// Reads the many shapes a "timestamps.json" can have and returns one flat
// list of words with a start and an end time. No model, no guessing at
// runtime: whatever the shape, the result is the same on every run.
//
// Shapes that are recognised:
//   [{ word, start, end }, …]                     plain list
//   { words: [...] }                              OpenAI Whisper verbose_json
//   { segments: [{ text, start, end }] }          sentence level
//   { chunks: [{ text, timestamp: [s, e] }] }     Transformers.js Whisper
//   { characters, character_start_times_seconds, character_end_times_seconds }
//                                                 ElevenLabs alignment
//   { "0": { word, start, end }, … }              numeric keys
//   [[0.12, 0.4, "hello"], …]                     arrays of triples
//   1 \n 00:00:00,000 --> 00:00:02,400 \n text    SRT or VTT
import { StudioError } from './store.js';

const TEXT_KEYS = ['word', 'text', 'value', 'token', 'content', 'chunk', 'character', 'char', 'label', 'w'];
const START_KEYS = ['start', 'startTime', 'start_time', 'startTimeSeconds', 'start_time_seconds', 'startSeconds', 'start_seconds', 'from', 'begin', 'offset', 'time', 't', 's'];
const END_KEYS = ['end', 'endTime', 'end_time', 'endTimeSeconds', 'end_time_seconds', 'endSeconds', 'end_seconds', 'to', 'stop', 'finish', 'until'];
const DURATION_KEYS = ['duration', 'dur', 'length'];

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(t);
    if (clock) {
      const [, h, m, s, ms] = clock;
      return Number(h || 0) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${ms || 0}`);
    }
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pick(o, keys) {
  for (const k of keys) {
    if (o[k] !== undefined && o[k] !== null) return o[k];
  }
  // Case-insensitive fallback: "Start", "START_TIME", …
  const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase().replace(/[_\s-]/g, ''), k]));
  for (const k of keys) {
    const hit = lower.get(k.toLowerCase().replace(/[_\s-]/g, ''));
    if (hit && o[hit] !== undefined && o[hit] !== null) return o[hit];
  }
  return null;
}

function timesOf(o) {
  if (!o || typeof o !== 'object') return null;
  const stamp = o.timestamp ?? o.timestamps ?? o.time;
  if (Array.isArray(stamp)) {
    const start = num(stamp[0]);
    const end = num(stamp[1]) ?? (num(stamp[2]) ? num(stamp[0]) + num(stamp[2]) : null);
    if (start !== null) return { start, end };
  }
  const start = num(pick(o, START_KEYS));
  if (start === null) return null;
  let end = num(pick(o, END_KEYS));
  if (end === null) {
    const dur = num(pick(o, DURATION_KEYS));
    if (dur !== null) end = start + dur;
  }
  return { start, end };
}

function textOf(o) {
  const v = pick(o, TEXT_KEYS);
  return typeof v === 'string' ? v : null;
}

function looksLikeEntry(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  return textOf(o) !== null && timesOf(o) !== null;
}

// [[start, end, "word"], ["word", start, end]] and friends.
function tripleOf(a) {
  if (!Array.isArray(a) || a.length < 2) return null;
  const nums = a.filter((x) => num(x) !== null && typeof x !== 'string' || (typeof x === 'string' && num(x) !== null));
  const strs = a.filter((x) => typeof x === 'string' && num(x) === null);
  if (nums.length < 2 || strs.length < 1) return null;
  const start = num(nums[0]);
  const end = num(nums[1]);
  if (start === null || end === null) return null;
  return { text: strs.join(' '), start, end };
}

function collect(node, out, depth = 0) {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    // One entry is a list too: a single sentence, or a single line of subtitles.
    if (node.length >= 1 && node.every(looksLikeEntry)) {
      out.push(node.map((o) => ({ text: textOf(o), ...timesOf(o) })));
      return;
    }
    if (node.length >= 1 && node.every((x) => tripleOf(x))) {
      out.push(node.map(tripleOf));
      return;
    }
    for (const item of node) collect(item, out, depth + 1);
    return;
  }
  const values = Object.values(node);
  if (values.length >= 1 && values.every(looksLikeEntry)) {
    // Numbers used as keys, in their sorted order.
    const keys = Object.keys(node).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    out.push(keys.map((k) => ({ text: textOf(node[k]), ...timesOf(node[k]) })));
    return;
  }
  // ElevenLabs style: parallel arrays of characters and times.
  const chars = node.characters ?? node.chars;
  const starts = node.character_start_times_seconds ?? node.characters_start_times ?? node.character_start_times;
  const ends = node.character_end_times_seconds ?? node.character_end_times;
  if (Array.isArray(chars) && Array.isArray(starts) && chars.length === starts.length) {
    const list = chars.map((c, i) => ({ text: String(c), start: num(starts[i]) ?? 0, end: num(ends?.[i]) ?? null }));
    out.push(groupCharacters(list));
    return;
  }
  for (const item of values) collect(item, out, depth + 1);
}

// Characters → words. A word ends at whitespace or after its punctuation.
function groupCharacters(chars) {
  const words = [];
  for (const c of chars) {
    const ch = String(c.text);
    const last = words[words.length - 1];
    if (last && last.open && !/^\s/.test(ch)) {
      last.text += ch;
      last.end = c.end ?? last.end;
    } else {
      if (last) last.open = false;
      words.push({ text: ch, start: c.start, end: c.end ?? c.start + 0.05, open: true });
    }
    const cur = words[words.length - 1];
    if (/\s/.test(ch) || /[.!?,;:]/.test(ch)) cur.open = false;
  }
  return words.filter((w) => w.text.trim()).map(({ text, start, end }) => ({ text: text.trim(), start, end }));
}

function parseClock(t) {
  const m = /(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
}

// SRT or VTT: cue times with one or more lines of text.
export function parseCues(text) {
  const blocks = String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '' && !/^WEBVTT/i.test(l));
    if (!lines.length) continue;
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const [a, b] = timeLine.split('-->');
    const start = parseClock(a);
    const end = parseClock(b.replace(/[^\d:.,]/g, ''));
    if (start === null) continue;
    const body = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l.trim())).join(' ').replace(/<[^>]+>/g, '').trim();
    if (body) cues.push({ text: body, start, end: end ?? null });
  }
  return cues;
}

function toWords(entries, fallbackDuration) {
  const words = [];
  let lastEnd = 0;
  for (const e of entries) {
    let text = String(e.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let start = e.start;
    let end = e.end;
    if (end === null || end === undefined || !Number.isFinite(end)) end = start + 0.3;
    if (end < start) end = start + 0.05;
    // Punctuation that a tool reports as its own entry sticks to the word before it.
    if (/^[.,;:!?…'"’”)\]]+$/.test(text) && words.length) {
      words[words.length - 1].text += text;
      words[words.length - 1].end = Math.max(words[words.length - 1].end, end);
      continue;
    }
    if (start < lastEnd - 0.05) start = lastEnd - 0.05;
    words.push({ text, start: Math.max(0, start), end });
    lastEnd = end;
  }
  if (fallbackDuration && words.length && words[words.length - 1].end > fallbackDuration + 0.5) {
    // Times look longer than the audio: keep them, the alignment reports it.
  }
  return words;
}

function scaleMs(words) {
  const max = Math.max(...words.map((w) => w.end), 0);
  if (words.length < 2 || max <= 10) return { words, ms: false };
  // Whole numbers in the hundreds or more, and no word under half a second,
  // means the file counted milliseconds.
  const allInts = words.every((w) => Number.isInteger(w.start) && Number.isInteger(w.end));
  const minGap = Math.min(...words.slice(1).map((w, i) => w.start - words[i].start));
  if (allInts && max > 600 && minGap >= 1) {
    return { words: words.map((w) => ({ ...w, start: w.start / 1000, end: w.end / 1000 })), ms: true };
  }
  return { words, ms: false };
}

// A plain array of entries, or of [start, end, "word"] triples.
function entriesOf(node) {
  if (!Array.isArray(node) || node.length < 1) return null;
  if (node.every(looksLikeEntry)) return node.map((o) => ({ text: textOf(o), ...timesOf(o) }));
  if (node.every((x) => tripleOf(x))) return node.map(tripleOf);
  return null;
}

// The shapes tools actually write, looked for by name before any guessing.
// Whatever the file, the words come out in the order they were spoken.
const WORD_KEYS = ['words', 'word_timings', 'wordTimings', 'word_timestamps', 'wordTimestamps', 'tokens', 'alignment', 'items', 'entries'];
const NEST_KEYS = ['result', 'results', 'output', 'data', 'transcript', 'transcription', 'alignment', 'segments', 'chunks', 'items', 'entries'];

function namedWords(node, depth = 0) {
  if (depth > 4 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = namedWords(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of WORD_KEYS) {
    const list = entriesOf(node[key]);
    if (list) return list;
  }
  // Whisper verbose_json: every segment carries its own word list.
  const segs = Array.isArray(node.segments) ? node.segments : Array.isArray(node.chunks) ? node.chunks : null;
  if (segs && segs.length) {
    const parts = segs.map((s) => entriesOf(s && s.words));
    if (parts.every(Boolean) && parts.reduce((n, p) => n + p.length, 0) >= 2) return parts.flat();
  }
  for (const key of NEST_KEYS) {
    if (!(key in node)) continue;
    const hit = namedWords(node[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

export function parseTimestamps(raw, { name = 'timestamps.json' } = {}) {
  let node = raw && typeof raw === 'object' ? raw : null;
  if (node === null) {
    const text = String(raw ?? '');
    try {
      node = JSON.parse(text);
    } catch {
      if (!/-->/.test(text)) {
        throw new StudioError(`${name} is neither JSON nor a subtitle file with cue times ("00:00:01,200 --> 00:00:03,400").`);
      }
      const cues = parseCues(text);
      if (!cues.length) throw new StudioError(`no cues found in ${name}`);
      const words = expandSentences(toWords(cues, null));
      return { words, level: 'segment', shape: 'SRT/VTT cue times', ms: false, cues: cues.length };
    }
  }
  const named = namedWords(node) || entriesOf(node);
  const found = [];
  if (named && named.length >= 2) found.push(named);
  collect(node, found);
  if (!found.length) {
    throw new StudioError(
      `could not find word times in ${name}. Expected a list like [{"word":"hello","start":0.0,"end":0.42}] ` +
        'or a Whisper segments file with words.',
    );
  }
  found.sort((a, b) => b.length - a.length);
  const best = found[0];
  const scaled = scaleMs(toWords(best, null));
  const spaced = scaled.words.filter((w) => /\s/.test(w.text)).length;
  const level = spaced / scaled.words.length > 0.25 ? 'segment' : 'word';
  return {
    words: level === 'segment' ? expandSentences(scaled.words) : scaled.words,
    level,
    shape: level === 'segment' ? 'sentence-level times, split by word length' : 'word-level times',
    ms: scaled.ms,
  };
}

// Sentence-level times (Whisper segments, SRT cues) → word times, split by
// how long each word is. Deterministic, good to about a tenth of a second.
function expandSentences(entries) {
  const out = [];
  for (const e of entries) {
    const parts = String(e.text).split(/\s+/).filter(Boolean);
    const total = Math.max(0.15, (e.end ?? e.start + 0.3) - e.start);
    const weight = parts.map((p) => Math.max(1, p.replace(/[^\p{L}\p{N}]/gu, '').length));
    const sum = weight.reduce((a, b) => a + b, 0) || 1;
    let t = e.start;
    parts.forEach((p, i) => {
      const d = (total * weight[i]) / sum;
      out.push({ text: p, start: t, end: t + d });
      t += d;
    });
  }
  return out;
}

// For the UI: a short, honest description of what was read.
export function summarizeTimestamps(parsed) {
  const words = parsed.words;
  const last = words.length ? words[words.length - 1].end : 0;
  return {
    words: words.length,
    duration: Math.round(last * 100) / 100,
    level: parsed.level,
    shape: parsed.shape,
    ms: parsed.ms,
  };
}
