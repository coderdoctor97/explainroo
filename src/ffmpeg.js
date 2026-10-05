// ffmpeg and ffprobe helpers.
import { spawn, spawnSync } from 'node:child_process';

export function ffmpegPath() {
  return process.env.EXPLAINROO_FFMPEG || 'ffmpeg';
}

export function ffprobePath() {
  return process.env.EXPLAINROO_FFPROBE || 'ffprobe';
}

export function ffmpegVersion() {
  const r = spawnSync(ffmpegPath(), ['-version'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split('\n')[0];
}

export function run(bin, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => reject(new Error(`${bin} could not start: ${e.message}. Install ffmpeg or set EXPLAINROO_FFMPEG.`)));
    p.on('close', (code) => {
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(`${bin} ${args.slice(0, 6).join(' ')} ... failed (${code}):\n${err.split('\n').slice(-12).join('\n')}`));
    });
    // The child can exit before reading stdin. Without this the EPIPE is an
    // unhandled Socket 'error' that kills the whole process ("write EOF").
    p.stdin.on('error', () => {});
    if (input) p.stdin.end(input);
    else p.stdin.end();
  });
}

export function ffmpeg(args, opts) {
  return run(ffmpegPath(), ['-hide_banner', '-y', ...args], opts);
}

// A long-running encoder fed with JPEG frames on stdin. `threads` caps x264
// frame threads: 6 encoders at the default (all cores each) exhausts Windows
// commit and x264 dies with "malloc of size ... failed".
export function frameEncoder({ fps, out, draft, threads = 0 }) {
  const args = [
    '-hide_banner', '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', draft ? 'veryfast' : 'medium', '-crf', draft ? '24' : '17',
    '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(fps * 2),
    // medium's 40-frame lookahead holds ~350MB of frame buffers per 1080p
    // encoder; 4+ of those exhaust Windows commit ("malloc of size ...
    // failed"). 10 (what veryfast uses) changes rate control slightly,
    // not quality at the same crf.
    '-x264-params', 'rc-lookahead=10',
    ...(threads > 0 ? ['-threads', String(threads)] : []),
    out,
  ];
  const p = spawn(ffmpegPath(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  let dead = null;
  p.stderr.on('data', (d) => (err += d));
  // ffmpeg can die mid-render (OOM, bad frame, disk). Its stdin then closes;
  // writes must fail as rejections, never as an unhandled Socket 'error'
  // ("write EOF") that kills the studio server, and never hang on 'drain'.
  p.stdin.on('error', (e) => {
    dead = dead || e;
  });
  const done = new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`ffmpeg could not start: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encoder failed (${code}): ${err.slice(-800)}`))));
  });
  done.catch(() => {});
  const died = (e) => new Error(`ffmpeg encoder died${e && e.message ? ` (${e.message})` : ''}: ${err.slice(-800) || 'no output'}`);
  return {
    write(buf) {
      if (dead || p.stdin.destroyed) return Promise.reject(died(dead));
      if (p.stdin.write(buf)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          p.stdin.off('drain', ok);
          p.stdin.off('error', fail);
          p.stdin.off('close', fail);
        };
        const ok = () => {
          cleanup();
          resolve();
        };
        const fail = (e) => {
          cleanup();
          reject(died(e));
        };
        p.stdin.on('drain', ok);
        p.stdin.on('error', fail);
        p.stdin.on('close', fail);
      });
    },
    async close() {
      if (!dead && !p.stdin.destroyed) p.stdin.end();
      await done;
    },
    kill() {
      try { p.kill('SIGKILL'); } catch {}
    },
  };
}

// Two-pass loudness normalization to `target` LUFS, peak-limited.
export async function normalizeLoudness(input, output, target = -14) {
  const base = `I=${target}:TP=-1.5:LRA=11`;
  const pass1 = await ffmpeg(['-i', input, '-af', `loudnorm=${base}:print_format=json`, '-f', 'null', '-']);
  const json = pass1.stderr.slice(pass1.stderr.lastIndexOf('{'), pass1.stderr.lastIndexOf('}') + 1);
  const m = JSON.parse(json);
  const measured = `measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}`;
  await ffmpeg(['-i', input, '-af', `loudnorm=${base}:${measured}:linear=true:print_format=summary`, '-ar', '48000', '-c:a', 'pcm_s16le', output]);
  return { inputI: Number(m.input_i), inputTP: Number(m.input_tp) };
}

export async function probe(file) {
  const { stdout } = await run(ffprobePath(), ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  return JSON.parse(stdout);
}

export async function loudness(file) {
  const { stderr } = await ffmpeg(['-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const I = /I:\s*(-?[\d.]+) LUFS/.exec(summary);
  const LRA = /LRA:\s*(-?[\d.]+) LU/.exec(summary);
  const peak = /Peak:\s*(-?[\d.]+|-inf) dBFS/.exec(summary);
  return { integrated: I ? Number(I[1]) : null, range: LRA ? Number(LRA[1]) : null, truePeak: peak ? Number(peak[1]) : null };
}
