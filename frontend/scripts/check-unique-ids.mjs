// Every id in one rendered document is unique.
//
// This is the Front-End Checklist rule html/unique-id, checked by reading the
// file instead of trusting the template that wrote it. A duplicate id is
// invalid HTML and silently breaks the things that point at an element by
// name: document.getElementById returns the first match only, a <label for>
// moves the wrong control, aria-labelledby / aria-describedby read the wrong
// text, an in-page "#anchor" lands nowhere, and a CSS #id rule paints every
// match (the sibling rule accessibility/duplicate-id-active makes the same
// point for focusable elements). It is the same question axe asks with
// duplicate-id, and html-validate asks with no-dup-id:
//
//   · an HTML document: no id value appears twice in the same document
//   · ids inside <template> are compared with each other and not with the
//     document, because the spec (and html-validate's no-dup-id) treat
//     template content as a document of its own until it is cloned
//   · an empty id="" is a problem: nothing can ever reference it
//   · a component or template file (jsx, tsx, vue, svelte, astro, hbs, ejs,
//     pug, php, erb) must not hardcode an id: the same component rendered
//     twice writes the same id twice, which is the number one way duplicates
//     reach a page. Use React's useId(), Vue's useId(), or a counter memoized
//     per instance, take an optional id prop, and build every dependent id
//     from it (id, `${id}-label`, `${id}-input`). When an element really is
//     rendered once, the line can say "unique-id-ok" and the id is allowed
//   · a reference (for on a label/output, aria-labelledby, aria-describedby,
//     aria-controls, aria-owns, aria-activedescendant, aria-errormessage,
//     href="#…") that matches no id, or more than one, is reported as a
//     warning: it may be filled in by script, and a duplicate is what makes
//     it ambiguous
//
//   node frontend/scripts/check-unique-ids.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-unique-ids.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. The tag reader is the one check-charset.mjs already uses, so
// an id inside a comment, a script or a style is never mistaken for markup and
// every guard sees the document the same way. The other half of the rule lives
// where a document is real: uitest.mjs mounts the studio and calls
// duplicateIds() on the page itself, at every step. Exits 1, with one line per
// broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_DOCUMENT = /\.x?html?$/i;
const IS_SOURCE = /\.(jsx|tsx|vue|svelte|astro|hbs|ejs|pug|php|erb)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'studio-workspace']);
const EXEMPT = /unique-id-ok/i;

// The attributes that point at an id. `for` only counts on the elements the
// spec gives it to; the aria ones point at ids from anywhere.
const POINTERS = new Map([
  ['for', false],
  ['aria-labelledby', true],
  ['aria-describedby', true],
  ['aria-controls', true],
  ['aria-owns', true],
  ['aria-activedescendant', false],
  ['aria-errormessage', false],
]);
const FOR_ELEMENTS = new Set(['label', 'output']);

// One attribute, read in order, so a value that happens to contain "id="
// (title="id=1") is never mistaken for an id attribute. A name without a value
// comes back with value null: boolean attributes are real.
const ATTRIBUTE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function attributes(raw) {
  const open = /^<\/?\s*([^\s/>]+)/.exec(raw);
  const name = (open ? open[1] : '').toLowerCase();
  const body = raw.slice(open ? open[0].length : 1).replace(/\/?>$/, '');
  const out = [];
  const re = new RegExp(ATTRIBUTE.source, 'g');
  let m;
  while ((m = re.exec(body))) out.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? null });
  return { name, attributes: out };
}

// Every id in a fragment of markup, in the order it appears, with the index it
// starts at in the document it came from and the scope it belongs to.
function idsIn(html, scope, offset = 0) {
  const out = [];
  let templates = 0;
  for (const tag of scanTags(html)) {
    if (!tag.closing) {
      for (const attribute of attributes(tag.raw).attributes) {
        if (attribute.name === 'id') {
          out.push({ value: attribute.value ?? '', index: offset + tag.index, scope });
        }
      }
    }
    if (!tag.closing && tag.name === 'template') {
      templates += 1;
      const close = html.toLowerCase().indexOf('</template', tag.end);
      const inner = close === -1 ? html.slice(tag.end) : html.slice(tag.end, close);
      const label = `${scope === 'the document' ? '' : `${scope} > `}<template> ${templates}`;
      out.push(...idsIn(inner, label, offset + tag.end));
    }
  }
  return out;
}

// Every "#…" and every id-pointing attribute in the markup, with the tag it
// sits on, so a broken one can be reported by line.
function pointersIn(html) {
  const out = [];
  for (const tag of scanTags(html)) {
    if (tag.closing) continue;
    const { name, attributes: attrs } = attributes(tag.raw);
    for (const attribute of attrs) {
      const value = attribute.value;
      // Skip anything a template language still has to fill in: it is not a
      // reference until it is runtime data.
      if (!value || /[{}$%\\]/.test(value)) continue;
      if (POINTERS.has(attribute.name)) {
        if (attribute.name === 'for' && !FOR_ELEMENTS.has(name)) continue;
        const many = POINTERS.get(attribute.name);
        for (const token of many ? value.trim().split(/\s+/) : [value.trim()]) {
          if (token) out.push({ attr: attribute.name, token, index: tag.index, tag: name });
        }
      } else if (attribute.name === 'href' && value.startsWith('#') && value.length > 1) {
        out.push({ attr: 'href', token: value.slice(1), index: tag.index, tag: name });
      }
    }
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function listLines(lines) {
  const unique = [...new Set(lines)];
  if (unique.length === 1) return `line ${unique[0]}`;
  if (unique.length === 2) return `line ${unique[0]} and line ${unique[1]}`;
  return `line ${unique.slice(0, -1).join(', line ')} and line ${unique[unique.length - 1]}`;
}

// The ids written literally in a component or template file, with the line
// each one sits on. `element.id = value` and id={value} are not literals: a
// generated id is exactly what this rule wants.
function literalIds(code) {
  const out = [];
  const patterns = [
    /(?:^|[\s"'=])id\s*=\s*"([^"]*)"/gm,
    /(?:^|[\s"'=])id\s*=\s*'([^']*)'/gm,
    /(?:^|[\s"'=])id\s*=\s*\{\s*"([^"]*)"\s*\}/gm,
    /(?:^|[\s"'=])id\s*=\s*\{\s*'([^']*)'\s*\}/gm,
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(code))) {
      const index = m.index + (m[0].length - m[0].trimStart().length);
      const line = lineOf(code, index);
      const exempt = EXEMPT.test(code.split('\n')[line - 1] || '');
      out.push({ value: m[1], index, line, exempt });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// A component or template file: duplicates inside one file are duplicates in
// every render, and a lone literal id is the duplicate waiting to happen when
// the component is used more than once.
function checkSourceText(code, name) {
  const ids = literalIds(code);
  const problems = [];
  const counts = new Map();
  for (const id of ids) if (!id.exempt) counts.set(id.value, (counts.get(id.value) || 0) + 1);
  const reported = new Set();
  for (const id of ids) {
    if (id.exempt || reported.has(id.value)) continue;
    reported.add(id.value);
    const count = counts.get(id.value);
    if (count > 1) {
      const lines = ids.filter((other) => other.value === id.value && !other.exempt).map((other) => other.line);
      problems.push(`id="${id.value}" is written ${count} times in this file (${listLines(lines)}) — every render of this file repeats it`);
    } else {
      problems.push(
        `line ${id.line}: id="${id.value}" is hardcoded — render this file twice and the document gets two of them. Generate it (React useId(), Vue useId(), or a counter memoized per instance), accept an optional id prop, and build the dependent ids from it; when the element really is rendered once, write "unique-id-ok" on that line`,
      );
    }
  }
  return { file: name, kind: 'source', ids, problems, warnings: [] };
}

// One HTML document: duplicates per scope, empty ids, and references that
// resolve to nothing (a warning: script may still fill them in).
export function checkUniqueIdsText(html, { name = 'fixture.html' } = {}) {
  if (!IS_DOCUMENT.test(name)) return checkSourceText(html, name);

  const ids = idsIn(html, 'the document');
  const problems = [];
  const warnings = [];

  const scopes = new Map();
  for (const id of ids) {
    if (!scopes.has(id.scope)) scopes.set(id.scope, []);
    scopes.get(id.scope).push(id);
  }
  for (const [scope, list] of scopes) {
    const counts = new Map();
    for (const id of list) counts.set(id.value, (counts.get(id.value) || 0) + 1);
    for (const [value, count] of counts) {
      if (count < 2) continue;
      const lines = list.filter((id) => id.value === value).map((id) => lineOf(html, id.index));
      problems.push(
        `id="${value}" appears ${count} times in ${scope} (${listLines(lines)}) — getElementById, <label for>, aria-labelledby and "#${value}" all stop at the first one`,
      );
    }
    for (const id of list) {
      if (id.value === '') problems.push(`line ${lineOf(html, id.index)}: id="" is empty — nothing can reference it`);
    }
  }

  const counts = new Map();
  for (const id of ids) if (id.value) counts.set(id.value, (counts.get(id.value) || 0) + 1);
  for (const pointer of pointersIn(html)) {
    const found = counts.get(pointer.token) || 0;
    const where = `line ${lineOf(html, pointer.index)}: <${pointer.tag}> ${pointer.attr}="${pointer.token}"`;
    if (found === 0) warnings.push(`${where} points at no id in this file — the element may be rendered by script`);
    else if (found > 1) warnings.push(`${where} matches ${found} elements — the reference is ambiguous while the id is duplicated`);
  }

  return { file: name, kind: 'document', ids, problems, warnings };
}

// The DOM of a page that is already built — jsdom in the tests, anything with
// querySelectorAll at runtime. axe's duplicate-id check asks the same question.
export function duplicateIds(root) {
  const seen = new Map();
  for (const element of root.querySelectorAll('[id]')) {
    const id = element.getAttribute('id') ?? '';
    if (!seen.has(id)) seen.set(id, { id, count: 0, elements: [] });
    const entry = seen.get(id);
    entry.count += 1;
    entry.elements.push(element);
  }
  return [...seen.values()].filter((entry) => entry.count > 1);
}

export function checkUniqueIdsHtml(file) {
  return { ...checkUniqueIdsText(fs.readFileSync(file, 'utf8'), { name: file }), file };
}

// Documents are checked, and so are the component and template files that
// write documents. Plain .js/.ts is left to the runtime scan: an id assembled
// in a string is only a duplicate in the page that gets it.
function markupFilesIn(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return IS_DOCUMENT.test(target) || IS_SOURCE.test(target) ? [target] : [];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...markupFilesIn(path.join(target, entry.name)));
    } else if (IS_DOCUMENT.test(entry.name) || IS_SOURCE.test(entry.name)) out.push(path.join(target, entry.name));
  }
  return out.sort();
}

// Targets are files or folders; folders are walked for HTML and component
// files. Returns one result per file, each with a `problems` array that is
// empty when it is fine.
export function checkUniqueIds(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of markupFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => (IS_DOCUMENT.test(file) ? checkUniqueIdsHtml(file) : { ...checkSourceText(fs.readFileSync(file, 'utf8'), file), file }));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkUniqueIds(targets);
  if (!results.length) {
    process.stdout.write('no HTML or component files found — nothing to check\n');
    return 0;
  }
  let broken = 0;
  let duplicates = 0;
  let warnings = 0;
  for (const result of results) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    const ids = result.ids.length;
    if (result.problems.length) {
      broken += 1;
      duplicates += result.problems.filter((problem) => problem.includes('appears') || problem.includes('written')).length;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      const detail = result.kind === 'document'
        ? `${ids} id${ids === 1 ? '' : 's'}, ${result.warnings.length ? `${result.warnings.length} reference${result.warnings.length === 1 ? '' : 's'} to check` : 'all unique and referenced'}`
        : 'no hardcoded ids';
      process.stdout.write(`ok   ${shown} — ${detail}\n`);
    }
    for (const warning of result.warnings) {
      warnings += 1;
      process.stdout.write(`warn ${shown}\n     ${warning}\n`);
    }
  }
  process.stdout.write(
    `\n${results.length - broken}/${results.length} files hold the unique-id rule — ${duplicates} duplicate id${duplicates === 1 ? '' : 's'}, ${warnings} reference${warnings === 1 ? '' : 's'} to check\n`,
  );
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
