// Local HTTP server for the engine pages, the project files and uploads from
// the page (rendered audio, stills and sheets). Binds to 127.0.0.1 only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveModule(spec) {
  return fileURLToPath(import.meta.resolve(spec));
}

function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  return p;
}

// Project files the engine page may read: scenes.js and the modules it
// imports, images, audio and video. Never dotfiles such as .env, and no
// JSON, Markdown or text files, which can hold keys or private notes.
const PROJECT_FILES = /\.(m?js|png|jpe?g|webp|gif|svg|wav|mp3|mp4)$/i;

function projectFile(projectDir, rel) {
  const parts = rel.split(/[\\/]+/);
  if (parts.some((x) => x.startsWith('.')) || !PROJECT_FILES.test(rel)) return null;
  return safeJoin(projectDir, rel);
}

// Uploads from the page may only land in build/ or out/, checked after the
// path is normalized so "build/../scenes.js" is refused.
function uploadFile(projectDir, rel) {
  const dest = safeJoin(projectDir, rel);
  if (!dest) return null;
  const inside = ['build', 'out'].some((d) => dest.startsWith(path.join(projectDir, d) + path.sep));
  return inside ? dest : null;
}

export function startServer({ projectDir, getState, port = 0 }) {
  const roughPath = resolveModule('roughjs/bundled/rough.esm.js');
  const server = http.createServer(async (req, res) => {
    try {
      // Only answer requests addressed to this machine. A web page on another
      // site that points its own domain at 127.0.0.1 (DNS rebinding) sends a
      // different Host header and is turned away.
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) return send(res, 403, 'forbidden host');
      const origin = req.headers.origin;
      if (origin && !hosts.some((h) => origin === `http://${h}`)) return send(res, 403, 'forbidden origin');
      const url = new URL(req.url, 'http://x');
      const p = decodeURIComponent(url.pathname);
      if (req.method === 'PUT' && p === '/__upload') {
        const rel = url.searchParams.get('path') || '';
        const dest = uploadFile(projectDir, rel);
        if (!dest) return send(res, 400, 'uploads go to build/ or out/');
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        const chunks = [];
        for await (const c of req) chunks.push(c);
        fs.writeFileSync(dest, Buffer.concat(chunks));
        return send(res, 200, 'ok');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
      if (p === '/favicon.ico') return send(res, 204, '');
      if (p === '/__state.json') {
        const state = await getState();
        return send(res, 200, JSON.stringify(state), TYPES['.json']);
      }
      let file = null;
      if (p === '/' || p === '/studio.html') file = path.join(ROOT, 'engine', 'studio.html');
      else if (p === '/frame.html') file = path.join(ROOT, 'engine', 'frame.html');
      else if (p === '/vendor/rough.js') file = roughPath;
      else if (p.startsWith('/engine/')) file = safeJoin(path.join(ROOT, 'engine'), p.slice(8));
      else if (p.startsWith('/fonts/')) file = safeJoin(path.join(ROOT, 'fonts'), p.slice(7));
      else if (p.startsWith('/project/')) file = projectFile(projectDir, p.slice(9));
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, `not found: ${p}`);
      const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      send(res, 500, String(e && e.stack || e));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({ url: `http://127.0.0.1:${actual}`, port: actual, close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }) });
    });
  });
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
