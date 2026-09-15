/**
 * Pulls the City of Cambridge open Address Points layer so ward doors can be
 * placed exactly, instead of geocoding 4,000+ buildings one per second.
 */
import { writeFile } from 'node:fs/promises';

const BASE =
  'https://services5.arcgis.com/LTaPSxJTf948f8sm/arcgis/rest/services/AddressPoints/FeatureServer/0/query';
const PAGE = 1000;
const out = [];

for (let offset = 0; ; offset += PAGE) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'HOUSE_NUMBER,UNIT_NUMBER,STREET_NAME,STATUS,WARD_ID,ADDRESS_LABEL',
    outSR: '4326',
    f: 'json',
    resultOffset: String(offset),
    resultRecordCount: String(PAGE),
  });
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`address service returned ${res.status}`);
  const json = await res.json();
  const features = json.features ?? [];
  features.forEach((f) => {
    if (!f.geometry) return;
    out.push({
      n: f.attributes.HOUSE_NUMBER,
      u: f.attributes.UNIT_NUMBER,
      s: f.attributes.STREET_NAME,
      w: f.attributes.WARD_ID,
      st: f.attributes.STATUS,
      lat: f.geometry.y,
      lng: f.geometry.x,
    });
  });
  process.stdout.write(`\r${out.length} points`);
  if (!json.exceededTransferLimit || features.length === 0) break;
}

await writeFile(process.argv[2], JSON.stringify(out));
console.log(`\nsaved ${out.length} address points`);
