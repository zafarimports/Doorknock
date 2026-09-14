import type { ColumnMapping, Household, Person } from '../types';
import { normalizeCommunity, type CommunityId } from './communities';
import {
  clean,
  displayAddress,
  householdKey,
  houseNumberOf,
  normalizePostal,
  parseName,
  splitUnit,
  streetOf,
  titleCase,
  uid,
} from './normalize';

export interface SheetPreview {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
}

/** Reads an .xlsx/.xls/.csv file entirely in the browser. */
export async function readWorkbook(file: File): Promise<SheetPreview[]> {
  // loaded on demand so the 400kB spreadsheet parser is not in the first paint
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  // raw: a CSV's "1/2" street suffix is a fraction on a house, not 2 January
  const wb = XLSX.read(buf, { type: 'array', cellDates: false, raw: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '', raw: false });
    const headerIdx = findHeaderRow(matrix);
    const width = matrix.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
    const headerRow = Array.from({ length: width }, (_, i) => clean((matrix[headerIdx] ?? [])[i]) || `Column ${i + 1}`);
    const headers = dedupeHeaders(headerRow);
    const rows: Record<string, string>[] = [];
    for (let r = headerIdx + 1; r < matrix.length; r++) {
      const row = matrix[r] ?? [];
      const rec: Record<string, string> = {};
      let filled = 0;
      headers.forEach((h, i) => {
        const v = clean(row[i]);
        rec[h] = v;
        if (v) filled++;
      });
      if (filled > 0) rows.push(rec);
    }
    return { name, headers, rows };
  });
}

const HEADER_WORDS =
  /\b(name|address|city|street|postal|zip|phone|email|poll|ward|unit|apt|community|group|religion|lat|lon|province|state|status|id)\b/i;

/**
 * Spreadsheets often carry a title row or two before the real header. Score rows
 * on how much they look like labels — short, unique, non-numeric, using words we
 * recognise — rather than just on how full they are, so a dense first data row
 * cannot win and cost us a voter.
 */
function findHeaderRow(matrix: string[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const cells = (matrix[r] ?? []).map((c) => clean(c)).filter(Boolean);
    if (cells.length < 2) continue;
    const unique = new Set(cells.map((c) => c.toLowerCase())).size;
    const texty = cells.filter((c) => Number.isNaN(Number(c))).length;
    const shortish = cells.filter((c) => c.length <= 30).length;
    const known = cells.filter((c) => HEADER_WORDS.test(c)).length;
    const score = cells.length + texty + shortish + unique + known * 4;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    return n === 0 ? h : `${h} (${n + 1})`;
  });
}

export interface BuildResult {
  households: Household[];
  people: Person[];
  skipped: number;
}

export interface BuildOptions {
  groupHouseholds: boolean;
  defaultRegion?: string;
  defaultCity?: string;
  /** stamp every row in this file with one group — how a "Muslim list" is layered on */
  forceCommunity?: CommunityId;
}

/** Turns mapped spreadsheet rows into households (map pins) + people (residents). */
export function buildRecords(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  opts: BuildOptions,
): BuildResult {
  const households = new Map<string, Household>();
  const people: Person[] = [];
  let skipped = 0;
  const now = Date.now();

  rows.forEach((row) => {
    const pick = (key: keyof ColumnMapping): string => {
      const col = mapping[key];
      return col ? clean(row[col]) : '';
    };

    // a list may carry one address column, or the number and the street name apart.
    // "96" + "A" is 96A; "4" + "1/2" is 4 1/2 — a letter joins on, anything else
    // keeps its space.
    const streetNumber = pick('streetNumber');
    const suffix = pick('streetSuffix');
    const number = suffix
      ? /^[A-Za-z]$/.test(suffix)
        ? `${streetNumber}${suffix.toUpperCase()}`
        : `${streetNumber} ${suffix}`
      : streetNumber;
    const rawAddress = [number, pick('address')].filter(Boolean).join(' ');
    if (!pick('address')) {
      skipped++;
      return;
    }

    const { street, unit: parsedUnit } = splitUnit(rawAddress);
    const unit = pick('unit') || parsedUnit || '';
    const city = pick('city') || opts.defaultCity || '';
    const postal = normalizePostal(pick('postal'));
    const key = opts.groupHouseholds
      ? householdKey(street, unit, city, postal)
      : `${householdKey(street, unit, city, postal)}|${people.length}`;

    let household = households.get(key);
    if (!household) {
      const lat = Number(pick('lat'));
      const lng = Number(pick('lng'));
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
      household = {
        id: uid('hh'),
        community: 'unknown',
        address: displayAddress(street),
        unit: unit || undefined,
        city: city ? titleCase(city) : undefined,
        postal: postal || undefined,
        region: pick('region') || opts.defaultRegion || undefined,
        poll: pick('poll') || undefined,
        lat: hasCoords ? lat : undefined,
        lng: hasCoords ? lng : undefined,
        geocode: hasCoords ? 'ok' : 'pending',
        geocodePrecision: hasCoords ? 'file' : undefined,
        status: 'not_started',
        visits: 0,
        notes: [],
        tags: [],
        updatedAt: now,
        houseNumber: houseNumberOf(street),
        street: streetOf(street),
      };
      households.set(key, household);
    }

    const splitName = [pick('firstName'), pick('lastName')].filter(Boolean).join(' ');
    const parsed = parseName(splitName || pick('name'));
    const first = pick('firstName') ? titleCase(pick('firstName')) : parsed.first;
    const last = pick('lastName') ? titleCase(pick('lastName')) : parsed.last;

    const community: CommunityId | undefined = opts.forceCommunity ?? normalizeCommunity(pick('community'));
    if (community && household.community === 'unknown') {
      household.community = community;
      household.communitySource = 'file';
    }

    people.push({
      id: uid('p'),
      householdId: household.id,
      community,
      communitySource: community ? 'file' : undefined,
      name: [first, last].filter(Boolean).join(' ') || parsed.display || 'Unnamed resident',
      firstName: first || undefined,
      lastName: last || undefined,
      occupancy: pick('occupancy') || undefined,
      phone: pick('phone') || undefined,
      email: pick('email') || undefined,
      raw: row,
    });
  });

  return { households: [...households.values()], people, skipped };
}
