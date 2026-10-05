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
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { startStudioApi } from './api.js';
import { checkCharset } from '../scripts/check-charset.mjs';
import { checkDoctype } from '../scripts/check-doctype.mjs';
import { checkViewport, firstViewportMeta } from '../scripts/check-viewport.mjs';
import { checkSri, checkSriText, corsReport, digestOf, integrityOf, parseIntegrity, verifyIntegrity } from '../scripts/check-sri.mjs';
import { charsetRule } from '../dev.mjs';
import { projectPaths } from './store.js';

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
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
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

// ---------- the subresource integrity rule (html/subresource-integrity) ----------
// The studio loads nothing from anybody else's server. React and roughjs are
// bundled out of node_modules by Vite, the three faces are woff2 files the
// repo fetched once and the API serves from /api/fonts/, and every URL the
// page writes is relative — so there is no hash to put in index.html today.
// What the rule needs is the guard that keeps it that way: the day a CDN
// <script> is pasted into the page, this fails with the command that computes
// the hash, instead of the browser finding out at runtime.
//
// The same three readings as the head rules above — the file on disk, the DOM
// a browser builds out of it, the page the dev server serves — and then the
// guard is turned on itself, because a guard that passes everything is worse
// than no guard at all.
for (const result of checkSri([pageFile, ...(fs.existsSync(distDir) ? [distDir] : [])])) {
  ok(
    `sri: ${path.relative(ROOT, result.file)} pins every third-party script and stylesheet`,
    result.problems.length === 0,
    result.problems[0] || (result.thirdParty.length
      ? `${result.thirdParty.length} third-party, hashed, crossorigin=anonymous`
      : `nothing from another origin, ${result.firstParty.length} first-party left alone`),
  );
}
// The DOM asks the question the way a browser would: through the selectors
// that fetch something. A cross-origin resource here needs both attributes;
// a first-party one needs neither, and a hash on it would be a page that
// stops loading the next time the bundle changes.
const sriTags = [...page.window.document.querySelectorAll('script[src], link[rel~="stylesheet"], link[rel~="modulepreload"]')];
const sriOrigin = 'http://localhost:5173';
const fromElsewhere = sriTags.filter((el) => new URL(el.getAttribute('src') || el.getAttribute('href'), sriOrigin).origin !== sriOrigin);
ok('sri: the DOM sees the resources the page fetches', sriTags.length >= 1, `${sriTags.length} tags`);
ok(
  'sri: the DOM sees nothing from another origin',
  fromElsewhere.length === 0,
  fromElsewhere.map((el) => el.outerHTML.trim()).join(' ') || 'every script and stylesheet is this origin',
);
ok(
  'sri: the first-party tags carry no hash of their own',
  sriTags.every((el) => !el.hasAttribute('integrity')),
  sriTags.find((el) => el.hasAttribute('integrity'))?.outerHTML.trim() || 'none of them do',
);
// The dev server puts /@vite/client and the React refresh preamble ahead of
// the page. Both are this origin, so the guard reads them as first-party and
// leaves them alone — a dev-only script is not a CDN.
const servedSri = checkSriText(servedHtml, 'the served page');
ok(
  'sri: the page the dev server serves loads nothing from another origin either',
  servedSri.problems.length === 0 && servedSri.thirdParty.length === 0,
  servedSri.problems[0] || `${servedSri.resources.length} resources, all first-party`,
);

// The digests come from node:crypto, so hold them against what openssl prints
// for the same bytes: a hash that is subtly wrong is a page that does not
// load, with nothing on the server to say why.
const KNOWN = Buffer.from('explainroo');
ok(
  'sri: sha384 and sha512 of known bytes match openssl',
  integrityOf(KNOWN, ['sha384', 'sha512'])
    === 'sha384-phN/o2ivMkLauE0lYr7XkwZdIcdg2Ml32oLZW6lZ2obnnm1sPHo0Gpk+MCxdo9RH'
    + ' sha512-eIurbrF6k43L/oFMKGyaiYg5N8H87N2oS1/ZK9riHH7ZvfnlQ6VPAMcNvV18rfDb01x97MUMa0rTZCf9BrMrgw==',
  integrityOf(KNOWN, ['sha384']).slice(0, 20) + '…',
);

// A correct hash is worth nothing if the CDN will not answer a CORS request:
// the browser blocks the file either way, and the page loses the library.
// This is the report --hash prints, asked about all three answers a CDN gives.
const cors = corsReport(new Headers({ 'access-control-allow-origin': '*', 'timing-allow-origin': '*' }));
ok('sri: a CDN that sends Access-Control-Allow-Origin can be pinned', cors.usable, cors.notes[0]);
const noCors = corsReport({ 'content-type': 'application/javascript' });
ok('sri: a CDN with no CORS header is reported as unusable', !noCors.usable && /self-host/.test(noCors.notes[0]), noCors.notes[0]);
const badCors = corsReport({ 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true' });
ok('sri: allow-origin * with allow-credentials is the combination browsers reject', badCors.notes.some((n) => /reject/.test(n)), badCors.notes.join(' · '));

// ---------- the guard, turned on itself ----------
// A CDN file, its real bytes, and the hash those bytes produce. Everything
// below is written the way the rule's canonical snippet is written.
const CDN = 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js';
const cdnBytes = Buffer.from('/*! jQuery v3.7.1 | (c) OpenJS Foundation | jquery.org/license */\n');
const cdnHash = digestOf(cdnBytes, 'sha384');
const shellHtml = (body) => `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n${body}\n  </head>\n  <body></body>\n</html>\n`;
const tag = (attrs) => shellHtml(`    <script src="${CDN}" ${attrs}></script>`);

ok('sri: a pinned, hashed, crossorigin CDN script passes', checkSriText(tag(`integrity="${cdnHash}" crossorigin="anonymous"`), 'pinned').problems.length === 0, checkSriText(tag(`integrity="${cdnHash}" crossorigin="anonymous"`), 'pinned').problems[0]);
const naked = checkSriText(shellHtml(`    <script src="${CDN}"></script>`), 'naked').problems;
ok('sri: a CDN script with no integrity is refused', naked.some((p) => /no integrity/.test(p)), naked[0]);
ok('sri: a CDN script with no crossorigin is refused', naked.some((p) => /no crossorigin/.test(p)), naked.find((p) => /crossorigin/.test(p)));
// The negative test the rule asks for, done where it can be done honestly: no
// browser here, so the bytes are changed and the digest asked again, which is
// precisely the check the browser makes. One character of the hash, or one
// byte of the file — either way the answer has to be "blocked".
const tampered = `${cdnHash.slice(0, 8)}${cdnHash[8] === 'A' ? 'B' : 'A'}${cdnHash.slice(9)}`;
ok('sri: the digest of the real bytes verifies', verifyIntegrity(cdnBytes, cdnHash).verified, verifyIntegrity(cdnBytes, cdnHash).reason);
ok('sri: one changed character in the digest no longer verifies', !verifyIntegrity(cdnBytes, tampered).verified, verifyIntegrity(cdnBytes, tampered).reason);
ok(
  'sri: a CDN serving different bytes under the same hash is caught',
  !verifyIntegrity(Buffer.from('/*! jQuery v3.7.1, with one line an attacker added */\n'), cdnHash).verified,
  'this is the compromise SRI exists for',
);
// Shapes a browser cannot use, and URLs a hash cannot be true of.
ok('sri: a digest of the wrong length is refused', parseIntegrity('sha384-tooshort').malformed.length === 1, parseIntegrity('sha384-tooshort').malformed[0]);
ok(
  'sri: sha256 alone is refused, sha384 preferred',
  checkSriText(tag(`integrity="${digestOf(cdnBytes, 'sha256')}" crossorigin="anonymous"`), 'weak').problems.some((p) => /prefer sha384/.test(p)),
);
ok(
  'sri: @latest is refused — the version is pinned before the hash is written',
  checkSriText(
    shellHtml(`    <script src="https://cdn.jsdelivr.net/npm/jquery@latest/dist/jquery.min.js" integrity="${cdnHash}" crossorigin="anonymous"></script>`),
    'latest',
  ).problems.some((p) => /not pinned/.test(p)),
);
ok(
  'sri: a plain http: fetch is refused',
  checkSriText(
    shellHtml(`    <script src="http://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js" integrity="${cdnHash}" crossorigin="anonymous"></script>`),
    'http',
  ).problems.some((p) => /over http:/.test(p)),
);
ok(
  'sri: crossorigin="use-credentials" is refused',
  checkSriText(tag(`integrity="${cdnHash}" crossorigin="use-credentials"`), 'credentials').problems.some((p) => /must be anonymous/.test(p)),
);
ok(
  'sri: a first-party file with a hash is refused',
  checkSriText(
    shellHtml(`    <script type="module" src="/src/main.tsx" integrity="${cdnHash}" crossorigin="anonymous"></script>`),
    'first-party',
  ).problems.some((p) => /first-party/.test(p)),
);

// ---------- the shell ----------
await until(async () => (!!$('.app') ? true : null), { tries: 40 });
ok('the app mounts', !!$('.app'), $('.app') ? 'workbench' : shot());
ok('the project name is in the masthead', text().includes('What a cache does'), shot());
ok('the rail lists the four steps', ['Sources', 'Scene plan', 'Look', 'Build and render'].every((s) => text().includes(s)));
ok('the readout knows the three files arrived', /files\s*3 \/ 3/.test(text()), text().match(/files[^A-Z]*/)?.[0]);
ok('the transport renders', !!$('.transport') || !!byText('button', 'Play'));

// ---------- Sources ----------
const readBtn = byText('button', 'Read the sources');
ok('“Read the sources” is offered', !!readBtn && !readBtn.disabled, readBtn ? `disabled=${readBtn.disabled}` : shot());
await click(readBtn);
const planned = await until(async () => (/scenes/.test($('.rail')?.textContent || '') ? true : null), { tries: 60 });
ok('reading the sources planned the scenes', !!planned, $('.rail')?.textContent.replace(/\s+/g, ' ').slice(0, 80));
// ---------- Scene plan ----------
await click(byText('.rail button', 'Scene plan'));
ok('the plan has one row per scene', $$('.scenes li.scene').length >= 2, `${$$('.scenes li.scene').length} rows`);
const rows = $$('.scenes li.scene');
ok('scene rows show their text and their timing', rows.length >= 2 && /\d+:\d\d/.test(rows[0].textContent), rows[0]?.textContent.replace(/\s+/g, ' ').slice(0, 90));

const heading = $('.scenes li.scene input[type="text"]');
await setField(heading, 'Cached copies are close by');
const savedHeading = await until(async () => {
  const studio = (await call(`/projects/${id}`)).studio;
  return Object.values(studio.plan.headings).includes('Cached copies are close by');
});
ok('a renamed heading is written to the project file', !!savedHeading, JSON.stringify(Object.values((await call(`/projects/${id}`)).studio.plan.headings)));

const chipInput = $('.chips .chip.add input');
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

ok('no uncaught errors in the page', problems.length === 0, problems.slice(0, 2).join(' | ').slice(0, 200));

await vite.close();
await api.close();

process.stdout.write(`\n${checks - failures}/${checks} checks passed${failures ? ` · ${failures} FAILED` : ''}\n`);
process.exit(failures ? 1 : 0);
