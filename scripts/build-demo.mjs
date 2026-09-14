/**
 * Builds a single self-contained HTML page: the whole app, its CSS, the sample
 * walk list and (optionally) a pack of map tiles, all inlined. The output is an
 * HTML fragment — no <html>/<head>/<body> — so it can be dropped straight into a
 * host page or opened with the tiny wrapper written alongside it.
 *
 *   npm run build:demo
 *   DEMO_TILES=/path/to/tiles.json npm run build:demo   # embed offline tiles
 */
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'dist-demo');

await build({
  root,
  plugins: [react()],
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 100 * 1024 * 1024,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app[extname]' } },
  },
});

const js = await readFile(path.join(outDir, 'app.js'), 'utf8');
const css = await readFile(path.join(outDir, 'app.css'), 'utf8');

const csv = await readFile(path.join(root, 'sample-data', 'placeholder-list.csv'), 'utf8');
const tilesPath = process.env.DEMO_TILES;
let tiles;
if (tilesPath && existsSync(tilesPath)) tiles = JSON.parse(await readFile(tilesPath, 'utf8'));

const payload = {
  csv,
  tiles,
  maxNativeZoom: Number(process.env.DEMO_MAX_ZOOM ?? 16),
  note: 'Placeholder list loaded — tap any pin to knock the door.',
};

const fragment = `<title>Doorknock</title>
<style>
${css}
</style>
<div id="root"></div>
<script>window.__DOORKNOCK_DEMO__ = ${JSON.stringify(payload)};</script>
<script type="module">
${js}
</script>
`;

await mkdir(outDir, { recursive: true });
const fragmentPath = path.join(outDir, 'doorknock-demo.html');
await writeFile(fragmentPath, fragment);
await writeFile(
  path.join(outDir, 'standalone.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n${fragment}</body></html>\n`,
);

const mb = (s) => (Buffer.byteLength(s) / 1e6).toFixed(2) + ' MB';
console.log(`demo page: ${fragmentPath} (${mb(fragment)})`);
console.log(`tiles embedded: ${tiles ? Object.keys(tiles).length : 0}`);
