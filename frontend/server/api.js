// The studio's local API. It runs inside the dev server (see scripts/dev.mjs)
// and only listens on 127.0.0.1, so it is reached through the Vite proxy at
// /api/… and never directly from another machine.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../src/server.js';
import { FORMATS, TRANSITIONS, MUSIC_STYLES, loadProject } from '../../src/project.js';
import { analyze, buildProject, doctor, status } from './build.js';
import { createProject, deleteProject, listProjects, projectExists, projectPaths, readIndex, readStudio, removeSource, sourcePath, StudioError, writeAsset, writeSource, writeStudio } from './store.js';
import { getJob, jobFor, publicJob, startJob } from './jobs.js';
import { styleList, LAYOUTS } from './presets.js';
import { iconFor } from './plan.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

async function readBody(req, limit = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new StudioError('that request is too large', 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw new StudioError('the request body is not JSON', 400);
  }
}

// Files inside one project, for the page: stills, the rendered MP4, the
// generated script.md, the scene audio. Only relative paths inside the
// project folder, never a dotfile.
function projectFile(id, rel) {
  const base = projectPaths(id).dir;
  const parts = String(rel || '').split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p.startsWith('.'))) return null;
  const file = path.resolve(base, parts.join(path.sep));
  if (file !== base && !file.startsWith(base + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function sendFile(req, res, file) {
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const st = fs.statSync(file);
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-store',
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

export function startStudioApi({ port = 4318, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname.replace(/\/+$/, '') || '/api';
    const parts = route.split('/').filter(Boolean); // ['api', …]
    const method = req.method || 'GET';
    try {
      if (parts[0] !== 'api') return json(res, 404, { error: `not found: ${route}` });

      // /api/health, /api/styles, /api/doctor, /api/projects …
      if (parts[1] === 'health') return json(res, 200, { ok: true, node: process.versions.node, root: ROOT });
      if (parts[1] === 'doctor') return json(res, 200, doctor());
      if (parts[1] === 'styles') {
        return json(res, 200, { styles: styleList(), layouts: LAYOUTS, sizes: Object.keys(FORMATS), transitions: TRANSITIONS, music: MUSIC_STYLES });
      }
      // The video fonts, so the studio can show a look in its own type.
      if (parts[1] === 'fonts' && parts.length === 3) {
        const name = path.basename(parts[2]);
        if (!/^[A-Za-z0-9._-]+\.(woff2?|ttf|otf)$/.test(name)) return json(res, 400, { error: 'bad font name' });
        const file = path.join(ROOT, 'fonts', name);
        if (!fs.existsSync(file)) return json(res, 404, { error: 'no such font' });
        return sendFile(req, res, file);
      }

      // One icon's paths, in the 24x24 box Lucide uses, for the chip editor.
      if (parts[1] === 'icons' && parts.length === 3) {
        const icons = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine', 'icons', 'lucide.json'), 'utf8'));
        const name = path.basename(parts[2].replace(/\.json$/, ''));
        const paths = icons.icons[name] || (icons.aliases && icons.aliases[name] ? icons.icons[icons.aliases[name]] : null);
        if (!paths) return json(res, 404, { error: `no icon "${name}"` });
        return json(res, 200, { name, paths });
      }

      if (parts[1] === 'icons') {
        const q = url.searchParams.get('q') || '';
        const names = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'engine', 'icons', 'lucide.json'), 'utf8')).icons);
        const scored = names
          .map((n) => ({ name: n, score: n === q.toLowerCase() ? 100 : n.includes(q.toLowerCase()) ? 30 - n.length / 40 : 0 }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, 24)
          .map((x) => x.name);
        const best = iconFor(q);
        return json(res, 200, { query: q, matches: best && !scored.includes(best) ? [best, ...scored] : scored });
      }

      if (parts[1] === 'jobs') {
        const job = getJob(parts[2]);
        if (!job) return json(res, 404, { error: 'no such job' });
        return json(res, 200, publicJob(job));
      }

      if (parts[1] !== 'projects') return json(res, 404, { error: `not found: ${route}` });

      if (parts.length === 2) {
        if (method === 'GET') return json(res, 200, { projects: listProjects(), last: readIndex().last });
        if (method === 'POST') {
          const body = await readJson(req);
          const id = createProject(body.name || 'Untitled video');
          return json(res, 201, { id, project: listProjects().find((p) => p.id === id) });
        }
        return json(res, 405, { error: `${method} is not allowed here` });
      }

      const id = parts[2];
      if (!projectExists(id)) return json(res, 404, { error: `no project "${id}"` });

      if (parts.length === 3) {
        if (method === 'GET') {
          const studio = readStudio(id);
          return json(res, 200, {
            id,
            studio,
            status: status(id),
            project: listProjects().find((p) => p.id === id) || null,
            styles: styleList(),
            layouts: LAYOUTS,
            sizes: Object.keys(FORMATS),
            transitions: TRANSITIONS,
          });
        }
        if (method === 'PATCH') {
          const body = await readJson(req);
          return json(res, 200, { studio: writeStudio(id, body) });
        }
        if (method === 'DELETE') {
          deleteProject(id);
          return json(res, 200, { ok: true });
        }
        return json(res, 405, { error: `${method} is not allowed here` });
      }

      const what = parts[3];

      if (what === 'file' && method === 'GET') {
        const file = projectFile(id, url.searchParams.get('path'));
        if (!file) return json(res, 404, { error: 'not found' });
        return sendFile(req, res, file);
      }

      if (what === 'audio' && method === 'GET') {
        const file = sourcePath(id, 'audio');
        if (!fs.existsSync(file)) return json(res, 404, { error: 'no voice-over uploaded' });
        return sendFile(req, res, file);
      }

      if (what === 'plan' && method === 'GET') {
        const a = analyze(id);
        return json(res, 200, { scenes: a.plan.scenes, stats: a.plan.stats, words: a.plan.words, warnings: a.warnings });
      }

      if (what === 'source' && method === 'PUT') {
        const kind = url.searchParams.get('kind');
        const buf = await readBody(req, 300 * 1024 * 1024);
        const info = writeSource(id, kind, buf);
        return json(res, 200, { ok: true, ...info, sources: status(id).sources });
      }

      if (what === 'source' && method === 'DELETE') {
        removeSource(id, url.searchParams.get('kind'));
        return json(res, 200, { ok: true, sources: status(id).sources });
      }

      if (what === 'asset' && method === 'PUT') {
        const buf = await readBody(req, 300 * 1024 * 1024);
        const info = writeAsset(id, url.searchParams.get('name'), buf);
        return json(res, 200, { ok: true, ...info });
      }

      if (what === 'analyze' && method === 'POST') {
        const job = startJob({
          projectId: id,
          kind: 'analyze',
          label: 'Read the sources',
          run: (log) => {
            const a = analyze(id);
            log(`${a.plan.stats.transcriptWords} words, ${a.plan.scenes.length} scenes, ${a.plan.stats.duration.toFixed(1)}s`);
            for (const w of a.warnings) log(`warning: ${w}`);
            return { scenes: a.plan.scenes, stats: a.plan.stats, words: a.plan.words, warnings: a.warnings };
          },
        });
        return json(res, 202, publicJob(job));
      }

      if (what === 'build' && method === 'POST') {
        const job = startJob({
          projectId: id,
          kind: 'build',
          label: 'Build project',
          run: (log, report) => buildProject(id, log, report),
        });
        return json(res, 202, publicJob(job));
      }

      if (what === 'render' && method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const job = startJob({
          projectId: id,
          kind: 'render',
          label: body.draft ? 'Render draft' : 'Render video',
          run: async (log, report) => {
            buildProject(id, log, report);
            const project = loadVideoProject(id);
            const { render } = await import('../../src/render.js');
            const r = await render(project, { log, onProgress: report, draft: !!body.draft, workers: body.workers, from: body.from, to: body.to });
            const rel = path.relative(project.dir, r.out).split(path.sep).join('/');
            return { ...r, out: rel, url: `/api/projects/${id}/file?path=${encodeURIComponent(rel)}` };
          },
        });
        return json(res, 202, publicJob(job));
      }

      if (what === 'check' && method === 'POST') {
        const job = startJob({
          projectId: id,
          kind: 'check',
          label: 'Check the video',
          run: async (log, report) => {
            buildProject(id, log, report);
            const project = loadVideoProject(id);
            const { check } = await import('../../src/qa.js');
            report({ phase: 'check', done: 0, total: 1 });
            const r = await check(project, { log });
            report({ phase: 'check', done: 1, total: 1 });
            log(`${r.issues.length} finding(s) in ${r.scenes} scenes`);
            return r;
          },
        });
        return json(res, 202, publicJob(job));
      }

      if (what === 'still' && method === 'POST') {
        const body = await readJson(req).catch(() => ({}));
        const specs = Array.isArray(body.specs) && body.specs.length ? body.specs.map(String) : [];
        const job = startJob({
          projectId: id,
          kind: 'still',
          label: 'Save stills',
          run: async (log, report) => {
            buildProject(id, log, report);
            const project = loadVideoProject(id);
            const { stills } = await import('../../src/qa.js');
            report({ phase: 'stills', done: 0, total: 1 });
            const list = await stills(project, specs, { log });
            report({ phase: 'stills', done: 1, total: 1 });
            const shots = list.map((x) => ({ ...x, url: `/api/projects/${id}/file?path=${encodeURIComponent(path.relative(project.dir, x.file).split(path.sep).join('/'))}` }));
            log(`${shots.length} still(s)`);
            return { shots };
          },
        });
        return json(res, 202, publicJob(job));
      }

      if (what === 'job' && method === 'GET') {
        return json(res, 200, publicJob(jobFor(id)));
      }

      return json(res, 404, { error: `not found: ${route}` });
    } catch (e) {
      const code = e instanceof StudioError ? e.status : 500;
      if (code >= 500) process.stderr.write(`studio api: ${e && e.stack ? e.stack : e}\n`);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }));
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://${host}:${actual}`,
        port: actual,
        close: () =>
          new Promise((r) => {
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}

// The project object the engine's own render, check and still commands use.
function loadVideoProject(id) {
  const dir = projectPaths(id).video;
  if (!fs.existsSync(path.join(dir, 'video.json'))) throw new StudioError('build the project first');
  return loadProject(dir);
}
