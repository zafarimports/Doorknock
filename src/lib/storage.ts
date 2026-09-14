import { get, set, del } from 'idb-keyval';
import type { Canvasser, Household, Person, Settings, Turf } from '../types';

const KEY = 'doorknock:project:v2';
const GEO_KEY = 'doorknock:geocache:v1';

export interface PersistedState {
  households: Household[];
  people: Person[];
  turfs: Turf[];
  canvassers: Canvasser[];
  settings: Settings;
  sourceColumns: string[];
}

export async function loadState(): Promise<PersistedState | undefined> {
  try {
    return await get<PersistedState>(KEY);
  } catch {
    return undefined;
  }
}

export async function saveState(state: PersistedState): Promise<void> {
  try {
    await set(KEY, state);
  } catch (err) {
    console.warn('Could not persist project', err);
  }
}

export async function clearState(): Promise<void> {
  await del(KEY);
}

export type GeoCache = Record<string, { lat: number; lng: number; label?: string; precision?: string } | null>;

export async function loadGeoCache(): Promise<GeoCache> {
  try {
    return (await get<GeoCache>(GEO_KEY)) ?? {};
  } catch {
    return {};
  }
}

export async function saveGeoCache(cache: GeoCache): Promise<void> {
  try {
    await set(GEO_KEY, cache);
  } catch (err) {
    console.warn('Could not persist geocode cache', err);
  }
}
