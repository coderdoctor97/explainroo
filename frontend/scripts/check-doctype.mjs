// Use the HTML5 doctype as the very first line of every HTML document.
//
// This is the Front-End Checklist rule html/doctype, checked by reading the
// bytes of the file instead of trusting the template that wrote it:
//
//   · the file does not start with a UTF-8 BOM
//   · the first non-empty content is exactly the HTML5 doctype
//   · nothing (whitespace, comments) precedes it
//   · no legacy HTML 4.01 / XHTML PUBLIC doctype remains
//
//   node frontend/scripts/check-doctype.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-doctype.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. Exits 1, with one line per broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFilesIn } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML5 = /^<!DOCTYPE html>\s*$/i;
const LEGACY = /PUBLIC\s+["']/i;

export function checkDoctypeHtml(file) {
  const buf = fs.readFileSync(file);
  const problems = [];
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  if (bom) problems.push('starts with a UTF-8 BOM — save it as UTF-8 without BOM');

  const text = buf.toString('utf8');
  const firstLine = (text.split(/\r?\n/, 1)[0] || '');
  const leading = text.match(/^\s*/)[0];
  if (leading.length && !firstLine.toLowerCase().startsWith('<!doctype')) {
    problems.push('leading whitespace before the doctype — it must be the first bytes');
  }
  if (/^\s*<!--/.test(text)) {
    problems.push('a comment precedes the doctype — it must be the first bytes');
  }

  const match = text.match(/^\s*(<!DOCTYPE\b[^>]*>)/i);
  if (!match) {
    problems.push('has no doctype — the first line must be <!DOCTYPE html>');
    return { file, problems, doctype: null };
  }
  const doctype = match[1];
  if (LEGACY.test(doctype)) {
    problems.push(`legacy doctype ${doctype} — replace it with <!DOCTYPE html>`);
  } else if (!HTML5.test(doctype)) {
    problems.push(`doctype is ${doctype} — it must be <!DOCTYPE html>`);
  }
  if (!text.startsWith('<!DOCTYPE html>') && !text.startsWith('<!doctype html>')) {
    // Prefer canonical casing when the rest is already HTML5.
    if (HTML5.test(doctype) && !text.startsWith('<!DOCTYPE html>')) {
      problems.push('doctype should be the canonical <!DOCTYPE html> as the first bytes');
    }
  }
  return { file, problems, doctype };
}

export function checkDoctype(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => checkDoctypeHtml(file));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkDoctype(targets);
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
      process.stdout.write(`ok   ${shown} — ${result.doctype}\n`);
    }
  }
  process.stdout.write(`\n${results.length - broken}/${results.length} files start with the HTML5 doctype\n`);
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
