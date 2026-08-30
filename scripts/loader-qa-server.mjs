// Local-only production-build QA. Each URL prefix has its own cold asset cache.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.txt': 'text/plain' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const [, mode, ...segments] = decodeURIComponent(url.pathname).split('/');
  if (!['normal', 'slow', 'broken-module', 'broken-frame'].includes(mode)) { res.writeHead(404).end(); return; }
  const name = segments.join('/') || 'index.html';
  const file = path.resolve(root, name);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if ((mode === 'broken-module' && name.endsWith('wanderhaym-loader.js')) || (mode === 'broken-frame' && name.endsWith('cat-03-swing.webp'))) {
    res.writeHead(404).end('Intentional QA fixture'); return;
  }
  try {
    const data = await readFile(file);
    const send = () => { if (!res.destroyed) res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data); };
    if (mode === 'slow' && /\.(webp|wav)$/.test(name)) setTimeout(send, 1000);
    else send();
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.argv[2]) || 4194, '127.0.0.1', () => console.log('Loader QA: http://127.0.0.1:' + server.address().port + '/normal/'));
