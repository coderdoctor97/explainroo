// Require Subresource Integrity on external scripts and stylesheets.
//
// This implements the Front-End Checklist rule html/subresource-integrity:
// every cross-origin <script src> and <link rel="stylesheet" href> needs a
// well-formed integrity digest and crossorigin="anonymous". SHA-384 is the
// preferred digest; SHA-256 and SHA-512 are also valid SRI algorithms.
//
//   node frontend/scripts/check-sri.mjs
//   node frontend/scripts/check-sri.mjs --origin https://studio.example page.html dist
//
// With static HTML there is no reliable way to know the page's deployment
// origin. By default, relative URLs are treated as same-origin and absolute
// HTTP(S) URLs as external. Pass --origin (or set SRI_ORIGIN) when a page uses
// absolute URLs for its own origin. Source and built HTML are scanned by
// default. This guard has no dependencies and does not add SRI to local assets.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFilesIn, scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TARGETS = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')];
const FALLBACK_ORIGIN = 'https://sri-check.invalid/';
const HASH_BYTES = new Map([['sha256', 32], ['sha384', 48], ['sha512', 64]]);
const ATTR_NAME = /^[a-zA-Z][\w:-]*/;
const URL_ENTITIES = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  colon: ':',
  sol: '/',
  bsol: '\\',
  period: '.',
  commat: '@',
  num: '#',
  quest: '?',
  equals: '=',
  semi: ';',
};

function decodeAttribute(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);?/gi, (entity, code, offset, source) => {
    if (code[0] !== '#') {
      const hasSemicolon = entity.endsWith(';');
      const next = source[offset + entity.length] || '';
      // In an HTML attribute a semicolonless named reference is not decoded
      // when followed by an alphanumeric character or '='.
      if (!hasSemicolon && /[\w=]/.test(next)) return entity;
      return URL_ENTITIES[code.toLowerCase()] ?? entity;
    }
    const hex = code[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff) return '\ufffd';
    try {
      return String.fromCodePoint(point);
    } catch {
      return '\ufffd';
    }
  });
}

// Read HTML attributes without mistaking whitespace or an '=' inside a quoted
// value for the end of an attribute. Attribute names are case-insensitive and,
// like a browser, the first duplicate wins.
export function parseAttributes(rawTag) {
  const attrs = new Map();
  const opening = /^<\s*[a-zA-Z][\w:-]*/.exec(rawTag);
  if (!opening) return attrs;

  let i = opening[0].length;
  while (i < rawTag.length) {
    while (/\s/.test(rawTag[i] || '') || rawTag[i] === '/') i += 1;
    if (i >= rawTag.length || rawTag[i] === '>') break;

    const nameMatch = ATTR_NAME.exec(rawTag.slice(i));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    i += nameMatch[0].length;
    while (/\s/.test(rawTag[i] || '')) i += 1;

    let value = '';
    if (rawTag[i] === '=') {
      i += 1;
      while (/\s/.test(rawTag[i] || '')) i += 1;
      const quote = rawTag[i] === '"' || rawTag[i] === "'" ? rawTag[i++] : '';
      const start = i;
      if (quote) {
        while (i < rawTag.length && rawTag[i] !== quote) i += 1;
      } else {
        while (i < rawTag.length && !/[\s>]/.test(rawTag[i])) i += 1;
      }
      value = decodeAttribute(rawTag.slice(start, i));
      if (quote && rawTag[i] === quote) i += 1;
    }
    if (!attrs.has(name)) attrs.set(name, value);
  }
  return attrs;
}

function normalizedOrigin(origin) {
  try {
    return new URL(origin || FALLBACK_ORIGIN).origin;
  } catch {
    throw new TypeError(`invalid page origin: ${origin}`);
  }
}

function resourceIsExternal(rawUrl, pageOrigin, baseUrl) {
  const value = rawUrl.trim();
  if (!value || /^(?:data|blob|javascript):/i.test(value)) return false;
  let url;
  try {
    url = new URL(value, baseUrl);
  } catch {
    // Invalid or unsupported URLs are not external CDN requests that SRI can
    // secure. The browser or a separate URL validation check should flag them.
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return url.origin !== pageOrigin;
}

function integrityAlgorithms(value) {
  const algorithms = [];
  for (const token of value.trim().split(/\s+/).filter(Boolean)) {
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(token);
    if (!match) continue;
    const [, algorithm, digest] = match;
    const decoded = Buffer.from(digest, 'base64');
    if (decoded.length !== HASH_BYTES.get(algorithm) || decoded.toString('base64') !== digest) continue;
    if (!algorithms.includes(algorithm)) algorithms.push(algorithm);
  }
  return algorithms;
}

function stylesheetLink(attrs) {
  return (attrs.get('rel') || '').split(/\s+/).some((rel) => rel.toLowerCase() === 'stylesheet');
}

// Return the external resource tags and any rule violations in an HTML string.
// A caller can pass a real origin so absolute first-party URLs remain exempt.
export function checkSriText(html, { file = '<html>', origin } = {}) {
  const pageOrigin = normalizedOrigin(origin);
  const tags = scanTags(html);
  const baseTag = tags.find((tag) => {
    if (tag.name !== 'base' || tag.closing) return false;
    return parseAttributes(tag.raw).has('href');
  });
  const baseHref = baseTag ? parseAttributes(baseTag.raw).get('href') : '/';
  let baseUrl;
  try {
    baseUrl = new URL(baseHref, `${pageOrigin}/`).href;
  } catch {
    baseUrl = `${pageOrigin}/`;
  }
  const resources = [];
  const problems = [];

  for (const tag of tags) {
    if (tag.closing || (tag.name !== 'script' && tag.name !== 'link')) continue;
    const attrs = parseAttributes(tag.raw);
    const urlAttr = tag.name === 'script' ? 'src' : 'href';
    if (tag.name === 'link' && !stylesheetLink(attrs)) continue;
    if (!attrs.has(urlAttr) || !resourceIsExternal(attrs.get(urlAttr), pageOrigin, baseUrl)) continue;

    const url = attrs.get(urlAttr);
    const integrity = attrs.get('integrity') || '';
    const algorithms = integrityAlgorithms(integrity);
    const crossorigin = (attrs.get('crossorigin') || '').trim().toLowerCase();
    const resource = {
      file,
      tag: tag.name,
      url,
      integrity,
      algorithms,
      crossorigin,
      problems: [],
    };
    if (!algorithms.length) resource.problems.push('missing a valid SHA-256, SHA-384 or SHA-512 integrity digest');
    if (crossorigin !== 'anonymous') resource.problems.push('must set crossorigin="anonymous"');
    resources.push(resource);
    for (const problem of resource.problems) problems.push(`${tag.name} ${url}: ${problem}`);
  }

  return { file, resources, problems };
}

export function checkSriHtml(file, options = {}) {
  return checkSriText(fs.readFileSync(file, 'utf8'), { ...options, file });
}

// Targets may be HTML files or folders. Folder traversal follows the same
// extension and skip-directory rules as the other front-end HTML guards.
export function checkSri(targets = DEFAULT_TARGETS, options = {}) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.sort().map((file) => checkSriHtml(file, options));
}

function main(argv) {
  const targets = [];
  let origin = process.env.SRI_ORIGIN || undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--origin') {
      origin = argv[i + 1];
      if (!origin) {
        process.stderr.write('--origin requires a URL\n');
        return 2;
      }
      i += 1;
    } else if (argv[i].startsWith('--origin=')) {
      origin = argv[i].slice('--origin='.length);
    } else {
      targets.push(path.resolve(process.cwd(), argv[i]));
    }
  }

  const results = checkSri(targets.length ? targets : DEFAULT_TARGETS, { origin });
  if (!results.length) {
    process.stdout.write('no HTML files found — nothing to check\n');
    return 0;
  }

  let broken = 0;
  let checked = 0;
  for (const result of results) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    checked += result.resources.length;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      const details = result.resources.length
        ? `${result.resources.length} external resource${result.resources.length === 1 ? '' : 's'} protected`
        : 'no external scripts or stylesheets';
      process.stdout.write(`ok   ${shown} — ${details}\n`);
    }
  }
  process.stdout.write(`\n${checked} external resource${checked === 1 ? '' : 's'} checked; ${broken} file${broken === 1 ? '' : 's'} with SRI issues\n`);
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
