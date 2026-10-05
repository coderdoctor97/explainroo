// Set the responsive viewport meta tag, and never turn zoom off.
//
// This is the Front-End Checklist rules html/viewport and css/viewport-zoom,
// checked by reading the bytes of the file instead of trusting the template
// that wrote it:
//
//   · exactly one <meta name="viewport"> in <head>, and it is not empty
//   · content starts from width=device-width, initial-scale=1
//     (initial-scale=1.0 is the same number, written differently)
//   · no user-scalable=no / user-scalable=0, which stops pinch zoom
//   · no maximum-scale below 2, which caps zoom at a level WCAG 2.1
//     SC 1.4.4 (Resize Text) does not allow
//
//   node frontend/scripts/check-viewport.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-viewport.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. The tag reader is the one check-charset.mjs already uses, so
// both head rules see the document the same way — a "<meta>" inside a comment,
// a script or a style is never mistaken for markup. Exits 1, with one line per
// broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFilesIn, headOf, scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NAME = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

function attr(re, raw) {
  const m = re.exec(raw);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

// "width=device-width, initial-scale=1" → { width: 'device-width', 'initial-scale': '1' }.
// Keys are lowercased; the last writing of a property wins, the way a browser reads it.
export function viewportContent(raw) {
  const out = {};
  for (const part of (attr(CONTENT, raw) || '').split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    if (key) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}

// The first <meta name="viewport"> in the document, with the index it starts
// at. The UI test uses this too, to ask a real DOM the same question.
export function firstViewportMeta(html) {
  const tags = scanTags(html);
  const head = headOf(tags, html);
  const tag = tags.find(
    (t) => t.name === 'meta' && !t.closing && /^viewport$/i.test((attr(NAME, t.raw) || '').trim())
      && (!head || (t.index >= head.start && t.index < head.end)),
  );
  return tag ? { raw: tag.raw, index: tag.index, content: viewportContent(tag.raw) } : null;
}

// One number, however it is written: "1", "1.0" and "1.00" are all zoom 1.
const number = (value) => {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
};

export function checkViewportHtml(file) {
  const text = fs.readFileSync(file, 'utf8');
  const problems = [];
  const tags = scanTags(text);
  const head = headOf(tags, text);

  if (!head) {
    problems.push('has no <head> and no <body>, so it declares no viewport');
    return { file, problems, content: null, count: 0 };
  }
  const where = head.implied ? 'the implied <head>' : '<head>';
  const metas = tags.filter(
    (t) => t.name === 'meta' && !t.closing && /^viewport$/i.test((attr(NAME, t.raw) || '').trim()),
  );
  const inside = metas.filter((t) => t.index >= head.start && t.index < head.end);

  if (!metas.length) {
    problems.push(`declares no <meta name="viewport"> in ${where}`);
    return { file, problems, content: null, count: 0 };
  }
  if (metas.length > 1) problems.push(`has ${metas.length} viewport tags — keep exactly one`);
  if (!inside.length && metas.length) problems.push(`<meta name="viewport"> is outside ${where}`);

  const meta = inside[0];
  if (!meta) return { file, problems, content: null, count: metas.length };
  const content = viewportContent(meta.raw);
  const seen = Object.entries(content).map(([k, v]) => `${k}=${v}`).join(', ') || 'nothing';

  if (!Object.keys(content).length) problems.push(`the viewport tag says nothing: content="${attr(CONTENT, meta.raw) || ''}"`);
  if (content.width !== 'device-width') {
    problems.push(`width is ${content.width ? `"${content.width}"` : 'missing'} — it must be device-width`);
  }
  const scale = number(content['initial-scale']);
  if (content['initial-scale'] === undefined) problems.push('initial-scale is missing — it must be 1');
  else if (scale !== 1) problems.push(`initial-scale is "${content['initial-scale']}" — it must be 1`);

  const userScalable = content['user-scalable'];
  if (userScalable !== undefined && /^(no|0|false|off)$/i.test(String(userScalable).trim())) {
    problems.push(`user-scalable=${userScalable} turns pinch zoom off — remove it (WCAG 2.1 SC 1.4.4)`);
  }
  const maxScale = number(content['maximum-scale']);
  if (content['maximum-scale'] !== undefined && (maxScale === null || maxScale < 2)) {
    problems.push(`maximum-scale=${content['maximum-scale']} caps zoom below 2 — remove it, or allow at least 2`);
  }
  return { file, problems, content: seen, count: metas.length };
}

// Targets are files or folders; folders are walked for .html files. Returns one
// result per file, each with a `problems` array that is empty when it is fine.
export function checkViewport(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => checkViewportHtml(file));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkViewport(targets);
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
      process.stdout.write(`ok   ${shown} — one responsive viewport: ${result.content}\n`);
    }
  }
  process.stdout.write(`\n${results.length - broken}/${results.length} files set the responsive viewport tag, zoom included\n`);
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
