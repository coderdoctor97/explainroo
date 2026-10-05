import { useRef, useState, type ReactNode } from 'react';
import { fmtBytes, type Job, type PlanAnswer, type ProjectStatus, type Sources as SourcesInfo } from '../api';
import { Hang, Panel } from '../components/ui';

const SLOTS = [
  {
    kind: 'transcript' as const,
    title: 'transcript.txt',
    what: 'What the voice says, in order.',
    hint: 'plain text, one paragraph per idea',
  },
  {
    kind: 'timestamps' as const,
    title: 'timestamps.json',
    what: 'When every word is spoken.',
    hint: 'word list, Whisper segments, SRT or character alignment',
  },
  {
    kind: 'audio' as const,
    title: 'voiceover.wav',
    what: 'The recording itself.',
    hint: 'WAV, mono or stereo, 16 to 32 bit',
  },
];

function Drop({ slot, info, onUpload, onRemove, busy, extra }: {
  slot: (typeof SLOTS)[number];
  info: SourcesInfo[keyof Omit<SourcesInfo, 'assets'>];
  onUpload: (file: File) => void;
  onRemove: () => void;
  busy: boolean;
  extra?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined | null) => file && onUpload(file);
  return (
    <div
      className={`drop ${over ? 'over' : ''} ${info.ok ? 'filled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files[0]);
      }}
    >
      <div>
        <div className="title">
          {info.ok ? <span className="tick">●</span> : <span className="cross">○</span>} <span className="mono">{slot.title}</span>{' '}
          <span className="dim">{slot.what}</span>
        </div>
        <div className="hint">{info.ok ? `${fmtBytes(info.bytes)} · dropped in` : slot.hint}</div>
      </div>
      <div className="actions">
        <input
          ref={input}
          type="file"
          className="visually-hidden"
          aria-label={`choose ${slot.title}`}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={() => input.current?.click()} disabled={busy}>
          {info.ok ? 'Replace' : 'Choose a file'}
        </button>
        {info.ok && (
          <button className="btn quiet" onClick={onRemove} aria-label={`remove ${slot.title}`}>
            ✕
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

export function Sources({ status, plan, busy, job, onUpload, onRemove, onAnalyze, onMakeTimestamps, onAsset }: {
  status: ProjectStatus;
  plan: PlanAnswer | null;
  busy: boolean;
  job: Job | null;
  onUpload: (kind: 'transcript' | 'timestamps' | 'audio', file: File) => void;
  onRemove: (kind: string) => void;
  onAnalyze: () => void;
  onMakeTimestamps: () => void;
  onAsset: (file: File, name: string) => void;
}) {
  const [assetOver, setAssetOver] = useState(false);
  const assetInput = useRef<HTMLInputElement>(null);
  const have = SLOTS.filter((s) => status.sources[s.kind]?.ok).length;
  const made = job?.kind === 'timestamps' ? job : null;

  return (
    <>
      <Hang title="Sources" note={`${have} of 3 files`} />
      <p className="lede">
        Drop the three files your recorder gave you. Nothing is uploaded anywhere: they are copied into{' '}
        <span className="mono">studio-workspace/</span> on this machine and read there. Bring the timings you already have, or let
        the local speech model listen to the voice-over and make <span className="mono">timestamps.json</span> right here. Either
        way, no API key is used.
      </p>
      <div className="stack">
        {SLOTS.map((slot) => (
          <Drop
            key={slot.kind}
            slot={slot}
            info={status.sources[slot.kind]}
            busy={busy}
            onUpload={(f) => onUpload(slot.kind, f)}
            onRemove={() => onRemove(slot.kind)}
            extra={
              slot.kind === 'timestamps' && status.sources.audio?.ok ? (
                <button
                  className="btn"
                  onClick={onMakeTimestamps}
                  disabled={busy}
                  title="run the local speech model on voiceover.wav"
                >
                  Make from the voice-over
                </button>
              ) : null
            }
          />
        ))}
      </div>
      {made && (made.status === 'running' || made.status === 'error') && (
        <p className="mono dim" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2xs)' }} aria-live="polite">
          {made.status === 'error' ? (
            <span className="err" style={{ color: 'var(--err)' }}>
              {made.error}
            </span>
          ) : (
            made.lines[made.lines.length - 1] || 'listening…'
          )}
        </p>
      )}

      <div className="row" style={{ marginTop: 'var(--space-sm)' }}>
        <button className="btn primary" onClick={onAnalyze} disabled={!status.sources.transcript?.ok || !status.sources.timestamps?.ok || busy}>
          Read the sources
        </button>
        <span className="mono dim">
          {plan ? `${plan.stats.transcriptWords} words · ${plan.stats.duration.toFixed(1)}s · ${plan.stats.shape}` : 'transcript and timings are enough for this step'}
        </span>
      </div>

      <hr className="hr" />

      <Hang title="Images for scenes" note="optional" />
      <p className="lede">
        A scene can carry one image: a screenshot, a diagram, a photo. Name it anything and attach it to a scene on the Plan step.
        If a scene asks for an image that is not here, the build tells you the exact file name it wants.
      </p>
      <div
        className={`drop ${assetOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setAssetOver(true);
        }}
        onDragLeave={() => setAssetOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setAssetOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onAsset(file, file.name);
        }}
      >
        <div>
          <div className="title">Drop images here</div>
          <div className="hint">png, jpg, webp, gif or svg</div>
        </div>
        <div className="actions">
          <input
            ref={assetInput}
            type="file"
            accept="image/*"
            className="visually-hidden"
            aria-label="choose an image"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAsset(file, file.name);
              e.target.value = '';
            }}
          />
          <button className="btn" onClick={() => assetInput.current?.click()}>
            Choose an image
          </button>
        </div>
      </div>
      {status.sources.assets.length > 0 && (
        <ul className="scenes" style={{ marginTop: 'var(--space-xs)' }}>
          {status.sources.assets.map((a) => (
            <li key={a.name} className="mono dim" style={{ fontSize: 'var(--text-xs)' }}>
              {a.name} · {fmtBytes(a.bytes)}
            </li>
          ))}
        </ul>
      )}

      <hr className="hr" />
      <Panel title="What will happen">
        <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: 'var(--text-sm)', color: 'var(--ink-soft)' }}>
          <li>The transcript is cut into scenes at sentence ends, so each scene is one idea.</li>
          <li>Your word times are lined up with the transcript; words that do not match are spread between their neighbours.</li>
          <li>The voice-over is cut into one WAV per scene, and the studio writes <span className="mono">script.md</span>,{' '}
            <span className="mono">scenes.js</span> and <span className="mono">video.json</span> — a normal explainroo project.</li>
          <li>The engine draws the frames and ffmpeg writes the MP4, exactly as it does for a hand-written project.</li>
        </ol>
      </Panel>
    </>
  );
}
