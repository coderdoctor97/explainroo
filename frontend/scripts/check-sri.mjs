// Pin every third-party script and stylesheet with a hash the browser checks.
//
// This is the Front-End Checklist rule html/subresource-integrity, checked by
// reading the bytes of the file instead of trusting the template that wrote it:
//
//   · every <script src>, every <link rel="stylesheet" href>, and every
//     preload / modulepreload link that fetches one of those ahead of time
//     carries integrity="sha384-…" and crossorigin="anonymous" when the file
//     comes from another origin. SRI is a CORS fetch or it is nothing, so the
//     two attributes travel together
//   · the integrity value is one a browser can use: space-separated digests,
//     each written algorithm-base64, each base64 the length that algorithm
//     produces, and at least one of them sha384 or stronger. A digest the
//     browser cannot parse is a digest the browser ignores, and the file then
//     loads with no protection at all and no error to say so
//   · the URL is pinned to one version and it is https:. A hash says "this
//     exact file"; @latest, a floating range and a plain-text fetch all let
//     the CDN answer with something else tomorrow
//   · first-party files are left alone: no integrity, no crossorigin required.
//     They come from this origin, they change with every build, and a hash on
//     your own bundle is a page that stops loading the moment the bundle does
//
//   node frontend/scripts/check-sri.mjs                 # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-sri.mjs page.html dist  # or exactly what you point it at
//
// The same file computes the hashes, so reaching for a CDN later is one
// command and never a snippet pasted from a page nobody read:
//
//   node frontend/scripts/check-sri.mjs --hash https://cdn.jsdelivr.net/npm/roughjs@4.6.6/dist/rough.min.js
//   node frontend/scripts/check-sri.mjs --hash node_modules/roughjs/dist/rough.min.js --all --snippet
//   node frontend/scripts/check-sri.mjs --hash <url|file> --expect "sha384-…"
//
// --expect asks the other question: does the hash already written down still
// match the bytes the CDN serves? That is the question the browser answers at
// runtime, and the one that catches a file changed underneath its digest.
//
// --hash also reports whether the CDN answered with the CORS header SRI needs.
// Without Access-Control-Allow-Origin the browser refuses the file, hash or no
// hash, and the honest answer is to self-host it — which is what this repo
// already does with its fonts (scripts/fetch-fonts.mjs writes them to fonts/,
// the studio serves them from /api/fonts/, and no Google URL reaches the page).
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`, so the digests come from node:crypto and the downloads from
// the fetch every supported Node ships. The tag reader is the one
// check-charset.mjs already uses, so all the head rules see the document the
// same way and a "<script src>" inside a comment, a script or a style is never
// mistaken for a resource. Exits 1, with one line per broken file, when
// anything is wrong.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFilesIn, scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The page on disk has no origin of its own, so relative URLs are read against
// this one: anything it resolves to is first-party, anything that names a host
// is not.
const PAGE_URL = 'http://localhost/';

const DIGEST_BYTES = { sha256: 32, sha384: 48, sha512: 64 };
const STRONG = new Set(['sha384', 'sha512']);
// Link rels that fetch a body a browser will run or paint, so a hash applies.
// The rest of the rels — preconnect, dns-prefetch, icon, manifest, canonical —
// fetch nothing that is executed, and cannot carry one.
const PRELOAD_AS = new Set(['script', 'style']);

// Every attribute on a tag: lowercased name → value, with '' for an attribute
// that is there but says nothing, the way crossorigin is allowed to.
export function attributes(raw) {
  const out = {};
  const body = String(raw).replace(/^<\s*\/?\s*[\w:-]+/, '').replace(/\/?>$/, '');
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = re.exec(body)) !== null) out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return out;
}

// Where a URL comes from: this origin, or somebody else's. data:, blob: and
// fragment URLs never reach the network, so there is nothing to pin. The
// scheme is the one written down, not the one a page would lend it: "//cdn/x"
// inherits the page's scheme, and only "http://cdn/x" promises the clear.
export function whereFrom(url, pageUrl = PAGE_URL) {
  const value = String(url ?? '').trim();
  if (!value) return { url: value, kind: 'empty', external: false, scheme: null, host: null };
  if (/^(?:data|blob|about|javascript):/i.test(value) || value.startsWith('#')) {
    return { url: value, kind: 'inline', external: false, scheme: null, host: null };
  }
  let parsed;
  try {
    parsed = new URL(value, pageUrl);
  } catch {
    return { url: value, kind: 'unparsable', external: false, scheme: null, host: null };
  }
  const written = value.startsWith('//') ? null : parsed.protocol;
  if (!/^https?:$/.test(parsed.protocol)) {
    return { url: value, kind: parsed.protocol, external: false, scheme: written, host: parsed.host };
  }
  const external = parsed.origin !== new URL(pageUrl).origin;
  return { url: value, kind: external ? 'external' : 'first-party', external, scheme: written, host: parsed.host, absolute: parsed.href };
}

// A hash is only true of one exact file, so the URL has to name one. These are
// the shapes that can answer with something else tomorrow: a floating npm
// range the CDN resolves (@latest, @^2, @1, @4.17), a "current" alias in the
// path, or no version at all — unpkg.com/roughjs is latest wearing a tidy URL.
// Only the path is read: a query string is how a CDN is told to bust a cache,
// and "?v=1.2.3" pins nothing.
const FLOATING = [
  [/@latest\b/i, 'it asks the CDN for @latest'],
  [/@[~^*]/, 'it asks the CDN for a range'],
  [/@\d+(?:\.\d+)?(?![\d.-])/, 'it names a major or minor version, not a release'],
  [/\/(?:latest|stable|current|edge|nightly|dev|master|main)\//i, 'it points at a moving alias'],
];
const VERSIONED = /\d+\.\d+\.\d+/;

// { pinned, reason }: whether one URL names one immutable file.
export function pinning(url) {
  const value = String(url ?? '');
  let parsed = null;
  try {
    parsed = new URL(value.startsWith('//') ? `https:${value}` : value);
  } catch {
    parsed = null;
  }
  const where = parsed ? parsed.pathname : value;
  for (const [pattern, reason] of FLOATING) if (pattern.test(where)) return { pinned: false, reason };
  if (!VERSIONED.test(where)) return { pinned: false, reason: 'no x.y.z version in the path, so the file can change' };
  return { pinned: true, reason: where.match(VERSIONED)[0] };
}

// "sha384-abc… sha256-def…" → what a browser would make of it. Malformed
// digests are reported rather than dropped silently: a value the browser
// cannot parse protects nothing and looks exactly like one that does.
export function parseIntegrity(value) {
  const tokens = String(value ?? '').trim().split(/[\s,]+/).filter(Boolean);
  const digests = [];
  const malformed = [];
  for (const token of tokens) {
    const match = /^([a-z0-9][a-z0-9-]*)-(\S+)$/i.exec(token);
    if (!match) {
      malformed.push(`"${token}" is not written algorithm-base64digest`);
      continue;
    }
    const algorithm = match[1].toLowerCase();
    const digest = match[2];
    const bytes = DIGEST_BYTES[algorithm];
    if (!bytes) {
      malformed.push(`${algorithm} is not one a browser implements (sha256, sha384, sha512)`);
      continue;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(digest)) {
      malformed.push(`the ${algorithm} digest is not base64 — hex will not do`);
      continue;
    }
    const decoded = Math.floor(digest.replace(/=+$/, '').length * 6 / 8);
    if (decoded !== bytes) {
      malformed.push(`the ${algorithm} digest decodes to ${decoded} bytes, not the ${bytes} that algorithm produces`);
      continue;
    }
    digests.push({ algorithm, digest });
  }
  return { tokens, digests, malformed, strong: digests.filter((d) => STRONG.has(d.algorithm)) };
}

// The digest of some bytes, in the one form the integrity attribute takes.
export function digestOf(data, algorithm = 'sha384') {
  if (!DIGEST_BYTES[algorithm]) throw new Error(`${algorithm} is not one of sha256, sha384, sha512`);
  return `${algorithm}-${crypto.createHash(algorithm).update(data).digest('base64')}`;
}

// One integrity value out of one file: sha384 by default, or several digests
// space-separated, which is what the attribute is for.
export function integrityOf(data, algorithms = ['sha384']) {
  return algorithms.map((algorithm) => digestOf(data, algorithm)).join(' ');
}

// What the browser does with the attribute, done here so a hash can be asked
// the only question that matters: does it still match these bytes? A guard
// that reads the page can check the shape of a digest; only the bytes can
// say whether it is the right one. The strongest algorithm present decides,
// the way the spec says — a matching sha256 does not rescue a wrong sha384.
export function verifyIntegrity(data, value) {
  const parsed = parseIntegrity(value);
  if (!parsed.digests.length) {
    return { verified: false, checked: [], reason: parsed.malformed[0] || 'there is no digest to check' };
  }
  const rank = { sha512: 3, sha384: 2, sha256: 1 };
  const checked = parsed.digests
    .map((d) => ({ ...d, matches: digestOf(data, d.algorithm) === `${d.algorithm}-${d.digest}` }))
    .sort((a, b) => rank[b.algorithm] - rank[a.algorithm]);
  const strongest = checked[0];
  return {
    verified: strongest.matches,
    checked,
    reason: strongest.matches
      ? `${strongest.algorithm} matches ${data.length} bytes`
      : `${strongest.algorithm} does not match these ${data.length} bytes — the browser would block the file`,
  };
}

// SRI needs the CDN to answer a CORS request, so a correct hash is worth
// nothing if the response carries no Access-Control-Allow-Origin: the browser
// blocks the file and the page loses the library. This reads what the CDN said
// — the browser still has the last word.
export function corsReport(headers) {
  const get = (name) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
  };
  const allow = get('access-control-allow-origin');
  const credentials = get('access-control-allow-credentials');
  const notes = [];
  if (!allow) notes.push('no Access-Control-Allow-Origin — the browser will refuse this file under SRI; self-host it or pick another CDN');
  else if (allow.trim() === '*' && String(credentials ?? '').toLowerCase() === 'true') notes.push('Access-Control-Allow-Origin: * together with allow-credentials: true is a combination browsers reject');
  else notes.push(`Access-Control-Allow-Origin: ${allow.trim()} — SRI can be enforced`);
  const timing = get('timing-allow-origin');
  if (timing) notes.push(`Timing-Allow-Origin: ${String(timing).trim()}`);
  return { allowOrigin: allow ? String(allow).trim() : null, usable: !!allow, notes };
}

// Every subresource the document asks the network for, in the order it asks:
// scripts with a src, stylesheets, and the preload hints that fetch one of
// those early. Inline <script> bodies are not here — they cannot carry a hash,
// and the rule that covers them is a Content Security Policy.
export function subresources(html, pageUrl = PAGE_URL) {
  const out = [];
  for (const tag of scanTags(String(html))) {
    if (tag.closing) continue;
    const attrs = attributes(tag.raw);
    let kind = null;
    let url = null;
    if (tag.name === 'script') {
      if (attrs.src === undefined) continue; // inline: nothing to fetch, nothing to pin
      kind = 'script';
      url = attrs.src;
    } else if (tag.name === 'link') {
      const rel = String(attrs.rel ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean);
      if (rel.includes('stylesheet')) kind = 'stylesheet';
      else if (rel.includes('modulepreload')) kind = 'modulepreload';
      else if (rel.includes('preload') && PRELOAD_AS.has(String(attrs.as ?? '').toLowerCase())) kind = 'preload';
      else continue; // a hint, an icon, a manifest: no body to hash
      if (attrs.href === undefined) continue;
      url = attrs.href;
    } else continue;

    const where = whereFrom(url, pageUrl);
    out.push({
      kind,
      url: where.url,
      host: where.host,
      scheme: where.scheme,
      external: where.external,
      inline: where.kind === 'inline' || where.kind === 'empty',
      tag: tag.raw,
      index: tag.index,
      type: attrs.type ?? null,
      integrity: attrs.integrity ?? null,
      crossorigin: attrs.crossorigin === undefined ? null : (attrs.crossorigin || 'anonymous'),
      referrerpolicy: attrs.referrerpolicy ?? null,
      pinned: where.external ? pinning(where.url) : { pinned: true, reason: 'first-party' },
    });
  }
  return out;
}

// One document, read as text. The dev server, the UI test and the file checks
// all ask the same question, so the question takes a string.
export function checkSriText(html, file = 'html', pageUrl = PAGE_URL) {
  const problems = [];
  const resources = subresources(html, pageUrl);
  const thirdParty = resources.filter((r) => r.external && !r.inline);
  const firstParty = resources.filter((r) => !r.external && !r.inline);

  for (const resource of thirdParty) {
    const what = `${resource.kind} ${resource.url}`;
    if (resource.scheme === 'http:') {
      problems.push(`${what} is fetched over http: — SRI cannot protect a plain-text fetch, so serve it over https:`);
    }
    if (!resource.pinned.pinned) {
      problems.push(`${what} is not pinned (${resource.pinned.reason}) — pin the exact version first, then hash the file you pinned`);
    }
    if (resource.integrity === null) {
      problems.push(`${what} has no integrity attribute — add integrity="sha384-…" (node frontend/scripts/check-sri.mjs --hash ${resource.url})`);
    } else {
      const integrity = parseIntegrity(resource.integrity);
      if (!integrity.tokens.length) problems.push(`${what} has an empty integrity attribute — an empty value protects nothing`);
      for (const note of integrity.malformed) problems.push(`${what}: integrity ${note}`);
      if (integrity.digests.length && !integrity.strong.length) {
        problems.push(`${what} is hashed with ${integrity.digests.map((d) => d.algorithm).join(' + ')} only — prefer sha384`);
      }
    }
    if (resource.crossorigin === null) {
      problems.push(`${what} has no crossorigin attribute — SRI is a CORS fetch, so it needs crossorigin="anonymous"`);
    } else if (!/^anonymous$/i.test(resource.crossorigin)) {
      problems.push(`${what} sets crossorigin="${resource.crossorigin}" — a CDN will not answer a credentialed request, so it must be anonymous`);
    }
  }

  for (const resource of firstParty) {
    if (resource.integrity !== null) {
      problems.push(
        `first-party ${resource.kind} ${resource.url} carries integrity="${resource.integrity.slice(0, 24)}…" — it is served from this origin and changes with every build; a hash belongs on somebody else's file`,
      );
    }
  }

  return { file, problems, resources, thirdParty, firstParty };
}

export function checkSriHtml(file, pageUrl = PAGE_URL) {
  return checkSriText(fs.readFileSync(file, 'utf8'), file, pageUrl);
}

// Targets are files or folders; folders are walked for .html files. Returns one
// result per file, each with a `problems` array that is empty when it is fine.
export function checkSri(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => checkSriHtml(file));
}

// The tag as the rule writes it, so a hash never has to be hand-assembled.
export function snippetFor({ url, integrity, kind = 'script' }) {
  const lines = kind === 'stylesheet'
    ? ['<link', '  rel="stylesheet"', `  href="${url}"`, `  integrity="${integrity}"`, '  crossorigin="anonymous"', '/>']
    : ['<script', `  src="${url}"`, `  integrity="${integrity}"`, '  crossorigin="anonymous"', '></script>'];
  return lines.join('\n');
}

async function readTarget(target) {
  if (/^https?:\/\//i.test(target)) {
    const response = await fetch(target, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${target} answered ${response.status} ${response.statusText}`);
    return { data: Buffer.from(await response.arrayBuffer()), headers: response.headers, from: response.url || target };
  }
  const file = path.resolve(process.cwd(), target);
  return { data: fs.readFileSync(file), headers: null, from: file };
}

// --hash: the digest of a file or of a URL, the CORS answer that goes with it,
// and the tag to paste. This is the only supported way to get a hash into the
// page: it is computed from the bytes that were downloaded, not copied. With
// --expect it goes the other way and asks whether a hash already written down
// still matches what the CDN serves — the question a browser answers at
// runtime, and the one that catches a file changed underneath its digest.
async function hashMain(argv) {
  const at = argv.indexOf('--hash');
  const target = argv[at + 1];
  if (!target || target.startsWith('--')) {
    process.stdout.write('usage: node frontend/scripts/check-sri.mjs --hash <url|file> [--all] [--snippet] [--expect "sha384-…"]\n');
    return 2;
  }
  const all = argv.includes('--all');
  const snippet = argv.includes('--snippet');
  const expectAt = argv.indexOf('--expect');
  const expected = expectAt !== -1 ? argv[expectAt + 1] : null;
  if (expectAt !== -1 && (!expected || expected.startsWith('--'))) {
    process.stdout.write('FAIL --expect needs the integrity value to check, in quotes\n');
    return 2;
  }
  const algorithms = all ? ['sha256', 'sha384', 'sha512'] : ['sha384'];

  let read;
  try {
    read = await readTarget(target);
  } catch (error) {
    process.stdout.write(`FAIL ${target}\n     ${error.message}\n`);
    return 1;
  }
  const integrity = integrityOf(read.data, algorithms);
  const pin = pinning(target);

  process.stdout.write(`${target}\n`);
  process.stdout.write(`  ${read.data.length} bytes, read from ${read.from}\n`);
  for (const line of integrity.split(' ')) process.stdout.write(`  ${line}\n`);
  if (!pin.pinned && /^https?:\/\//i.test(target)) {
    process.stdout.write(`  WARN not pinned — ${pin.reason}; a hash is only true of one exact file\n`);
  }
  if (/^https?:\/\//i.test(target)) {
    const cors = corsReport(read.headers);
    for (const note of cors.notes) process.stdout.write(`  ${cors.usable ? 'ok  ' : 'WARN'} ${note}\n`);
  }

  if (expected) {
    const verified = verifyIntegrity(read.data, expected);
    process.stdout.write(`  expected ${expected}\n`);
    if (verified.verified) {
      process.stdout.write(`  ok   ${verified.reason}\n`);
    } else {
      process.stdout.write(`  FAIL ${verified.reason}\n`);
      for (const check of verified.checked) {
        process.stdout.write(`       ${check.matches ? 'ok  ' : 'FAIL'} ${check.algorithm}-${check.digest}\n`);
      }
      return 1;
    }
  }
  if (snippet) {
    const kind = /\.(?:css)(?:[?#]|$)/i.test(target) ? 'stylesheet' : 'script';
    process.stdout.write(`\n${snippetFor({ url: target, integrity, kind })}\n`);
  }
  return 0;
}

function describe(result) {
  const own = `${result.firstParty.length} first-party left alone`;
  if (!result.resources.length) return 'no scripts or stylesheets to pin';
  if (!result.thirdParty.length) return `nothing from another origin — ${own}`;
  const algorithms = [...new Set(result.thirdParty.flatMap((r) => parseIntegrity(r.integrity).digests.map((d) => d.algorithm)))];
  return `${result.thirdParty.length} third-party pinned with ${algorithms.join(' + ') || 'no usable digest'}, crossorigin=anonymous — ${own}`;
}

async function main(argv) {
  if (argv.includes('--hash')) return hashMain(argv);
  const targets = argv.filter((a) => !a.startsWith('--')).map((t) => path.resolve(process.cwd(), t));
  const results = checkSri(targets.length ? targets : undefined);
  if (!results.length) {
    process.stdout.write('no HTML files found — nothing to check\n');
    return 0;
  }
  let broken = 0;
  for (const result of results) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      process.stdout.write(`ok   ${shown} — ${describe(result)}\n`);
    }
  }
  process.stdout.write(`\n${results.length - broken}/${results.length} files pin every third-party script and stylesheet\n`);
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
