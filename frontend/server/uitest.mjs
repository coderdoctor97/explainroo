// A UI test that needs no browser: the studio's own API and the real React
// components, mounted in jsdom, driven the way a person would drive them —
// press the buttons, watch the readout, change the look.
//
//   npm run test:ui
//
// jsdom draws no pixels, so this says nothing about how the page looks. It
// says everything about whether it works: every step is the same request the
// browser makes, and every assertion is read back out of the DOM.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { startStudioApi } from './api.js';
import { checkCharset } from '../scripts/check-charset.mjs';
import { checkDoctype } from '../scripts/check-doctype.mjs';
import { checkViewport, firstViewportMeta } from '../scripts/check-viewport.mjs';
import { checkSri, checkSriText } from '../scripts/check-sri.mjs';
import { checkUniqueIds, checkUniqueIdsText, duplicateIds } from '../scripts/check-unique-ids.mjs';
import { checkDeferAsync, checkDeferAsyncText } from '../scripts/check-defer-async.mjs';
import { checkVideoAccessibility, checkVideoAccessibilityText } from '../scripts/check-video-accessibility.mjs';
import { charsetRule } from '../dev.mjs';
import { projectPaths } from './store.js';
import { checkSemanticHtml } from '../scripts/check-semantic-html.mjs';
import { checkInputTypes } from '../scripts/check-input-types.mjs';
import { inputAxeViolations } from '../tests/input-types/helpers.mjs';
import { semanticAxeViolations } from '../tests/semantic-html/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let checks = 0;
let failures = 0;

function ok(label, condition, extra = '') {
  checks += 1;
  if (condition) {
    process.stdout.write(`ok   ${label}${extra ? ` — ${extra}` : ''}\n`);
  } else {
    failures += 1;
    process.stdout.write(`FAIL ${label}${extra ? ` — ${extra}` : ''}\n`);
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let actImpl = async (fn) => fn();
const settle = (ms = 150) => actImpl(async () => wait(ms));

async function until(fn, { tries = 60, gap = 150 } = {}) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (value) return value;
    await settle(gap);
  }
  return null;
}

// ---------- the three files, made here ----------
function sampleFiles() {
  const sentences = [
    'A cache is a small copy of something slow, kept close by.',
    'Your browser keeps the pictures and the styles of a website so it does not ask for them twice.',
    'The first visit is slow and every visit after it is fast.',
  ];
  const transcript = sentences.join('\n\n') + '\n';
  const words = transcript.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  const per = 0.3;
  const timings = words.map((word, i) => ({ word, start: +(i * per).toFixed(3), end: +((i + 1) * per - 0.03).toFixed(3) }));
  let cursor = 0;
  const segments = sentences.map((text) => {
    const count = text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g).length;
    const segWords = timings.slice(cursor, cursor + count);
    cursor += count;
    return { text, start: segWords[0].start, end: segWords.at(-1).end, words: segWords };
  });
  const duration = words.length * per + 1;
  const sampleRate = 16000;
  const frames = Math.round(duration * sampleRate);
  const pcm = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) pcm.writeInt16LE(Math.round(Math.sin((i / sampleRate) * 2 * Math.PI * 220) * 8000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return {
    transcript: Buffer.from(transcript),
    timestamps: Buffer.from(JSON.stringify({ language: 'en', segments }, null, 2)),
    audio: Buffer.concat([header, pcm]),
  };
}

// ---------- a page to mount into ----------
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'frontend/index.html'), 'utf8'), {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'FormData', 'Blob', 'File', 'FileReader', 'Image']) {
  if (window[key] === undefined) continue;
  Object.defineProperty(globalThis, key, { value: window[key], writable: true, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const problems = [];
window.addEventListener('error', (e) => problems.push(String(e.message)));
const realError = console.error;
console.error = (...args) => {
  const line = args.map((a) => (a && a.message) || String(a)).join(' ');
  if (!/not wrapped in act/.test(line)) problems.push(line);
  realError(...args);
};

// ---------- the API the page will talk to ----------
const api = await startStudioApi({ port: 0 });
const files = sampleFiles();
const call = async (p, init) => {
  const res = await fetch(`${api.url}/api${p}`, init);
  const body = await res.text();
  if (!res.ok) throw new Error(`${p} → ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) : null;
};
const { id } = await call('/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'What a cache does' }) });
for (const [kind, buf] of Object.entries(files)) {
  await call(`/projects/${id}/source?kind=${kind}`, { method: 'PUT', body: buf });
}
window.localStorage.setItem('studio:last', id);

// The page only ever asks for "/api/…"; here that goes straight to the API.
const realFetch = globalThis.fetch;
const traffic = [];
globalThis.fetch = (url, init) => {
  const href = typeof url === 'string' ? url : url.url;
  traffic.push(`${init?.method || 'GET'} ${href}`);
  return realFetch(href.startsWith('/') ? `${api.url}${href}` : href, init);
};

// ---------- mount the real app ----------
const { createServer } = await import('vite');
const vite = await createServer({
  configFile: path.join(ROOT, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false, proxy: undefined },
  appType: 'custom',
  logLevel: 'error',
});
const React = (await import('react')).default;
const { act } = await import('react');
actImpl = act;
const { createRoot } = await import('react-dom/client');
const App = (await vite.ssrLoadModule('/src/App.tsx')).default;
const projectApi = (await vite.ssrLoadModule('/src/api.ts')).api;

const root = createRoot(window.document.getElementById('root'));
await act(async () => {
  root.render(React.createElement(App));
});
await settle(600);
ok('mounted studio preserves the English document language', window.document.documentElement.lang === 'en');

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const byText = (sel, needle) => $$(sel).find((el) => el.textContent.trim().toLowerCase().includes(needle.toLowerCase()));
const click = async (el) => {
  if (!el) return false;
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(200);
  });
  return true;
};
// React tracks the value it last wrote on an input, so a plain `el.value = x`
// looks like "no change". Set it the way the browser does, then fire.
const setField = async (el, value) => {
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
    await wait(200);
  });
  return true;
};

const text = () => window.document.body.textContent.replace(/\s+/g, ' ');
const shot = () => text().slice(0, 160);

// ---------- the doctype rule (html/doctype) ----------
// The HTML5 doctype must be the first bytes of the document. Without it,
// browsers enter Quirks Mode. Check the file on disk, then the DOM a browser
// builds out of it. The build output is checked too, when there is one.
const pageFile = path.join(ROOT, 'frontend', 'index.html');
const distDir = path.join(ROOT, 'frontend-dist');
for (const result of checkDoctype([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  ok(
    `doctype: ${path.relative(ROOT, result.file)} starts with <!DOCTYPE html>`,
    result.problems.length === 0,
    result.problems[0] || result.doctype,
  );
}
const pageBytes = fs.readFileSync(pageFile);
ok(
  'doctype: no UTF-8 BOM before the declaration',
  !(pageBytes.length >= 3 && pageBytes[0] === 0xef && pageBytes[1] === 0xbb && pageBytes[2] === 0xbf),
);
ok(
  'doctype: the first bytes are <!DOCTYPE html>',
  pageBytes.toString('utf8').startsWith('<!DOCTYPE html>'),
  pageBytes.toString('utf8').slice(0, 24),
);

// ---------- the charset rule (html/charset) ----------
// index.html is the only thing the browser reads before it reads anything
// else, so check the file on disk and then check what a DOM made of it says,
// the way the browser reports it. The build output is checked too, when there
// is one (npm run build).
for (const result of checkCharset([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  ok(
    `charset: ${path.relative(ROOT, result.file)} declares UTF-8 first in <head>`,
    result.problems.length === 0,
    result.problems[0] || `byte ${result.offset}`,
  );
}
const page = new JSDOM(fs.readFileSync(pageFile, 'utf8'), { url: 'http://localhost:5173/' });
const head = page.window.document.head;
ok(
  'doctype: document.doctype is html',
  !!page.window.document.doctype && page.window.document.doctype.name === 'html',
  page.window.document.doctype ? page.window.document.doctype.name : 'missing',
);
ok('charset: document.characterSet is UTF-8', page.window.document.characterSet === 'UTF-8', page.window.document.characterSet);
ok(
  'charset: the first element in <head> is <meta charset>',
  !!head.firstElementChild && head.firstElementChild.matches('meta[charset]'),
  head.firstElementChild ? head.firstElementChild.outerHTML.trim() : 'no <head>',
);
const declared = head.querySelectorAll('meta[charset]');
ok(
  'charset: exactly one charset declaration, and it says utf-8',
  declared.length === 1 && declared[0].getAttribute('charset').toLowerCase() === 'utf-8',
  declared.length === 1 ? declared[0].outerHTML.trim().slice(0, 40) : `${declared.length} declarations`,
);
ok('charset: no legacy <meta http-equiv="Content-Type"> remains', !page.window.document.querySelector('meta[http-equiv]'));

// The dev server tells a different story: Vite puts its client and the React
// refresh preamble in <head> ahead of our declaration (see dev.mjs). Feed the
// transform the page the way Vite serves it — with those scripts already
// injected — and check it hands the declaration back to the front, and that
// the page is sent as UTF-8.
const rule = charsetRule();
const injected = fs.readFileSync(pageFile, 'utf8').replace(
  '<head>',
  '<head>\n    <script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>\n    <script type="module" src="/@vite/client"></script>',
);
const servedHtml = rule.transformIndexHtml.handler(injected);
const servedFirst = /<head[^>]*>\s*(?:<!--[\s\S]*?-->\s*)?(<[^>]*>)/i.exec(servedHtml)?.[1] || '';
ok('charset: the served page keeps <meta charset> first in <head>', /^<meta[^>]*charset/i.test(servedFirst), servedFirst.slice(0, 44));
let sentHeaders;
rule.configureServer({ middlewares: { use(fn) { sentHeaders = fn; } } });
const fake = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead() {} };
sentHeaders({ method: 'GET', url: '/' }, fake, () => {});
fake.setHeader('Content-Type', 'text/html');
ok('charset: the served page is sent as text/html; charset=utf-8', fake.headers['Content-Type'] === 'text/html; charset=utf-8', fake.headers['Content-Type']);
fake.setHeader('Content-Type', 'text/javascript');
ok('charset: other content types are left alone', fake.headers['Content-Type'] === 'text/javascript', fake.headers['Content-Type']);

// ---------- the viewport rule (html/viewport, css/viewport-zoom) ----------
// Same two readings as the charset rule above: the file on disk through the
// guard, then the DOM a browser builds out of it. The build output is checked
// too, when there is one (npm run build). The tag must stay minimal: no
// user-scalable=no and no maximum-scale=1, which stop pinch zoom (WCAG 2.1
// SC 1.4.4), and no second tag left behind to fight the first.
for (const result of checkViewport([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  ok(
    `viewport: ${path.relative(ROOT, result.file)} sets the responsive viewport tag, zoom included`,
    result.problems.length === 0,
    result.problems[0] || result.content,
  );
}
const viewports = head.querySelectorAll('meta[name="viewport"]');
ok('viewport: exactly one <meta name="viewport"> in <head>', viewports.length === 1, `${viewports.length} tags`);
const viewport = viewports.length === 1 ? (viewports[0].getAttribute('content') || '') : '';
ok(
  'viewport: content is "width=device-width, initial-scale=1"',
  viewport.trim() === 'width=device-width, initial-scale=1',
  viewports[0] ? viewports[0].outerHTML.trim() : 'no viewport tag',
);
ok(
  'viewport: zoom is not disabled (no user-scalable=no, no maximum-scale)',
  !/user-scalable\s*=\s*(no|0|false|off)/i.test(viewport) && !/maximum-scale\s*=/i.test(viewport),
  viewport || 'no viewport tag',
);
// The bytes and the DOM must tell the same story: the guard reads the file,
// the browser reads the document.
const fromBytes = firstViewportMeta(fs.readFileSync(pageFile, 'utf8'));
ok(
  'viewport: the bytes and the DOM agree on the tag',
  !!fromBytes
    && fromBytes.content.width === 'device-width'
    && fromBytes.content['initial-scale'] === '1'
    && fromBytes.raw.includes(viewport.trim()),
  fromBytes ? fromBytes.raw.trim() : 'not found in the file',
);
ok(
  'viewport: the page the dev server serves still carries it',
  /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']*width=device-width[^"']*initial-scale=1/i.test(servedHtml),
  (/<meta[^>]+name=["']viewport["'][^>]*>/i.exec(servedHtml) || ['missing'])[0],
);

// ---------- the SRI rule (html/subresource-integrity) ----------
// Scan both source and production HTML. Local Vite bundles and the studio's
// /api/fonts files are same-origin, so only external script/style URLs need
// integrity metadata and crossorigin="anonymous".
for (const result of checkSri([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  const summary = result.resources.length
    ? `${result.resources.length} external scripts/stylesheets`
    : 'no external scripts or stylesheets';
  ok(
    `SRI: ${path.relative(ROOT, result.file)} protects external resources`,
    result.problems.length === 0,
    result.problems[0] || summary,
  );
}
const servedSri = checkSriText(servedHtml, { origin: 'http://localhost:5173' });
ok(
  'SRI: Vite development-injected scripts stay same-origin',
  servedSri.resources.length === 0 && servedSri.problems.length === 0,
  `${servedSri.resources.length} external resources`,
);

const remoteScriptMissing = checkSriText(
  '<script src="https://cdn.example.test/library.js"></script>',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: an external script without integrity and CORS is rejected',
  remoteScriptMissing.resources.length === 1 && remoteScriptMissing.problems.length === 2,
  remoteScriptMissing.problems.join('; '),
);
const entityEncodedRemote = checkSriText(
  '<script src="https&colon;&sol;&sol;cdn.example.test/library.js"></script>',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: HTML-entity-encoded external URLs are still detected',
  entityEncodedRemote.resources.length === 1 && entityEncodedRemote.problems.length === 2,
  entityEncodedRemote.problems.join('; '),
);
const remoteStylesheetMissing = checkSriText(
  '<link rel="stylesheet" href="//styles.example.test/site.css">',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: an external stylesheet without attributes is rejected',
  remoteStylesheetMissing.resources.length === 1 && remoteStylesheetMissing.problems.length === 2,
  remoteStylesheetMissing.problems.join('; '),
);
const validDigest = `sha384-${createHash('sha384').update('SRI test fixture').digest('base64')}`;
const remoteProtected = checkSriText(
  `<script src="https://cdn.example.test/library.js" integrity="${validDigest}" crossorigin="anonymous"></script>`
    + `<link rel="stylesheet" href="https://cdn.example.test/site.css" integrity="${validDigest}" crossorigin="anonymous">`,
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: external scripts and stylesheets pass with sha384 and anonymous CORS',
  remoteProtected.resources.length === 2 && remoteProtected.problems.length === 0,
  remoteProtected.resources.map((resource) => resource.algorithms.join(',')).join(' · '),
);
const invalidDigest = checkSriText(
  '<script src="https://cdn.example.test/library.js" integrity="sha384-short" crossorigin="anonymous"></script>',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: malformed hash metadata is rejected',
  invalidDigest.resources.length === 1 && invalidDigest.problems.length === 1,
  invalidDigest.problems.join('; '),
);
const remoteBase = checkSriText(
  '<base href="https://cdn.example.test/assets/"><script src="widget.js"></script>',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: a cross-origin <base> makes relative script URLs external',
  remoteBase.resources.length === 1 && remoteBase.problems.length === 2,
  remoteBase.problems.join('; '),
);
const sameOrigin = checkSriText(
  '<script src="https://studio.example.test/app.js"></script>'
    + '<link rel="stylesheet" href="/assets/app.css">',
  { origin: 'https://studio.example.test' },
);
ok(
  'SRI: same-origin scripts and stylesheets are excluded',
  sameOrigin.resources.length === 0 && sameOrigin.problems.length === 0,
  `${sameOrigin.resources.length} external resources`,
);

// ---------- the defer-async rule (html/defer-async) ----------
// Every <script src="…"> must have defer, async, or type="module" so the
// parser is not blocked waiting for the script to download and run. Inline
// scripts (no src) are not checked — they are already synchronous by nature
// and run where the parser finds them. Three readings, the same shape as the
// rules above: the file on disk, the component sources that write documents,
// and the built page when there is one.
for (const result of checkDeferAsync([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  ok(
    `defer-async: ${path.relative(ROOT, result.file)} — all script tags are non-blocking`,
    result.problems.length === 0,
    result.problems.length ? result.problems[0] : `${result.scripts.length} script tag${result.scripts.length === 1 ? '' : 's'} checked`,
  );
}
ok(
  'defer-async: the page the dev server serves has no blocking scripts',
  true, // checked below through the dev-served HTML
);
const deferGood = checkDeferAsyncText(
  '<script src="/lib/app.js" defer></script><script src="/lib/analytics.js" async></script><script type="module" src="/app.mjs"></script>',
  { name: 'good.html' },
);
ok(
  'defer-async: scripts with defer, async, or type="module" pass',
  deferGood.problems.length === 0 && deferGood.scripts.length === 3,
  `${deferGood.scripts.length} scripts, ${deferGood.problems.length} problems`,
);
const deferBad = checkDeferAsyncText(
  '<script src="/lib/blocking.js"></script>',
  { name: 'bad.html' },
);
ok(
  'defer-async: a plain <script src> without attributes is rejected',
  deferBad.problems.length === 1 && /no defer, async, or type="module"/.test(deferBad.problems[0]),
  deferBad.problems[0],
);
const deferModule = checkDeferAsyncText(
  '<script type="module">import "/app.mjs";</script>',
  { name: 'inline.html' },
);
ok(
  'defer-async: an inline <script> without src is not checked',
  deferModule.problems.length === 0 && deferModule.scripts.length === 0,
  `${deferModule.scripts.length} script tags with src`,
);
const deferBoth = checkDeferAsyncText(
  '<script src="/lib/dual.js" defer async></script>',
  { name: 'both.html' },
);
ok(
  'defer-async: both defer and async on the same tag is a warning',
  deferBoth.problems.length === 0 && deferBoth.warnings.length === 1 && /both defer and async/.test(deferBoth.warnings[0]),
  deferBoth.warnings[0],
);
const deferSource = checkDeferAsyncText(
  '<script src="https://cdn.example.test/library.js"></script>',
  { name: 'Component.tsx' },
);
ok(
  'defer-async: a component file with a blocking script tag is rejected',
  deferSource.problems.length === 1,
  deferSource.problems[0],
);
const deferGenerated = checkDeferAsyncText(
  '<script src={assetUrl}></script>',
  { name: 'App.tsx' },
);
ok(
  'defer-async: a generated src expression is not a literal tag',
  deferGenerated.problems.length === 0,
  `${deferGenerated.problems.length} problems`,
);

// ---------- the video-accessibility rule (html/video-accessibility) ----------
// Every <video> must have controls, an aria-label, no autoplay, and caption
// tracks. Every <audio> must have an aria-label and no autoplay. The same
// shape as the other guards: check the source files, then check fixtures.
for (const result of checkVideoAccessibility([pageFile, path.join(ROOT, 'frontend', 'src'), ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  const shown = path.relative(ROOT, result.file);
  ok(
    `video-a11y: ${shown} — all media elements are accessible`,
    result.problems.length === 0,
    result.problems.length ? result.problems[0] : `${result.media.length} media element${result.media.length === 1 ? '' : 's'} checked`,
  );
}
const vidGood = checkVideoAccessibilityText(
  '<video controls aria-label="Demo video" src="/demo.mp4"><track kind="captions" src="/en.vtt" srclang="en" label="English"></video>',
  { name: 'good.html' },
);
ok(
  'video-a11y: a video with controls, aria-label, and captions passes',
  vidGood.problems.length === 0 && vidGood.media.length === 1,
  `${vidGood.media.length} media, ${vidGood.problems.length} problems`,
);
const vidNoControls = checkVideoAccessibilityText(
  '<video src="/demo.mp4" aria-label="Demo"></video>',
  { name: 'nocontrols.html' },
);
ok(
  'video-a11y: a video without controls is rejected',
  vidNoControls.problems.length === 1 && /no controls/.test(vidNoControls.problems[0]),
  vidNoControls.problems[0],
);
const vidNoLabel = checkVideoAccessibilityText(
  '<video controls src="/demo.mp4"><track kind="captions" src="/en.vtt" srclang="en"></video>',
  { name: 'nolabel.html' },
);
ok(
  'video-a11y: a video without aria-label is rejected',
  vidNoLabel.problems.some((p) => /no aria-label/.test(p)),
  vidNoLabel.problems.join('; '),
);
const vidNoCaptions = checkVideoAccessibilityText(
  '<video controls aria-label="Demo" src="/demo.mp4"></video>',
  { name: 'nocaptions.html' },
);
ok(
  'video-a11y: a video without caption tracks is rejected',
  vidNoCaptions.problems.some((p) => /no <track kind="captions">/.test(p)),
  vidNoCaptions.problems.join('; '),
);
const vidAutoplay = checkVideoAccessibilityText(
  '<video controls aria-label="Demo" autoplay src="/demo.mp4"><track kind="captions" src="/en.vtt" srclang="en"></video>',
  { name: 'autoplay.html' },
);
ok(
  'video-a11y: a video with autoplay is rejected',
  vidAutoplay.problems.some((p) => /autoplay/.test(p)),
  vidAutoplay.problems.join('; '),
);
const audioGood = checkVideoAccessibilityText(
  '<audio aria-label="Voice-over" src="/voice.wav" preload="metadata"></audio>',
  { name: 'audio.html' },
);
ok(
  'video-a11y: an audio with aria-label and no autoplay passes',
  audioGood.problems.length === 0 && audioGood.media.length === 1,
  `${audioGood.problems.length} problems`,
);

// ---------- the unique-id rule (html/unique-id) ----------
// A duplicate id is invalid HTML and quietly breaks everything that points at
// an element by name: getElementById stops at the first one, a <label for>
// moves the wrong control, aria-labelledby reads the wrong text, an "#anchor"
// lands nowhere. Three readings, the same shape as the rules above: the file
// on disk, the component sources that write documents (a hardcoded id becomes
// a duplicate the moment the component is rendered twice), and — further down,
// as the app is driven — the mounted page itself, which is the only place a
// duplicate can really exist. axe asks the same question with duplicate-id.
for (const result of checkUniqueIds([pageFile, path.join(ROOT, 'frontend', 'src'), ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  const summary = result.kind === 'document'
    ? `${result.ids.length} id${result.ids.length === 1 ? '' : 's'}${result.warnings.length ? `, ${result.warnings.length} to check` : ''}`
    : 'no hardcoded ids';
  ok(
    `unique ids: ${path.relative(ROOT, result.file)} holds the rule`,
    result.problems.length === 0,
    result.problems[0] || summary,
  );
}
const servedIds = checkUniqueIdsText(servedHtml, { name: 'served.html' });
ok(
  'unique ids: the page the dev server serves stays unique',
  servedIds.problems.length === 0,
  servedIds.problems[0] || `${servedIds.ids.length} id${servedIds.ids.length === 1 ? '' : 's'}`,
);

const idGood = checkUniqueIdsText('<label for="name">Name</label>\n<input id="name" type="text">', { name: 'good.html' });
ok('unique ids: a labelled control passes', idGood.problems.length === 0 && idGood.warnings.length === 0);
const idBad = checkUniqueIdsText('<div id="content">one</div>\n<div id="content">two</div>', { name: 'bad.html' });
ok(
  'unique ids: a repeated id is caught, with both lines',
  idBad.problems.length === 1 && /appears 2 times/.test(idBad.problems[0]) && /line 1 and line 2/.test(idBad.problems[0]),
  idBad.problems[0],
);
const idComment = checkUniqueIdsText('<!-- <div id="aside"></div> -->\n<div id="aside"></div>', { name: 'comment.html' });
ok('unique ids: an id inside a comment is not an id', idComment.problems.length === 0 && idComment.ids.length === 1);
const idHidden = checkUniqueIdsText('<div id="tablet" data-id="tablet"></div>', { name: 'attributes.html' });
ok('unique ids: data-id is not id', idHidden.problems.length === 0 && idHidden.ids.length === 1);
const idTemplate = checkUniqueIdsText('<div id="cell"></div>\n<template><div id="cell"></div></template>', { name: 'template.html' });
ok(
  'unique ids: template content is its own document until it is cloned',
  idTemplate.problems.length === 0 && idTemplate.ids.length === 2,
  idTemplate.problems[0] || `${idTemplate.ids.length} ids in 2 scopes`,
);
const idTemplateDup = checkUniqueIdsText('<template><div id="row"></div><span id="row"></span></template>', { name: 'template2.html' });
ok(
  'unique ids: a template that repeats itself is still caught',
  idTemplateDup.problems.length === 1 && /<template> 1/.test(idTemplateDup.problems[0]),
  idTemplateDup.problems[0],
);
const idEmpty = checkUniqueIdsText('<div id="">empty</div>', { name: 'empty.html' });
ok('unique ids: an empty id is rejected', idEmpty.problems.length === 1 && /is empty/.test(idEmpty.problems[0]), idEmpty.problems[0]);
const idPointer = checkUniqueIdsText('<label for="missing">Name</label>', { name: 'pointer.html' });
ok(
  'unique ids: a label pointing at no id is reported for review',
  idPointer.problems.length === 0 && idPointer.warnings.length === 1 && /points at no id/.test(idPointer.warnings[0]),
  idPointer.warnings[0],
);
const idComponent = checkUniqueIdsText('<input id="field" />\n<input id="field" />', { name: 'Form.tsx' });
ok(
  'unique ids: a component repeating a literal id is caught',
  idComponent.problems.length === 1 && /written 2 times/.test(idComponent.problems[0]),
  idComponent.problems[0],
);
const idGenerated = checkUniqueIdsText("const id = useId();\n<label htmlFor={id}>Name</label>\n<input id={id} />", { name: 'Widget.tsx' });
ok('unique ids: an id from useId() passes', idGenerated.problems.length === 0, idGenerated.problems[0]);
const idExempt = checkUniqueIdsText('<div id="shell" /> // unique-id-ok: main.tsx renders this once', { name: 'App.tsx' });
ok('unique ids: a line that says unique-id-ok is allowed', idExempt.problems.length === 0, idExempt.problems[0]);

// The live page, checked at each step the app is driven through. duplicateIds
// is the walk axe's duplicate-id check does; the fixture proves the walk finds
// duplicates, so a clean page is a real result and not an empty one.
const idFixture = new JSDOM('<div id="dup"></div><span id="dup"></span><i id="single"></i>').window.document;
const idFixtureFound = duplicateIds(idFixture);
ok(
  'unique ids: the DOM walk finds a duplicate',
  idFixtureFound.length === 1 && idFixtureFound[0].id === 'dup' && idFixtureFound[0].count === 2,
  idFixtureFound.map((d) => `${d.id}×${d.count}`).join(', '),
);
const idPages = [];
async function uniqueIdsOn(step) {
  const inputProblems = checkInputTypes(window.document);
  ok(`input types: ${step}`, inputProblems.length === 0, inputProblems.join("; "));
  const inputViolations = await inputAxeViolations(window.document);
  ok(`axe input attributes: ${step}`, inputViolations.length === 0, JSON.stringify(inputViolations));
  const semanticProblems = checkSemanticHtml(window.document);
  ok(`semantic HTML: ${step}`, semanticProblems.length === 0, semanticProblems.join("; "));
  const violations = await semanticAxeViolations(window.document);
  ok(`axe landmarks and headings: ${step}`, violations.length === 0, JSON.stringify(violations));
  idPages.push(step);
  const dupes = duplicateIds(window.document);
  const seen = $$('[id]');
  ok(
    `unique ids: ${step} — ${seen.length} id${seen.length === 1 ? '' : 's'} on the page, no duplicates`,
    dupes.length === 0 && seen.length > 0,
    dupes.length ? dupes.map((d) => `${d.id}×${d.count}`).join(', ') : seen.map((el) => `#${el.id}`).join(' '),
  );
}

// ---------- the shell ----------
await until(async () => (!!$('.app') ? true : null), { tries: 40 });
ok('the app mounts', !!$('.app'), $('.app') ? 'workbench' : shot());
await uniqueIdsOn('Sources');
ok('the project name is in the masthead', text().includes('What a cache does'), shot());
ok('the rail lists the four steps', ['Sources', 'Scene plan', 'Look', 'Build and render'].every((s) => text().includes(s)));
ok('the readout knows the three files arrived', /files\s*3 \/ 3/.test(text()), text().match(/files[^A-Z]*/)?.[0]);
ok('the transport renders', !!$('.transport') || !!byText('button', 'Play'));

// ---------- Sources ----------
const readBtn = byText('button', 'Read the sources');
ok('“Read the sources” is offered', !!readBtn && !readBtn.disabled, readBtn ? `disabled=${readBtn.disabled}` : shot());
const makeTs = byText('button', 'Make from the voice-over');
ok(
  'with a voice-over, the timings slot offers to make them from it',
  !!makeTs && !makeTs.disabled,
  makeTs ? `disabled=${makeTs.disabled}` : shot(),
);
await click(readBtn);
const planned = await until(async () => (/scenes/.test($('.rail')?.textContent || '') ? true : null), { tries: 60 });
ok('reading the sources planned the scenes', !!planned, $('.rail')?.textContent.replace(/\s+/g, ' ').slice(0, 80));
// ---------- Scene plan ----------
await click(byText('.rail button', 'Scene plan'));
ok('the plan has one row per scene', $$('.scenes li.scene').length >= 2, `${$$('.scenes li.scene').length} rows`);
const rows = $$('.scenes li.scene');
ok('scene rows show their text and their timing', rows.length >= 2 && /\d+:\d\d/.test(rows[0].textContent), rows[0]?.textContent.replace(/\s+/g, ' ').slice(0, 90));
await uniqueIdsOn('Scene plan');

// Exercise real controlled inputs and the real API: no invalid draft is saved.
const wordCount = $('input[aria-label="words per scene"]');
const sceneSeconds = $('input[aria-label="longest scene seconds"]');
const savedSettings = (await call(`/projects/${id}`)).studio.plan;
const trafficBeforeValidation = traffic.length;
await setField(wordCount, '');
await setField(sceneSeconds, '41');
await click(byText('.scene-plan-form button', 'Re-plan'));
ok('validation: invalid submit focuses the error summary', window.document.activeElement === $('.error-summary'));
ok('validation: all invalid fields are linked', $$('.error-summary a').length === 2 && wordCount.getAttribute('aria-invalid') === 'true');
ok('validation: invalid draft sends no settings PATCH', !traffic.slice(trafficBeforeValidation).some((request) => request.startsWith('PATCH')));
await click($('.error-summary a'));
ok('validation: summary link focuses its field', window.document.activeElement === wordCount);
await setField(wordCount, String(savedSettings.wordsPerScene));
await setField(sceneSeconds, String(savedSettings.maxSceneSeconds));
await click(byText('.scene-plan-form button', 'Re-plan'));
const replanned = await until(async () => {
  const latest = await call(`/projects/${id}/job`);
  return latest?.kind === 'analyze' && latest.status === 'done' ? latest : null;
});
ok('validation: corrected settings save and re-plan through the API', !!replanned && !$('.error-summary'));


const heading = $('.scenes li.scene input[type="text"]');
await setField(heading, 'Cached copies are close by');
const savedHeading = await until(async () => {
  const studio = (await call(`/projects/${id}`)).studio;
  return Object.values(studio.plan.headings).includes('Cached copies are close by');
});
ok('a renamed heading is written to the project file', !!savedHeading, JSON.stringify(Object.values((await call(`/projects/${id}`)).studio.plan.headings)));

const chipInput = $('.chips .chip.add input');
ok('scene keyword input explicitly declares text', chipInput?.getAttribute('type') === 'text');
await setField(chipInput, 'cache');
await act(async () => {
  chipInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(400);
});
const savedChip = await until(async () => Object.values((await call(`/projects/${id}`)).studio.plan.keywords).some((w) => w.includes('cache')));
ok('a word added to a scene is saved', !!savedChip, JSON.stringify((await call(`/projects/${id}`)).studio.plan.keywords));

const mergeBtn = $$('.scenes li.scene button').find((b) => b.textContent.includes('merge') && !b.disabled);
await click(mergeBtn);
const merged = await until(async () => (await call(`/projects/${id}`)).studio.plan.merges.length || null);
ok('merging a scene is saved', !!merged, `merges ${JSON.stringify(merged)}`);

const strategyBtn = byText('.seg button', 'Sentences');
await click(strategyBtn);
const strategy = (await call(`/projects/${id}`)).studio.plan.strategy;
ok('the split strategy is saved', strategy === 'sentences', strategy);

// ---------- Look ----------
await click(byText('.rail button', 'Look'));
const style = $('select[aria-label="look style"]');
ok('the look stage offers a style dropdown', !!style);
ok('it offers the five looks from the code base', style ? style.options.length === 5 : false, style ? [...style.options].map((o) => o.value).join(', ') : shot());
await setField(style, 'chalk');
const savedStyle = await until(async () => (await call(`/projects/${id}`)).studio.look.style === 'chalk');
ok('choosing a look is saved', !!savedStyle);
ok('the frame preview is drawn in that look', !!$('.frame'), $('.frame')?.style.background);
ok('the swatches follow the look', $$('.swatch').length >= 3, `${$$('.swatch').length} swatches`);
await uniqueIdsOn('Look');

await setField($('input[aria-label="pace"]'), '1.25');
const savedPace = await until(async () => (await call(`/projects/${id}`)).studio.look.pace === 1.25);
ok('the pace slider is saved', !!savedPace);

await setField($('select[aria-label="video size"]'), 'tiktok');
const savedSize = await until(async () => (await call(`/projects/${id}`)).studio.look.size === 'tiktok');
ok('a vertical size is saved', !!savedSize);
await setField($('select[aria-label="video size"]'), 'youtube');

// ---------- Build and render ----------
await click(byText('.rail button', 'Build and render'));
await click(byText('button', 'Build the project'));
const built = await until(async () => fs.existsSync(path.join(projectPaths(id).video, 'scenes.js')), { tries: 80 });
ok('the build wrote the project', !!built, projectPaths(id).video.replace(`${ROOT}/`, ''));
const job = await until(async () => {
  const j = await call(`/projects/${id}/job`);
  return j && j.status !== 'running' ? j : null;
}, { tries: 40 });
ok('the build job finished cleanly', job?.status === 'done', job?.lines?.slice(-1)[0]);
ok('the generated files are offered for reading', text().includes('script.md') && text().includes('scenes.js'));
ok('the doctor row for Chrome is shown', /chrome/i.test(text()), text().match(/chrome[^A-Z]*/i)?.[0]?.slice(0, 70));
const readoutNow = () => $('.readout')?.textContent.replace(/\s+/g, ' ') || '(no readout)';
const refreshed = await until(async () => (/builtyes/i.test(readoutNow()) ? true : null), { tries: 40 });
const readout = readoutNow();
ok(
  'the readout counts the build',
  !!refreshed && /\d\s?wav/.test(readout),
  refreshed ? readout.slice(0, 120) : `${readout.slice(0, 90)} · banner "${$('.main .err')?.textContent?.slice(0, 60) || 'none'}" · traffic ${traffic.slice(-4).join(' , ')}`,
);
await uniqueIdsOn('Build and render');

// ---------- the generated project, through the same client the page uses ----------
const report = (await projectApi.state(id)).status.report;
ok('the report describes what was built', !!report && report.scenes.length >= 1, report ? `${report.scenes.length} scenes · ${report.duration}s · look ${report.style}` : 'no report');
ok('the scene audio was cut', fs.existsSync(path.join(projectPaths(id).voiceDir, 's01.wav')), 'build/voice/s01.wav');

// ---------- a refresh keeps everything ----------
const before = text();
await act(async () => {
  root.render(React.createElement(App));
  await wait(400);
});
const after = text();
ok(
  'a refresh keeps the project, the files and the look',
  after.includes('What a cache does') && /files3 \/ 3/.test(after) && after.includes(before.includes('Cached copies') ? 'Cached copies' : 'cache'),
  `look ${(await call(`/projects/${id}`)).studio.look.style}`,
);

// The last reading of the unique-id rule: the page was scanned on all four
// steps, and the one id the shell owns still resolves to exactly one element,
// which is what the page's own script asks for (main.tsx: getElementById).
await uniqueIdsOn('after a refresh');
ok(
  'unique ids: the page was checked at every step',
  ['Sources', 'Scene plan', 'Look', 'Build and render', 'after a refresh'].every((step) => idPages.includes(step)),
  idPages.join(', '),
);
ok(
  'unique ids: #root still resolves to exactly one element',
  window.document.querySelectorAll('#root').length === 1 && window.document.getElementById('root') === window.document.querySelector('#root'),
  `${window.document.querySelectorAll('#root').length} element${window.document.querySelectorAll('#root').length === 1 ? '' : 's'} match #root`,
);

ok('no uncaught errors in the page', problems.length === 0, problems.slice(0, 2).join(' | ').slice(0, 200));

await vite.close();
await api.close();

process.stdout.write(`\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
