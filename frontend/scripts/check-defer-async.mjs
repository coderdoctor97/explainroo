// Load scripts with defer, async, or type=module.
//
// This is the Front-End Checklist rule html/defer-async, checked by reading
// the bytes of the file instead of trusting the template that wrote it:
//
//   · every <script src="…"> has defer, async, or type="module"
//   · inline <script> (no src) is not checked — it is already synchronous by
//     nature and runs where the parser finds it
//   · a script that has type="module" does not also need defer: modules are
//     deferred by default
//   · a script that sets both defer and async is reported as a warning (the
//     two conflict; browsers pick async, but it is probably a mistake)
//   · a component or template file (jsx, tsx, vue, svelte, astro, hbs, ejs,
//     pug, php, erb) that injects a plain <script src> without one of the
//     three attributes is reported as a problem: the same component rendered
//     twice writes the same blocking tag twice
//
//   node frontend/scripts/check-defer-async.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-defer-async.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. The tag reader is the one check-charset.mjs already uses, so
// an attribute inside a comment, a script or a style is never mistaken for
// markup and every guard sees the document the same way. Exits 1, with one
// line per broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_HTML = /\.x?html?$/i;
const IS_SOURCE = /\.(jsx|tsx|vue|svelte|astro|hbs|ejs|pug|php|erb)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'studio-workspace']);

const ATTR_NAME = /^[a-zA-Z][\w:-]*/;
const ATTR_ENTITIES = {
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
      if (!hasSemicolon && /[\w=]/.test(next)) return entity;
      return ATTR_ENTITIES[code.toLowerCase()] ?? entity;
    }
    const hex = code[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff) return '';
    try {
      return String.fromCodePoint(point);
    } catch {
      return '';
    }
  });
}

// Read the attributes of one tag, respecting quotes so a ">" inside a value
// does not end the tag early. Boolean attributes (defer, async) have no value
// and come back with value null — they are real by their presence.
function readAttributes(rawTag) {
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

    let value = null;
    if (rawTag[i] === '=') {
      i += 1;
      while (/\s/.test(rawTag[i] || '')) i += 1;
      const quote = rawTag[i] === '"' || rawTag[i] === "'" ? rawTag[i++] : '';
      const start = i;
      if (quote) {
        while (i < rawTag.length && rawTag[i] !== quote) i += 1;
        value = decodeAttribute(rawTag.slice(start, i));
        if (rawTag[i] === quote) i += 1;
      } else {
        while (i < rawTag.length && !/[\s>]/.test(rawTag[i])) i += 1;
        value = decodeAttribute(rawTag.slice(start, i));
      }
    }
    if (!attrs.has(name)) attrs.set(name, value);
  }
  return attrs;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// One HTML document: every <script src="…"> must carry defer, async, or
// type="module". The inline scripts (no src) are not checked — they are
// already synchronous by nature and run where the parser finds them.
// A script with both defer and async is a warning: browsers pick async,
// but writing both is almost always a mistake.
export function checkDeferAsyncText(html, { name = 'fixture.html' } = {}) {
  const tags = scanTags(html);
  const problems = [];
  const warnings = [];
  const scripts = [];

  for (const tag of tags) {
    if (tag.name !== 'script' || tag.closing) continue;
    const attrs = readAttributes(tag.raw);
    if (!attrs.has('src')) continue;
    const src = attrs.get('src') || '';
    // Skip data: and javascript: URLs — they are not external scripts.
    if (/^(?:data|javascript):/i.test(src.trim())) continue;

    const type = (attrs.get('type') || '').trim().toLowerCase();
    const hasDefer = attrs.has('defer');
    const hasAsync = attrs.has('async');
    const hasModule = type === 'module';
    const line = lineOf(html, tag.index);
    const shown = src || '(unnamed)';

    const entry = { src, type, defer: hasDefer, async: hasAsync, module: hasModule, line };
    scripts.push(entry);

    if (!hasDefer && !hasAsync && !hasModule) {
      problems.push(
        `line ${line}: <script src="${shown}"> has no defer, async, or type="module" — the parser blocks until the script downloads and runs`,
      );
    }
    if (hasDefer && hasAsync) {
      warnings.push(
        `line ${line}: <script src="${shown}"> has both defer and async — they conflict; the browser picks async. Pick one`,
      );
    }
  }
  return { file: name, scripts, problems, warnings };
}

export function checkDeferAsyncHtml(file) {
  return { ...checkDeferAsyncText(fs.readFileSync(file, 'utf8'), { name: file }), file };
}

// A component or template file: literal <script src="…"> tags without one of
// the three attributes are problems — the same component rendered twice writes
// the same blocking tag twice. A src that looks generated ({var}, ${expr},
// {{mustache}}, <% erb %>) is left alone: it is not a literal tag until the
// template language fills it in.
const GENERATED = /[{}$%\\]/;

export function checkDeferAsyncSource(code, name) {
  const problems = [];
  const warnings = [];
  const scripts = [];
  // Match <script ... src="..." ...> but not inside a comment. This is a
  // best-effort grep; the tag reader above is authoritative for HTML files.
  const pattern = /<script\b[^>]*>/gi;
  let match;
  while ((match = pattern.exec(code))) {
    const raw = match[0];
    const attrs = readAttributes(raw);
    if (!attrs.has('src')) continue;
    const src = attrs.get('src') || '';
    if (/^(?:data|javascript):/i.test(src.trim())) continue;
    // A generated src is not a literal tag yet.
    if (GENERATED.test(src)) continue;

    const type = (attrs.get('type') || '').trim().toLowerCase();
    const hasDefer = attrs.has('defer');
    const hasAsync = attrs.has('async');
    const hasModule = type === 'module';
    const line = lineOf(code, match.index);
    const shown = src || '(unnamed)';

    const entry = { src, type, defer: hasDefer, async: hasAsync, module: hasModule, line };
    scripts.push(entry);

    if (!hasDefer && !hasAsync && !hasModule) {
      problems.push(
        `line ${line}: <script src="${shown}"> has no defer, async, or type="module" — add one so the parser does not block`,
      );
    }
    if (hasDefer && hasAsync) {
      warnings.push(
        `line ${line}: <script src="${shown}"> has both defer and async — pick one`,
      );
    }
  }
  return { file: name, scripts, problems, warnings };
}

function markupFilesIn(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return IS_HTML.test(target) || IS_SOURCE.test(target) ? [target] : [];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...markupFilesIn(path.join(target, entry.name)));
    } else if (IS_HTML.test(entry.name) || IS_SOURCE.test(entry.name)) out.push(path.join(target, entry.name));
  }
  return out.sort();
}

// Targets are files or folders; folders are walked for HTML and component
// files. Returns one result per file, each with a `problems` array that is
// empty when it is fine.
export function checkDeferAsync(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of markupFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => (IS_HTML.test(file) ? checkDeferAsyncHtml(file) : { ...checkDeferAsyncSource(fs.readFileSync(file, 'utf8'), file), file }));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkDeferAsync(targets);
  if (!results.length) {
    process.stdout.write('no HTML or component files found — nothing to check\n');
    return 0;
  }
  let broken = 0;
  let warnings = 0;
  let scriptsChecked = 0;
  for (const result of results) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    scriptsChecked += result.scripts.length;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      const detail = result.scripts.length
        ? `${result.scripts.length} script tag${result.scripts.length === 1 ? '' : 's'} with src, all non-blocking`
        : 'no <script src> tags to check';
      process.stdout.write(`ok   ${shown} — ${detail}\n`);
    }
    for (const warning of result.warnings) {
      warnings += 1;
      process.stdout.write(`warn ${shown}\n     ${warning}\n`);
    }
  }
  process.stdout.write(
    `\n${scriptsChecked} script tag${scriptsChecked === 1 ? '' : 's'} checked; ${results.length - broken}/${results.length} files hold the defer-async rule`,
  );
  if (warnings) process.stdout.write(`, ${warnings} warning${warnings === 1 ? '' : 's'}`);
  process.stdout.write('\n');
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
