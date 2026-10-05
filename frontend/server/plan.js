// Turns a transcript and a timings file into a scene plan: which words belong
// to which scene, when every word is spoken, and what each scene shows.
// Nothing here calls a model. The same three files always give the same plan.
import fs from 'node:fs';
import path from 'node:path';
import { parseScript, tokenizeNarration, speechChunks, resolveMarks } from '../../src/script.js';
import { alignWords } from '../../src/align.js';
import { readWav, writeWav } from '../../src/wav.js';
import { normalizeConfig } from '../../src/project.js';
import { sceneHash } from '../../src/voice.js';
import { ROOT } from '../../src/server.js';
import { StudioError } from './store.js';
import { parseTimestamps, summarizeTimestamps } from './timestamps.js';

const ICONS = path.join(ROOT, 'engine', 'icons');
let iconIndex = null;

function icons() {
  if (!iconIndex) {
    iconIndex = {
      tags: JSON.parse(fs.readFileSync(path.join(ICONS, 'lucide-tags.json'), 'utf8')),
      names: new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ICONS, 'lucide.json'), 'utf8')).icons)),
    };
  }
  return iconIndex;
}

// ---------- text ----------

// A blank line starts a paragraph. Single newlines are just wrapping.
export function paragraphs(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/^\uFEFF/, '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

// Splits one transcript into words, using the same tokenizer the engine uses
// for script.md, so the two always agree about what a word is.
export function transcriptWords(text) {
  const words = [];
  paragraphs(text).forEach((para, paraIndex) => {
    const units = tokenizeNarration(para);
    for (const u of units) {
      if (u.type !== 'word') continue;
      words.push({ display: u.display, spoken: u.spoken, space: u.space, para: paraIndex, index: words.length });
    }
  });
  if (!words.length) throw new StudioError('the transcript has no words in it');
  return words;
}

const SENTENCE_END = /[.!?…]["'’)\]]*$/;

function sentencesOf(words) {
  const out = [];
  let start = 0;
  words.forEach((w, i) => {
    if (SENTENCE_END.test(w.display) || i === words.length - 1) {
      out.push({ start, end: i + 1 });
      start = i + 1;
    }
  });
  return out;
}

export function textOf(words, from = 0, to = words.length) {
  let out = '';
  for (let i = from; i < to; i++) {
    if (i > from && words[i].space !== false) out += ' ';
    out += words[i].display;
  }
  return out;
}

// ---------- the plan ----------

const STRATEGIES = ['sentences', 'paragraphs', 'fixed'];

/**
 * words: transcript words with times ({display, spoken, para, index, start, end, matched})
 * opts:  strategy, wordsPerScene, maxSceneSeconds, minSceneSeconds, cuts, merges
 */
export function segment(words, opts = {}) {
  const {
    strategy = 'sentences',
    wordsPerScene = 36,
    maxSceneSeconds = 12,
    minSceneSeconds = 2.5,
    cuts = [],
    merges = [],
  } = opts;
  const mode = STRATEGIES.includes(strategy) ? strategy : 'sentences';
  const hasTimes = words.every((w) => typeof w.start === 'number');
  const sentenceStarts = new Set(sentencesOf(words).map((s) => s.start));
  const boundaries = new Set([0]);

  if (mode === 'fixed') {
    for (let i = wordsPerScene; i < words.length; i += wordsPerScene) boundaries.add(i);
  } else if (mode === 'paragraphs') {
    for (let i = 1; i < words.length; i++) {
      if (words[i].para !== words[i - 1].para) boundaries.add(i);
    }
    // A paragraph that is far too long still gets split, at a sentence.
    const list = [...boundaries].sort((a, b) => a - b);
    for (let k = 0; k < list.length; k++) {
      const from = list[k];
      const to = list[k + 1] ?? words.length;
      if (to - from > wordsPerScene * 1.8) {
        let last = from;
        for (const s of sentencesOf(words)) {
          if (s.start <= from || s.start >= to) continue;
          if (s.start - last >= wordsPerScene) {
            boundaries.add(s.start);
            last = s.start;
          }
        }
      }
    }
  } else {
    // Sentences, packed until the scene is long enough.
    let from = 0;
    for (const s of sentencesOf(words)) {
      const overWords = s.end - from >= wordsPerScene;
      const overTime = hasTimes && words[s.end - 1].end - words[from].start >= maxSceneSeconds;
      if (overWords || overTime) {
        boundaries.add(s.start);
        from = s.start;
      }
    }
  }

  const sentenceAt = (n) => sentencesOf(words).find((s) => n >= s.start && n < s.end);
  // Splitting a scene in the studio is an instruction, not a suggestion: a
  // hand-made cut is never folded away below, however short the scene it makes.
  const explicit = new Set();
  for (const raw of cuts) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0 || n >= words.length) continue;
    // It only snaps forward when it lands in the last 15% of a sentence, which
    // is usually a stray frame rather than the word the user picked.
    const s = sentenceAt(n);
    const at = s && n - s.start > (s.end - s.start) * 0.85 ? s.end : n;
    boundaries.add(at);
    explicit.add(at);
  }

  // A merge means "do not start a scene here": the scene that would begin at
  // this word is folded into the one before it.
  const folded = new Set();
  for (const raw of merges) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0 || n >= words.length) continue;
    folded.add(n);
  }

  const edges = [...boundaries]
    .filter((n) => n > 0 && n < words.length && !folded.has(n))
    .sort((a, b) => a - b);
  const merged = [0];
  for (const edge of edges) {
    if (folded.has(edge)) continue;
    const from = merged[merged.length - 1];
    const seconds = hasTimes ? words[edge - 1].end - words[from].start : (edge - from) / 2.5;
    if (!explicit.has(edge) && seconds < minSceneSeconds && edge - from < wordsPerScene * 0.6) continue; // fold into the next scene
    merged.push(edge);
  }
  const all = [...merged.slice(1), words.length];
  return all.map((to, i) => ({ from: i === 0 ? 0 : all[i - 1], to }));
}

// The first sentence of a scene, shortened to fit on screen.
const STOPWORDS = new Set(
  (
    "a an the and or but if then than that this these those is are was were be been being am do does did doing have has had having " +
    "it its as at by for from in into of on onto over to up with within without you your yours we our ours they their theirs " +
    "he she his her him them us me my mine so not no yes can could may might must shall should will would there here what which who " +
    "when where why how all any both each few more most other some such only own same too very just also about after again against " +
    "because before below between during out off under while don now ll ve re"
  ).split(/\s+/),
);

export function headingFor(text, maxChars = 46) {
  const first = (String(text).split(/(?<=[.!?…])\s/)[0] || String(text)).trim();
  if (first.length <= maxChars) return first.replace(/[.]$/, '');
  const words = first.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((`${out} ${w}`).trim().length > maxChars) break;
    out = `${out} ${w}`.trim();
  }
  // A heading that had to be cut short should not end on "which is" or "the".
  const kept = out.split(/\s+/);
  while (kept.length > 2 && STOPWORDS.has(kept[kept.length - 1].toLowerCase().replace(/[^\p{L}\p{N}']/gu, ''))) kept.pop();
  return (kept.join(' ') || first.slice(0, maxChars)).replace(/[,;:]$/, '');
}

// The words a scene is about, for the on-screen chips. Deterministic: word
// length, position and repetition decide, and an icon in the icon set breaks
// ties, so chips are things the engine can actually draw.
export function keywordsFor(text, { max = 4, used = new Set() } = {}) {
  const found = new Map();
  const tokens = String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  tokens.forEach((raw, i) => {
    const word = raw.toLowerCase().replace(/['’]s$/, '');
    if (word.length < 4 || STOPWORDS.has(word) || /^\d+$/.test(word) || used.has(word)) return;
    const key = word.replace(/(ies|es|s)$/, '');
    const hit = found.get(key) || { key, word, score: 0, at: i };
    hit.score += 2 + Math.min(3, word.length / 4);
    // Early words are more likely to be the subject of the scene.
    hit.score += Math.max(0, 1.5 - i / 12);
    if (word === raw.toLowerCase()) hit.score += 0.5;
    found.set(key, hit);
  });
  return [...found.values()]
    .map((h) => {
      const icon = iconFor(h.word);
      return { word: h.word, score: h.score + (icon ? 1.5 : 0), icon, at: h.at };
    })
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, max);
}

// One icon that means this word, or null.
export function iconFor(word) {
  const { tags, names } = icons();
  const q = String(word).toLowerCase().trim();
  if (!q || !names.size) return null;
  if (names.has(q)) return q;
  const singular = q.replace(/ies$/, 'y').replace(/(es|s)$/, '');
  if (names.has(singular)) return singular;
  let best = null;
  for (const [name, list] of Object.entries(tags)) {
    if (!names.has(name)) continue;
    let score = 0;
    const parts = name.split('-');
    if (parts.includes(q) || parts.includes(singular)) score += 30;
    else if (name.startsWith(`${q}-`) || name.endsWith(`-${q}`)) score += 18;
    else if (name.includes(q)) score += 8;
    if (list.includes(q) || list.includes(singular)) score += 22;
    else if (list.some((t) => t.includes(q))) score += 8;
    if (!score) continue;
    score -= name.length / 40;
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score >= 22 ? best.name : null;
}

// A number worth putting on screen: "95%", "$1,500", "2.5 billion".
export function headlineNumber(text) {
  const m = /(\$|€|£)?\s?(\d[\d,]*(?:\.\d+)?)\s?(%|percent|million|billion|thousand|k\b)?/i.exec(String(text));
  if (!m) return null;
  const value = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(value) || value === 0) return null;
  const word = (m[3] || '').toLowerCase();
  const suffix = word === '%' || word === 'percent' ? '%' : word === '' ? '' : ` ${word === 'k' ? 'k' : word}`;
  return { value, prefix: m[1] || '', suffix, raw: m[0].trim() };
}

// ---------- the whole plan ----------

export function planFromSources({ transcript, timestamps, audio, studio }) {
  const parsedTimestamps = parseTimestamps(timestamps);
  const words = transcriptWords(transcript);
  const rawDuration = audio?.duration ?? parsedTimestamps.words[parsedTimestamps.words.length - 1]?.end ?? 0;
  const aligned = alignWords(words, parsedTimestamps.words, rawDuration);
  const timed = words.map((w, i) => ({ ...w, start: aligned.words[i].start, end: aligned.words[i].end, matched: aligned.words[i].matched }));

  const planOpts = studio?.plan || {};
  const ranges = segment(timed, planOpts);
  const usedKeywords = new Set();

  const scenes = ranges.map((r, i) => {
    const id = `s${String(i + 1).padStart(2, '0')}`;
    const text = textOf(timed, r.from, r.to);
    const edited = planOpts.headings?.[id];
    const editedKeywords = planOpts.keywords?.[id];
    const slice = timed.slice(r.from, r.to);
    // An edited list is used exactly as given, even when it is empty: taking a
    // chip away again has to mean something.
    const chipWords = Array.isArray(editedKeywords) ? editedKeywords : keywordsFor(text, { max: 4, used: usedKeywords }).map((k) => k.word);
    const chips = chipWords
      .map((word) => ({ word, icon: iconFor(word) }))
      // Say them on screen in the order the voice says them.
      .sort((a, b) => firstWordAt(slice, a.word) - firstWordAt(slice, b.word));
    if (!editedKeywords) for (const c of chips) usedKeywords.add(c.word.toLowerCase());
    const start = slice[0]?.start ?? 0;
    const end = slice[slice.length - 1]?.end ?? start;
    return {
      id,
      index: i,
      from: r.from,
      to: r.to,
      heading: edited || headingFor(text),
      headingEdited: !!edited,
      text,
      words: slice.map((w) => ({ display: w.display, index: w.index, matched: w.matched, start: w.start, end: w.end })),
      start,
      end,
      seconds: Math.round((end - start) * 1000) / 1000,
      asset: planOpts.assets?.[id] || null,
      chips,
      number: headlineNumber(text),
      unmatched: slice.filter((w) => !w.matched).length,
    };
  });

  const summary = summarizeTimestamps(parsedTimestamps);
  return {
    title: studio?.title || null,
    scenes,
    words: timed,
    stats: {
      ...summary,
      transcriptWords: timed.length,
      scenes: scenes.length,
      matchRate: Math.round(aligned.matchRate * 1000) / 1000,
      unmatched: timed.filter((w) => !w.matched).length,
      audioDuration: audio?.duration ?? null,
      audioSampleRate: audio?.sampleRate ?? null,
      endsAt: Math.round((timed[timed.length - 1]?.end ?? 0) * 100) / 100,
    },
  };
}

// ---------- the files the engine reads ----------

// Writes script.md for a plan. Words keep their paragraphs and every scene
// gets its own "## id" heading, exactly like a hand-written script.md.
export function writeScript(projectDir, plan, title) {
  const lines = [`# ${title}`.trim(), ''];
  for (const scene of plan.scenes) {
    lines.push(`## ${scene.id}`);
    const words = plan.words.slice(scene.from, scene.to);
    let para = words[0]?.para;
    let line = '';
    for (const w of words) {
      if (w.para !== para) {
        if (line) lines.push(line);
        lines.push('');
        line = '';
        para = w.para;
      }
      if (line && w.space !== false) line += ' ';
      line += w.display;
    }
    if (line) lines.push(line);
    lines.push('');
  }
  const md = `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'script.md'), md);
  return md;
}

/**
 * Slices the uploaded voice-over into one WAV per scene and writes the same
 * build/voice/<scene>.json the voice model would have written, so the rest of
 * explainroo cannot tell the difference.
 */
export function writeVoiceCache(project, plan, audio, config, opts = {}) {
  const { paths } = project;
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  fs.mkdirSync(paths.voice, { recursive: true });
  const parsedScenes = parseScript(fs.readFileSync(paths.script, 'utf8')).scenes;
  const byId = new Map(parsedScenes.map((s) => [s.id, s]));
  const info = {};
  let total = 0;

  for (let si = 0; si < plan.scenes.length; si++) {
    const scene = plan.scenes[si];
    const parsed = byId.get(scene.id);
    if (!parsed) throw new StudioError(`scene ${scene.id} is missing from script.md`);
    const slice = plan.words.slice(scene.from, scene.to);
    const parsedWordCount = parsed.units.filter((u) => u.type === 'word').length;
    if (parsedWordCount !== slice.length) {
      throw new StudioError(`${scene.id}: script.md has ${parsedWordCount} words but the plan has ${slice.length}; rebuild the plan`);
    }
    const first = slice[0];
    const last = slice[slice.length - 1];
    const from = Math.max(0, (first?.start ?? 0) - 0.12);
    // The scene's length comes from the word timings, not from how much
    // audio is left: when the timings run past the end of the uploaded
    // voice-over, the missing tail is silence, never a negative slice.
    // (Before this, scenes past the audio got a negative duration, a 44-byte
    // WAV and cues outside the scene, so check failed and the render's
    // soundtrack had nothing to mix.)
    const wantTo = (last?.end ?? from) + 0.3;
    const end = Math.max(wantTo, from + 0.5);
    const needSamples = Math.max(1, Math.round((end - from) * audio.sampleRate));
    const availFrom = Math.min(audio.samples.length, Math.max(0, Math.round(from * audio.sampleRate)));
    const availTo = Math.min(audio.samples.length, Math.max(availFrom, Math.round(Math.min(end, audio.duration) * audio.sampleRate)));
    const samples = new Float32Array(needSamples);
    if (availTo > availFrom) {
      samples.set(audio.samples.subarray(availFrom, availTo).subarray(0, needSamples));
    }
    if (wantTo > audio.duration + 0.05) {
      log(`warning: ${scene.id} speaks until ${wantTo.toFixed(1)}s but the voice-over ends at ${audio.duration.toFixed(1)}s; the missing tail is silence`);
    }
    writeWav(path.join(paths.voice, `${scene.id}.wav`), samples, audio.sampleRate);

    // Word times relative to the slice, keyed by unit index like the engine's.
    const wordTimes = [];
    let k = 0;
    parsed.units.forEach((u, ui) => {
      if (u.type !== 'word') return;
      const w = slice[k++];
      wordTimes[ui] = { start: w.start - from, end: w.end - from, matched: w.matched !== false };
    });

    const outWords = [];
    parsed.units.forEach((u, ui) => {
      if (u.type !== 'word' || !wordTimes[ui]) return;
      outWords.push({
        text: u.display,
        spoken: u.spoken,
        start: round(wordTimes[ui].start),
        end: round(wordTimes[ui].end),
        matched: wordTimes[ui].matched,
      });
    });

    const words = outWords.filter((w) => w.matched).length;
    const info_ = {
      hash: sceneHashOf(parsed, config),
      id: scene.id,
      source: 'imported',
      // Where the scene's audio starts in the uploaded file. The engine does
      // not need this; the scene generator and the page preview do.
      offset: round(from),
      duration: round(end - from),
      words: outWords,
      marks: Object.fromEntries(Object.entries(resolveMarks(parsed.units, wordTimes)).map(([k2, v]) => [k2, round(v)])),
      chunks: sentenceChunks(outWords),
      transcript: parsed.text,
      matchRate: outWords.length ? Math.round((words / outWords.length) * 1000) / 1000 : 1,
      unmatched: outWords.filter((w) => !w.matched).map((w) => w.text),
    };
    fs.writeFileSync(path.join(paths.voice, `${scene.id}.json`), JSON.stringify(info_, null, 2));
    info[scene.id] = info_;
    total += info_.duration;
    if (onProgress) onProgress({ phase: 'voice', done: si + 1, total: plan.scenes.length, detail: scene.id });
  }
  return { scenes: info, total: round(total) };
}

function round(v) {
  return Math.round(v * 1000) / 1000;
}

// Where a word first appears in a scene, for ordering the chips. Words that
// are not in the narration at all go last.
function firstWordAt(words, word) {
  const want = String(word).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const i = words.findIndex((w) => String(w.display).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').startsWith(want));
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

// Real-time spans of the narration, for the music ducking.
function sentenceChunks(words) {
  const chunks = [];
  let cur = null;
  for (const w of words) {
    if (!cur) cur = { start: w.start, end: w.end, text: '' };
    cur.text += (cur.text ? ' ' : '') + w.text;
    cur.end = w.end;
    if (SENTENCE_END.test(w.text)) {
      chunks.push(cur);
      cur = null;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => ({ start: round(c.start), end: round(c.end), text: c.text }));
}

// The hash the engine will compute when it loads the project: it must be made
// from the same normalized settings, or every build would look stale.
function sceneHashOf(scene, config) {
  const { width, height, format, safe, ...rest } = config;
  const norm = normalizeConfig(rest);
  return sceneHash(scene, speechChunks(scene.units, { sentenceGap: norm.sentenceGap, paragraphGap: norm.paragraphGap, pace: norm.pace }), norm);
}

export function readAudio(file) {
  const wav = readWav(file);
  const duration = wav.samples.length / wav.sampleRate;
  if (duration < 0.5) throw new StudioError('the voice-over is shorter than half a second');
  if (duration > 3600) throw new StudioError('the voice-over is longer than an hour; explainroo is made for short videos');
  return { ...wav, duration };
}

export { parseTimestamps, summarizeTimestamps };
