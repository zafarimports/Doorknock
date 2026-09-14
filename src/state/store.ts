import { create } from 'zustand';
import type {
  Canvasser,
  ColumnMapping,
  DoorStatus,
  Household,
  Note,
  Person,
  ProjectFile,
  Settings,
  Turf,
} from '../types';
import { STATUS_MAP } from '../types';
import { householdKey, uid } from '../lib/normalize';
import type { GeocodeProgress } from '../lib/geocode';
import { buildRecords } from '../lib/parse';
import { pointInPolygon } from '../lib/geo';
import type { CommunityId } from '../lib/communities';
import type { PersistedState } from '../lib/storage';

export interface ImportOptions {
  /** replace everything, add alongside, or tag the doors already on the map */
  mode: 'replace' | 'append' | 'merge';
  /** stamp every row with this group — how a single-community list is layered on */
  community?: CommunityId;
}

export interface ImportResult {
  added: number;
  tagged: number;
  skipped: number;
}

/** Same door, whatever list it arrived in. */
const keyOf = (h: Household): string => householdKey(h.address, h.unit ?? '', h.city ?? '', h.postal ?? '');

export const TURF_COLORS = ['#f97316', '#22d3ee', '#a78bfa', '#f472b6', '#84cc16', '#facc15', '#60a5fa', '#fb7185'];

export interface Filters {
  search: string;
  statuses: DoorStatus[];
  /** groups switched off in the layer control */
  hiddenCommunities: CommunityId[];
  turfId?: string;
  poll?: string;
  city?: string;
  canvasserId?: string;
  unknockedOnly: boolean;
}

export type MapMode = 'browse' | 'draw-turf' | 'place-pin';

export const defaultSettings: Settings = {
  contactEmail: '',
  defaultCountry: 'Canada',
  defaultCity: '',
  geocoder: 'nominatim',
  mapboxToken: '',
  groupHouseholds: true,
  colorBy: 'community',
  followMe: true,
  basemap: 'Streets',
};

interface State {
  households: Household[];
  people: Person[];
  turfs: Turf[];
  canvassers: Canvasser[];
  settings: Settings;
  sourceColumns: string[];
  hydrated: boolean;
  /** bumped whenever the door set is replaced wholesale, so the map refits */
  dataVersion: number;

  selectedHouseholdId?: string;
  filters: Filters;
  mapMode: MapMode;
  placingHouseholdId?: string;
  geocodeProgress?: GeocodeProgress;
  geocodeRunning: boolean;
  geocodeErrors: string[];
  geocodeAbort?: () => void;
  /** bumped by the follow button in the top bar; the map answers it */
  recenterRequest: number;
  toast?: { id: string; message: string; kind: 'info' | 'error' };

  hydrate: (state: PersistedState) => void;
  importRows: (
    rows: Record<string, string>[],
    mapping: ColumnMapping,
    columns: string[],
    opts: ImportOptions,
  ) => ImportResult;
  loadProject: (project: ProjectFile) => void;

  select: (id?: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  setMapMode: (mode: MapMode, householdId?: string) => void;
  requestRecenter: () => void;

  setStatus: (householdId: string, status: DoorStatus, personId?: string) => void;
  toggleKnocked: (householdId: string) => void;
  addNote: (householdId: string, text: string) => void;
  deleteNote: (householdId: string, noteId: string) => void;
  toggleTag: (householdId: string, tag: string) => void;
  setCommunity: (householdId: string, community: CommunityId) => void;
  toggleCommunityLayer: (community: CommunityId) => void;
  updatePerson: (personId: string, patch: Partial<Person>) => void;
  moveHousehold: (householdId: string, lat: number, lng: number) => void;
  applyGeocode: (householdId: string, hit: { lat: number; lng: number; label?: string; precision?: string } | null) => void;

  addTurf: (polygon: [number, number][]) => Turf;
  renameTurf: (id: string, name: string) => void;
  assignTurf: (turfId: string, canvasserId?: string) => void;
  deleteTurf: (id: string) => void;
  recomputeTurfMembership: () => void;

  addCanvasser: (name: string) => Canvasser;
  removeCanvasser: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setGeocodeProgress: (p?: GeocodeProgress) => void;
  /** set by useGeocoder so data changes can stop a run in flight */
  registerGeocodeAbort: (abort?: () => void) => void;
  abortGeocode: () => void;
  setGeocodeRunning: (running: boolean) => void;
  pushGeocodeError: (message: string) => void;
  notify: (message: string, kind?: 'info' | 'error') => void;
  dismissToast: () => void;
  clearAll: () => void;
}

const emptyFilters: Filters = { search: '', statuses: [], hiddenCommunities: [], unknockedOnly: false };

export const useStore = create<State>((set, get) => ({
  households: [],
  people: [],
  turfs: [],
  canvassers: [],
  settings: defaultSettings,
  sourceColumns: [],
  hydrated: false,
  dataVersion: 0,

  filters: emptyFilters,
  mapMode: 'browse',
  geocodeRunning: false,
  geocodeErrors: [],
  recenterRequest: 0,

  hydrate: (state) =>
    set({
      households: state.households ?? [],
      people: state.people ?? [],
      turfs: state.turfs ?? [],
      canvassers: state.canvassers ?? [],
      settings: { ...defaultSettings, ...(state.settings ?? {}) },
      sourceColumns: state.sourceColumns ?? [],
      hydrated: true,
    }),

  importRows: (rows, mapping, columns, opts) => {
    get().abortGeocode();
    const { settings } = get();
    const { households, people, skipped } = buildRecords(rows, mapping, {
      groupHouseholds: settings.groupHouseholds,
      defaultCity: settings.defaultCity,
      forceCommunity: opts.community,
    });

    if (opts.mode === 'merge') {
      // A community list is an overlay on doors that already exist: match by
      // address, tag what is there, and only add doors the base list missed.
      const existing = get().households;
      const byKey = new Map(existing.map((h) => [keyOf(h), h]));
      const matched: Household[] = [];
      const fresh: Household[] = [];
      const freshPeople: Person[] = [];
      const remap = new Map<string, string>();

      households.forEach((incoming) => {
        const hit = byKey.get(keyOf(incoming));
        if (hit) {
          matched.push(hit);
          remap.set(incoming.id, hit.id);
        } else {
          fresh.push(incoming);
          remap.set(incoming.id, incoming.id);
        }
      });

      const matchedIds = new Set(matched.map((h) => h.id));
      const knownNames = new Set(
        get().people.map((p) => `${p.householdId}|${p.name.toLowerCase()}`),
      );
      people.forEach((p) => {
        const householdId = remap.get(p.householdId) ?? p.householdId;
        const isNewPerson = !knownNames.has(`${householdId}|${p.name.toLowerCase()}`);
        if (isNewPerson) freshPeople.push({ ...p, householdId });
      });

      set((s) => ({
        dataVersion: s.dataVersion + 1,
        households: [
          ...s.households.map((h) =>
            matchedIds.has(h.id) && opts.community
              ? { ...h, community: opts.community, communitySource: 'file' as const, updatedAt: Date.now() }
              : h,
          ),
          ...fresh,
        ],
        people: [...s.people, ...freshPeople],
        sourceColumns: [...new Set([...s.sourceColumns, ...columns])],
        selectedHouseholdId: undefined,
      }));
      get().recomputeTurfMembership();
      return { added: fresh.length, tagged: matched.length, skipped };
    }

    const replace = opts.mode === 'replace';
    set((s) => ({
      dataVersion: s.dataVersion + 1,
      households: replace ? households : [...s.households, ...households],
      people: replace ? people : [...s.people, ...people],
      sourceColumns: replace ? columns : [...new Set([...s.sourceColumns, ...columns])],
      turfs: replace ? [] : s.turfs,
      selectedHouseholdId: undefined,
      filters: emptyFilters,
    }));
    get().recomputeTurfMembership();
    return { added: households.length, tagged: 0, skipped };
  },

  loadProject: (project) => {
    get().abortGeocode();
    set((s) => ({
      dataVersion: s.dataVersion + 1,
      households: project.households,
      people: project.people,
      turfs: project.turfs ?? [],
      canvassers: project.canvassers ?? [],
      settings: { ...defaultSettings, ...project.settings },
      sourceColumns: project.sourceColumns ?? [],
      selectedHouseholdId: undefined,
      filters: emptyFilters,
    }));
  },

  select: (id) => set({ selectedHouseholdId: id }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set({ filters: emptyFilters }),
  setMapMode: (mode, householdId) => set({ mapMode: mode, placingHouseholdId: householdId }),
  requestRecenter: () =>
    set((s) => ({ recenterRequest: s.recenterRequest + 1, settings: { ...s.settings, followMe: true } })),

  setStatus: (householdId, status, personId) =>
    set((s) => {
      const now = Date.now();
      const knocked = STATUS_MAP[status].knocked;
      const canvasser = s.canvassers.find((c) => c.id === s.settings.activeCanvasserId);
      return {
        households: s.households.map((h) => {
          if (h.id !== householdId) return h;
          // a door revisited on Wednesday after "not home" on Monday is two visits
          const isNewVisit = knocked && h.status !== status;
          return {
            ...h,
            status,
            knockedAt: knocked ? h.knockedAt ?? now : undefined,
            lastVisitAt: knocked ? now : undefined,
            knockedBy: knocked ? h.knockedBy ?? canvasser?.name : undefined,
            visits: isNewVisit ? h.visits + 1 : h.visits,
            updatedAt: now,
          };
        }),
        people: personId
          ? s.people.map((p) => (p.id === personId ? { ...p, status } : p))
          : s.people,
      };
    }),

  toggleKnocked: (householdId) => {
    const h = get().households.find((x) => x.id === householdId);
    if (!h) return;
    const isKnocked = STATUS_MAP[h.status].knocked;
    get().setStatus(householdId, isKnocked ? 'not_started' : 'not_home');
    if (isKnocked) {
      set((s) => ({
        households: s.households.map((x) =>
          x.id === householdId
            ? { ...x, knockedAt: undefined, lastVisitAt: undefined, knockedBy: undefined, visits: Math.max(0, x.visits - 1) }
            : x,
        ),
      }));
    }
  },

  addNote: (householdId, text) =>
    set((s) => {
      const author = s.canvassers.find((c) => c.id === s.settings.activeCanvasserId)?.name;
      const note: Note = { id: uid('n'), at: Date.now(), text, author };
      return {
        households: s.households.map((h) =>
          h.id === householdId ? { ...h, notes: [note, ...h.notes], updatedAt: Date.now() } : h,
        ),
      };
    }),

  deleteNote: (householdId, noteId) =>
    set((s) => ({
      households: s.households.map((h) =>
        h.id === householdId ? { ...h, notes: h.notes.filter((n) => n.id !== noteId) } : h,
      ),
    })),

  toggleTag: (householdId, tag) =>
    set((s) => ({
      households: s.households.map((h) =>
        h.id === householdId
          ? {
              ...h,
              tags: h.tags.includes(tag) ? h.tags.filter((t) => t !== tag) : [...h.tags, tag],
              updatedAt: Date.now(),
            }
          : h,
      ),
    })),

  setCommunity: (householdId, community) =>
    set((s) => ({
      households: s.households.map((h) =>
        h.id === householdId ? { ...h, community, communitySource: 'manual', updatedAt: Date.now() } : h,
      ),
      people: s.people.map((p) =>
        p.householdId === householdId ? { ...p, community, communitySource: 'manual' } : p,
      ),
    })),

  toggleCommunityLayer: (community) =>
    set((s) => ({
      filters: {
        ...s.filters,
        hiddenCommunities: s.filters.hiddenCommunities.includes(community)
          ? s.filters.hiddenCommunities.filter((c) => c !== community)
          : [...s.filters.hiddenCommunities, community],
      },
    })),

  updatePerson: (personId, patch) =>
    set((s) => ({ people: s.people.map((p) => (p.id === personId ? { ...p, ...patch } : p)) })),

  moveHousehold: (householdId, lat, lng) => {
    set((s) => ({
      households: s.households.map((h) =>
        h.id === householdId ? { ...h, lat, lng, geocode: 'manual', updatedAt: Date.now() } : h,
      ),
      mapMode: 'browse',
      placingHouseholdId: undefined,
    }));
    get().recomputeTurfMembership();
  },

  applyGeocode: (householdId, hit) =>
    set((s) => ({
      households: s.households.map((h) =>
        // a pin dropped by a canvasser beats anything the geocoder guesses
        h.id === householdId && h.geocode !== 'manual'
          ? hit
            ? { ...h, lat: hit.lat, lng: hit.lng, geocode: 'ok', geocodeLabel: hit.label, geocodePrecision: hit.precision }
            : { ...h, geocode: 'failed' }
          : h,
      ),
    })),

  addTurf: (polygon) => {
    const turfs = get().turfs;
    const turf: Turf = {
      id: uid('t'),
      name: `Turf ${turfs.length + 1}`,
      color: TURF_COLORS[turfs.length % TURF_COLORS.length],
      polygon,
      createdAt: Date.now(),
    };
    set({ turfs: [...turfs, turf], mapMode: 'browse' });
    get().recomputeTurfMembership();
    return turf;
  },

  renameTurf: (id, name) => set((s) => ({ turfs: s.turfs.map((t) => (t.id === id ? { ...t, name } : t)) })),
  assignTurf: (turfId, canvasserId) =>
    set((s) => ({ turfs: s.turfs.map((t) => (t.id === turfId ? { ...t, canvasserId } : t)) })),

  deleteTurf: (id) => {
    set((s) => ({
      turfs: s.turfs.filter((t) => t.id !== id),
      households: s.households.map((h) => (h.turfId === id ? { ...h, turfId: undefined } : h)),
      filters: s.filters.turfId === id ? { ...s.filters, turfId: undefined } : s.filters,
    }));
  },

  /** Last turf drawn wins when polygons overlap. */
  recomputeTurfMembership: () =>
    set((s) => ({
      households: s.households.map((h) => {
        if (h.lat === undefined || h.lng === undefined) return h.turfId ? { ...h, turfId: undefined } : h;
        let turfId: string | undefined;
        for (const t of s.turfs) if (pointInPolygon([h.lat, h.lng], t.polygon)) turfId = t.id;
        return h.turfId === turfId ? h : { ...h, turfId };
      }),
    })),

  addCanvasser: (name) => {
    const canvassers = get().canvassers;
    const canvasser: Canvasser = {
      id: uid('c'),
      name,
      color: TURF_COLORS[canvassers.length % TURF_COLORS.length],
      code: Math.random().toString(36).slice(2, 7).toUpperCase(),
    };
    set({ canvassers: [...canvassers, canvasser] });
    return canvasser;
  },

  removeCanvasser: (id) =>
    set((s) => ({
      canvassers: s.canvassers.filter((c) => c.id !== id),
      turfs: s.turfs.map((t) => (t.canvasserId === id ? { ...t, canvasserId: undefined } : t)),
      settings: s.settings.activeCanvasserId === id ? { ...s.settings, activeCanvasserId: undefined } : s.settings,
    })),

  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setGeocodeProgress: (p) => set({ geocodeProgress: p }),
  registerGeocodeAbort: (abort) => set({ geocodeAbort: abort }),
  abortGeocode: () => {
    get().geocodeAbort?.();
    set({ geocodeAbort: undefined, geocodeRunning: false, geocodeProgress: undefined });
  },
  setGeocodeRunning: (running) => set({ geocodeRunning: running, geocodeErrors: running ? [] : get().geocodeErrors }),
  pushGeocodeError: (message) => set((s) => ({ geocodeErrors: [message, ...s.geocodeErrors].slice(0, 50) })),
  notify: (message, kind = 'info') => set({ toast: { id: uid('toast'), message, kind } }),
  dismissToast: () => set({ toast: undefined }),

  clearAll: () => {
    get().abortGeocode();
    set((s) => ({
      dataVersion: s.dataVersion + 1,
      households: [],
      people: [],
      turfs: [],
      sourceColumns: [],
      selectedHouseholdId: undefined,
      filters: emptyFilters,
      geocodeProgress: undefined,
      geocodeErrors: [],
    }));
  },
}));

/** Households passing the current filter set, with their residents attached. */
export function selectVisible(state: State): Household[] {
  const { households, people, filters } = state;
  const q = filters.search.trim().toLowerCase();
  const peopleByHousehold = new Map<string, Person[]>();
  people.forEach((p) => {
    const list = peopleByHousehold.get(p.householdId);
    if (list) list.push(p);
    else peopleByHousehold.set(p.householdId, [p]);
  });
  const turfById = new Map(state.turfs.map((t) => [t.id, t]));

  return households.filter((h) => {
    if (filters.hiddenCommunities.includes(h.community)) return false;
    if (filters.statuses.length && !filters.statuses.includes(h.status)) return false;
    if (filters.unknockedOnly && STATUS_MAP[h.status].knocked) return false;
    if (filters.turfId && h.turfId !== filters.turfId) return false;
    if (filters.poll && h.poll !== filters.poll) return false;
    if (filters.city && h.city !== filters.city) return false;
    if (filters.canvasserId) {
      const turf = h.turfId ? turfById.get(h.turfId) : undefined;
      if (turf?.canvasserId !== filters.canvasserId) return false;
    }
    if (q) {
      const residents = peopleByHousehold.get(h.id) ?? [];
      const hay = [h.address, h.unit, h.city, h.postal, h.poll, ...h.tags, ...residents.map((p) => p.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function peopleOf(state: State, householdId: string): Person[] {
  return state.people.filter((p) => p.householdId === householdId);
}
