// Writes the files an explainroo project needs from a scene plan:
//   video.json   the look and the settings
//   script.md    the narration (written by plan.js)
//   scenes.js    what each scene draws, timed on the real words
// The engine cannot tell these apart from files a coding agent wrote by hand.
import fs from 'node:fs';
import path from 'node:path';
import { normalizeConfig } from '../../src/project.js';
import { styleFor } from './presets.js';

const q = (s) => JSON.stringify(String(s));
const r = (n) => Math.round(n * 1000) / 1000;
const px = (expr) => `Math.round(${expr})`;

export function videoConfig({ title, look, styleId }) {
  const look_ = look || {};
  const preset = styleFor(styleId || look_.style);
  const cfg = {
    title: title || 'Untitled video',
    theme: preset.theme,
    size: look_.size || '16:9',
    fps: 30,
    voice: 'af_heart',
    pace: num(look_.pace, 1, 0.7, 1.6),
    music: look_.music === false ? false : preset.music,
    sfx: true,
    captions: look_.captions === undefined ? 'auto' : look_.captions,
    transition: look_.transition && look_.transition !== 'auto' ? look_.transition : preset.transition,
    lead: num(look_.lead, 0.35, 0, 10),
    hold: num(look_.hold, 0.7, 0, 10),
    end: num(look_.end, 1.4, 0, 10),
    watermark: look_.watermark === false ? false : 'explainroo.com',
    _external: true,
    _studio: {
      generator: 'explainroo-studio',
      style: preset.id,
      layout: look_.layout || 'sync',
      built: new Date().toISOString(),
    },
  };
  // The engine's own validation runs on it, but only the raw settings are
  // written: width, height and safe are computed by the engine on load and
  // would be refused as unknown keys in the file.
  normalizeConfig(cfg);
  return cfg;
}

function num(v, fallback, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

export function writeVideoJson(projectDir, config) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'video.json'), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

// ---------- scenes.js ----------

/**
 * plan:   from planFromSources
 * voice:  { [sceneId]: { offset, duration } } from writeVoiceCache
 * look:   { layout, lead, style }
 * assets: image names that really exist in the project's assets/ folder
 */
export function scenesSource({ plan, voice, look, title, assets = [] }) {
  const preset = styleFor(look?.style);
  const layout = ['sync', 'cards', 'poster'].includes(look?.layout) ? look.layout : 'sync';
  const head = [
    `// ${title || 'Untitled video'} — drawn by explainroo studio.`,
    `// Look: ${preset.name} (${preset.theme}) · layout: ${layout} · scene changes: ${preset.transition} · music: ${preset.music}`,
    '// Every element appears on the word it belongs to, using the timings you',
    '// uploaded. Pressing "Build project" writes this file again, so copy it',
    '// somewhere else first if you want to keep hand-made changes.',
    '',
    'export default {',
  ];
  const body = [];
  plan.scenes.forEach((scene) => {
    const times = sceneTimes(scene, voice[scene.id], num(look?.lead, 0.35, 0, 10));
    const lines = sceneLines(scene, { layout, times, total: plan.scenes.length, assets });
    body.push(`  // ${scene.heading}`, `  ${scene.id}(s) {`, ...lines.map((l) => `    ${l}`), '  },');
  });
  return [...head, ...body, '};', ''].join('\n');
}

export function writeScenes(projectDir, source) {
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'scenes.js'), source);
  return source;
}

// When a word is said, in scene seconds: the engine adds `lead` to the
// imported word times, and every scene's audio starts at its own offset.
function sceneTimes(scene, info, lead) {
  const offset = info?.offset ?? Math.max(0, (scene.words[0]?.start ?? 0) - 0.12);
  const at = (abs) => Math.max(0, r(lead + (abs - offset)));
  const words = scene.words.map((w) => ({ ...w, at: at(w.start) }));
  const wordAt = (needle) => {
    const n = String(needle).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const hit = words.find((w) => String(w.display).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === n);
    return hit ? hit.at : null;
  };
  return {
    offset,
    first: words.length ? words[0].at : 0,
    last: words.length ? words[words.length - 1].at : 0,
    wordAt,
  };
}

function sceneLines(scene, ctx) {
  const { layout, times, total, assets } = ctx;
  const hasAsset = !!scene.asset && assets.includes(scene.asset);
  const missingAsset = !!scene.asset && !hasAsset;
  const out = [];
  const pad = (n) => String(n).padStart(2, '0');

  // Where you are. Every scene starts the same way, so the video reads as one piece.
  out.push(`s.text(${q(`${pad(scene.index + 1)} / ${pad(total)}`)}, { x: s.safe.x, y: s.safe.y, align: 'left', valign: 'top', size: ${px('s.safe.w * 0.024')}, font: 'mono', color: 'muted', at: 0 });`);

  if (layout === 'poster') {
    out.push(`s.text(${q(scene.heading)}, { id: 'head', x: s.cx, y: s.safe.y + s.safe.h * 0.4, align: 'center', size: ${px('s.safe.w * 0.07')}, font: 'display', maxWidth: ${px('s.safe.w * 0.86')}, at: ${r(Math.min(times.first, 0.4))} });`);
    if (scene.number) {
      out.push(`s.number(${scene.number.value}, { prefix: ${q(scene.number.prefix)}, suffix: ${q(scene.number.suffix)}, x: s.cx, y: s.safe.y + s.safe.h * 0.68, size: ${px('s.safe.w * 0.055')}, at: ${r(times.first + 0.25)}, enter: 'fade' });`);
    } else if (scene.chips[0]) {
      out.push(chipLine(scene.chips[0], ctx, { x: 's.cx', y: 's.safe.y + s.safe.h * 0.72', size: 's.safe.w * 0.038', index: 0 }));
    }
    return out;
  }

  // The heading of the scene, with a short accent rule under it. A scene with
  // only one sentence has nothing left to say under the heading, so there the
  // heading itself appears word by word with the voice.
  const body = bodyAfterHeading(scene.text, scene.heading);
  const bodyWords = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const headEnter = layout === 'sync' && bodyWords < 4 ? ", enter: 'sync'" : '';
  const headAt = layout === 'sync' && bodyWords < 4 ? times.first : r(Math.min(times.first, 0.4));
  const headY = 's.safe.y + s.safe.h * 0.085';
  const ruleY = `${headY} + s.safe.w * 0.048 * 1.55`;
  out.push(`s.text(${q(scene.heading)}, { id: 'head', x: s.safe.x, y: ${headY}, align: 'left', valign: 'top', size: ${px('s.safe.w * 0.048')}, font: 'display', maxWidth: ${px('s.safe.w * 0.78')}, at: ${headAt}${headEnter} });`);
  out.push(`s.line([[s.safe.x, ${ruleY}], [s.safe.x + ${px('s.safe.w * 0.09')}, ${ruleY}]], { color: 'accent', width: 6, at: ${r(Math.min(times.first, 0.4) + 0.25)} });`);

  if (hasAsset) {
    out.push(`s.image('assets/${scene.asset}', { id: 'art', x: s.safe.x + s.safe.w * 0.75, y: s.safe.y + s.safe.h * 0.58, w: ${px('s.safe.w * 0.42')}, h: ${px('s.safe.h * 0.56')}, fit: 'contain', frame: 'card', at: ${times.first} });`);
  } else if (missingAsset) {
    out.push(`s.box(${q(`image needed: ${scene.asset}`)}, { id: 'art', x: s.safe.x + s.safe.w * 0.75, y: s.safe.y + s.safe.h * 0.58, w: ${px('s.safe.w * 0.4')}, h: ${px('s.safe.h * 0.5')}, dashed: true, color: 'muted', size: ${px('s.safe.w * 0.022')}, at: ${times.first}, enter: 'fade' });`);
    out.push(`s.note('add this file, then build again', { x: s.safe.x + s.safe.w * 0.75, y: s.safe.y + s.safe.h * 0.86, size: ${px('s.safe.w * 0.018')}, at: ${r(times.first + 0.3)}, enter: 'fade' });`);
  }

  if (layout === 'cards') {
    if (scene.number) {
      out.push(`s.number(${scene.number.value}, { prefix: ${q(scene.number.prefix)}, suffix: ${q(scene.number.suffix)}, x: ${hasAsset ? 's.safe.x + s.safe.w * 0.24' : 's.cx'}, y: s.safe.y + s.safe.h * 0.38, size: ${px('s.safe.w * 0.05')}, at: ${r(times.first + 0.25)}, enter: 'fade' });`);
    }
    if (!scene.chips.length && body) {
      out.push(syncText(body, ctx, hasAsset));
      return out;
    }
    scene.chips.slice(0, hasAsset ? 2 : 3).forEach((chip, i) => {
      out.push(
        chipLine(chip, ctx, {
          x: hasAsset ? `s.safe.x + s.safe.w * (0.14 + ${i} * 0.22)` : 's.cx',
          y: hasAsset ? 's.safe.y + s.safe.h * 0.9' : `s.safe.y + s.safe.h * (0.56 + ${i} * 0.14)`,
          size: hasAsset ? 's.safe.w * 0.026' : 's.safe.w * 0.036',
          index: i,
        }),
      );
    });
    return out;
  }

  // sync: the narration appears word by word as the voice says it. This is the
  // layout that needs nothing but your three files, and it moves the whole time.
  if (body) out.push(syncText(body, ctx, hasAsset));
  scene.chips.slice(0, hasAsset ? 2 : 3).forEach((chip, i) => {
    out.push(
      chipLine(chip, ctx, {
        x: hasAsset
          ? `s.safe.x + s.safe.w * (0.12 + ${i} * 0.2)`
          : `s.safe.x + s.safe.w * (0.2 + ${i} * 0.3)`,
        y: 's.safe.y + s.safe.h * 0.9',
        size: 's.safe.w * 0.026',
        index: i,
      }),
    );
  });
  return out;
}

function syncText(text, { times }, hasAsset) {
  return `s.text(${q(text)}, { id: 'narration', x: ${
    hasAsset ? 's.safe.x + s.safe.w * 0.25' : 's.cx'
  }, y: s.safe.y + s.safe.h * 0.58, align: 'center', size: ${px(
    hasAsset ? 's.safe.w * 0.03' : 's.safe.w * 0.038',
  )}, maxWidth: ${px(hasAsset ? 's.safe.w * 0.42' : 's.safe.w * 0.84')}, lineHeight: 1.3, enter: 'sync', at: ${times.first}, mark: 'accent' });`;
}

function chipLine(chip, { times }, { x, y, size, index }) {
  const at = times.wordAt(chip.word);
  const when = at === null ? r(times.first + 0.5 + index * 0.08) : at;
  const icon = chip.icon ? `, icon: ${q(chip.icon)}` : '';
  return `s.box(${q(chip.word)}, { id: ${q(`chip-${index}`)}, x: ${x}, y: ${y}, size: ${px(size)}${icon}, color: 'accent', at: ${when}, enter: 'pop' });`;
}

// What is left of a scene's narration when its heading already says the first
// sentence. Keeping both would put the same words on screen twice.
export function bodyAfterHeading(text, heading) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?…]+$/, '').trim();
  const t = String(text).trim();
  const want = norm(heading);
  if (!want) return t;
  if (norm(t) === want) return '';
  if (!norm(t).startsWith(want)) return t;
  // Walk the words until the heading is said, then take the rest.
  let said = '';
  for (const m of t.matchAll(/\S+/g)) {
    said = said ? `${said} ${m[0].toLowerCase()}` : m[0].toLowerCase();
    if (said.length >= want.length) {
      const rest = t.slice(m.index + m[0].length).replace(/^[\s.,;:!?…]+/, '').trim();
      return rest.split(/\s+/).filter(Boolean).length >= 4 ? rest : '';
    }
  }
  return '';
}

export function sceneSummary(plan, voice) {
  return plan.scenes.map((s) => ({
    id: s.id,
    heading: s.heading,
    seconds: s.seconds,
    words: s.words.length,
    chips: s.chips.map((c) => c.word),
    hasVoice: !!voice[s.id],
  }));
}
