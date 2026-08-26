import type { Household, Settings } from '../types';
import { normalizePostal } from './normalize';
import { loadGeoCache, saveGeoCache, type GeoCache } from './storage';

export interface GeocodeHit {
  lat: number;
  lng: number;
  label?: string;
  precision?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nominatim's usage policy allows at most 1 request/second. */
const NOMINATIM_DELAY = 1150;
const MAPBOX_DELAY = 120;

export function cacheKeyFor(h: Household, settings: Settings): string {
  return [h.address, h.unit ?? '', h.city ?? '', normalizePostal(h.postal ?? ''), h.region ?? '', settings.defaultCountry]
    .join('|')
    .toUpperCase();
}

function queryString(h: Household, settings: Settings): string {
  return [h.address, h.city, h.region, normalizePostal(h.postal ?? ''), settings.defaultCountry]
    .filter(Boolean)
    .join(', ');
}

async function nominatim(h: Household, settings: Settings, signal: AbortSignal): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    addressdetails: '0',
    street: h.address,
    country: settings.defaultCountry || 'Canada',
  });
  if (h.city) params.set('city', h.city);
  if (h.postal) params.set('postalcode', normalizePostal(h.postal));
  if (h.region) params.set('state', h.region);
  if (settings.contactEmail) params.set('email', settings.contactEmail);

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429) throw new Error('rate-limited');
  if (!res.ok) throw new Error(`geocoder returned ${res.status}`);
  const json = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string; type?: string }>;
  if (json.length) {
    const hit = json[0];
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name, precision: hit.type };
  }

  // Structured search missed — retry as free text, which is more forgiving of
  // abbreviations like "CRES" or missing city names.
  const fallback = new URLSearchParams({ format: 'jsonv2', limit: '1', q: queryString(h, settings) });
  if (settings.contactEmail) fallback.set('email', settings.contactEmail);
  await sleep(NOMINATIM_DELAY);
  const res2 = await fetch(`https://nominatim.openstreetmap.org/search?${fallback}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res2.ok) return null;
  const json2 = (await res2.json()) as Array<{ lat: string; lon: string; display_name?: string; type?: string }>;
  if (!json2.length) return null;
  const hit = json2[0];
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name, precision: hit.type ?? 'fallback' };
}

async function mapbox(h: Household, settings: Settings, signal: AbortSignal): Promise<GeocodeHit | null> {
  const q = encodeURIComponent(queryString(h, settings));
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?limit=1&access_token=${encodeURIComponent(
    settings.mapboxToken,
  )}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Mapbox returned ${res.status}`);
  const json = (await res.json()) as {
    features?: Array<{ center: [number, number]; place_name?: string; place_type?: string[] }>;
  };
  const f = json.features?.[0];
  if (!f) return null;
  return { lat: f.center[1], lng: f.center[0], label: f.place_name, precision: f.place_type?.[0] };
}

export interface GeocodeProgress {
  done: number;
  total: number;
  ok: number;
  failed: number;
  current?: string;
}

export interface RunOptions {
  households: Household[];
  settings: Settings;
  signal: AbortSignal;
  onResult: (householdId: string, hit: GeocodeHit | null) => void;
  onProgress: (p: GeocodeProgress) => void;
  onError: (message: string) => void;
}

/**
 * Walks the queue one address at a time, honouring the provider's rate limit and
 * reusing anything already in the on-disk cache so re-imports are instant.
 */
export async function runGeocoder({
  households,
  settings,
  signal,
  onResult,
  onProgress,
  onError,
}: RunOptions): Promise<void> {
  const cache: GeoCache = await loadGeoCache();
  const delay = settings.geocoder === 'mapbox' ? MAPBOX_DELAY : NOMINATIM_DELAY;
  let done = 0;
  let ok = 0;
  let failed = 0;
  let dirty = false;
  let lastRequestAt = 0;

  for (const h of households) {
    if (signal.aborted) break;
    const key = cacheKeyFor(h, settings);
    onProgress({ done, total: households.length, ok, failed, current: h.address });

    if (key in cache) {
      const cached = cache[key];
      onResult(h.id, cached);
      cached ? ok++ : failed++;
      done++;
      continue;
    }

    const wait = lastRequestAt + delay - Date.now();
    if (wait > 0) await sleep(wait);
    if (signal.aborted) break;
    lastRequestAt = Date.now();

    try {
      const hit =
        settings.geocoder === 'mapbox'
          ? await mapbox(h, settings, signal)
          : await nominatim(h, settings, signal);
      cache[key] = hit;
      dirty = true;
      onResult(h.id, hit);
      hit ? ok++ : failed++;
    } catch (err) {
      if (signal.aborted) break;
      const message = err instanceof Error ? err.message : String(err);
      onError(`${h.address}: ${message}`);
      onResult(h.id, null);
      failed++;
      if (message === 'rate-limited') await sleep(5000);
    }
    done++;
    if (dirty && done % 20 === 0) {
      await saveGeoCache(cache);
      dirty = false;
    }
  }

  if (dirty) await saveGeoCache(cache);
  onProgress({ done, total: households.length, ok, failed });
}
