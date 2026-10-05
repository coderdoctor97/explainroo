import { fmtTime, type Word } from '../api';

export type SceneSpan = { id: string; start: number; end: number };

// Groups the words into the phrases a viewer would read: a new phrase at a
// long pause, a sentence end, or when the line gets too long.
export function phrases(words: Word[], maxChars = 88): { start: number; end: number; from: number; to: number }[] {
  const out: { start: number; end: number; from: number; to: number }[] = [];
  let cur: { start: number; end: number; from: number; to: number } | null = null;
  words.forEach((w, i) => {
    if (cur) {
      const length = words.slice(cur.from, i + 1).reduce((n, x) => n + x.display.length + 1, 0);
      const gap = w.start - cur.end;
      const ends = /[.!?;:]["'’)]*$/.test(words[i - 1]?.display || '');
      if (length > maxChars || gap > 0.55 || ends) {
        out.push(cur);
        cur = null;
      }
    }
    if (!cur) cur = { start: w.start, end: w.end, from: i, to: i + 1 };
    else {
      cur.end = w.end;
      cur.to = i + 1;
    }
  });
  if (cur) out.push(cur);
  return out;
}

export function wordAt(words: Word[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].end < t) lo = mid + 1;
    else if (words[mid].start > t) hi = mid - 1;
    else return mid;
  }
  return Math.min(Math.max(lo, 0), words.length - 1);
}

type Props = {
  words: Word[];
  scenes: SceneSpan[];
  duration: number;
  time: number;
  playing: boolean;
  ready: boolean;
  font?: string;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onStep: (delta: number) => void;
};

export function Transport({ words, scenes, duration, time, playing, ready, font, onToggle, onSeek, onStep }: Props) {
  const all = phrases(words);
  const current = all.find((p) => time >= p.start - 0.05 && time < p.end + 0.35) || null;
  const active = ready && words.length ? wordAt(words, time) : -1;
  const scene = scenes.find((s) => time >= s.start - 0.01 && time < s.end) || scenes[scenes.length - 1] || null;
  const length = duration || (words.length ? words[words.length - 1].end + 0.5 : 1);
  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / length) * 100))}%`;

  return (
    <div className="transport">
      <div className="line">
        <div className="row" style={{ gap: '0.35rem' }}>
          <button className="btn primary" onClick={onToggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❙❙ Pause' : '▶ Play'}
          </button>
          <button className="btn quiet" onClick={() => onStep(-2)} disabled={!ready} aria-label="Back two seconds">
            ◀ 2s
          </button>
          <button className="btn quiet" onClick={() => onStep(2)} disabled={!ready} aria-label="Forward two seconds">
            2s ▶
          </button>
        </div>
        <div className="scrub">
          <div className="track" />
          <div className="fill" style={{ width: pct(time) }} />
          {scenes.map((s) => (
            <div key={s.id} className="tick" style={{ left: pct(s.start) }} title={s.id} />
          ))}
          <div className="cursor" style={{ left: pct(time) }} />
          <input
            type="range"
            min={0}
            max={Math.max(0.1, length)}
            step={0.05}
            value={Math.min(time, length)}
            disabled={!ready}
            aria-label="Voice-over position"
            onChange={(e) => onSeek(Number(e.target.value))}
          />
        </div>
        <div className="time mono nowrap">
          {scene ? `${scene.id} · ` : ''}
          {fmtTime(time)} / {fmtTime(length)}
        </div>
      </div>
      <div className="karaoke" style={font ? { fontFamily: `"${font}", var(--font-body)` } : undefined}>
        {current ? (
          <>
            {words.slice(current.from, current.to).map((w, i) => {
              const idx = current.from + i;
              const said = idx < active;
              const now = idx === active;
              return (
                <span key={idx} style={{ opacity: said ? 0.45 : 1 }}>
                  {now ? <b>{w.display}</b> : w.display}{' '}
                </span>
              );
            })}
          </>
        ) : (
          <span className="dim">{ready ? 'press play to hear the words light up' : 'upload the three files to hear the words light up'}</span>
        )}
      </div>
    </div>
  );
}
