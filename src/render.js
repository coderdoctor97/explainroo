// Renders the finished MP4: soundtrack, frames in parallel pages, encode, mux.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { prepare, withEngine } from './pipeline.js';
import { frameEncoder, ffmpeg, normalizeLoudness } from './ffmpeg.js';

// Mixes narration + music + effects on a worker thread. A long mix asks a
// browser page for ~3GB of peak memory, which crashed headless Chrome on
// 7+ minute videos, and doing it on the main thread froze the studio server.
export function mixSoundtrack({ project, timeline, sfx, out, onProgress = null }) {
  return new Promise((resolve, reject) => {
    const voiceFiles = timeline.scenes
      .filter((sc) => sc.voice && sc.voice.url)
      .map((sc) => ({ path: path.join(project.dir, sc.voice.url), start: sc.voice.start }));
    const worker = new Worker(new URL('./soundtrack-worker.js', import.meta.url), {
      workerData: {
        duration: timeline.duration,
        sampleRate: 48000,
        voiceFiles,
        voiceSpans: timeline.voiceSpans,
        music: project.config.music,
        sfx,
        scenes: timeline.scenes.map((sc) => ({ start: sc.start, dur: sc.dur })),
        out,
      },
    });
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      fn(v);
    };
    worker.on('message', (m) => {
      if (m.type === 'progress') {
        try {
          if (onProgress) onProgress(m.p);
        } catch {
          /* progress must never break the render */
        }
        return;
      }
      if (m.type === 'done') finish(resolve, { cues: m.cues, duration: m.duration });
      else if (m.type === 'error') finish(reject, new Error(m.message));
    });
    worker.on('error', (e) => finish(reject, e));
    worker.on('exit', (code) => finish(reject, new Error(`soundtrack worker exited with code ${code}`)));
  });
}

export async function render(project, opts = {}) {
  const log = opts.log || (() => {});
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  const report = (p) => {
    try {
      if (onProgress) onProgress(p);
    } catch {
      /* progress must never break the render */
    }
  };
  const t0 = Date.now();
  log('preparing the timeline (voice cache + scene times)');
  report({ phase: 'prepare', done: 0, total: 100 });
  const { timeline } = await prepare(project, { log });
  report({ phase: 'prepare', done: 5, total: 100 });
  const draft = !!opts.draft;
  const scale = opts.scale ?? (draft ? 0.5 : 1);
  const fps = project.config.fps;
  const total = timeline.frames;
  const from = Math.max(0, Math.floor((opts.from ?? 0) * fps));
  const to = Math.min(total, opts.to !== undefined ? Math.ceil(opts.to * fps) : total);
  if (to <= from) throw new Error('nothing to render: --from must be before --to');
  const partial = from > 0 || to < total;
  const out = path.resolve(opts.out || path.join(project.paths.out, draft ? 'draft.mp4' : 'video.mp4'));
  let workers = Math.max(1, Math.min(opts.workers ?? Math.min(8, Math.max(1, Math.floor(os.cpus().length / 2))), to - from));
  if (opts.workers == null) {
    // Size the pool from free memory: engine pages plus x264 encoders fill
    // Windows commit on small machines, and x264 then dies with "malloc of
    // size ... failed". Per-worker figures include the chrome page, its
    // encoder and a share of the browser; the reserve covers other apps.
    const freeMB = os.freemem() / (1024 * 1024);
    const perWorkerMB = draft ? 400 : 700;
    const memCap = Math.max(1, Math.floor((freeMB - 500) / perWorkerMB));
    if (memCap < workers) log(`using ${memCap} workers (of ${workers} possible): ${Math.round(freeMB)}MB free, about ${perWorkerMB}MB needed per worker`);
    workers = Math.max(1, Math.min(workers, memCap));
  }
  // Total x264 threads across all encoders stay near the core count. At the
  // default (all cores each) six 1080p encoders exhaust commit and die with
  // "malloc of size ... failed".
  const encThreads = Math.max(1, Math.floor(os.cpus().length / workers));
  const quality = draft ? 0.82 : 0.93;
  const segDir = path.join(project.paths.build, 'segments');
  fs.rmSync(segDir, { recursive: true, force: true });
  fs.mkdirSync(segDir, { recursive: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  log(`rendering ${((to - from) / fps).toFixed(1)}s (${to - from} frames at ${fps} fps, ${Math.round(project.config.width * scale)}x${Math.round(project.config.height * scale)}) with ${workers} worker${workers > 1 ? 's' : ''}`);
  if (timeline.duration > 120) {
    log(`note: this is a long video (${timeline.duration.toFixed(0)}s timeline). The soundtrack mixes the whole timeline even for a --from/--to slice, so the first minutes show little progress; the frame counter below is live.`);
  }
  report({ phase: 'engine', done: 6, total: 100, detail: `${workers} worker${workers > 1 ? 's' : ''}` });

  const mix = path.join(project.paths.build, 'mix.wav');
  const mixNorm = path.join(project.paths.build, 'mix-norm.wav');
  const encoders = [];
  try {
    // Sound cues come from the engine (scene functions), which needs one
    // page. The mix itself runs on a worker thread, not in the page: a long
    // in-page mix peaked near 3GB and headless Chrome crashed ("Target page,
    // context or browser has been closed").
    log('collecting sound cues (1 engine page)…');
    report({ phase: 'soundtrack', done: 6, total: 100, detail: 'sound cues' });
    let cueData;
    await withEngine(project, timeline, { scale, pages: 1, log }, async (page) => {
      cueData = await page.evaluate(() => window.explainroo.cues());
    });
    if (cueData.errors.length) {
      throw new Error(cueData.errors.map((e) => `scene "${e.scene}" at ${Number(e.t).toFixed(2)}s: ${e.message}`).join('\n'));
    }
    log(`mixing the soundtrack for ${timeline.duration.toFixed(1)}s in a background worker (voice + music + effects)…`);
    report({ phase: 'soundtrack', done: 8, total: 100, detail: `${timeline.duration.toFixed(0)}s timeline` });
    const ta = Date.now();
    let sound;
    try {
      sound = await mixSoundtrack({
        project,
        timeline,
        sfx: cueData.cues,
        out: mix,
        onProgress: (p) => report({ phase: 'soundtrack', done: 8 + Math.round(p * 12), total: 100, detail: `${Math.round(p * 100)}%` }),
      });
    } catch (e) {
      throw new Error(`soundtrack mix failed (${e.message}). Try a shorter slice (--from/--to) or "music": false in video.json for long videos.`, { cause: e });
    }
    log(`soundtrack: ${sound.cues} sound cues, mixed in ${((Date.now() - ta) / 1000).toFixed(1)}s`);
    report({ phase: 'soundtrack', done: 20, total: 100, detail: `${sound.cues} cues` });

    log(`engine ready (${workers} page${workers > 1 ? 's' : ''}); drawing frames…`);
    await withEngine(project, timeline, { scale, pages: workers, log }, async (pages) => {
      const list = Array.isArray(pages) ? pages : [pages];

      const per = Math.ceil((to - from) / list.length);
      let done = 0;
      let lastLog = Date.now();
      const tf = Date.now();
      report({ phase: 'frames', done: 0, total: to - from });
      await Promise.all(list.map(async (page, k) => {
        const a = from + k * per;
        const b = Math.min(to, a + per);
        if (a >= b) return;
        const enc = frameEncoder({ fps, out: path.join(segDir, `seg-${String(k).padStart(2, '0')}.mp4`), draft, threads: encThreads });
        encoders.push(enc);
        const batch = 6;
        for (let f = a; f < b; f += batch) {
          const frames = [];
          for (let i = f; i < Math.min(b, f + batch); i++) frames.push(i);
          const jpegs = await page.evaluate(([l, q]) => window.explainroo.frames(l, q), [frames, quality]);
          for (const j of jpegs) await enc.write(Buffer.from(j, 'base64'));
          done += frames.length;
          report({ phase: 'frames', done, total: to - from });
          if (Date.now() - lastLog > 1500) {
            lastLog = Date.now();
            const elapsed = (Date.now() - tf) / 1000;
            const rate = elapsed > 0 ? done / elapsed : 0;
            const left = rate > 0 ? Math.ceil((to - from - done) / rate) : null;
            log(`frames ${done}/${to - from} (${rate.toFixed(1)} fps${left !== null ? `, about ${left}s left` : ''})`);
          }
        }
        await enc.close();
      }));
      log(`frames done in ${((Date.now() - tf) / 1000).toFixed(1)}s`);
      report({ phase: 'frames', done: to - from, total: to - from });
    });
  } catch (e) {
    for (const enc of encoders) enc.kill();
    throw e;
  }

  // After the frames, not during: while frames draw, pages plus encoders
  // already fill Windows commit on small machines; loudnorm would push it
  // over. Nothing here is slow enough to matter for the wait.
  log('normalizing loudness…');
  report({ phase: 'audio', done: 0, total: 1 });
  await normalizeLoudness(mix, mixNorm, project.config.loudness);
  report({ phase: 'audio', done: 1, total: 1 });

  const segs = fs.readdirSync(segDir).filter((f) => f.endsWith('.mp4')).sort();
  const listFile = path.join(segDir, 'list.txt');
  fs.writeFileSync(listFile, segs.map((s) => `file '${path.join(segDir, s).replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  log('joining picture + sound into the MP4…');
  report({ phase: 'mux', done: 0, total: 1 });
  const audioArgs = partial ? ['-ss', String(from / fps), '-t', String((to - from) / fps), '-i', mixNorm] : ['-i', mixNorm];
  await ffmpeg(['-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, ...audioArgs, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]);
  fs.rmSync(segDir, { recursive: true, force: true });
  const secs = (Date.now() - t0) / 1000;
  log(`wrote ${path.relative(process.cwd(), out) || out} in ${secs.toFixed(1)}s`);
  report({ phase: 'done', done: 1, total: 1 });
  return { out, duration: (to - from) / fps, frames: to - from, seconds: secs, width: Math.round(project.config.width * scale), height: Math.round(project.config.height * scale) };
}
