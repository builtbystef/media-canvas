// PROTOTYPE — the full bench: renders the sample doc through both candidates,
// pixel-diffs, times, writes out/ + compare.html. Run: node bench.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { Resvg } from '@resvg/resvg-js';
import * as resvgWasm from '@resvg/resvg-wasm';
import { PDFDocument } from 'pdf-lib';
import { doc } from './sample-doc.mjs';
import { compile, FONT_FILES } from './compile.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const results = { renders: {}, diffs: {}, timings: {}, notes: [] };

const stats = (ts) => {
  const s = [...ts].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1),
    median: +s[Math.floor(s.length / 2)].toFixed(1),
    p95: +s[Math.floor(s.length * 0.95)].toFixed(1),
  };
};

// ---------- 1. synthesize the sample photo (800x600, gradient + circles) ----------
{
  const png = new PNG({ width: 800, height: 600 });
  for (let y = 0; y < 600; y++) for (let x = 0; x < 800; x++) {
    const i = (y * 800 + x) * 4;
    png.data[i] = Math.round(40 + (x / 800) * 180);
    png.data[i + 1] = Math.round(80 + (y / 600) * 120);
    png.data[i + 2] = Math.round(200 - (x / 800) * 120);
    png.data[i + 3] = 255;
  }
  for (const [cx, cy, r, rgb] of [[200, 180, 90, [255, 209, 102]], [560, 340, 130, [239, 71, 111]], [400, 480, 70, [255, 255, 255]]]) {
    for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
      if (x < 0 || y < 0 || x >= 800 || y >= 600) continue;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * 800 + x) * 4;
      [png.data[i], png.data[i + 1], png.data[i + 2]] = rgb;
    }
  }
  writeFileSync(OUT + 'photo.png', PNG.sync.write(png));
}
const photoDataUri = 'data:image/png;base64,' + readFileSync(OUT + 'photo.png').toString('base64');

// ---------- 2. compile document -> SVG (shared by every engine) ----------
const svg = compile(doc, { 'photo.png': photoDataUri });
writeFileSync(OUT + 'design.svg', svg);
writeFileSync(OUT + 'sample-doc.json', JSON.stringify(doc, null, 2));
console.log(`compiled SVG: ${(svg.length / 1024).toFixed(0)} KB`);

const fontFiles = Object.values(FONT_FILES);
const resvgOpts = { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Lato' } };

// ---------- 3. Candidate B: resvg native ----------
{
  for (let i = 0; i < 3; i++) new Resvg(svg, resvgOpts).render().asPng(); // warmup
  const times = [];
  let png;
  for (let i = 0; i < 30; i++) {
    const t = process.hrtime.bigint();
    png = new Resvg(svg, resvgOpts).render().asPng();
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  writeFileSync(OUT + 'b-native.png', png);
  results.timings['b-native-sequential'] = stats(times);
  const a = new Resvg(svg, resvgOpts).render().asPng();
  const b = new Resvg(svg, resvgOpts).render().asPng();
  results.notes.push(`resvg determinism (same host, repeat renders byte-identical): ${Buffer.compare(a, b) === 0}`);
  results.timings['b-native-rss-mb'] = Math.round(process.memoryUsage().rss / 1e6);
}

// ---------- 4. Candidate B: resvg WASM (the editor-preview side) ----------
{
  await resvgWasm.initWasm(readFileSync(new URL(import.meta.resolve('@resvg/resvg-wasm/index_bg.wasm')).pathname));
  const fontBuffers = fontFiles.map((f) => new Uint8Array(readFileSync(f)));
  const wasmOpts = { font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Lato' } };
  new resvgWasm.Resvg(svg, wasmOpts).render().asPng(); // warmup
  const times = [];
  let png;
  for (let i = 0; i < 10; i++) {
    const t = process.hrtime.bigint();
    png = new resvgWasm.Resvg(svg, wasmOpts).render().asPng();
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  writeFileSync(OUT + 'b-wasm.png', Buffer.from(png));
  results.timings['b-wasm-sequential'] = stats(times);
  results.notes.push(`resvg native vs WASM byte-identical PNG: ${Buffer.compare(readFileSync(OUT + 'b-native.png'), Buffer.from(png)) === 0}`);
}

// ---------- 5. Candidate B: concurrency via worker_threads (4 workers x 10) ----------
{
  const t0 = process.hrtime.bigint();
  const all = await Promise.all(Array.from({ length: 4 }, () =>
    new Promise((res, rej) => {
      const w = new Worker(new URL('./worker-resvg.mjs', import.meta.url), { workerData: { svg, fontFiles, n: 10 } });
      w.on('message', res); w.on('error', rej);
    })));
  const wall = Number(process.hrtime.bigint() - t0) / 1e6;
  results.timings['b-native-concurrent-4x10'] = { wallMs: Math.round(wall), perRenderMs: +(wall / 40).toFixed(1), workerTimes: stats(all.flat()) };
}

// ---------- 6. Candidate B: PDF (raster, PNG embedded via pdf-lib) ----------
{
  const t = process.hrtime.bigint();
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(readFileSync(OUT + 'b-native.png'));
  const page = pdf.addPage([doc.canvas.width, doc.canvas.height]);
  page.drawImage(img, { x: 0, y: 0, width: doc.canvas.width, height: doc.canvas.height });
  writeFileSync(OUT + 'b-raster.pdf', await pdf.save());
  results.timings['b-pdf-ms'] = +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1);
}

// ---------- 7. Candidate A: headless Chromium via Playwright ----------
const html = `<!doctype html><html><head><style>
@font-face{font-family:'Lato';font-weight:400;src:url(data:font/ttf;base64,${readFileSync(FONT_FILES[400]).toString('base64')}) format('truetype')}
@font-face{font-family:'Lato';font-weight:700;src:url(data:font/ttf;base64,${readFileSync(FONT_FILES[700]).toString('base64')}) format('truetype')}
html,body{margin:0;padding:0}</style></head><body>${svg}</body></html>`;

async function benchChromium(launchOpts, tag) {
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: doc.canvas.width, height: doc.canvas.height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const renderOnce = async (p) => {
    await p.setContent(html);
    await p.evaluate(() => document.fonts.ready);
    return p.screenshot({ clip: { x: 0, y: 0, width: 1080, height: 1080 } });
  };
  for (let i = 0; i < 3; i++) await renderOnce(page); // warmup
  const times = []; let shot;
  for (let i = 0; i < 30; i++) {
    const t = process.hrtime.bigint();
    shot = await renderOnce(page);
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  writeFileSync(OUT + `${tag}.png`, shot);
  results.timings[`${tag}-sequential`] = stats(times);
  const again = await renderOnce(page);
  results.notes.push(`${tag} determinism (same host, repeat renders byte-identical): ${Buffer.compare(shot, again) === 0}`);
  // concurrency: 8 pages, 40 renders total
  const pages = await Promise.all(Array.from({ length: 8 }, () => ctx.newPage()));
  const t0 = process.hrtime.bigint();
  await Promise.all(pages.map(async (p, pi) => { for (let i = 0; i < 5; i++) await renderOnce(p); }));
  const wall = Number(process.hrtime.bigint() - t0) / 1e6;
  results.timings[`${tag}-concurrent-8x5`] = { wallMs: Math.round(wall), perRenderMs: +(wall / 40).toFixed(1) };
  try {
    const rss = execSync(`ps -o rss= -p ${browser.process().pid} --ppid ${browser.process().pid} 2>/dev/null | awk '{s+=$1} END {print s}'`).toString().trim();
    results.timings[`${tag}-browser-rss-mb`] = Math.round(Number(rss) / 1024);
  } catch { /* best effort */ }
  // PDF via CDP printToPDF (vector)
  if (tag === 'a-shell') {
    const t = process.hrtime.bigint();
    const pdf = await page.pdf({ width: '1080px', height: '1080px', printBackground: true, pageRanges: '1' });
    writeFileSync(OUT + 'a-vector.pdf', pdf);
    results.timings['a-pdf-ms'] = +(Number(process.hrtime.bigint() - t) / 1e6).toFixed(1);
  }
  await browser.close();
}

await benchChromium({}, 'a-shell'); // chromium-headless-shell (the worker default)
try {
  await benchChromium({ channel: 'chromium' }, 'a-full'); // full build, new headless (closer to the editor's browser)
} catch (e) {
  results.notes.push(`full-chromium comparison skipped: ${e.message.split('\n')[0]}`);
}

// ---------- 8. pixel diffs ----------
function diff(f1, f2, tag) {
  const p1 = PNG.sync.read(readFileSync(OUT + f1 + '.png'));
  const p2 = PNG.sync.read(readFileSync(OUT + f2 + '.png'));
  if (p1.width !== p2.width || p1.height !== p2.height) {
    results.diffs[tag] = { error: `size mismatch ${p1.width}x${p1.height} vs ${p2.width}x${p2.height}` };
    return;
  }
  const out = new PNG({ width: p1.width, height: p1.height });
  const n = pixelmatch(p1.data, p2.data, out.data, p1.width, p1.height, { threshold: 0.1 });
  writeFileSync(OUT + `diff-${tag}.png`, PNG.sync.write(out));
  results.diffs[tag] = { differingPixels: n, pct: +((n / (p1.width * p1.height)) * 100).toFixed(3) };
}
diff('b-native', 'b-wasm', 'b-native-vs-wasm');
diff('a-shell', 'b-native', 'a-vs-b');
try { diff('a-shell', 'a-full', 'a-shell-vs-full'); } catch { /* a-full may not exist */ }

// ---------- 9. extrapolate to 1,000 ----------
for (const [tag, key] of [['A (chromium)', 'a-shell'], ['B (resvg)', 'b-native']]) {
  const seq = results.timings[`${key}-sequential`];
  const conc = results.timings[`${key}-concurrent-${key === 'a-shell' ? '8x5' : '4x10'}`];
  results.timings[`batch-1000-${key}`] = {
    sequentialMin: +((seq.mean * 1000) / 60000).toFixed(1),
    concurrentMin: +((conc.perRenderMs * 1000) / 60000).toFixed(1),
  };
}

writeFileSync(OUT + 'timings.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

// ---------- 10. compare.html ----------
const imgs = ['a-shell', 'a-full', 'b-native', 'b-wasm'].map((t) =>
  `<figure><figcaption>${t}</figcaption><img src="${t}.png"></figure>`).join('');
const diffs = Object.keys(results.diffs).map((t) =>
  `<figure><figcaption>diff: ${t} — ${JSON.stringify(results.diffs[t])}</figcaption><img src="diff-${t}.png"></figure>`).join('');
writeFileSync(OUT + 'compare.html', `<!doctype html><title>PROTOTYPE render fidelity</title>
<style>body{font-family:sans-serif;background:#222;color:#eee;margin:20px}figure{display:inline-block;margin:8px;max-width:46%}img{width:100%;border:1px solid #555}figcaption{font-size:13px;margin-bottom:4px}pre{background:#111;padding:12px;overflow:auto}</style>
<h1>Render fidelity — side by side</h1>${imgs}<h2>Diffs</h2>${diffs}
<h2>Numbers</h2><pre>${JSON.stringify(results, null, 2)}</pre>`);
console.log('\nwrote out/compare.html');
