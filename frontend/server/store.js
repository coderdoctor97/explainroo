// The studio workspace: where uploads, settings and generated explainroo
// projects live. Everything is on disk, so a browser refresh (or a restart)
// finds the same projects again.
//
//   studio-workspace/
//     index.json                 the list of projects
//     projects/<id>/
//       studio.json              the settings the front end edits
//       source/                  what the user uploaded
//         transcript.txt         the words
//         timestamps.json        when each word is spoken
//         voiceover.wav          the audio
//         assets/                images the user supplied for scenes
//       video/                   a normal explainroo project (video.json,
//         script.md, scenes.js, assets/, build/, out/)
//       logs/                    what build and render printed
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT } from '../../src/server.js';

export const WORKSPACE = process.env.STUDIO_WORKSPACE || path.join(ROOT, 'studio-workspace');

// The three upload slots. Files are stored under these fixed names, so the
// user can drop whatever their tool produced.
export const KINDS = {
  transcript: { file: 'transcript.txt', label: 'transcript', exts: ['.txt', '.md', '.text'] },
  timestamps: { file: 'timestamps.json', label: 'timings', exts: ['.json', '.srt', '.vtt'] },
  audio: { file: 'voiceover.wav', label: 'voice-over', exts: ['.wav'] },
};

const ID_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;
const MAX_UPLOAD = 300 * 1024 * 1024;

export class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function defaultStudio(name = '') {
  return {
    name,
    title: '',
    look: {
      style: 'paper',
      layout: 'sync',
      size: '16:9',
      pace: 1,
      captions: 'auto',
      music: true,
      watermark: true,
      transition: 'auto',
      lead: 0.35,
      hold: 0.7,
      end: 1.4,
    },
    plan: {
      strategy: 'sentences',
      wordsPerScene: 36,
      maxSceneSeconds: 12,
      minSceneSeconds: 2.5,
      cuts: [],
      merges: [],
      headings: {},
      keywords: {},
      assets: {},
    },
  };
}

function ensure() {
  fs.mkdirSync(path.join(WORKSPACE, 'projects'), { recursive: true });
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readIndex() {
  ensure();
  const idx = readJson(path.join(WORKSPACE, 'index.json'), null);
  return idx && Array.isArray(idx.projects) ? idx : { last: null, projects: [] };
}

export function writeIndex(idx) {
  ensure();
  atomicJson(path.join(WORKSPACE, 'index.json'), idx);
}

export function listProjects() {
  const idx = readIndex();
  return idx.projects
    .map((p) => {
      const dir = projectDir(p.id);
      const studio = readStudio(p.id);
      const built = fs.existsSync(path.join(dir, 'video', 'video.json'));
      const out = path.join(dir, 'video', 'out', 'video.mp4');
      return {
        ...p,
        name: studio.name || p.name,
        built,
        rendered: fs.existsSync(out),
        renderedAt: fs.existsSync(out) ? fs.statSync(out).mtimeMs : null,
        hasSources: ['transcript', 'timestamps', 'audio'].filter((k) => fs.existsSync(sourcePath(p.id, k))).length,
      };
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function slug(name) {
  const s = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  return s || 'video';
}

export function createProject(name) {
  ensure();
  const id = `${slug(name)}-${crypto.randomBytes(3).toString('hex')}`;
  const dir = projectDir(id);
  for (const d of ['source/assets', 'video/assets', 'logs']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  writeStudio(id, { ...defaultStudio(name || ''), name: name || 'Untitled video' });
  const idx = readIndex();
  idx.projects.push({ id, name: name || 'Untitled video', createdAt: Date.now(), updatedAt: Date.now() });
  idx.last = id;
  writeIndex(idx);
  return id;
}

export function deleteProject(id) {
  const idx = readIndex();
  idx.projects = idx.projects.filter((p) => p.id !== id);
  if (idx.last === id) idx.last = idx.projects[0]?.id ?? null;
  writeIndex(idx);
  fs.rmSync(projectDir(id), { recursive: true, force: true });
}

export function projectDir(id) {
  if (!ID_RE.test(String(id))) throw new StudioError('bad project id', 400);
  return path.join(WORKSPACE, 'projects', id);
}

export function projectPaths(id) {
  const dir = projectDir(id);
  return {
    id,
    dir,
    studio: path.join(dir, 'studio.json'),
    source: path.join(dir, 'source'),
    sourceAssets: path.join(dir, 'source/assets'),
    video: path.join(dir, 'video'),
    assets: path.join(dir, 'video/assets'),
    build: path.join(dir, 'video/build'),
    voiceDir: path.join(dir, 'video/build/voice'),
    out: path.join(dir, 'video/out'),
    logs: path.join(dir, 'logs'),
  };
}

export function projectExists(id) {
  return fs.existsSync(projectDir(id));
}

export function readStudio(id) {
  const raw = readJson(projectPaths(id).studio, null);
  if (!raw) return defaultStudio();
  // studio.json is written by hand-editable code and by older versions of the
  // studio, so fill in anything a project from before is missing.
  const base = defaultStudio(raw.name || '');
  const studio = { ...base, ...raw };
  studio.look = { ...base.look, ...(raw.look || {}) };
  studio.plan = { ...base.plan, ...(raw.plan || {}) };
  for (const key of ['cuts', 'merges']) {
    if (!Array.isArray(studio.plan[key])) studio.plan[key] = [];
  }
  for (const key of ['headings', 'keywords', 'assets']) {
    if (!studio.plan[key] || typeof studio.plan[key] !== 'object') studio.plan[key] = {};
  }
  return studio;
}

// Writes studio.json. Objects one level deep (look, plan) merge key by key, so
// the front end can send a small patch.
export function writeStudio(id, patch) {
  const cur = fs.existsSync(projectPaths(id).studio) ? readStudio(id) : defaultStudio();
  const next = { ...cur, ...patch };
  for (const key of ['look', 'plan']) {
    if (!patch[key]) continue;
    next[key] = { ...cur[key], ...patch[key] };
    // Per-scene overrides (headings, keywords, images) are named by scene id:
    // merge them so a patch about one scene never changes another.
    for (const map of ['headings', 'keywords', 'assets']) {
      if (!patch[key][map]) continue;
      const merged = { ...(cur[key]?.[map] || {}) };
      for (const [scene, value] of Object.entries(patch[key][map])) {
        // null is how the page says "forget my override for this scene" and
        // lets the automatic heading, words or image come back.
        if (value === null || value === undefined) delete merged[scene];
        else merged[scene] = value;
      }
      next[key][map] = merged;
    }
  }
  next.updatedAt = Date.now();
  atomicJson(projectPaths(id).studio, next);
  const idx = readIndex();
  const entry = idx.projects.find((p) => p.id === id);
  if (entry) {
    entry.updatedAt = Date.now();
    if (patch.name) entry.name = patch.name;
    if (patch.title) entry.name = patch.title;
  }
  idx.last = id;
  writeIndex(idx);
  return next;
}

export function sourcePath(id, kind) {
  const k = KINDS[kind];
  if (!k) throw new StudioError(`unknown upload slot "${kind}"`);
  return path.join(projectPaths(id).source, k.file);
}

export function writeSource(id, kind, buf) {
  const k = KINDS[kind];
  if (!k) throw new StudioError(`unknown upload slot "${kind}"`);
  if (buf.length > MAX_UPLOAD) throw new StudioError(`${k.label} is larger than 300 MB`, 413);
  const file = sourcePath(id, kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  touch(id);
  return { kind, bytes: buf.length, file };
}

export function removeSource(id, kind) {
  fs.rmSync(sourcePath(id, kind), { force: true });
  touch(id);
}

// An asset for a scene: safe file name, image only, in source/assets/.
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.(png|jpe?g|webp|gif|svg)$/i;

export function writeAsset(id, name, buf) {
  const clean = path.basename(String(name || ''));
  if (!ASSET_RE.test(clean)) throw new StudioError('an asset must be an image (png, jpg, webp, gif, svg) with a simple name, like scene-01.png');
  if (buf.length > MAX_UPLOAD) throw new StudioError('that image is larger than 300 MB', 413);
  const file = path.join(projectPaths(id).sourceAssets, clean);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  touch(id);
  return { name: clean, bytes: buf.length };
}

export function sourceAssets(id) {
  const dir = projectPaths(id).sourceAssets;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => ASSET_RE.test(f)).sort();
}

export function touch(id) {
  const idx = readIndex();
  const entry = idx.projects.find((p) => p.id === id);
  if (entry) {
    entry.updatedAt = Date.now();
    idx.last = id;
    writeIndex(idx);
  }
}

// What has been uploaded, without parsing it.
export function sourceInfo(id) {
  const out = {};
  for (const kind of Object.keys(KINDS)) {
    const file = sourcePath(id, kind);
    try {
      const st = fs.statSync(file);
      out[kind] = { ok: true, bytes: st.size, mtime: st.mtimeMs, name: KINDS[kind].file };
    } catch {
      out[kind] = { ok: false, bytes: 0, mtime: null, name: KINDS[kind].file };
    }
  }
  out.assets = sourceAssets(id).map((name) => {
    const st = fs.statSync(path.join(projectPaths(id).sourceAssets, name));
    return { name, bytes: st.size };
  });
  return out;
}

export function logPath(id) {
  const dir = projectPaths(id).logs;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
