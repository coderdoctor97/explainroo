// Declare UTF-8 first in <head>, and keep it that way.
//
// This is the Front-End Checklist rule html/charset, checked by reading the
// bytes of the file instead of trusting the template that wrote it:
//
//   · <meta charset="utf-8"> is the first element child of <head>
//   · there is exactly one charset declaration, and it says utf-8
//   · it starts inside the first 1024 bytes of the document
//   · no legacy <meta http-equiv="Content-Type"> is left anywhere
//   · the file does not start with a UTF-8 BOM
//
//   node frontend/scripts/check-charset.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-charset.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. It is a guard, not a validator — the parser below is a small
// tag reader, not the HTML parser; it knows enough to find <head>, the tags
// inside it and where they sit in the file, and it skips the raw text of
// <script>, <style>, <title>, <textarea>, <template> and <noscript> so their
// contents are never mistaken for markup. Exits 1, with one line per broken
// file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_HTML = /\.x?html?$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'studio-workspace']);
const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea', 'template', 'noscript']);
const CHARSET = /\bcharset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const HTTP_EQUIV = /\bhttp-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

function attr(re, raw) {
  const m = re.exec(raw);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

// A tag, read to its closing ">", with quotes respected so a ">" inside an
// attribute value does not end it early.
function readTag(text, start) {
  let i = start + 1;
  let quote = '';
  while (i < text.length) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return text.slice(start, i + 1);
    i += 1;
  }
  return text.slice(start);
}

// Every tag in the document, in order, with the index it starts at.
// Exported so the other head rules (check-viewport.mjs) read the document the
// same way this one does.
export function scanTags(text) {
  const tags = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    const next = text[lt + 1] || '';
    if (next === '!') {
      if (text.startsWith('<!--', lt)) {
        const end = text.indexOf('-->', lt + 4);
        i = end === -1 ? text.length : end + 3;
      } else {
        const end = text.indexOf('>', lt);
        i = end === -1 ? text.length : end + 1;
      }
      continue;
    }
    if (next !== '/' && !/[a-zA-Z]/.test(next)) {
      i = lt + 1;
      continue;
    }
    const raw = readTag(text, lt);
    const closing = raw.startsWith('</');
    const name = ((raw.match(/^<\/?\s*([a-zA-Z][\w:-]*)/) || [])[1] || '').toLowerCase();
    tags.push({ name, raw, index: lt, end: lt + raw.length, closing });
    i = lt + raw.length;
    if (!closing && RAW_TEXT.has(name)) {
      const close = text.toLowerCase().indexOf(`</${name}`, i);
      if (close === -1) i = text.length;
      else i = close + readTag(text, close).length;
    }
  }
  return tags;
}

// The head: the real element if there is one, otherwise the implied one, which
// by the spec is everything before <body>.
export function headOf(tags, text) {
  const open = tags.find((t) => t.name === 'head' && !t.closing);
  if (open) {
    const close = tags.find((t) => t.name === 'head' && t.closing && t.index > open.index);
    return { start: open.end, end: close ? close.index : text.length, implied: false };
  }
  const body = tags.find((t) => t.name === 'body');
  return body ? { start: 0, end: body.index, implied: true } : null;
}

// "Starts at" and "is the first child" are both byte questions in the spec, so
// measure in bytes, not in characters.
const byteOffset = (text, index) => Buffer.byteLength(text.slice(0, index), 'utf8');

// The first real <meta charset> in a document — the one a browser would read —
// with the index it starts at and the byte it starts at. It goes through the
// same tag reader as the checks, so a "<meta charset>" inside a comment, a
// script or a style is never mistaken for the declaration. The dev server uses
// this too, to keep the declaration first when it serves the page (dev.mjs).
export function firstCharsetMeta(html) {
  const tag = scanTags(html).find((t) => t.name === 'meta' && CHARSET.test(t.raw));
  return tag ? { raw: tag.raw, index: tag.index, offset: byteOffset(html, tag.index) } : null;
}

export function checkHtml(file) {
  const buf = fs.readFileSync(file);
  const problems = [];
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  if (bom) problems.push('starts with a UTF-8 BOM — save it as UTF-8 without BOM');

  const text = buf.toString('utf8');
  const tags = scanTags(text);
  const head = headOf(tags, text);
  const metas = tags.filter((t) => t.name === 'meta' && CHARSET.test(t.raw));
  const legacy = tags.filter((t) => t.name === 'meta' && /^content-type$/i.test((attr(HTTP_EQUIV, t.raw) || '').trim()));

  for (const tag of legacy) {
    problems.push(`legacy <meta http-equiv="Content-Type"> at byte ${byteOffset(text, tag.index)} must be removed`);
  }

  if (!head) {
    problems.push('has no <head> and no <body>, so it declares no encoding');
    return { file, problems, offset: null };
  }
  const where = head.implied ? 'the implied <head>' : '<head>';
  const inside = metas.filter((t) => t.index >= head.start && t.index < head.end);

  if (!metas.length) problems.push(`declares no <meta charset> in ${where}`);
  if (metas.length > 1) problems.push(`has ${metas.length} charset declarations — keep exactly one`);
  if (!inside.length && metas.length) problems.push(`<meta charset> is outside ${where}`);

  const first = tags.find((t) => t.index >= head.start && t.index < head.end && !t.closing);
  const meta = inside[0];
  if (meta) {
    const value = (attr(CHARSET, meta.raw) || '').trim();
    const offset = byteOffset(text, meta.index);
    if (value.toLowerCase() !== 'utf-8') problems.push(`charset is "${value}" — it must be utf-8`);
    if (offset >= 1024) problems.push(`<meta charset> starts at byte ${offset} — it must be inside the first 1024 bytes`);
    if (!first || first.index !== meta.index) {
      problems.push(`<meta charset> is not the first element in ${where} — <${(first && first.name) || '?'}> comes before it`);
    }
    return { file, problems, offset, value, implied: head.implied };
  }
  if (first && first.name && first.name !== 'meta') {
    problems.push(`the first element in ${where} is <${first.name}> — <meta charset> must come before it`);
  }
  return { file, problems, offset: null };
}

export function htmlFilesIn(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return IS_HTML.test(target) ? [target] : [];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...htmlFilesIn(path.join(target, entry.name)));
    } else if (IS_HTML.test(entry.name)) out.push(path.join(target, entry.name));
  }
  return out.sort();
}

// Targets are files or folders; folders are walked for .html files. Returns one
// result per file, each with a `problems` array that is empty when it is fine.
export function checkCharset(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => ({ ...checkHtml(file), file }));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkCharset(targets);
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
      process.stdout.write(`ok   ${shown} — meta charset utf-8 first in <head>, byte ${result.offset}\n`);
    }
  }
  process.stdout.write(`\n${results.length - broken}/${results.length} files declare UTF-8 first in <head>\n`);
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
