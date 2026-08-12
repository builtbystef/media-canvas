// PROTOTYPE — the one step that starts it: node server.mjs
// Static server for the page, plus /fonts/* mapped to the system Lato files (so no
// font binaries have to live on this disposable branch).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const FONTS = '/usr/share/fonts/truetype/lato/';
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript',
  '.json': 'application/json', '.ttf': 'font/ttf', '.css': 'text/css' };

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const path = url.startsWith('/fonts/')
    ? join(FONTS, normalize(url.slice(7)))
    : join(ROOT, normalize(url === '/' ? '/index.html' : url));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found: ' + path);
  }
}).listen(4321, () => console.log('PROTOTYPE editor-preview → http://localhost:4321'));
