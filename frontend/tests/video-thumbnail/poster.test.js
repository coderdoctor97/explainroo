import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, build } from 'vite';
import { validateHtml } from '../../scripts/validate-html.mjs';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import axe from 'axe-core';

let vite, dom, root, AccessibleVideo, Render, fallback, origin;
const probes = [];
const saved = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><html lang="en"><head><title>Video tests</title></head><body><main><h1>Video</h1><div id="root"></div></main></body></html>', { url: 'http://studio.test', runScripts: 'outside-only' });
  class FakeImage {
    naturalWidth = 640;
    set src(value) { this.url = value; probes.push(this); }
  }
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'Image']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === 'Image' ? FakeImage : key === 'window' ? dom.window : dom.window[key], configurable: true, writable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('root'));
  vite = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)),
    server: { port: 0, host: '0.0.0.0', hmr: false, proxy: undefined }, logLevel: 'error',
  });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  ({ AccessibleVideo, DEFAULT_VIDEO_POSTER: fallback } = await vite.ssrLoadModule('/src/components/AccessibleVideo.tsx'));
  ({ Render } = await vite.ssrLoadModule('/src/stages/Render.tsx'));
});
afterEach(async () => { await act(async () => root.render(null)); probes.length = 0; });
after(async () => {
  await act(async () => root?.unmount());
  await vite?.close(); dom?.window.close();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const props = { src: '/sample.mp4', title: 'Sample', captions: [{ src: '/en.vtt', srclang: 'en', label: 'English', default: true }] };
const video = () => document.querySelector('video');
const poster = () => video().getAttribute('poster');
const mount = async (extra = {}) => act(async () => root.render(React.createElement(AccessibleVideo, { ...props, ...extra })));

test('missing, empty and whitespace posters always use the bundled preview', async () => {
  for (const value of [undefined, '', '   ']) {
    await mount({ poster: value });
    assert.equal(poster(), fallback);
  }
  assert.equal(probes.length, 0);
});

test('SSR includes a visible fallback before effects or custom image loading', () => {
  const markup = renderToStaticMarkup(React.createElement(AccessibleVideo, { ...props, poster: '/custom.webp' }));
  const parsed = new JSDOM(markup);
  try { assert.equal(parsed.window.document.querySelector('video').getAttribute('poster'), fallback); }
  finally { parsed.window.close(); }
});

test('a custom poster replaces the fallback only when successfully loaded', async () => {
  await mount({ poster: ' /custom.webp ' });
  assert.equal(poster(), fallback);
  assert.equal(probes[0].url, '/custom.webp');
  await act(async () => probes[0].onload());
  assert.equal(poster(), '/custom.webp');
});

test('failed and zero-width custom images retain the bundled fallback', async () => {
  await mount({ poster: '/missing.webp' });
  await act(async () => probes[0].onerror());
  assert.equal(poster(), fallback);
  await mount({ poster: '/empty.webp' });
  probes[1].naturalWidth = 0;
  await act(async () => probes[1].onload());
  assert.equal(poster(), fallback);
  assert.equal(probes.length, 2); // No retry loop against the fallback.
});

test('poster changes cannot be overwritten by stale image callbacks', async () => {
  await mount({ poster: '/old.webp' });
  const staleLoad = probes[0].onload;
  await mount({ poster: '/new.webp' });
  await act(async () => staleLoad());
  assert.equal(poster(), fallback);
  await act(async () => probes[1].onload());
  assert.equal(poster(), '/new.webp');
  await mount();
  assert.equal(poster(), fallback);
});

test('Render uses its first scene still, or the fallback when there are no stills', async () => {
  const renderProps = {
    id: 'demo', status: { built: false, out: { video: { bytes: 1000, mtime: 0 } }, sources: { audio: { ok: true } }, stills: ['s01.png', 's02.png'] },
    studio: { name: 'Demo', look: { style: 'paper' } }, job: null, doctor: null, busy: false, run() {}, onRefresh() {},
  };
  await act(async () => root.render(React.createElement(Render, renderProps)));
  assert.equal(poster(), fallback);
  assert.match(decodeURIComponent(probes[0].url), /out\/stills\/s01\.png/);
  await act(async () => probes[0].onload());
  assert.equal(poster(), probes[0].url);
  await act(async () => root.render(React.createElement(Render, { ...renderProps, status: { ...renderProps.status, stills: [] } })));
  assert.equal(poster(), fallback);
});

test('served fallback returns HTTP 200 and decodes as a visible 640×360 WebP', async () => {
  await mount();
  const response = await fetch(new URL(poster(), origin));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/webp/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < 20_000);
  const { info, data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 640);
  assert.equal(info.height, 360);
  assert.ok(new Set(data).size > 10); // Not a one-pixel or blank stand-in.
});

test('fallback asset stays small and is explicitly imported through Vite', async () => {
  const bytes = fs.readFileSync(new URL('../../src/assets/video-thumbnail/placeholder.webp', import.meta.url));
  assert.equal((await sharp(bytes).metadata()).format, 'webp');
  assert.ok(bytes.length < 20_000);
  assert.match(fallback, /placeholder\.webp/);
});

test('posters preserve controls, caption tracks and accessible naming', async () => {
  await mount();
  assert.equal(video().controls, true);
  assert.equal(video().autoplay, false);
  assert.equal(video().getAttribute('aria-label'), 'Video player – Sample');
  assert.equal(video().querySelector('track').getAttribute('kind'), 'captions');
  dom.window.eval(axe.source);
  const result = await dom.window.axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(result.violations, (v) => v.id), []);
});


test('HTML validation rejects missing or empty posters and accepts the actual component markup', async () => {
  const shell = (content) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Video</title></head><body>${content}</body></html>`;
  for (const attribute of ['', 'poster=""', 'poster="   "']) {
    const result = await validateHtml(shell(`<video controls ${attribute}></video>`));
    assert.ok(result.errors > 0);
    assert.ok(result.messages.some((m) => ['element-required-attributes', 'attribute-allowed-values'].includes(m.ruleId)));
  }
  const markup = renderToStaticMarkup(React.createElement(AccessibleVideo, props));
  const result = await validateHtml(shell(markup));
  assert.equal(result.errors, 0, JSON.stringify(result.messages));
});

test('production build emits a decodable poster and honors a nested deployment base', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-poster-build-'));
  try {
    await build({ root: fileURLToPath(new URL('../../', import.meta.url)),
      configFile: fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)),
      base: '/nested/', build: { outDir: dir, emptyOutDir: true }, logLevel: 'silent',
    });
    const assets = path.join(dir, 'assets');
    const names = fs.readdirSync(assets);
    const posterName = names.find((name) => /^placeholder-.*\.webp$/.test(name));
    assert.ok(posterName, names.join(', '));
    const result = await sharp(fs.readFileSync(path.join(assets, posterName))).raw().toBuffer({ resolveWithObject: true });
    assert.equal(result.info.width, 640);
    const javascript = names.filter((name) => name.endsWith('.js')).map((name) => fs.readFileSync(path.join(assets, name), 'utf8')).join('\n');
    assert.ok(javascript.includes(`/nested/assets/${posterName}`));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
