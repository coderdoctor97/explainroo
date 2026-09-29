import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../src/server.js';

function request(port, { method = 'GET', path: p, host = `127.0.0.1:${port}`, origin, body }) {
  return new Promise((resolve, reject) => {
    const headers = { host };
    if (origin) headers.origin = origin;
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the preview server keeps secrets and sources safe', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'explainroo-server-'));
  fs.writeFileSync(path.join(dir, '.env'), 'OPENROUTER_API_KEY=secret');
  fs.writeFileSync(path.join(dir, 'notes.md'), 'private');
  fs.writeFileSync(path.join(dir, 'scenes.js'), 'export default {};');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'logo.png'), 'png');
  const server = await startServer({ projectDir: dir, getState: () => ({}) });
  try {
    const port = server.port;
    assert.equal((await request(port, { path: '/project/scenes.js' })).status, 200);
    assert.equal((await request(port, { path: '/project/assets/logo.png' })).status, 200);
    assert.equal((await request(port, { path: '/project/.env' })).status, 404);
    assert.equal((await request(port, { path: '/project/notes.md' })).status, 404);
    assert.equal((await request(port, { path: '/project/assets/../.env' })).status, 404);
    assert.equal((await request(port, { path: '/project/scenes.js', host: 'evil.example:80' })).status, 403);
    assert.equal((await request(port, { path: '/project/scenes.js', origin: 'http://evil.example' })).status, 403);
    const put = (p) => request(port, { method: 'PUT', path: `/__upload?path=${encodeURIComponent(p)}`, body: 'x' });
    assert.equal((await put('build/../scenes.js')).status, 400);
    assert.equal(fs.readFileSync(path.join(dir, 'scenes.js'), 'utf8'), 'export default {};');
    assert.equal((await put('out/stills/a.png')).status, 200);
    assert.ok(fs.existsSync(path.join(dir, 'out', 'stills', 'a.png')));
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
