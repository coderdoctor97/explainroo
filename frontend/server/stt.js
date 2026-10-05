// Makes the timings slot from the project's own voice-over, the same way the
// command line makes word times: read the WAV, resample it to 16 kHz, and let
// the local speech model hear every word and when it was said. The result is
// written as timestamps.json, so a made file and an uploaded file go through
// the same parser and the same plan.
//
// No API key and no separate program: the model is the one explainroo already
// uses for its speech check (see src/models.js), cached under
// ~/.cache/explainroo/models and downloaded there on first use.
import fs from 'node:fs';
import { readWav, resample } from '../../src/wav.js';
import { ASR_MODEL, transcribeWords } from '../../src/models.js';
import { parseTimestamps } from './timestamps.js';
import { StudioError, sourcePath, writeSource } from './store.js';

const round = (n) => Math.round(n * 1000) / 1000;

// Reads source/voiceover.wav, writes source/timestamps.json and returns a
// short summary for the job log. log() gets the same lines the command line
// prints, including the model download on the first run.
export async function makeTimestamps(id, log = () => {}) {
  const file = sourcePath(id, 'audio');
  if (!fs.existsSync(file)) throw new StudioError('upload the voice-over (voiceover.wav) first', 400);
  let wav;
  try {
    wav = readWav(file);
  } catch (e) {
    throw new StudioError(`${e && e.message ? e.message : e}; the voice-over slot takes a WAV file`, 400);
  }
  if (!wav.samples.length) throw new StudioError('the voice-over has no audio in it', 400);

  log(`listening to ${(wav.samples.length / wav.sampleRate).toFixed(1)}s of audio with ${ASR_MODEL}`);
  const heard = await transcribeWords(resample(wav.samples, wav.sampleRate, 16000), { log });
  const words = (heard.words || []).filter((w) => w.text && Number.isFinite(w.start));
  if (!words.length) throw new StudioError('the model heard no words in this recording', 400);

  const body = {
    text: heard.text,
    model: ASR_MODEL,
    words: words.map((w) => ({ word: w.text, start: round(w.start), end: round(Math.max(w.end, w.start + 0.01)) })),
  };
  const json = `${JSON.stringify(body, null, 2)}\n`;
  // Read back what we are about to write: the file has to be one this studio
  // can plan from, or the next step would be where the problem shows up.
  const parsed = parseTimestamps(json, { name: 'timestamps.json' });
  writeSource(id, 'timestamps', Buffer.from(json, 'utf8'));

  const seconds = body.words[body.words.length - 1].end;
  log(`${words.length} words over ${seconds.toFixed(1)}s, ${parsed.level}-level times`);
  return { words: words.length, duration: round(seconds), level: parsed.level, model: ASR_MODEL };
}
