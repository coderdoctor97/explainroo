// The steps between the uploaded files and a rendered video:
//   analyze  read the three sources, line the words up, plan the scenes
//   build    write video.json, script.md, scenes.js and the per-scene audio
//   render   run the explainroo engine (shared with the command line)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadProject } from '../../src/project.js';
import { findChrome } from '../../src/browser.js';
import { ffmpegVersion } from '../../src/ffmpeg.js';
import { cacheRoot } from '../../src/models.js';
import { projectPaths, readStudio, sourceAssets, sourceInfo, sourcePath, StudioError } from './store.js';
import { planFromSources, readAudio, writeScript, writeVoiceCache } from './plan.js';
import { scenesSource, sceneSummary, videoConfig, writeScenes, writeVideoJson } from './generate.js';

function has(p) {
  try {
    return fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

function readSources(id) {
  const paths = projectPaths(id);
  const studio = readStudio(id);
  const transcriptFile = sourcePath(id, 'transcript');
  if (!has(transcriptFile)) throw new StudioError('upload your transcript first (drop it in the "transcript" box)');
  const timestampsFile = sourcePath(id, 'timestamps');
  if (!has(timestampsFile)) throw new StudioError('upload the word timings first (drop them in the "timings" box)');
  const transcript = fs.readFileSync(transcriptFile, 'utf8');
  // JSON, or SRT/VTT text. planFromSources decides which.
  const timestamps = fs.readFileSync(timestampsFile, 'utf8');
  const audioFile = sourcePath(id, 'audio');
  const audio = has(audioFile) ? readAudio(audioFile) : null;
  return { paths, studio, transcript, timestamps, audio, audioFile };
}

export function analyze(id) {
  const { paths, studio, transcript, timestamps, audio } = readSources(id);
  const plan = planFromSources({ transcript, timestamps, audio, studio });
  return { paths, studio, plan, audio, transcript, stats: plan.stats, warnings: warningsFor(plan, audio) };
}

function warningsFor(plan, audio) {
  const out = [];
  const s = plan.stats;
  if (s.level === 'segment') out.push('The timings are sentence-level, so words inside a sentence were spread evenly. Word-level timings give sharper pictures.');
  if (s.ms) out.push('The timings looked like milliseconds and were divided by 1000.');
  if (s.matchRate < 0.97) out.push(`The transcript and the timings disagree on ${s.unmatched} word(s); their times were filled in between the words that did match.`);
  if (audio && s.endsAt > audio.duration + 0.3) out.push(`The last word is at ${s.endsAt}s but the voice-over is ${audio.duration.toFixed(1)}s long.`);
  for (const scene of plan.scenes) {
    if (scene.seconds > 20) out.push(`Scene ${scene.id} runs ${scene.seconds.toFixed(0)}s; shorter scenes are easier to watch.`);
  }
  return out;
}

function titleFor(studio, plan) {
  if (studio.title && studio.title.trim()) return studio.title.trim();
  if (studio.name && studio.name.trim() && studio.name !== 'Untitled video') return studio.name.trim();
  const first = plan.scenes[0]?.heading || 'Untitled video';
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/**
 * Writes the explainroo project for one studio project: everything under
 * video/ is a normal explainroo project the command line can use too.
 */
export function buildProject(id, log = () => {}) {
  const { paths, studio, plan, audio } = analyze(id);
  if (!audio) throw new StudioError('upload your voice-over first (drop the .wav in the "voice-over" box)');
  const title = titleFor(studio, plan);
  const videoDir = paths.video;
  fs.mkdirSync(videoDir, { recursive: true });

  const config = videoConfig({ title, look: studio.look, styleId: studio.look.style });
  writeVideoJson(videoDir, config);

  log('writing script.md');
  writeScript(videoDir, plan, title);

  // Images the user supplied for scenes are copied next to the project.
  fs.mkdirSync(paths.assets, { recursive: true });
  const supplied = sourceAssets(id);
  for (const name of supplied) {
    fs.copyFileSync(path.join(paths.sourceAssets, name), path.join(paths.assets, name));
  }
  const assigned = [...new Set(plan.scenes.map((s) => s.asset).filter(Boolean))];
  const missing = assigned.filter((name) => !supplied.includes(name));
  if (missing.length) log(`waiting for ${missing.length} image(s): ${missing.join(', ')}`);

  log('cutting the voice-over into scene audio');
  const before = {
    dir: videoDir,
    paths: { voice: paths.voiceDir, script: path.join(videoDir, 'script.md'), build: paths.build, out: paths.out },
  };
  const voice = writeVoiceCache(before, plan, audio, config);

  log('writing scenes.js');
  writeScenes(videoDir, scenesSource({ plan, voice: voice.scenes, look: studio.look, title, assets: supplied }));

  // Load it the way the engine will; a problem here is a problem the render
  // would hit, and it is much cheaper to hit it now.
  const project = loadProject(videoDir);
  const report = {
    builtAt: Date.now(),
    title,
    style: studio.look.style,
    layout: studio.look.layout,
    size: studio.look.size,
    theme: project.config.theme,
    config: {
      pace: project.config.pace,
      captions: project.config.captions,
      music: project.config.music ? project.config.music.style : false,
      transition: project.config.transition,
      watermark: project.config.watermark,
    },
    duration: plan.words.length ? Math.round(plan.words[plan.words.length - 1].end * 100) / 100 : 0,
    voiceSeconds: voice.total,
    stats: plan.stats,
    scenes: sceneSummary(plan, voice.scenes),
    missing,
    warnings: warningsFor(plan, audio),
    files: {
      video: path.join(videoDir, 'video.json'),
      script: path.join(videoDir, 'script.md'),
      scenes: path.join(videoDir, 'scenes.js'),
      voice: paths.voiceDir,
    },
  };
  fs.writeFileSync(path.join(paths.build, 'studio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  log(`project ready: ${plan.scenes.length} scenes, ${report.duration}s of narration`);
  return report;
}

export function readReport(id) {
  const file = path.join(projectPaths(id).build, 'studio-report.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Everything the status rail shows, read from disk only.
export function status(id) {
  const paths = projectPaths(id);
  const report = readReport(id);
  const out = {
    sources: sourceInfo(id),
    report,
    built: fs.existsSync(path.join(paths.video, 'video.json')),
    voice: null,
    out: null,
    missing: report ? report.missing : [],
  };
  if (fs.existsSync(paths.voiceDir)) {
    const files = fs.readdirSync(paths.voiceDir);
    out.voice = {
      wavs: files.filter((f) => f.endsWith('.wav')).length,
      cached: files.filter((f) => f.endsWith('.json')).length,
    };
  }
  const mp4 = path.join(paths.out, 'video.mp4');
  const draft = path.join(paths.out, 'draft.mp4');
  for (const [kind, file] of [['video', mp4], ['draft', draft]]) {
    if (fs.existsSync(file)) {
      const st = fs.statSync(file);
      out.out = { ...(out.out || {}), [kind]: { bytes: st.size, mtime: st.mtimeMs } };
    }
  }
  const stills = path.join(paths.out, 'stills');
  if (fs.existsSync(stills)) {
    const list = fs.readdirSync(stills).filter((f) => f.endsWith('.png'));
    if (list.length) out.stills = list.sort().slice(0, 24);
  }
  return out;
}

// Is this machine ready to draw frames and write an MP4? The same three
// checks the explainroo command line makes.
export function doctor() {
  const rows = [];
  const [maj, min] = process.versions.node.split('.').map(Number);
  const nodeOk = maj > 20 || (maj === 20 && min >= 11);
  rows.push({ name: 'node', ok: nodeOk, detail: `v${process.versions.node}`, need: '20.11 or newer' });
  const ff = ffmpegVersion();
  rows.push({ name: 'ffmpeg', ok: !!ff, detail: ff || 'not found', need: 'needed to write the MP4' });
  try {
    rows.push({ name: 'chrome', ok: true, detail: findChrome() });
  } catch (e) {
    rows.push({ name: 'chrome', ok: false, detail: e.message, need: 'needed to draw the frames' });
  }
  const models = path.join(cacheRoot(), 'models', 'onnx-community');
  const voices = fs.existsSync(path.join(models, 'Kokoro-82M-v1.0-ONNX'));
  rows.push({
    name: 'voice model',
    ok: true,
    optional: true,
    detail: voices ? 'downloaded' : 'not downloaded — not needed, you upload the voice-over',
  });
  const ready = rows.filter((r) => !r.optional).every((r) => r.ok);
  return { rows, ready, platform: os.platform() };
}
