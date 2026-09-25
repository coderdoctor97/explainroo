// Aligns the words we asked the voice model to say with the words Whisper
// heard, so every script word gets a start and end time.
import { normWord } from './script.js';

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000',
};

function canon(w) {
  const n = normWord(w).replace(/,/g, '');
  return NUMBER_WORDS[n] ?? n;
}

// "example.com" and "1.1.1.1" are spoken as words joined by "dot"; Whisper
// writes them with dots. Expand both sides the same way.
function expand(word) {
  const n = canon(word);
  // Whisper splits "1.1.1.1" into "1", ".1", ".1", ".1": a leading dot is a spoken "dot".
  const lead = /^\s*\.[a-z0-9]/i.test(String(word)) ? ['dot'] : [];
  if (!/[a-z0-9]\.[a-z0-9]/.test(n)) return n ? [...lead, n] : lead;
  const parts = n.split('.').filter(Boolean).map((p) => NUMBER_WORDS[p] ?? p);
  const out = [...lead];
  parts.forEach((p, i) => {
    if (i) out.push('dot');
    out.push(p);
  });
  return out;
}

function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function similar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len <= 3) return false;
  return editDistance(a, b) / len <= 0.34;
}

// words: [{ spoken }] in order. heard: [{ text, start, end }] from Whisper.
// Returns per-word { start, end, matched } and the share of spoken tokens matched.
export function alignWords(words, heard, duration) {
  const tokens = [];
  words.forEach((w, wi) => {
    const parts = String(w.spoken).split(/\s+/).flatMap(expand);
    (parts.length ? parts : ['']).forEach((p, k) => tokens.push({ wi, norm: p, first: k === 0, last: k === parts.length - 1 || !parts.length }));
  });
  const H = [];
  for (const h of heard) {
    const parts = expand(h.text);
    const step = (h.end - h.start) / Math.max(1, parts.length);
    parts.forEach((p, k) => H.push({ text: p, norm: p, start: h.start + k * step, end: h.start + (k + 1) * step }));
  }
  const T = tokens.length;
  const N = H.length;

  // Dynamic programming over (token i, heard j). Moves:
  //  match 1:1, skip a token, skip a heard word, a whole multi-token word to one
  //  heard word ("D N S" vs "DNS"), and one token to two heard words.
  const INF = 1e9;
  const cost = Array.from({ length: T + 1 }, () => new Float64Array(N + 1).fill(INF));
  const move = Array.from({ length: T + 1 }, () => new Int8Array(N + 1));
  cost[0][0] = 0;
  const groupEnd = new Int32Array(T);
  for (let i = 0; i < T; i++) {
    let e = i;
    while (e + 1 < T && tokens[e + 1].wi === tokens[i].wi) e++;
    groupEnd[i] = e;
  }
  for (let i = 0; i <= T; i++) {
    for (let j = 0; j <= N; j++) {
      const c = cost[i][j];
      if (c >= INF) continue;
      if (i < T && c + 1 < cost[i + 1][j]) { cost[i + 1][j] = c + 1; move[i + 1][j] = 2; }
      if (j < N && c + 1 < cost[i][j + 1]) { cost[i][j + 1] = c + 1; move[i][j + 1] = 3; }
      if (i < T && j < N) {
        const ok = similar(tokens[i].norm, H[j].norm);
        const v = c + (ok ? 0 : 1.6);
        if (v < cost[i + 1][j + 1]) { cost[i + 1][j + 1] = v; move[i + 1][j + 1] = ok ? 1 : 4; }
      }
      if (i < T && j < N && tokens[i].first && groupEnd[i] > i) {
        const e = groupEnd[i];
        const joined = tokens.slice(i, e + 1).map((t) => t.norm).join('');
        if (similar(joined, H[j].norm) && c < cost[e + 1][j + 1]) { cost[e + 1][j + 1] = c; move[e + 1][j + 1] = 5; }
      }
      if (i < T && j + 1 < N && similar(tokens[i].norm, H[j].norm + H[j + 1].norm) && c < cost[i + 1][j + 2]) {
        cost[i + 1][j + 2] = c;
        move[i + 1][j + 2] = 6;
      }
    }
  }

  const spans = words.map(() => null);
  const add = (wi, s, e) => {
    const cur = spans[wi];
    spans[wi] = cur ? { start: Math.min(cur.start, s), end: Math.max(cur.end, e) } : { start: s, end: e };
  };
  let matched = 0;
  let i = T;
  let j = N;
  while (i > 0 || j > 0) {
    const m = move[i][j];
    if (m === 1) { add(tokens[i - 1].wi, H[j - 1].start, H[j - 1].end); matched++; i--; j--; }
    else if (m === 4) { i--; j--; }
    else if (m === 2) { i--; }
    else if (m === 3) { j--; }
    else if (m === 5) {
      let s = i - 1;
      while (s > 0 && tokens[s - 1].wi === tokens[i - 1].wi) s--;
      add(tokens[i - 1].wi, H[j - 1].start, H[j - 1].end);
      matched += i - s;
      i = s;
      j--;
    } else if (m === 6) { add(tokens[i - 1].wi, H[j - 2].start, H[j - 1].end); matched++; i--; j -= 2; }
    else break;
  }

  // Interpolate words Whisper did not confirm, by character length, between
  // the nearest confirmed neighbours.
  const out = words.map((w, wi) => ({ start: 0, end: 0, matched: !!spans[wi] }));
  const weight = words.map((w) => Math.max(1, String(w.spoken).length));
  let k = 0;
  while (k < words.length) {
    if (spans[k]) {
      out[k].start = spans[k].start;
      out[k].end = Math.max(spans[k].end, spans[k].start + 0.05);
      k++;
      continue;
    }
    let e = k;
    while (e < words.length && !spans[e]) e++;
    const from = k > 0 ? out[k - 1].end : 0;
    const to = e < words.length ? spans[e].start : duration;
    const total = weight.slice(k, e).reduce((a, b) => a + b, 0);
    let t = from;
    for (let q = k; q < e; q++) {
      const d = ((to - from) * weight[q]) / total;
      out[q].start = t;
      out[q].end = t + d;
      t += d;
    }
    k = e;
  }
  // Keep times monotonic.
  for (let q = 1; q < out.length; q++) {
    if (out[q].start < out[q - 1].start) out[q].start = out[q - 1].start;
    if (out[q].end < out[q].start) out[q].end = out[q].start + 0.05;
  }
  return { words: out, matchRate: T ? matched / T : 1 };
}
