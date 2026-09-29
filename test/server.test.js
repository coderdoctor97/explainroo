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
  fs.mkdirSync(path.join(dir, 'assets', 'fonts'));
  fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'Brand-600.woff2'), 'font');
  fs.writeFileSync(path.join(dir, 'assets', 'fonts', 'OFL.txt'), 'license');
  const server = await startServer({ projectDir: dir, getState: () => ({}) });
  try {
    const port = server.port;
    assert.equal((await request(port, { path: '/project/scenes.js' })).status, 200);
    assert.equal((await request(port, { path: '/project/assets/logo.png' })).status, 200);
    assert.equal((await request(port, { path: '/project/assets/fonts/Brand-600.woff2' })).status, 200);
    assert.equal((await request(port, { path: '/project/assets/fonts/OFL.txt' })).status, 404);
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

    // Symlinks do not get around the rules.
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'explainroo-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.png'), 'outside');
    fs.symlinkSync(path.join(dir, '.env'), path.join(dir, 'assets', 'alias.png'));
    fs.symlinkSync(path.join(outside, 'secret.png'), path.join(dir, 'assets', 'away.png'));
    assert.equal((await request(port, { path: '/project/assets/alias.png' })).status, 404);
    assert.equal((await request(port, { path: '/project/assets/away.png' })).status, 404);
    fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
    fs.symlinkSync(path.join(dir, 'scenes.js'), path.join(dir, 'build', 'source-link.js'));
    assert.equal((await put('build/source-link.js')).status, 400);
    assert.equal(fs.readFileSync(path.join(dir, 'scenes.js'), 'utf8'), 'export default {};');
    fs.symlinkSync(path.join(outside, 'new.png'), path.join(dir, 'build', 'dangling.png'));
    assert.equal((await put('build/dangling.png')).status, 400);
    assert.ok(!fs.existsSync(path.join(outside, 'new.png')));
    fs.symlinkSync(outside, path.join(dir, 'out', 'elsewhere'));
    assert.equal((await put('out/elsewhere/x.png')).status, 400);
    assert.ok(!fs.existsSync(path.join(outside, 'x.png')));
    fs.rmSync(outside, { recursive: true, force: true });
  } finally {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
