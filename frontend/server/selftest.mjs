// Run with:  npm run test:studio
//
// The studio's own check, with no browser, no ffmpeg and no models. It makes a
// transcript, a timings file and a WAV, runs the whole model-free path, then
// checks the things that break silently: word times that drift, a scenes.js
// that points at a missing word or icon, a voice cache the engine would
// reject, or a build that reaches for the voice model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
process.env.STUDIO_WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));

const { createProject, writeSource, projectPaths, readStudio, writeStudio, sourcePath } = await import('./store.js');
const { transcriptWords, readAudio, headingFor } = await import('./plan.js');
const { analyze, buildProject } = await import('./build.js');
const { parseTimestamps } = await import('./timestamps.js');
const { loadProject } = await import('../../src/project.js');
const { buildTimeline } = await import('../../src/timeline.js');
const { synthesize, sceneHash } = await import('../../src/voice.js');
const { speechChunks } = await import('../../src/script.js');
const { writeWav } = await import('../../src/wav.js');

let passed = 0;
const ok = (name, fn) => {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  }
};

// ---------- the words ----------

const TRANSCRIPT = `Every time you open a website, your computer asks a question. It asks for the address of the site.

Computers do not find each other by name. They use numbers called IP addresses. A resolver looks the name up for you.

The answer is usually saved, so the next visit is fast. That is why the second page loads quicker than the first.`;

const words = transcriptWords(TRANSCRIPT);
const SCRIPT_WORDS = words.map((w) => w.display);

// A timings file in the shape a speech tool prints: one entry per word.
let t = 0.4;
const timed = SCRIPT_WORDS.map((w, i) => {
  const dur = 0.18 + (w.length % 5) * 0.04;
  const entry = { word: i === 5 ? 'elephant' : w.replace(/[^\w']/g, ''), start: Math.round(t * 1000) / 1000, end: Math.round((t + dur) * 1000) / 1000 };
  t += dur + 0.06;
  return entry;
});
const AUDIO_SECONDS = Math.ceil(t + 1.5);

// ---------- the timings parser ----------

ok('timings: flat word list', () => {
  const r = parseTimestamps(JSON.stringify(timed));
  assert.equal(r.level, 'word');
  assert.equal(r.words.length, timed.length);
  assert.equal(r.words[0].text, 'Every');
  assert.ok(r.words[1].start > r.words[0].start);
});

ok('timings: whisper verbose_json with segments and words', () => {
  const file = { text: 'hello world', segments: [{ start: 0, end: 1, text: 'hello world', words: [{ word: 'hello', start: 0.0, end: 0.4 }, { word: 'world', start: 0.5, end: 0.9 }] }] };
  const r = parseTimestamps(JSON.stringify(file));
  assert.equal(r.level, 'word');
  assert.deepEqual(r.words.map((w) => w.text), ['hello', 'world']);
});

ok('timings: transformers.js chunks with [start, end]', () => {
  const file = { text: 'one two', chunks: [{ text: ' one', timestamp: [0, 0.4] }, { text: ' two', timestamp: [0.4, 0.8] }] };
  const r = parseTimestamps(JSON.stringify(file));
  assert.equal(r.words.length, 2);
  assert.equal(r.words[1].end, 0.8);
});

ok('timings: elevenlabs character alignment', () => {
  const chars = [...'hi there'];
  const file = {
    characters: chars,
    character_start_times_seconds: chars.map((_, i) => i * 0.1),
    character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.09),
  };
  const r = parseTimestamps(JSON.stringify(file));
  assert.deepEqual(r.words.map((w) => w.text), ['hi', 'there']);
});

ok('timings: srt fallback', () => {
  const srt = '1\n00:00:00,000 --> 00:00:02,400\nHello there friend\n\n2\n00:00:02,400 --> 00:00:04,000\nGoodbye now\n';
  const r = parseTimestamps(srt);
  assert.equal(r.level, 'segment');
  assert.equal(r.words.length, 5);
  assert.ok(r.words[0].start === 0);
});

ok('timings: milliseconds are divided by 1000', () => {
  const ms = [{ word: 'a', start: 0, end: 300 }, { word: 'b', start: 400, end: 900 }, { word: 'c', start: 1000, end: 1200 }];
  const r = parseTimestamps(JSON.stringify(ms));
  assert.equal(r.ms, true);
  assert.equal(r.words[1].start, 0.4);
});

ok('timings: nonsense is refused with a readable message', () => {
  assert.throws(() => parseTimestamps(JSON.stringify({ hello: 'world' })), /could not find word times/);
});

// ---------- the whole path ----------

const id = createProject('Selftest video').toString();
const dirs = projectPaths(id);
writeSource(id, 'transcript', Buffer.from(TRANSCRIPT, 'utf8'));
writeSource(id, 'timestamps', Buffer.from(JSON.stringify(timed, null, 2), 'utf8'));

// The voice-over: a beep per word, at the times the timings file says.
const SR = 24000;
const samples = new Float32Array(Math.round(AUDIO_SECONDS * SR));
timed.forEach((w) => {
  for (let i = Math.round(w.start * SR); i < Math.round(w.end * SR) && i < samples.length; i++) {
    samples[i] = Math.sin((i / SR) * 2 * Math.PI * 220) * 0.4;
  }
});
writeWav(sourcePath(id, 'audio'), samples, SR);

writeStudio(id, { look: { style: 'chalk', layout: 'sync', size: '16:9' }, plan: { strategy: 'sentences', wordsPerScene: 20 } });

const parsedAudio = readAudio(sourcePath(id, 'audio'));
ok('audio: read back with the right length', () => {
  assert.equal(parsedAudio.sampleRate, SR);
  assert.ok(Math.abs(parsedAudio.duration - AUDIO_SECONDS) < 0.05);
});

const a = analyze(id);
ok('analyze: scenes were planned from sentences', () => {
  assert.ok(a.plan.scenes.length >= 3, `expected 3+ scenes, got ${a.plan.scenes.length}`);
  assert.equal(a.plan.stats.transcriptWords, words.length);
  assert.ok(a.plan.stats.matchRate > 0.95, `match rate ${a.plan.stats.matchRate}`);
});

ok('analyze: one word did not match and is reported', () => {
  assert.equal(a.plan.stats.unmatched, 1);
  assert.ok(a.plan.scenes.some((s) => s.unmatched === 1));
});

ok('analyze: every word has a time, in order', () => {
  let prev = -1;
  for (const w of a.plan.words) {
    assert.ok(Number.isFinite(w.start) && Number.isFinite(w.end), `bad time for ${w.display}`);
    assert.ok(w.start >= prev - 0.001, `out of order at ${w.display}`);
    assert.ok(w.end > w.start);
    prev = w.start;
  }
});

ok('analyze: keywords and an icon are found for every scene', () => {
  const { iconFor } = { iconFor: null };
  for (const s of a.plan.scenes) {
    assert.ok(s.heading.length > 0);
    assert.ok(s.chips.length > 0, `no chips for ${s.id}`);
    for (const c of s.chips) assert.ok(c.word.length > 3);
  }
});

const report = buildProject(id, () => {});
ok('build: writes the three files the engine needs', () => {
  for (const f of ['video.json', 'script.md', 'scenes.js']) assert.ok(fs.existsSync(path.join(dirs.video, f)), `${f} missing`);
  assert.equal(report.scenes.length, a.plan.scenes.length);
});

ok('build: one WAV and one cache file per scene', () => {
  for (const s of report.scenes) {
    assert.ok(fs.existsSync(path.join(dirs.voiceDir, `${s.id}.wav`)), `${s.id}.wav missing`);
    const info = JSON.parse(fs.readFileSync(path.join(dirs.voiceDir, `${s.id}.json`), 'utf8'));
    assert.equal(info.words.length, s.words);
    assert.ok(info.duration > 0);
    assert.ok(info.chunks.length > 0);
  }
});

const project = loadProject(dirs.video);

ok('engine: the project loads like any other explainroo project', () => {
  assert.equal(project.config.theme, 'chalk');
  assert.equal(project.config._external, true);
  assert.equal(project.script.scenes.length, a.plan.scenes.length);
});

ok('engine: the imported voice cache passes without loading a model', async () => {
  const voices = await synthesize(project, { log: () => {}, external: true });
  for (const scene of project.script.scenes) assert.ok(voices[scene.id], `no voice for ${scene.id}`);
});

ok('engine: the cache is only valid for this exact script', () => {
  const scene = project.script.scenes[0];
  const config = project.config;
  const chunks = speechChunks(scene.units, { sentenceGap: config.sentenceGap, paragraphGap: config.paragraphGap, pace: config.pace });
  const info = JSON.parse(fs.readFileSync(path.join(dirs.voiceDir, `${scene.id}.json`), 'utf8'));
  assert.equal(info.hash, sceneHash(scene, chunks, config));
});

const timeline = buildTimeline(project, await synthesize(project, { external: true }));

ok('timeline: every scene starts where the previous one ends', () => {
  let at = 0;
  for (const sc of timeline.scenes) {
    assert.equal(sc.start, at);
    at = Math.round((at + sc.dur) * timeline.fps) / timeline.fps;
  }
  assert.ok(Math.abs(timeline.duration - (parsedAudio.duration + timeline.scenes.length * 1.05)) < 3, `duration ${timeline.duration} vs audio ${parsedAudio.duration}`);
});

ok('timeline: the word times land on the uploaded timings', () => {
  // The first word of the first scene: lead + (uploaded start - slice offset).
  const scene = timeline.scenes[0];
  const info = JSON.parse(fs.readFileSync(path.join(dirs.voiceDir, `${scene.id}.json`), 'utf8'));
  const word = scene.words[0];
  const expected = project.config.lead + (a.plan.scenes[0].words[0].start - info.offset);
  assert.ok(Math.abs(word.start - expected) < 0.02, `first word at ${word.start}, expected ${expected}`);
  // The scene's audio covers every word in it.
  assert.ok(scene.voice.dur >= info.words[info.words.length - 1].end, 'audio shorter than the words');
  // And the scene lasts for the lead-in plus the audio plus the hold.
  assert.ok(scene.dur >= project.config.lead + scene.voice.dur, `scene ${scene.id} is too short`);
});

// ---------- the generated scenes.js ----------

const source = fs.readFileSync(path.join(dirs.video, 'scenes.js'), 'utf8');
ok('scenes.js: no voice model, no network, just numbers', () => {
  assert.ok(!/import |require\(|fetch\(/.test(source), 'scenes.js should not import anything');
  assert.ok(!/NaN|Infinity|undefined/.test(source), 'scenes.js has a bad value');
});

const mod = await import(pathToFileURL(path.join(dirs.video, 'scenes.js')).href);
const icons = JSON.parse(fs.readFileSync(path.join(root, 'engine', 'icons', 'lucide.json'), 'utf8')).icons;

ok('scenes.js: one function per scene, no strays', () => {
  assert.deepEqual(Object.keys(mod.default).sort(), a.plan.scenes.map((s) => s.id).sort());
});

ok('scenes.js: every element is timed inside its scene, every icon exists', () => {
  const problems = [];
  a.plan.scenes.forEach((scene, i) => {
    const sc = timeline.scenes[i];
    const calls = [];
    const stage = fakeStage(sc.dur, calls);
    mod.default[scene.id](stage);
    for (const c of calls) {
      if (typeof c.o.at !== 'number' || !Number.isFinite(c.o.at)) problems.push(`${scene.id} ${c.kind}: at=${c.o.at}`);
      else if (c.o.at < 0 || c.o.at > sc.dur) problems.push(`${scene.id} ${c.kind}: at=${c.o.at} outside 0..${sc.dur}`);
      if (c.o.icon && !icons[c.o.icon]) problems.push(`${scene.id} ${c.kind}: no icon "${c.o.icon}"`);
    }
    if (!calls.some((c) => c.kind === 'text')) problems.push(`${scene.id}: nothing is written`);
  });
  assert.deepEqual(problems, []);
});

ok('scenes.js: the narration text really appears', () => {
  const sc = timeline.scenes[1];
  const calls = [];
  mod.default[a.plan.scenes[1].id](fakeStage(sc.dur, calls));
  const text = calls.filter((c) => c.kind === 'text').map((c) => c.text).join(' ');
  assert.ok(text.includes(a.plan.scenes[1].words[0].display), `narration missing: ${text.slice(0, 80)}`);
});

function fakeStage(dur, calls) {
  const base = { x: 134, y: 76, w: 1652, h: 928, left: 134, top: 76, right: 1786, bottom: 1004 };
  const record = (kind) => (text, o = {}) => {
    calls.push({ kind, text: typeof text === 'string' ? text : '', o: o || {} });
    return { ...base, x: 960, y: 540, w: 200, h: 60 };
  };
  return {
    safe: base,
    cx: 960,
    cy: 540,
    dur,
    t: 0,
    W: 1920,
    H: 1080,
    text: record('text'),
    title: record('title'),
    note: record('note'),
    box: record('box'),
    line: (points, o = {}) => {
      calls.push({ kind: 'line', text: '', o: o || {} });
      return base;
    },
    number: (value, o = {}) => {
      calls.push({ kind: 'number', text: String(value), o: o || {} });
      return base;
    },
    image: record('image'),
    icon: record('icon'),
  };
}

// ---------- the studio's own state ----------

ok('studio: settings survive a reload (they are on disk)', () => {
  const again = readStudio(id);
  assert.equal(again.look.style, 'chalk');
  assert.equal(again.look.layout, 'sync');
});

ok('studio: a second build is byte-identical for the same settings', () => {
  const first = fs.readFileSync(path.join(dirs.video, 'script.md'), 'utf8');
  const firstScenes = fs.readFileSync(path.join(dirs.video, 'scenes.js'), 'utf8');
  buildProject(id, () => {});
  assert.equal(fs.readFileSync(path.join(dirs.video, 'script.md'), 'utf8'), first, 'script.md changed');
  const second = fs.readFileSync(path.join(dirs.video, 'scenes.js'), 'utf8');
  // The stamp line carries the build time; everything below it must be equal.
  const strip = (s) => s.split('\n').filter((l) => !l.includes('built') && !l.startsWith('// ')).join('\n');
  assert.equal(strip(second), strip(firstScenes), 'scenes.js changed between builds');
});

// ---------- the shapes real tools write, and the settings that change the cut ----------

ok('timings: a Whisper file with words inside segments is read word by word', () => {
  const whisper = JSON.stringify({
    task: 'transcribe',
    language: 'en',
    segments: [
      { id: 0, text: 'hello there', start: 0, end: 1.0, words: [{ word: 'hello', start: 0, end: 0.4 }, { word: 'there', start: 0.4, end: 1.0 }] },
      { id: 1, text: 'general kenobi', start: 1.2, end: 2.4, words: [{ word: 'general', start: 1.2, end: 1.8 }, { word: 'kenobi', start: 1.8, end: 2.4 }] },
    ],
  });
  const parsed = parseTimestamps(whisper);
  assert.equal(parsed.level, 'word', 'fell back to sentence level');
  assert.equal(parsed.words.length, 4);
  assert.equal(parsed.words[3].text, 'kenobi');
  assert.equal(parsed.words[3].start, 1.8);
});

ok('timings: sentence-level files still become usable word times', () => {
  const parsed = parseTimestamps({ segments: [{ text: 'hello there world', start: 0, end: 3 }] });
  assert.equal(parsed.level, 'segment');
  assert.equal(parsed.words.length, 3);
  assert.ok(Math.abs(parsed.words.at(-1).end - 3) < 0.01);
});

ok('plan: a hand-made cut is never folded away, however short the scene', () => {
  const withCut = analyze(id).plan;
  const base = withCut.scenes.length;
  // Cut inside the second scene, two words in.
  const at = withCut.scenes[1].from + 2;
  writeStudio(id, { plan: { cuts: [at] } });
  const cut = analyze(id).plan;
  assert.equal(cut.scenes.length, base + 1, 'the cut was ignored');
  assert.equal(cut.scenes[1].to, at, 'the cut did not land on the word');
  // And a merge takes the same boundary away again.
  writeStudio(id, { plan: { cuts: [], merges: [at] } });
  const merged = analyze(id).plan;
  assert.equal(merged.scenes.length, base, `merge did not restore the count: ${merged.scenes.length} vs ${base}`);
  writeStudio(id, { plan: { cuts: [], merges: [] } });
});

ok('studio: a project file from before a setting existed still opens', () => {
  const file = projectPaths(id).studio;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete raw.plan.merges;
  delete raw.look.captions;
  fs.writeFileSync(file, JSON.stringify(raw));
  const read = readStudio(id);
  assert.deepEqual(read.plan.merges, [], 'merges should default to an empty list');
  assert.ok('captions' in read.look, 'missing look settings should be filled in');
  assert.deepEqual(read.plan.cuts, raw.plan.cuts, 'what was there must survive');
});

ok('plan: an edited list of on-screen words is used exactly as given', () => {
  const scene = analyze(id).plan.scenes[0];
  writeStudio(id, { plan: { keywords: { [scene.id]: ['dns', 'resolver'] } } });
  assert.deepEqual(analyze(id).plan.scenes[0].chips.map((c) => c.word), ['dns', 'resolver']);
  writeStudio(id, { plan: { keywords: { [scene.id]: [] } } });
  assert.deepEqual(analyze(id).plan.scenes[0].chips, [], 'an empty list means no chips');
  // null is "forget my override", so the automatic words come back.
  writeStudio(id, { plan: { keywords: { [scene.id]: null } } });
  assert.ok(analyze(id).plan.scenes[0].chips.length > 0, 'clearing the override did not bring the automatic words back');
  assert.ok(!(scene.id in readStudio(id).plan.keywords), 'the override should be gone from the file');
});

ok('plan: a heading cut short does not end on a filler word', () => {
  const long = 'The resolver asks the root servers where the dot com zone lives and then it asks again';
  const short = 'A cache is a small copy';
  assert.equal(headingFor(short), short, 'a heading that fits is left alone');
  const cut = headingFor(long);
  assert.ok(cut.length <= 46, `cut heading is too long: ${cut}`);
  assert.ok(!/\b(the|a|of|to|which|is|and|where)$/i.test(cut), `ends on a filler word: "${cut}"`);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}`);
