// PROTOTYPE — worker_threads body for the resvg concurrency test.
import { parentPort, workerData } from 'node:worker_threads';
import { Resvg } from '@resvg/resvg-js';

const { svg, fontFiles, n } = workerData;
const times = [];
for (let i = 0; i < n; i++) {
  const t = process.hrtime.bigint();
  const r = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Lato' } });
  r.render().asPng();
  times.push(Number(process.hrtime.bigint() - t) / 1e6);
}
parentPort.postMessage(times);
