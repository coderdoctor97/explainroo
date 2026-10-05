// Mixes the soundtrack for one render, off the main thread: a long mix
// blocks the event loop and, done in a browser page, asks headless Chrome
// for ~3GB of peak memory (it crashed on long videos). This worker keeps
// the studio server responsive and the peak near 500MB.
import fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { renderSoundtrack, encodeWav } from '../engine/audio/soundtrack.js';
import { parseWav, toMono } from '../engine/audio/pcm.js';

const { duration, sampleRate, voiceFiles, voiceSpans, music, sfx, scenes, out } = workerData;

try {
  const voice = voiceFiles.map((v) => {
    const buf = fs.readFileSync(v.path);
    const wav = parseWav(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    return { data: toMono(wav.channels), sampleRate: wav.sampleRate, start: v.start };
  });
  const buffer = await renderSoundtrack({
    duration,
    sampleRate,
    voice,
    voiceSpans,
    music,
    sfx,
    scenes,
    onProgress: (p) => parentPort.postMessage({ type: 'progress', p }),
  });
  fs.writeFileSync(out, Buffer.from(encodeWav(buffer)));
  parentPort.postMessage({ type: 'done', cues: sfx.length, duration: buffer.duration });
} catch (e) {
  parentPort.postMessage({ type: 'error', message: e && e.message ? e.message : String(e) });
}
