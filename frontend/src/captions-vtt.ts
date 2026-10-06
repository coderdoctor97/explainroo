// Generate WebVTT caption text from the studio's word timings.
//
// The engine burns captions into the video frames (engine/captions.js), so
// the MP4 already shows the words as they are spoken. But a <video> element
// also needs a <track kind="captions"> for screen readers and for viewers
// who turn the player's own captions on. This module turns the same words
// the engine already phrases into WebVTT cues, one cue per phrase.
//
// The phrasing is the same logic the Transport uses for the karaoke line:
// break at a long pause, at a sentence end, or when the line gets too long.

import type { Word } from './api';

export type Phrase = {
  start: number;
  end: number;
  text: string;
};

const FMT = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

// Group words into phrases the way a viewer would read them. Each phrase
// becomes one WebVTT cue.
export function buildPhrases(words: Word[], maxChars = 88): Phrase[] {
  const out: Phrase[] = [];
  let cur: { words: Word[]; start: number; end: number } | null = null;

  const flush = () => {
    if (cur && cur.words.length) {
      out.push({
        start: cur.start,
        end: cur.end,
        text: cur.words.map((w) => w.display).join(' '),
      });
    }
    cur = null;
  };

  words.forEach((w, i) => {
    if (cur) {
      const length = cur.words.reduce((n, x) => n + x.display.length + 1, 0) + w.display.length;
      const gap = w.start - cur.end;
      const prev = cur.words[cur.words.length - 1];
      const ends = /[.!?;:]["''")]*$/.test(prev.display);
      if (length > maxChars || gap > 0.55 || ends) flush();
    }
    if (!cur) cur = { words: [w], start: w.start, end: w.end };
    else {
      cur.words.push(w);
      cur.end = w.end;
    }
  });
  flush();
  return out;
}

// One WebVTT document, ready to serve as a caption track. Each phrase is a
// cue; cues are numbered; the header is the standard WEBVTT with no metadata.
export function vttFromPhrases(phrases: Phrase[]): string {
  const lines = ['WEBVTT', ''];
  phrases.forEach((p, i) => {
    lines.push(String(i + 1));
    lines.push(`${FMT(p.start)} --> ${FMT(p.end)}`);
    lines.push(p.text);
    lines.push('');
  });
  return lines.join('\n');
}

// Full transcript as plain text: every phrase on its own line, the way a
// viewer reads a transcript alongside the video.
export function transcriptFromPhrases(phrases: Phrase[]): string {
  return phrases.map((p) => p.text).join('\n');
}
