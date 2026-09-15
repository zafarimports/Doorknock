/**
 * Builds `public/preload.json` — the list a shipped build opens on.
 *
 *   node scripts/make-preload.mjs --base <voters.csv> \
 *        --group "Muslim=<muslim.xlsx>" [--group "Black=<black.csv>" …] \
 *        [--city Cambridge] [--only muslim]
 *
 * It drives the real app in a headless browser and exports its project file, so
 * the preload is built by exactly the code a canvasser's import would run — no
 * second implementation to drift.
 *
 * The output contains real names and addresses. It is gitignored on purpose:
 * ship it inside an APK you hand to your own team, never to a public web build.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const groups = args.reduce((acc, a, i) => (args[i - 1] === '--group' ? [...acc, a] : acc), []);

const base = flag('base');
const city = flag('city') ?? 'Cambridge';
const only = flag('only');
const chromePath = flag('chrome') ?? process.env.CHROME_PATH;
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');

if (!base) {
  console.error('usage: make-preload.mjs --base <voters.csv> [--group "Label=<file>"] [--city X] [--only id]');
  process.exit(1);
}
await stat(path.join(dist, 'index.html')).catch(() => {
  console.error('run `npm run build` first — this drives the built app');
  process.exit(1);
});

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const rel = (req.url ?? '/').split('?')[0];
  const file = path.join(dist, rel === '/' ? 'index.html' : rel);
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  createReadStream(file)
    .on('error', () => res.writeHead(404).end())
    .once('open', () => {
      res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    })
    .pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
// nothing here needs the network: coordinates come from the file
await page.route('**tile**', (r) => r.abort());
await page.route('**nominatim**', (r) => r.abort());

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Upload spreadsheet' }).waitFor({ timeout: 30000 });
await page.getByRole('button', { name: 'Upload spreadsheet' }).click();

const importFile = async (file, label) => {
  await page.locator('input[type=file]').setInputFiles(path.resolve(file));
  await page.waitForSelector('.mapping-grid', { timeout: 120000 });

  const cityField = page.locator('.field', { hasText: 'City or town these addresses are in' });
  if (await cityField.count()) await cityField.locator('input').fill(city);

  if (label) {
    const select = page.locator('.field', { hasText: 'Everyone in this file is' }).locator('select');
    const options = await select.locator('option').allTextContents();
    if (!options.includes(label)) {
      page.once('dialog', (d) => d.accept(label));
      await select.selectOption('__new__');
    } else {
      await select.selectOption({ label });
    }
  }

  const before = Date.now();
  await page.getByRole('button', { name: /Import \d+ rows/ }).click();
  await page.waitForFunction(() => !document.querySelector('.modal'), null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  console.log(`imported ${path.basename(file)}${label ? ` as ${label}` : ''} in ${Date.now() - before} ms`);
};

await importFile(base);
for (const spec of groups) {
  const at = spec.indexOf('=');
  const label = spec.slice(0, at).trim();
  const file = spec.slice(at + 1).trim();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('.segmented button', { hasText: 'List' }).click();
  await page.getByRole('button', { name: 'Upload spreadsheet' }).click();
  await importFile(file, label);
  await page.locator('.sheet--left').getByRole('button', { name: 'Close' }).click();
}

const download = page.waitForEvent('download', { timeout: 300000 });
await page.getByRole('button', { name: 'Menu' }).click();
await page.locator('.segmented button', { hasText: 'List' }).click();
await page.getByRole('button', { name: 'Project file' }).click();
const saved = await (await download).path();

const project = JSON.parse(await readFile(saved, 'utf8'));
if (only) project.initialFilter = { onlyCommunity: only };
const out = path.join(root, 'public', 'preload.json');
await writeFile(out, JSON.stringify(project));

const counts = project.households.reduce((acc, h) => ({ ...acc, [h.community]: (acc[h.community] ?? 0) + 1 }), {});
const placed = project.households.filter((h) => h.lat !== undefined).length;
console.log(`\n${out}`);
console.log(`doors: ${project.households.length} · people: ${project.people.length} · on the map: ${placed}`);
console.log('groups:', counts);
if (only) console.log(`opens showing: ${only}`);

await browser.close();
server.close();
