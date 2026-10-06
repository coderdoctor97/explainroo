import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HtmlValidate } from 'html-validate';
import { JSDOM } from 'jsdom';

const FRONTEND = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(fs.readFileSync(new URL('../.htmlvalidate.json', import.meta.url), 'utf8'));
const validator = new HtmlValidate(config);

export async function validateHtml(source, name = 'document.html') {
  const report = await validator.validateString(source, name);
  const messages = report.results.flatMap((result) => result.messages);
  const add = (ruleId, message) => messages.push({ ruleId, severity: 2, message, line: 1, column: 1 });
  // Project document requirements supplement the standards preset. Do not
  // normalize source before the validator: browsers repair broken HTML.
  if (!/^\s*<!doctype\s+html\s*>/i.test(source)) add('project/doctype-first', 'Begin the document with the HTML5 doctype.');
  const dom = new JSDOM(source);
  try {
    const metas = [...dom.window.document.querySelectorAll('head meta[charset]')];
    if (metas.length !== 1 || metas[0].getAttribute('charset').toLowerCase() !== 'utf-8') {
      add('project/charset', 'Declare exactly one UTF-8 meta charset in head.');
    }
  } finally { dom.window.close(); }
  return { file: name, errors: messages.filter((m) => m.severity === 2).length, warnings: messages.filter((m) => m.severity === 1).length, messages };
}

export function reportFor(results) {
  return { tool: 'html-validate', scope: 'frontend', certification: 'Local checks only; not a W3C Nu result',
    documents: results.length, errors: results.reduce((n, r) => n + r.errors, 0),
    warnings: results.reduce((n, r) => n + r.warnings, 0), results };
}

export function writeReport(file, results) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(reportFor(results), null, 2) + '\n');
}

function discover(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ['node_modules', 'tests', 'references', '.reports', '.git'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? discover(file) : /\.html?$/i.test(entry.name) ? [file] : [];
  }).sort();
}

async function main(args) {
  const reportPath = path.join(FRONTEND, '.reports/html-validation.json');
  // Never leave a stale successful artifact after an input or tool failure.
  fs.rmSync(reportPath, { force: true });
  const results = [];
  // Explicit filenames are also supported, including deliberately bad fixtures.
  const files = args.length ? args.map((file) => path.resolve(file)) : discover(FRONTEND);
  if (!files.length) throw new Error('No HTML documents found; refusing an empty pass.');
  for (const file of files) results.push(await validateHtml(fs.readFileSync(file, 'utf8'), path.relative(FRONTEND, file)));
  if (!args.length) {
    const { createServer } = await import('vite');
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const vite = await createServer({ root: FRONTEND, configFile: path.resolve(FRONTEND, '../vite.config.ts'), server: { middlewareMode: true, hmr: false, proxy: undefined }, appType: 'custom', logLevel: 'error' });
    try {
      const App = (await vite.ssrLoadModule('/src/App.tsx')).default;
      const shell = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
      results.push(await validateHtml(shell.replace('<div id="root"></div>', `<div id="root">${renderToStaticMarkup(React.createElement(App))}</div>`), 'rendered/start.html'));
    } finally { await vite.close(); }
  }
  const report = reportFor(results);
  writeReport(reportPath, results);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.errors ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`HTML validation failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
