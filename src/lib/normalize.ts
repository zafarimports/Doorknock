import type { ColumnMapping } from '../types';

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export const clean = (v: unknown): string =>
  v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();

export const titleCase = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (_m, a: string, b: string) => a.toUpperCase() + b)
    .replace(/\bMc([a-z])/g, (_m, a: string) => 'Mc' + a.toUpperCase());

/** "AYUB, SAMIA" -> { first: "Samia", last: "Ayub", display: "Samia Ayub" } */
export function parseName(raw: string): { first: string; last: string; display: string } {
  const s = clean(raw);
  if (!s) return { first: '', last: '', display: '' };
  if (s.includes(',')) {
    const [last, ...rest] = s.split(',');
    const first = rest.join(' ').trim();
    return {
      first: titleCase(first),
      last: titleCase(last),
      display: titleCase([first, last].filter(Boolean).join(' ')),
    };
  }
  const parts = s.split(' ');
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  const first = parts.slice(0, -1).join(' ') || s;
  return { first: titleCase(first), last: titleCase(last), display: titleCase(s) };
}

export function initialsOf(name: string): string {
  const p = clean(name).replace(/,/g, ' ').split(' ').filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Canadian postal codes arrive as N1S4C2 — Nominatim wants "N1S 4C2". */
export function normalizePostal(raw: string): string {
  const s = clean(raw).toUpperCase().replace(/\s+/g, '');
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s)) return `${s.slice(0, 3)} ${s.slice(3)}`;
  return clean(raw).toUpperCase();
}

const UNIT_RE = /\b(?:UNIT|APT|APARTMENT|SUITE|STE|#)\s*([A-Za-z0-9-]+)\s*$/i;

/** Splits "169 BISMARK DR UNIT 27" into street + unit. */
export function splitUnit(address: string): { street: string; unit?: string } {
  const s = clean(address);
  const m = s.match(UNIT_RE);
  if (m) return { street: clean(s.slice(0, m.index)), unit: m[1] };
  return { street: s };
}

export function houseNumberOf(address: string): number | undefined {
  const m = clean(address).match(/^(\d+)/);
  return m ? Number(m[1]) : undefined;
}

export function streetOf(address: string): string {
  return clean(address).replace(/^\d+\s*/, '').toUpperCase();
}

/** Stable key used to merge people living at the same door. */
export function householdKey(address: string, unit: string, city: string, postal: string): string {
  return [clean(address).toUpperCase(), clean(unit).toUpperCase(), clean(city).toUpperCase(), normalizePostal(postal)]
    .join('|')
    .replace(/\s+/g, ' ');
}

export function displayAddress(address: string, unit?: string): string {
  // 96A Blenheim Rd, not 96a Blenheim Rd
  const a = titleCase(address).replace(/^(\d+)([a-z])\b/, (_m, n: string, letter: string) => n + letter.toUpperCase());
  return unit ? `${a}, Unit ${unit}` : a;
}

/**
 * Order matters: fields are claimed in this order, so the specific name columns
 * get first refusal — otherwise "First Name" is swallowed by the catch-all
 * "name" field and every surname is dropped.
 */
const HEADER_HINTS: Record<keyof ColumnMapping, string[]> = {
  firstName: ['first name', 'firstname', 'first', 'given name', 'givenname', 'fname'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'],
  streetNumber: ['street #', 'street number', 'house number', 'house #', 'civic number', 'st #'],
  streetSuffix: ['street # suffix', 'number suffix', 'suffix'],
  address: ['street name', 'property address', 'address', 'street address', 'street', 'addr', 'residence'],
  name: ['full name', 'name', 'voter', 'elector', 'resident', 'contact'],
  unit: ['unit', 'apt', 'apartment', 'suite'],
  city: ['city', 'town', 'municipality'],
  postal: ['p-c', 'pc', 'postal', 'postal code', 'postcode', 'zip', 'zip code'],
  region: ['province', 'state', 'region', 'prov'],
  poll: ['poll', 'precinct', 'ward', 'district', 'p-d', 'pd'],
  occupancy: ['os', 'occupancy', 'occupant status', 'tenure', 'relationship'],
  phone: ['phone', 'telephone', 'mobile', 'cell', 'tel'],
  email: ['email', 'e-mail', 'mail'],
  lat: ['lat', 'latitude', 'y'],
  lng: ['lng', 'lon', 'long', 'longitude', 'x'],
  community: ['community', 'group', 'religion', 'ethnicity', 'demographic', 'segment', 'background'],
};

/** Best-effort auto mapping of spreadsheet headers onto our fields. */
export function guessMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const norm = headers.map((h) => clean(h).toLowerCase());

  (Object.keys(HEADER_HINTS) as (keyof ColumnMapping)[]).forEach((field) => {
    const hints = HEADER_HINTS[field];
    // "First Name" belongs to firstName and "Street Name" to the address, even
    // though both contain the word "name"
    const splitNameColumn = field === 'name';
    let bestIdx = -1;
    let bestScore = 0;
    norm.forEach((h, i) => {
      if (!h || used.has(headers[i])) return;
      if (splitNameColumn && /\b(first|last|given|sur|family|middle|street|address|road|city|unit|file)\b/.test(h)) return;
      let score = 0;
      hints.forEach((hint, rank) => {
        const weight = hints.length - rank;
        if (h === hint) score = Math.max(score, 100 + weight);
        else if (h.replace(/[^a-z]/g, '') === hint.replace(/[^a-z]/g, '')) score = Math.max(score, 90 + weight);
        // whole words only, so "community" is not read as a "unit" column
        else if (new RegExp(`\\b${hint.replace(/[^a-z0-9 ]/g, '.')}\\b`).test(h)) score = Math.max(score, 50 + weight);
      });
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0 && bestScore >= 50) {
      mapping[field] = headers[bestIdx];
      used.add(headers[bestIdx]);
    }
  });
  return mapping;
}
