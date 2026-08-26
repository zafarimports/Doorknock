import type { ColumnMapping, Household, Person } from '../types';
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
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '', raw: false });
    const headerIdx = findHeaderRow(matrix);
    const headerRow = (matrix[headerIdx] ?? []).map((h, i) => clean(h) || `Column ${i + 1}`);
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

/** Spreadsheets often carry a title row or two before the real header. */
function findHeaderRow(matrix: string[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const row = matrix[r] ?? [];
    const filled = row.filter((c) => clean(c)).length;
    const texty = row.filter((c) => clean(c) && Number.isNaN(Number(clean(c)))).length;
    const score = filled + texty;
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

/** Turns mapped spreadsheet rows into households (map pins) + people (residents). */
export function buildRecords(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
  opts: { groupHouseholds: boolean; defaultRegion?: string },
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

    const rawAddress = pick('address');
    if (!rawAddress) {
      skipped++;
      return;
    }

    const { street, unit: parsedUnit } = splitUnit(rawAddress);
    const unit = pick('unit') || parsedUnit || '';
    const city = pick('city');
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

    const nameRaw =
      pick('name') || [pick('firstName'), pick('lastName')].filter(Boolean).join(' ');
    const parsed = parseName(nameRaw);
    const first = pick('firstName') ? titleCase(pick('firstName')) : parsed.first;
    const last = pick('lastName') ? titleCase(pick('lastName')) : parsed.last;

    people.push({
      id: uid('p'),
      householdId: household.id,
      name: parsed.display || [first, last].filter(Boolean).join(' ') || 'Unnamed resident',
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
