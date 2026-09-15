/**
 * Adds Latitude/Longitude columns to a voter list by matching each address
 * against an open municipal address-point dataset, so the doors land exactly and
 * nothing has to be geocoded one-per-second.
 *
 *   node scripts/join-coordinates.mjs <voters.csv> <address-points.json> <out.csv>
 *
 * The address-point file is an array of { n, u, s, lat, lng } — house number,
 * unit, street name, and position. `scripts/fetch-address-points.mjs` builds one
 * from an ArcGIS feature service.
 */
import { readFile, writeFile } from 'node:fs/promises';

const [listPath, pointsPath, outPath] = process.argv.slice(2);
if (!listPath || !pointsPath || !outPath) {
  console.error('usage: join-coordinates.mjs <voters.csv> <address-points.json> <out.csv>');
  process.exit(1);
}

const normStreet = (s) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Minimal RFC4180 reader — the lists carry quoted names with commas in them. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const toCsv = (rows) =>
  rows
    .map((r) => r.map((c) => (/[",\n]/.test(c ?? '') ? `"${String(c).replace(/"/g, '""')}"` : c ?? '')).join(','))
    .join('\n') + '\n';

const rows = parseCsv(await readFile(listPath, 'utf8'));
const header = rows[0];
const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name);
const numberAt = col('street #');
const suffixAt = col('street # suffix');
const streetAt = col('street name');

if (numberAt < 0 || streetAt < 0) {
  console.error('expected "Street #" and "Street Name" columns');
  process.exit(1);
}

const points = JSON.parse(await readFile(pointsPath, 'utf8'));
const index = new Map();
points.forEach((p) => {
  const key = `${String(p.n ?? '').trim().toUpperCase()}|${normStreet(p.s)}`;
  if (!index.has(key)) index.set(key, p);
});

let matched = 0;
const out = [[...header, 'Latitude', 'Longitude']];
for (const row of rows.slice(1)) {
  const number = `${(row[numberAt] ?? '').trim()}${suffixAt >= 0 ? (row[suffixAt] ?? '').trim() : ''}`;
  const hit =
    index.get(`${number.toUpperCase()}|${normStreet(row[streetAt])}`) ??
    // "4 1/2" and "96A" only exist in the voter file; fall back to the plain number
    index.get(`${(row[numberAt] ?? '').trim().toUpperCase()}|${normStreet(row[streetAt])}`);
  if (hit) matched++;
  out.push([...row, hit ? hit.lat.toFixed(7) : '', hit ? hit.lng.toFixed(7) : '']);
}

await writeFile(outPath, toCsv(out));
console.log(`${matched} of ${rows.length - 1} rows placed · ${outPath}`);
