import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { STATUS_MAP, type Household } from '../types';
import { selectVisible, useStore } from '../state/store';
import { initialsOf } from '../lib/normalize';
import { jitter } from '../lib/geo';

const TILE_LAYERS = {
  Streets: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
  'OSM classic': {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  Satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri',
    maxZoom: 19,
  },
} as const;

function pinIcon(h: Household, label: string, selected: boolean): L.DivIcon {
  const meta = STATUS_MAP[h.status];
  const cls = ['pin', meta.knocked ? 'pin--knocked' : 'pin--new', selected ? 'pin--selected' : ''].join(' ');
  const check = meta.knocked
    ? '<svg class="pin__check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : `<span class="pin__label">${label}</span>`;
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}" style="--pin:${meta.color}"><div class="pin__body">${check}</div><div class="pin__stem"></div></div>`,
    iconSize: [30, 40],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; sig: string }>());
  const turfLayerRef = useRef<L.LayerGroup | null>(null);
  const draftRef = useRef<{ points: L.LatLng[]; line: L.Polyline | null; markers: L.CircleMarker[] }>({
    points: [],
    line: null,
    markers: [],
  });
  const didFitRef = useRef(false);

  const households = useStore((s) => s.households);
  const people = useStore((s) => s.people);
  const turfs = useStore((s) => s.turfs);
  const filters = useStore((s) => s.filters);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const mapMode = useStore((s) => s.mapMode);
  const placingHouseholdId = useStore((s) => s.placingHouseholdId);

  const visible = useStore(selectVisible);
  const labels = useMemo(() => {
    const map = new Map<string, string>();
    const byHousehold = new Map<string, string[]>();
    people.forEach((p) => {
      const list = byHousehold.get(p.householdId) ?? [];
      list.push(p.name);
      byHousehold.set(p.householdId, list);
    });
    households.forEach((h) => {
      const names = byHousehold.get(h.id) ?? [];
      map.set(h.id, names.length > 1 ? String(names.length) : initialsOf(names[0] ?? h.address));
    });
    return map;
  }, [households, people]);

  // ---- map bootstrap -------------------------------------------------------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [43.3616, -80.3144],
      zoom: 12,
      zoomControl: false,
      preferCanvas: true,
    });
    const layers = Object.fromEntries(
      Object.entries(TILE_LAYERS).map(([name, cfg]) => [name, L.tileLayer(cfg.url, cfg)]),
    ) as Record<keyof typeof TILE_LAYERS, L.TileLayer>;
    layers.Streets.addTo(map);
    L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 46,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const children = cluster.getAllChildMarkers();
        const knocked = children.filter((m) => (m.options as { knocked?: boolean }).knocked).length;
        const pct = Math.round((knocked / children.length) * 100);
        return L.divIcon({
          className: 'cluster-wrap',
          html: `<div class="cluster" style="--pct:${pct}"><span>${children.length}</span><small>${pct}%</small></div>`,
          iconSize: [46, 46],
        });
      },
    });
    map.addLayer(cluster);
    clusterRef.current = cluster;
    turfLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // ---- markers -------------------------------------------------------------
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    const seenAtPoint = new Map<string, number>();
    const wanted = new Map<string, Household>();
    visible.forEach((h) => {
      if (h.lat === undefined || h.lng === undefined) return;
      wanted.set(h.id, h);
    });

    const registry = markersRef.current;
    const toAdd: L.Marker[] = [];
    const toRemove: L.Marker[] = [];

    registry.forEach((entry, id) => {
      if (!wanted.has(id)) {
        toRemove.push(entry.marker);
        registry.delete(id);
      }
    });

    wanted.forEach((h, id) => {
      const key = `${h.lat!.toFixed(6)},${h.lng!.toFixed(6)}`;
      const seen = seenAtPoint.get(key) ?? 0;
      seenAtPoint.set(key, seen + 1);
      const [lat, lng] = jitter(h.lat!, h.lng!, seen);
      const selected = id === selectedId;
      const sig = `${h.status}|${selected}|${lat}|${lng}|${labels.get(id)}`;
      const existing = registry.get(id);
      if (existing) {
        if (existing.sig !== sig) {
          existing.marker.setLatLng([lat, lng]);
          existing.marker.setIcon(pinIcon(h, labels.get(id) ?? '', selected));
          (existing.marker.options as { knocked?: boolean }).knocked = STATUS_MAP[h.status].knocked;
          existing.sig = sig;
        }
        return;
      }
      const marker = L.marker([lat, lng], {
        icon: pinIcon(h, labels.get(id) ?? '', selected),
        title: h.address,
        knocked: STATUS_MAP[h.status].knocked,
        riseOnHover: true,
      } as L.MarkerOptions);
      marker.on('click', () => useStore.getState().select(id));
      registry.set(id, { marker, sig });
      toAdd.push(marker);
    });

    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);
  }, [visible, selectedId, labels]);

  // ---- fit to data once we have something to show --------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFitRef.current) return;
    const pts = households.filter((h) => h.lat !== undefined).map((h) => [h.lat!, h.lng!] as [number, number]);
    if (pts.length < 1) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: false });
    didFitRef.current = true;
  }, [households]);

  useEffect(() => {
    if (!households.length) didFitRef.current = false;
  }, [households.length]);

  // ---- turf polygons -------------------------------------------------------
  useEffect(() => {
    const layer = turfLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    turfs.forEach((t) => {
      const dimmed = filters.turfId !== undefined && filters.turfId !== t.id;
      const poly = L.polygon(t.polygon, {
        color: t.color,
        weight: 2,
        fillOpacity: dimmed ? 0.03 : 0.12,
        opacity: dimmed ? 0.35 : 0.9,
        interactive: false,
      });
      poly.addTo(layer);
      L.marker(poly.getBounds().getCenter(), {
        interactive: false,
        icon: L.divIcon({ className: 'turf-label-wrap', html: `<div class="turf-label" style="--turf:${t.color}">${t.name}</div>`, iconSize: [0, 0] }),
      }).addTo(layer);
    });
  }, [turfs, filters.turfId]);

  // ---- reveal the selected door, un-clustering it if need be ---------------
  useEffect(() => {
    const map = mapRef.current;
    const cluster = clusterRef.current;
    if (!map || !cluster || !selectedId) return;
    const h = households.find((x) => x.id === selectedId);
    if (!h || h.lat === undefined || h.lng === undefined) return;
    const entry = markersRef.current.get(selectedId);
    const target = entry ? entry.marker.getLatLng() : L.latLng(h.lat, h.lng);
    const offscreen = !map.getBounds().pad(-0.15).contains(target);
    if (offscreen) map.setView(target, Math.max(map.getZoom(), 17), { animate: true });
    // a pin hidden inside a cluster cannot show the user it is selected
    if (entry && cluster.hasLayer(entry.marker)) {
      const visible = cluster.getVisibleParent(entry.marker);
      if (visible && visible !== entry.marker) cluster.zoomToShowLayer(entry.marker, () => undefined);
    }
  }, [selectedId, households]);

  // ---- drawing turf / placing a pin ---------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clearDraft = () => {
      const draft = draftRef.current;
      draft.line?.remove();
      draft.markers.forEach((m) => m.remove());
      draftRef.current = { points: [], line: null, markers: [] };
    };

    const finish = () => {
      const draft = draftRef.current;
      if (draft.points.length >= 3) {
        const ring = draft.points.map((p) => [p.lat, p.lng] as [number, number]);
        const turf = useStore.getState().addTurf(ring);
        const count = useStore.getState().households.filter((h) => h.turfId === turf.id).length;
        useStore.getState().notify(`${turf.name} created — ${count} door${count === 1 ? '' : 's'} inside`);
      } else {
        useStore.getState().setMapMode('browse');
      }
      clearDraft();
    };

    const onClick = (e: L.LeafletMouseEvent) => {
      const mode = useStore.getState().mapMode;
      if (mode === 'place-pin') {
        const id = useStore.getState().placingHouseholdId;
        if (id) {
          useStore.getState().moveHousehold(id, e.latlng.lat, e.latlng.lng);
          useStore.getState().notify('Pin placed');
        }
        return;
      }
      if (mode !== 'draw-turf') return;
      const draft = draftRef.current;
      draft.points.push(e.latlng);
      const dot = L.circleMarker(e.latlng, { radius: 4, color: '#f97316', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(map);
      draft.markers.push(dot);
      if (draft.line) draft.line.setLatLngs(draft.points);
      else draft.line = L.polyline(draft.points, { color: '#f97316', weight: 2, dashArray: '6 4' }).addTo(map);
    };

    const onDblClick = (e: L.LeafletMouseEvent) => {
      if (useStore.getState().mapMode !== 'draw-turf') return;
      L.DomEvent.stop(e);
      finish();
    };

    const onKey = (e: KeyboardEvent) => {
      const mode = useStore.getState().mapMode;
      if (mode === 'browse') return;
      if (e.key === 'Enter') finish();
      if (e.key === 'Escape') {
        clearDraft();
        useStore.getState().setMapMode('browse');
      }
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKey);
      clearDraft();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const el = map.getContainer();
    el.classList.toggle('map--drawing', mapMode !== 'browse');
    if (mapMode === 'draw-turf') map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [mapMode]);

  const locate = () => {
    const map = mapRef.current;
    if (!map) return;
    map.locate({ setView: true, maxZoom: 17 });
    map.once('locationfound', (e: L.LocationEvent) => {
      L.circleMarker(e.latlng, { radius: 8, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: 0.6 })
        .addTo(map)
        .bindTooltip('You are here');
    });
    map.once('locationerror', () => useStore.getState().notify('Could not get your location', 'error'));
  };

  const placing = placingHouseholdId
    ? households.find((h) => h.id === placingHouseholdId)
    : undefined;

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" />
      <button className="map-locate" onClick={locate} title="Find my location">
        ◎
      </button>
      {mapMode !== 'browse' && (
        <div className="map-hint">
          {mapMode === 'draw-turf' ? (
            <>
              <strong>Cutting turf</strong> — click to drop corners, double-click or press <kbd>Enter</kbd> to close it.
              <button onClick={() => useStore.getState().setMapMode('browse')}>Cancel</button>
            </>
          ) : (
            <>
              <strong>Placing</strong> {placing?.address ?? 'door'} — click the map where the door is.
              <button onClick={() => useStore.getState().setMapMode('browse')}>Cancel</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
