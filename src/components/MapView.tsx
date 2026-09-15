import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { STATUS_MAP, type Household } from '../types';
import { communityMeta, type CommunityMeta } from '../lib/communities';
import { useStore } from '../state/store';
import { useVisibleHouseholds } from '../state/useVisible';
import { initialsOf } from '../lib/normalize';
import { getDemo } from '../lib/demo';
import { jitter } from '../lib/geo';
import { watchPosition } from '../lib/geolocation';

const TILE_LAYERS = {
  Streets: {
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

export const OFFLINE_BASEMAP = 'Offline pack';

interface MarkerMeta {
  knocked?: boolean;
  color?: string;
}

/** A cluster wears the colours of the doors inside it. */
function clusterRing(children: L.Marker[]): string {
  const counts = new Map<string, number>();
  children.forEach((m) => {
    const color = (m.options as MarkerMeta).color ?? '#64748b';
    counts.set(color, (counts.get(color) ?? 0) + 1);
  });
  const total = children.length || 1;
  let at = 0;
  const stops = [...counts.entries()].map(([color, n]) => {
    const from = (at / total) * 100;
    at += n;
    return `${color} ${from}% ${(at / total) * 100}%`;
  });
  return `radial-gradient(circle at center, var(--panel) 0 58%, transparent 59%), conic-gradient(${stops.join(', ')})`;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const BLANK_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Serves map tiles out of an embedded pack so the demo build needs no network. */
function packedTileLayer(): L.TileLayer | undefined {
  const tiles = getDemo()?.tiles;
  if (!tiles) return undefined;
  const Packed = L.TileLayer.extend({
    getTileUrl(coords: L.Coords) {
      return tiles[`${coords.z}/${coords.x}/${coords.y}`] ?? BLANK_TILE;
    },
  }) as unknown as new (url: string, options: L.TileLayerOptions) => L.TileLayer;
  return new Packed('', {
    maxNativeZoom: getDemo()?.maxNativeZoom ?? 16,
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors — offline tile pack',
  }) as L.TileLayer;
}

function pinColor(h: Household, colorBy: 'community' | 'response', groups: CommunityMeta[]): string {
  return colorBy === 'community' ? communityMeta(groups, h.community).color : STATUS_MAP[h.status].color;
}

function pinIcon(
  h: Household,
  label: string,
  selected: boolean,
  colorBy: 'community' | 'response',
  groups: CommunityMeta[],
): L.DivIcon {
  const meta = STATUS_MAP[h.status];
  const color = pinColor(h, colorBy, groups);
  const cls = ['pin', meta.knocked ? 'pin--knocked' : 'pin--new', selected ? 'pin--selected' : ''].join(' ');
  const check = meta.knocked
    ? '<svg class="pin__check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : `<span class="pin__label">${label}</span>`;
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}" style="--pin:${color}"><div class="pin__body">${check}</div><div class="pin__stem"></div></div>`,
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
  const baseLayersRef = useRef<Record<string, L.TileLayer>>({});
  const draftRef = useRef<{ points: L.LatLng[]; line: L.Polyline | null; markers: L.CircleMarker[] }>({
    points: [],
    line: null,
    markers: [],
  });
  const didFitRef = useRef(false);
  const dataVersion = useStore((s) => s.dataVersion);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number }>();
  const retryLocationRef = useRef<() => void>();
  const finishTurfRef = useRef<() => void>();

  const households = useStore((s) => s.households);
  const people = useStore((s) => s.people);
  const turfs = useStore((s) => s.turfs);
  const filters = useStore((s) => s.filters);
  const selectedId = useStore((s) => s.selectedHouseholdId);
  const mapMode = useStore((s) => s.mapMode);
  const colorBy = useStore((s) => s.settings.colorBy);
  const groups = useStore((s) => s.communities);
  const basemap = useStore((s) => s.settings.basemap);
  const recenterRequest = useStore((s) => s.recenterRequest);
  const placingHouseholdId = useStore((s) => s.placingHouseholdId);

  const visible = useVisibleHouseholds();
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
      // clustering needs a max zoom before any tile layer is attached
      maxZoom: 19,
      minZoom: 3,
      zoomControl: false,
      preferCanvas: true,
    });
    const layers = Object.fromEntries(
      Object.entries(TILE_LAYERS).map(([name, cfg]) => [name, L.tileLayer(cfg.url, cfg)]),
    ) as Record<string, L.TileLayer>;
    const packed = packedTileLayer();
    if (packed) layers[OFFLINE_BASEMAP] = packed;
    baseLayersRef.current = layers;
    // no zoom buttons: pinch and double-tap cover it, and they collided with
    // the app's own controls on a phone
    L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 40,
      // walking a street, you want the individual doors, not a bubble
      disableClusteringAtZoom: 18,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const children = cluster.getAllChildMarkers();
        const knocked = children.filter((m) => (m.options as MarkerMeta).knocked).length;
        return L.divIcon({
          className: 'cluster-wrap',
          html: `<div class="cluster" style="background-image:${clusterRing(children)}"><span>${children.length}</span>${knocked ? `<small>✓${knocked}</small>` : ''}</div>`,
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

  // ---- basemap -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const layers = baseLayersRef.current;
    if (!map || !Object.keys(layers).length) return;
    const wanted = layers[basemap] ?? layers[OFFLINE_BASEMAP] ?? layers.Streets;
    Object.values(layers).forEach((layer) => {
      if (layer !== wanted && map.hasLayer(layer)) map.removeLayer(layer);
    });
    if (!map.hasLayer(wanted)) wanted.addTo(map);
    wanted.bringToBack();
  }, [basemap]);

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
      const sig = `${h.status}|${h.community}|${colorBy}|${groups.length}|${selected}|${lat}|${lng}|${labels.get(id)}`;
      const existing = registry.get(id);
      if (existing) {
        if (existing.sig !== sig) {
          existing.marker.setLatLng([lat, lng]);
          existing.marker.setIcon(pinIcon(h, labels.get(id) ?? '', selected, colorBy, groups));
          const meta = existing.marker.options as MarkerMeta;
          meta.knocked = STATUS_MAP[h.status].knocked;
          meta.color = pinColor(h, colorBy, groups);
          existing.sig = sig;
        }
        return;
      }
      const marker = L.marker([lat, lng], {
        icon: pinIcon(h, labels.get(id) ?? '', selected, colorBy, groups),
        title: h.address,
        knocked: STATUS_MAP[h.status].knocked,
        color: pinColor(h, colorBy, groups),
        riseOnHover: true,
      } as L.MarkerOptions);
      marker.on('click', () => useStore.getState().select(id));
      registry.set(id, { marker, sig });
      toAdd.push(marker);
    });

    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);
  }, [visible, selectedId, labels, colorBy, groups]);

  // ---- fit to data once we have something to show --------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || didFitRef.current) return;
    const pts = households.filter((h) => h.lat !== undefined).map((h) => [h.lat!, h.lng!] as [number, number]);
    if (pts.length < 1) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.15), { animate: false });
    didFitRef.current = true;
  }, [households]);

  // a replace-import or a loaded project goes N doors -> M doors without ever
  // passing through zero, so the fit has to key off the data identity
  useEffect(() => {
    didFitRef.current = false;
  }, [dataVersion]);

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
        icon: L.divIcon({
          className: 'turf-label-wrap',
          html: `<div class="turf-label" style="--turf:${escapeHtml(t.color)}">${escapeHtml(t.name)}</div>`,
          iconSize: [0, 0],
        }),
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

    finishTurfRef.current = () => finish();
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

    const onDragStart = () => {
      if (useStore.getState().settings.followMe) useStore.getState().updateSettings({ followMe: false });
    };

    map.on('dragstart', onDragStart);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    return () => {
      map.off('dragstart', onDragStart);
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

  // ---- live position while walking ---------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let dot: L.Marker | null = null;
    let halo: L.Circle | null = null;
    let centred = false;
    let warned = false;
    let stop: (() => void) | undefined;

    const begin = () => {
      stop?.();
      stop = watchPosition({
      onFix: (position) => {
        const here = L.latLng(position.lat, position.lng);
        if (!dot) {
          dot = L.marker(here, {
            zIndexOffset: 1000,
            interactive: false,
            icon: L.divIcon({ className: 'me-wrap', html: '<div class="me"><span class="me__beam"></span></div>', iconSize: [22, 22] }),
          }).addTo(map);
          halo = L.circle(here, {
            radius: position.accuracy,
            color: '#38bdf8',
            weight: 1,
            fillColor: '#38bdf8',
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
        } else {
          dot.setLatLng(here);
          halo?.setLatLng(here);
          halo?.setRadius(position.accuracy);
        }

        const el = dot.getElement()?.querySelector('.me') as HTMLElement | null;
        if (el) {
          el.style.setProperty('--heading', position.heading === undefined ? '0deg' : `${position.heading}deg`);
          el.classList.toggle('me--heading', position.heading !== undefined);
        }

        setFix(position);
        const { settings, mapMode, households } = useStore.getState();
        if (!centred && !households.some((h) => h.lat !== undefined)) {
          map.setView(here, 16);
          centred = true;
        }
        if (settings.followMe && mapMode === 'browse') map.panTo(here, { animate: true, duration: 0.6 });
      },
      onError: (message) => {
        if (warned) return;
        warned = true;
        useStore.getState().notify(message, 'error');
      },
      });
    };

    begin();
    retryLocationRef.current = () => {
      warned = false;
      begin();
    };

    // the native watch keeps draining battery in the background, and a user who
    // turned location on mid-walk needs it to start working without a restart
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop?.();
      else {
        warned = false;
        begin();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      retryLocationRef.current = undefined;
      stop?.();
      dot?.remove();
      halo?.remove();
    };
  }, []);

  useEffect(() => {
    if (recenterRequest > 0) recenter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterRequest]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    if (fix) map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), 17), { animate: true });
    // no fix yet usually means permission was refused earlier — ask again
    else retryLocationRef.current?.();
    useStore.getState().updateSettings({ followMe: true });
  };

  const placing = placingHouseholdId
    ? households.find((h) => h.id === placingHouseholdId)
    : undefined;

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" />
      <div className="map-zoom">
        <button onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in">
          +
        </button>
        <button onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out">
          −
        </button>
      </div>
      {mapMode !== 'browse' && (
        <div className="map-hint">
          {mapMode === 'draw-turf' ? (
            <>
              <strong>Tap the corners</strong> of the area you want, then tap Done.
              <button className="btn btn--primary" onClick={() => finishTurfRef.current?.()}>
                Done
              </button>
              <button className="btn btn--ghost" onClick={() => useStore.getState().setMapMode('browse')}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <strong>Tap the map</strong> where {placing?.address ?? 'this door'} is.
              <button className="btn btn--ghost" onClick={() => useStore.getState().setMapMode('browse')}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
