// Ensure all IDs are unique.
//
// This is the Front-End Checklist rule html/unique-id, with the two rules that
// lean on it — accessibility/duplicate-id-active (a focusable element's id must
// be unique) and the label / ARIA / anchor rules that resolve an id reference —
// checked by reading the bytes of the file instead of trusting whatever wrote
// it:
//
//   · no id value appears twice in one document
//   · no id is empty, and none contains ASCII whitespace (the spec forbids it,
//     and such an id can never be referenced or selected)
//   · every reference resolves: <label for>, <output for>, the aria-* id
//     reference lists (aria-labelledby, aria-describedby, aria-controls, …),
//     th/td headers, an in-page anchor href="#…" and <use href="#…">
//   · a reference that does resolve must resolve to exactly one element, and a
//     <label for> must point at a labelable element
//   · a reusable component (frontend/src/components/) hardcodes no id: a
//     component rendered N times writes that id N times into one document
//
//   node frontend/scripts/check-unique-id.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-unique-id.mjs page.html dist # or exactly what you point it at
//
// Uniqueness belongs to one rendered document, not to one source file, so the
// rule is applied in three places and all three come through auditIdGraph()
// below: the markup on disk (here, on its own), the document React actually
// builds — where one component appears many times on a page — read out of the
// live DOM with checkUniqueIdsDom(), and the reusable components themselves,
// which are refused a hardcoded id before they can render one twice.
// frontend/server/uitest.mjs runs all three, so `npm run test:ui` is the check
// that covers the whole rule; running this file alone covers the markup and the
// components, and needs no dependencies installed.
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. The tag and attribute readers are the ones check-charset.mjs
// and check-sri.mjs already use, so every guard sees a document the same way —
// an "id" inside a comment, a <script>, a <style> or a <template> is never
// mistaken for markup, which is also what a browser does. Exits 1, with one
// line per broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlFilesIn, scanTags } from './check-charset.mjs';
import { parseAttributes } from './check-sri.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_TARGETS = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')];

// Where the reusable components live. A literal id in here is a duplicate the
// moment the component is rendered twice, so it is refused outright; the stages
// in frontend/src/stages/ are covered by the live-DOM assertions instead,
// because whether they repeat is a runtime question.
const COMPONENT_DIR = path.join(ROOT, 'frontend', 'src', 'components');
const IS_COMPONENT = /\.(?:tsx|jsx|ts|js|mjs)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'studio-workspace']);

// What a <label for> may point at. An <input type="hidden"> is not labelable.
const LABELABLE = new Set(['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea']);
// Attributes whose value is a whitespace-separated list of ids.
const ID_LIST_ATTRS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-flowto', 'aria-activedescendant', 'aria-details', 'aria-errormessage', 'headers'];
// Attributes that can carry a same-document fragment, the "#id" half of a URL.
const FRAGMENT_ATTRS = ['href', 'xlink:href', 'src'];

const idList = (value) => String(value ?? '').trim().split(/\s+/).filter(Boolean);

// Line numbers, so a failure says where to look. Offsets are worked out once
// per document and then binary-searched.
function lineFinder(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const decodeFragment = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// The rule itself, applied to one document's id graph. Both halves of the guard
// come through here: the markup reader below and the live DOM in the UI test
// each collect { ids, references } and ask this the same question.
//
//   ids:         [{ value, tag, where, attrs }]
//   references:  [{ attr, kind, tokens, tag, where }]   kind: 'labelable' | 'list' | 'fragment'
export function auditIdGraph({ ids, references, source = 'this document' }) {
  const problems = [];
  const byId = new Map();
  for (const entry of ids) {
    const found = byId.get(entry.value);
    if (found) found.push(entry);
    else byId.set(entry.value, [entry]);
  }

  for (const [value, found] of byId) {
    const at = found.map((f) => `${f.where} <${f.tag}>`).join(', ');
    if (value === '') {
      problems.push(`an empty id="" can never be referenced — give ${at} a real id, or none`);
      continue;
    }
    if (/\s/.test(value)) problems.push(`id "${value}" contains whitespace, which HTML forbids — ${at}`);
    if (found.length > 1) {
      problems.push(`id "${value}" is used ${found.length} times in ${source} — ${at}`);
    }
  }

  for (const ref of references) {
    for (const token of ref.tokens) {
      if (!token) continue;
      // An <a href="#id"> is an in-page anchor; the same syntax on <use> or
      // <img> is just a same-document reference, so say which one it is.
      const value = ref.kind === 'fragment' ? `#${token}` : token;
      const anchor = ref.kind === 'fragment' && (ref.tag === 'a' || ref.tag === 'area');
      const named = `${anchor ? 'the in-page anchor ' : ''}${ref.attr}="${value}"`;
      const target = byId.get(token);
      if (!target || !target.length) {
        problems.push(`${named} on <${ref.tag}> (${ref.where}) points at an id nothing in ${source} has`);
        continue;
      }
      if (target.length > 1) {
        problems.push(`${named} on <${ref.tag}> (${ref.where}) is ambiguous — ${target.length} elements in ${source} share that id`);
        continue;
      }
      if (ref.kind === 'labelable') {
        const hit = target[0];
        const type = String(hit.attrs?.type || '').toLowerCase();
        const labelable = LABELABLE.has(hit.tag) && !(hit.tag === 'input' && type === 'hidden');
        if (!labelable) {
          problems.push(`${named} on <${ref.tag}> (${ref.where}) points at <${hit.tag}${type ? ` type="${type}"` : ''}>, which a label cannot be for`);
        }
      }
    }
  }
  return [...new Set(problems)];
}

// ---------- half one: the markup on disk ----------

// Every id and every id reference in an HTML string, read the way a browser
// reads it: <script>, <style>, <title>, <textarea>, <template> and comments are
// inert, so what is inside them does not count.
export function collectIdsFromHtml(html, { file = '<html>' } = {}) {
  const line = lineFinder(html);
  const ids = [];
  const references = [];
  for (const tag of scanTags(html)) {
    if (tag.closing) continue;
    const attrs = parseAttributes(tag.raw);
    const where = `${path.basename(file)}:${line(tag.index)}`;
    if (attrs.has('id')) {
      ids.push({ value: attrs.get('id'), tag: tag.name, where, attrs: Object.fromEntries(attrs) });
    }
    for (const name of ID_LIST_ATTRS) {
      if (!attrs.has(name)) continue;
      references.push({ attr: name, kind: 'list', tokens: idList(attrs.get(name)), tag: tag.name, where });
    }
    if (attrs.has('for')) {
      // <output for> is a list of ids; <label for> is one, and it must be a
      // control a label can be for.
      const list = tag.name === 'output';
      references.push({
        attr: 'for',
        kind: list ? 'list' : 'labelable',
        tokens: list ? idList(attrs.get('for')) : [attrs.get('for').trim()],
        tag: tag.name,
        where,
      });
    }
    for (const name of FRAGMENT_ATTRS) {
      if (!attrs.has(name)) continue;
      const value = attrs.get(name).trim();
      // Only "#id" is a same-document reference; "other.html#id" is not ours to
      // check, and a bare "#" points nowhere in particular.
      if (!value.startsWith('#') || value.length < 2) continue;
      references.push({ attr: name, kind: 'fragment', tokens: [decodeFragment(value.slice(1))], tag: tag.name, where });
    }
  }
  return { ids, references };
}

export function checkUniqueIdsText(html, { file = '<html>' } = {}) {
  const graph = collectIdsFromHtml(html, { file });
  return {
    file,
    ids: graph.ids,
    references: graph.references,
    problems: auditIdGraph({ ...graph, source: path.basename(file) }),
  };
}

export function checkUniqueIdsHtml(file) {
  return checkUniqueIdsText(fs.readFileSync(file, 'utf8'), { file });
}

// ---------- the same rule, asked of a live document ----------

function attributesOf(el) {
  const out = {};
  for (const attribute of el.attributes) out[attribute.name.toLowerCase()] = attribute.value;
  return out;
}

// A short readable place: the last few tags above the element, told apart by the
// class that styles them. Not by the id — the id is what is being reported, and
// when it is the duplicate it is the ambiguous part.
function describeElement(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && parts.length < 4) {
    const tag = node.tagName.toLowerCase();
    const cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    parts.unshift(tag + (cls ? `.${cls}` : ''));
    node = node.parentElement;
  }
  return parts.join(' > ');
}

// Every id and every id reference in a DOM a browser (or jsdom) built. This is
// the half of the rule that matters most here: uniqueness belongs to one
// rendered document, and the studio's document is written by React components
// that appear many times on a page. The markup reader above cannot see that;
// this can. Both feed the same auditIdGraph.
export function collectIdsFromDom(doc, { label = 'the page' } = {}) {
  const ids = [];
  const references = [];
  for (const el of doc.querySelectorAll('[id]')) {
    ids.push({
      value: el.getAttribute('id'),
      tag: el.tagName.toLowerCase(),
      where: `${label} ${describeElement(el)}`,
      attrs: attributesOf(el),
    });
  }
  for (const el of doc.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    const where = `${label} ${describeElement(el)}`;
    for (const name of ID_LIST_ATTRS) {
      const value = el.getAttribute(name);
      if (value === null) continue;
      references.push({ attr: name, kind: 'list', tokens: idList(value), tag, where });
    }
    const forValue = el.getAttribute('for');
    if (forValue !== null) {
      const list = tag === 'output';
      references.push({ attr: 'for', kind: list ? 'list' : 'labelable', tokens: list ? idList(forValue) : [forValue.trim()], tag, where });
    }
    for (const name of FRAGMENT_ATTRS) {
      const value = (el.getAttribute(name) || '').trim();
      if (!value.startsWith('#') || value.length < 2) continue;
      references.push({ attr: name, kind: 'fragment', tokens: [decodeFragment(value.slice(1))], tag, where });
    }
  }
  return { ids, references };
}

export function checkUniqueIdsDom(doc, { label = 'the page' } = {}) {
  const graph = collectIdsFromDom(doc, { label });
  return { label, ids: graph.ids, references: graph.references, problems: auditIdGraph({ ...graph, source: label }) };
}

// ---------- half two: the components that write the ids ----------

const LITERAL_ID = /(?:^|\s)id\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\})/g;

// JSX opening tags, each read to the ">" that closes it with quotes and braces
// respected. Without that, the "id" in `const id = 'x'`, in `style.id === 'y'`
// or in a ">" inside an attribute value would be read as markup.
export function jsxTags(source) {
  const out = [];
  const start = /<[A-Za-z][\w.-]*/g;
  let match;
  while ((match = start.exec(source))) {
    let i = match.index + match[0].length;
    let quote = '';
    let depth = 0;
    while (i < source.length) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || c === '`') quote = c;
      else if (c === '{') depth += 1;
      else if (c === '}') depth = Math.max(0, depth - 1);
      else if (c === '>' && depth === 0) break;
      i += 1;
    }
    if (i >= source.length) break;
    out.push({ name: match[0].slice(1), attributes: source.slice(match.index + match[0].length, i), index: match.index });
  }
  return out;
}

// Comments blanked to spaces, with every offset and every newline left exactly
// where it was, so line numbers still mean what they say. A file that documents
// the wrong thing — `<div id="panel">` in a comment, as an example of what not
// to write — must not be read as its own markup.
export function withoutComments(source) {
  const out = [];
  let inBlock = false;
  for (const line of source.split('\n')) {
    let text = line;
    if (inBlock) {
      const end = text.indexOf('*/');
      if (end === -1) {
        out.push(' '.repeat(text.length));
        continue;
      }
      text = `${' '.repeat(end + 2)}${text.slice(end + 2)}`;
      inBlock = false;
    }
    text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    const open = text.indexOf('/*');
    if (open !== -1 && text.indexOf('*/', open + 2) === -1) {
      text = text.slice(0, open) + ' '.repeat(text.length - open);
      inBlock = true;
    }
    // Only a comment that starts its line: a "//" inside a string, a URL or a
    // regular expression is code and stays put.
    if (/^\s*\/\//.test(text)) text = ' '.repeat(text.length);
    out.push(text);
  }
  return out.join('\n');
}

export function checkComponentIdsText(source, { file = '<component>' } = {}) {
  const code = withoutComments(source);
  const line = lineFinder(code);
  // One entry per literal id, keyed by the character it starts at: a component
  // written inside another one's braces is read through both tags, and the
  // innermost tag is the one that owns the attribute.
  const found = new Map();
  for (const tag of jsxTags(code)) {
    const base = tag.index + 1 + tag.name.length; // where tag.attributes starts
    for (const match of tag.attributes.matchAll(LITERAL_ID)) {
      // Point at the `id` itself, not at the whitespace the pattern swallowed,
      // so the line number is the line the attribute is written on. The offset
      // is the same read through a wrapper tag, which is what dedupes the two.
      const at = base + match.index + match[0].indexOf('id');
      const previous = found.get(at);
      if (previous && previous.tagIndex >= tag.index) continue;
      found.set(at, {
        tagIndex: tag.index,
        value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '',
        name: tag.name,
        line: line(at),
      });
    }
  }
  const problems = [...found.values()].sort((a, b) => a.line - b.line || a.tagIndex - b.tagIndex).map(({ value, name, line: at }) => (
    `<${name}> at line ${at} hardcodes id="${value}" — a reusable component is rendered as often as it is used, `
    + 'so every instance writes that same id into one document. Generate it with useUniqueId() '
    + '(frontend/src/components/useUniqueId.ts), keep an optional id prop so a caller can still name it, '
    + 'and build the ids that depend on it from the same value.'
  ));
  return { file, problems };
}

export function checkComponentIds(file) {
  return checkComponentIdsText(fs.readFileSync(file, 'utf8'), { file });
}

function componentFilesIn(target) {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return IS_COMPONENT.test(target) ? [target] : [];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...componentFilesIn(path.join(target, entry.name)));
    } else if (IS_COMPONENT.test(entry.name)) out.push(path.join(target, entry.name));
  }
  return out.sort();
}

// Targets are files or folders; folders are walked for .html files. Returns one
// result per file, each with a `problems` array that is empty when it is fine.
export function checkUniqueIds(targets = DEFAULT_TARGETS) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of htmlFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => checkUniqueIdsHtml(file));
}

// The reusable components, unless the caller pointed the guard somewhere else.
export function checkComponents(targets = [COMPONENT_DIR]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of componentFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => checkComponentIds(file));
}

function main(argv) {
  const targets = argv.map((t) => path.resolve(process.cwd(), t));
  const documents = checkUniqueIds(targets.length ? targets : undefined);
  const components = checkComponents(targets.length ? targets : undefined);
  if (!documents.length && !components.length) {
    process.stdout.write('no HTML or component files found — nothing to check\n');
    return 0;
  }

  let broken = 0;
  let ids = 0;
  for (const result of documents) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    ids += result.ids.length;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      const unique = result.ids.length === 1 ? '1 unique id' : `${result.ids.length} unique ids`;
      const refs = result.references.length === 1 ? '1 reference resolved' : `${result.references.length} references resolved`;
      process.stdout.write(`ok   ${shown} — ${unique}, ${refs}\n`);
    }
  }
  for (const result of components) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else {
      process.stdout.write(`ok   ${shown} — no hardcoded id in a reusable component\n`);
    }
  }

  const files = documents.length + components.length;
  process.stdout.write(
    `\n${files - broken}/${files} files keep every id unique (${ids} id${ids === 1 ? '' : 's'} read out of ${documents.length} document${documents.length === 1 ? '' : 's'})\n`,
  );
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
