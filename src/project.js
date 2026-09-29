// Loads and validates a video project folder:
//   video.json   settings
//   script.md    narration, one "## scene-id" per scene
//   scenes.js    one drawing function per scene id
//   assets/      optional images (logos, screenshots)
import fs from 'node:fs';
import path from 'node:path';
import { parseScript } from './script.js';
import { VOICES } from './models.js';

export const THEMES = ['paper', 'clean', 'chalk', 'blueprint', 'midnight'];
export const MUSIC_STYLES = ['warm', 'upbeat', 'calm', 'tech', 'playful'];
export const TRANSITIONS = ['auto', 'fade', 'slide', 'wipe', 'zoom', 'brush', 'cut'];
export const THEME_MUSIC = { paper: 'warm', clean: 'upbeat', chalk: 'calm', blueprint: 'tech', midnight: 'tech' };
const ASPECTS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };

// Named formats for the usual places a video goes. Vertical apps draw their
// own buttons, names and captions over the video; `safe` is the part of the
// frame they leave free, as fractions of the frame. The numbers follow the
// platforms' safe-zone templates as of 2026 and move a little with app updates.
export const FORMATS = {
  youtube: { size: [1920, 1080], use: 'YouTube and other wide players' },
  shorts: { size: [1080, 1920], use: 'YouTube Shorts', safe: { top: 0.15, right: 0.12, bottom: 0.35, left: 0.06 } },
  tiktok: { size: [1080, 1920], use: 'TikTok', safe: { top: 0.125, right: 0.2, bottom: 0.34, left: 0.11 } },
  reels: { size: [1080, 1920], use: 'Instagram and Facebook Reels', safe: { top: 0.14, right: 0.11, bottom: 0.35, left: 0.06 } },
  vertical: { size: [1080, 1920], use: 'one file for Shorts, TikTok and Reels', safe: { top: 0.15, right: 0.2, bottom: 0.35, left: 0.11 } },
  instagram: { size: [1080, 1350], use: 'Instagram and Facebook feed posts' },
  linkedin: { size: [1080, 1350], use: 'the LinkedIn feed' },
  square: { size: [1080, 1080], use: 'square posts on X, LinkedIn and Facebook' },
};

export const DEFAULTS = {
  title: null,
  theme: 'paper',
  size: '16:9',
  fps: 30,
  voice: 'af_heart',
  speed: 0.9,
  pace: 1,
  music: true,
  sfx: true,
  captions: 'auto',
  transition: 'auto',
  lead: 0.35,
  hold: 0.7,
  end: 1.4,
  sentenceGap: 0.3,
  paragraphGap: 0.55,
  loudness: -14,
  seed: 1,
  boil: 0,
  watermark: 'explainroo.com',
  images: null,
};

export class ProjectError extends Error {}

function fail(msg) {
  throw new ProjectError(msg);
}

export function resolveSize(size) {
  if (FORMATS[size]) return { width: FORMATS[size].size[0], height: FORMATS[size].size[1], safe: FORMATS[size].safe || null };
  if (ASPECTS[size]) return { width: ASPECTS[size][0], height: ASPECTS[size][1] };
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(String(size));
  if (!m) fail(`size must be a format (${Object.keys(FORMATS).join(', ')}), a ratio (${Object.keys(ASPECTS).join(', ')}) or WIDTHxHEIGHT, not "${size}"`);
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (width % 2 || height % 2) fail('size width and height must be even numbers (H.264 needs that)');
  return { width, height };
}

export function normalizeConfig(raw) {
  const cfg = { ...DEFAULTS, ...raw };
  const unknown = Object.keys(raw).filter((k) => !(k in DEFAULTS) && !k.startsWith('_'));
  if (unknown.length) fail(`video.json has unknown setting(s): ${unknown.join(', ')}. Known: ${Object.keys(DEFAULTS).join(', ')}`);
  if (!THEMES.includes(cfg.theme)) fail(`theme must be one of ${THEMES.join(', ')}, not "${cfg.theme}"`);
  if (!VOICES[cfg.voice]) fail(`voice "${cfg.voice}" does not exist. Run "explainroo voices" for the list.`);
  if (!(cfg.speed >= 0.6 && cfg.speed <= 1.6)) fail('speed must be between 0.6 and 1.6');
  if (!(cfg.pace >= 0.7 && cfg.pace <= 1.6)) fail('pace must be between 0.7 and 1.6 (1 is normal, 1.3 is 30% faster)');
  if (cfg.speed * cfg.pace > 1.8) fail(`speed ${cfg.speed} times pace ${cfg.pace} makes the voice too fast; keep speed x pace at 1.8 or below`);
  if (![24, 25, 30, 50, 60].includes(cfg.fps)) fail('fps must be 24, 25, 30, 50 or 60');
  if (!TRANSITIONS.includes(cfg.transition)) fail(`transition must be one of ${TRANSITIONS.join(', ')}`);
  if (![true, false, 'minimal'].includes(cfg.sfx)) fail('sfx must be true, false or "minimal"');
  if (![true, false, 'auto'].includes(cfg.captions)) fail('captions must be true, false or "auto"');
  for (const k of ['lead', 'hold', 'end', 'sentenceGap', 'paragraphGap']) {
    if (!(typeof cfg[k] === 'number' && cfg[k] >= 0 && cfg[k] <= 10)) fail(`${k} must be a number of seconds between 0 and 10`);
  }
  if (!(cfg.loudness <= -8 && cfg.loudness >= -30)) fail('loudness must be between -30 and -8 LUFS');
  if (!(cfg.boil >= 0 && cfg.boil <= 12)) fail('boil must be between 0 (off) and 12 redraws per second');
  if (cfg.watermark !== false && !(typeof cfg.watermark === 'string' && cfg.watermark.trim() && cfg.watermark.length <= 40)) {
    fail('watermark must be false or a short text of up to 40 characters, like "example.com"');
  }
  if (cfg.images !== null) {
    if (typeof cfg.images !== 'object' || Array.isArray(cfg.images)) fail('images must be an object like { "model": "best", "style": "..." }');
    const extra = Object.keys(cfg.images).filter((k) => !['model', 'style'].includes(k));
    if (extra.length) fail(`images has unknown setting(s): ${extra.join(', ')}. Known: model, style`);
  }

  let music = cfg.music;
  if (music === true) music = { style: THEME_MUSIC[cfg.theme] };
  else if (typeof music === 'string') music = { style: music };
  if (music) {
    // A faster pace plays the music a little faster too.
    music = { volume: 0.5, seed: cfg.seed, tempo: Math.sqrt(cfg.pace), ...music };
    if (!MUSIC_STYLES.includes(music.style)) fail(`music style must be one of ${MUSIC_STYLES.join(', ')}, not "${music.style}"`);
    if (!(music.volume >= 0 && music.volume <= 1)) fail('music.volume must be between 0 and 1');
  }
  cfg.music = music || null;

  const { width, height, safe } = resolveSize(cfg.size);
  cfg.width = width;
  cfg.height = height;
  cfg.format = FORMATS[cfg.size] ? cfg.size : null;
  cfg.safe = safe || null;
  if (cfg.captions === 'auto') cfg.captions = height >= width;
  return cfg;
}

export function findProjectDir(arg) {
  const dir = path.resolve(arg || '.');
  if (fs.existsSync(path.join(dir, 'video.json'))) return dir;
  if (arg) fail(`${dir} is not a video project (no video.json). Create one with "explainroo init ${arg}".`);
  fail('no video.json here. Pass the project folder, for example "explainroo render videos/my-video".');
}

export function loadProject(arg) {
  const dir = findProjectDir(arg);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  } catch (e) {
    fail(`video.json is not valid JSON: ${e.message}`);
  }
  const config = normalizeConfig(raw);
  const scriptPath = path.join(dir, 'script.md');
  if (!fs.existsSync(scriptPath)) fail(`${scriptPath} is missing`);
  const script = parseScript(fs.readFileSync(scriptPath, 'utf8'));
  if (!config.title) config.title = script.title || path.basename(dir);
  const scenesPath = path.join(dir, 'scenes.js');
  if (!fs.existsSync(scenesPath)) fail(`${scenesPath} is missing`);
  const build = path.join(dir, 'build');
  const out = path.join(dir, 'out');
  return { dir, config, script, paths: { build, out, voice: path.join(build, 'voice'), scenes: scenesPath, script: scriptPath } };
}

export function listAssets(dir) {
  const root = path.join(dir, 'assets');
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}
