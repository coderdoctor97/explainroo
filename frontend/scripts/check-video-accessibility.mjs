// Video accessibility: captions, controls, no autoplay.
//
// This is the Front-End Checklist rule html/video-accessibility, checked by
// reading the bytes of the file instead of trusting the template that wrote
// it:
//
//   · every <video> has a controls attribute (the user must be able to play,
//     pause, seek, and change volume)
//   · every <video> has an aria-label or aria-labelledby (screen readers
//     need a name for the player)
//   · no <video> has autoplay set to a truthy value (autoplay="" in HTML is
//     a boolean attribute, autoplay={false} in JSX is fine, autoplay="false"
//     is a trap — the string is truthy in HTML)
//   · every <video> with a src that looks like a real video has either a
//     <track kind="captions"> child or a captions prop in a React component
//     — the engine may burn captions into the frames, but the player still
//     needs a track for screen readers and viewers who turn captions on
//   · every <audio> has an aria-label or aria-labelledby, and no autoplay
//
//   node frontend/scripts/check-video-accessibility.mjs                # frontend/ + a built frontend-dist/
//   node frontend/scripts/check-video-accessibility.mjs page.html dist # or exactly what you point it at
//
// Zero dependencies on purpose: it has to run on a fresh checkout, before
// `npm install`. The tag reader is the one check-charset.mjs already uses, so
// a tag inside a comment, a script or a style is never mistaken for markup.
// Exits 1, with one line per broken file, when anything is wrong.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTags } from './check-charset.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_HTML = /\.x?html?$/i;
const IS_COMPONENT = /\.(jsx|tsx|vue|svelte|astro|hbs|ejs|pug|php|erb)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'studio-workspace']);

const ATTR_NAME = /^[a-zA-Z][\w:-]*/;
const ATTR_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  colon: ':', sol: '/', bsol: '\\', period: '.', commat: '@',
  num: '#', quest: '?', equals: '=', semi: ';',
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
    try { return String.fromCodePoint(point); } catch { return ''; }
  });
}

function readAttributes(rawTag) {
  const attrs = new Map();
  const opening = /^<\s*[a-zA-Z][\w:-]*/.exec(rawTag);
  if (!opening) return attrs;
  let i = opening[0].length;
  while (i < rawTag.length) {
    while (/\s/.test(rawTag[i] || '') || rawTag[i] === '/') i += 1;
    if (i >= rawTag.length || rawTag[i] === '>') break;
    const nameMatch = ATTR_NAME.exec(rawTag.slice(i));
    if (!nameMatch) { i += 1; continue; }
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

// Is the autoplay value truthy? In HTML, autoplay="" is truthy (the mere
// presence of the attribute is enough). In JSX, autoplay={false} is fine.
// The string "false" in an HTML attribute is a common trap — it is truthy.
function autoplayIsOn(attrs) {
  if (!attrs.has('autoplay')) return false;
  const value = attrs.get('autoplay');
  if (value === null) return true; // boolean attribute, present without value
  if (value === '' ) return true;  // autoplay=""
  if (/^false$/i.test(value.trim())) return true; // "false" is truthy in HTML
  return /^(true|1|yes|on)$/i.test(value.trim());
}

// One HTML document: check every <video> and <audio> for the accessibility
// attributes the checklist requires.
export function checkVideoAccessibilityText(html, { name = 'fixture.html' } = {}) {
  const tags = scanTags(html);
  const problems = [];
  const media = [];

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag.closing) continue;
    if (tag.name !== 'video' && tag.name !== 'audio') continue;
    const attrs = readAttributes(tag.raw);
    const line = lineOf(html, tag.index);
    const entry = { tag: tag.name, line, attrs, problems: [] };

    // Controls: the user must be able to operate the player. A hidden <audio>
    // controlled by a custom UI (like the studio's Transport) is exempt if
    // it has an aria-label; the Transport provides the controls.
    if (tag.name === 'video' && !attrs.has('controls')) {
      entry.problems.push(`line ${line}: <video> has no controls attribute — the viewer must be able to play, pause, seek and change volume`);
    }

    // ARIA label: screen readers need a name. Either aria-label or
    // aria-labelledby is fine.
    if (!attrs.has('aria-label') && !attrs.has('aria-labelledby')) {
      entry.problems.push(`line ${line}: <${tag.name}> has no aria-label or aria-labelledby — a screen reader cannot name the player`);
    }

    // No autoplay: the page must not start media without the user asking.
    if (autoplayIsOn(attrs)) {
      entry.problems.push(`line ${line}: <${tag.name}> has autoplay — the page must not start media without the user asking (WCAG 2.2 SC 1.4.11, WCAG 2.1 SC 2.2.2)`);
    }

    // Captions: every <video> with a src should have a <track kind="captions">
    // somewhere inside it (or a captions prop in a React component). We look
    // ahead for a <track> sibling before the closing </video>.
    if (tag.name === 'video' && attrs.has('src')) {
      let hasCaptions = false;
      for (let j = i + 1; j < tags.length; j++) {
        if (tags[j].name === 'video' && tags[j].closing) break;
        if (tags[j].name === 'track') {
          const trackAttrs = readAttributes(tags[j].raw);
          if ((trackAttrs.get('kind') || '').toLowerCase() === 'captions') {
            hasCaptions = true;
            break;
          }
        }
      }
      if (!hasCaptions) {
        entry.problems.push(`line ${line}: <video> has no <track kind="captions"> — deaf and hard-of-hearing viewers need captions`);
      }
    }

    for (const p of entry.problems) problems.push(p);
    media.push(entry);
  }

  return { file: name, media, problems };
}

export function checkVideoAccessibilityHtml(file) {
  return { ...checkVideoAccessibilityText(fs.readFileSync(file, 'utf8'), { name: file }), file };
}

// A component file: look for <video> and <audio> JSX tags. The same checks
// apply, but we accept autoplay={false} (JSX expression) as safe, and we
// look for captions={...} props on <video> as the component-level equivalent
// of <track kind="captions">.
const GENERATED = /[{}$%\\]/;

// Read a JSX opening tag starting at position `start` in the source. JSX tags
// can contain `{…}` expressions with `>` inside them (arrow functions,
// ternaries), so a simple `[^>]*` regex stops too early. This reader counts
// brace depth and stops at the first `>` outside any `{…}`.
function readJsxTag(code, start) {
  let i = start;
  // Skip past <tagName
  while (i < code.length && code[i] !== ' ' && code[i] !== '\t' && code[i] !== '\n' && code[i] !== '\r' && code[i] !== '>' && code[i] !== '/') i++;
  let depth = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '{') { depth += 1; i += 1; continue; }
    if (c === '}') { depth = Math.max(0, depth - 1); i += 1; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      while (i < code.length && code[i] !== quote) {
        if (code[i] === '\\' && quote === '`') i += 1; // skip escape in template literal
        i += 1;
      }
      if (i < code.length) i += 1;
      continue;
    }
    if (depth === 0 && c === '>') {
      return code.slice(start, i + 1);
    }
    i += 1;
  }
  return code.slice(start);
}

export function checkVideoAccessibilitySource(code, name) {
  const problems = [];
  const media = [];
  // Find the position of every <video or <audio tag, then read the full tag
  // with the JSX-aware reader.
  const tagRe = /<(video|audio)\b/gi;
  let match;
  while ((match = tagRe.exec(code))) {
    const raw = readJsxTag(code, match.index);
    const tag = match[1].toLowerCase();
    const attrs = readAttributes(raw);
    const line = lineOf(code, match.index);
    const entry = { tag, line, attrs, problems: [] };

    // Is this tag inside the AccessibleVideo component itself? The component
    // adds controls, aria-label and captions at render time from its props,
    // so the raw JSX tag does not carry them as attributes. Check by file name
    // (the component is the only file that wraps <video> with the accessibility
    // attributes dynamically) and by nearby text.
    const isAccessibleVideoFile = /AccessibleVideo/i.test(name);
    const insideAccessible = isAccessibleVideoFile || /AccessibleVideo/.test(code.slice(Math.max(0, match.index - 300)));

    if (tag === 'video' && !attrs.has('controls') && !/{controls}/.test(raw) && !/controls\s*=/.test(raw)) {
      if (!insideAccessible) {
        entry.problems.push(`line ${line}: <${tag}> has no controls — the viewer must be able to operate the player`);
      }
    }

    if (!attrs.has('aria-label') && !attrs.has('aria-labelledby') && !/aria-label/.test(raw)) {
      if (!insideAccessible) {
        entry.problems.push(`line ${line}: <${tag}> has no aria-label — a screen reader cannot name the player`);
      }
    }

    // In JSX, autoplay={false} is the safe value. autoplay (bare) or
    // autoplay={true} or autoplay="true" are all on.
    if (autoplayIsOn(attrs) && !/autoplay\s*=\s*\{\s*false\s*\}/.test(raw)) {
      entry.problems.push(`line ${line}: <${tag}> has autoplay — remove it or set autoplay={false}`);
    }

    if (tag === 'video' && !/captions/.test(raw) && !/kind\s*=\s*["']captions["']/.test(raw)) {
      // Look for <track kind="captions"> children inside the video. The track
      // may be inside a JSX expression (captions?.map) rather than literally
      // in the opening tag.
      const closingIdx = code.indexOf('</video>', match.index);
      const inner = closingIdx !== -1 ? code.slice(match.index, closingIdx) : '';
      const hasCaptionTrack = /kind\s*=\s*["']captions["']/.test(inner) || /kind\s*=\s*\{?\s*["']captions["']/.test(inner);
      if (!hasCaptionTrack && !insideAccessible) {
        entry.problems.push(`line ${line}: <video> has no caption track — add <track kind="captions"> or pass captions to the component`);
      }
    }

    for (const p of entry.problems) problems.push(p);
    media.push(entry);
  }
  return { file: name, media, problems };
}

function markupFilesIn(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return IS_HTML.test(target) || IS_COMPONENT.test(target) ? [target] : [];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...markupFilesIn(path.join(target, entry.name)));
    } else if (IS_HTML.test(entry.name) || IS_COMPONENT.test(entry.name)) out.push(path.join(target, entry.name));
  }
  return out.sort();
}

export function checkVideoAccessibility(targets = [path.join(ROOT, 'frontend'), path.join(ROOT, 'frontend-dist')]) {
  const files = [];
  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    for (const file of markupFilesIn(target)) if (!files.includes(file)) files.push(file);
  }
  return files.map((file) => (IS_HTML.test(file) ? checkVideoAccessibilityHtml(file) : { ...checkVideoAccessibilitySource(fs.readFileSync(file, 'utf8'), file), file }));
}

function main(argv) {
  const targets = argv.length ? argv.map((t) => path.resolve(process.cwd(), t)) : undefined;
  const results = checkVideoAccessibility(targets);
  if (!results.length) {
    process.stdout.write('no HTML or component files found — nothing to check\n');
    return 0;
  }
  let broken = 0;
  let mediaChecked = 0;
  for (const result of results) {
    const shown = path.relative(process.cwd(), result.file) || result.file;
    mediaChecked += result.media.length;
    if (result.problems.length) {
      broken += 1;
      process.stdout.write(`FAIL ${shown}\n`);
      for (const problem of result.problems) process.stdout.write(`     ${problem}\n`);
    } else if (result.media.length) {
      process.stdout.write(`ok   ${shown} — ${result.media.length} media element${result.media.length === 1 ? '' : 's'}, all accessible\n`);
    }
  }
  process.stdout.write(
    `\n${mediaChecked} media element${mediaChecked === 1 ? '' : 's'} checked; ${results.length - broken}/${results.length} files hold the video-accessibility rule\n`,
  );
  return broken ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
