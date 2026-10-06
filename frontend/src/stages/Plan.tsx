import { useState } from 'react';
import { ScenePlanForm } from '../components/ScenePlanForm';
import { fmtTime, type PlanAnswer, type PlanOptions, type ProjectStatus, type Scene } from '../api';
import { Hang, Icon, Panel, Seg } from '../components/ui';

const STRATEGIES: [PlanOptions['strategy'], string][] = [
  ['sentences', 'Sentences'],
  ['paragraphs', 'Paragraphs'],
  ['fixed', 'Every N words'],
];

function ChipEditor({ scene, onSet, onReset, edited }: { scene: Scene; onSet: (words: string[]) => void; onReset: () => void; edited: boolean }) {
  const [draft, setDraft] = useState('');
  const words = scene.chips.map((c) => c.word);
  const add = () => {
    const w = draft.trim().toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, '');
    if (!w) return setDraft('');
    if (!words.includes(w)) onSet([...words, w]);
    setDraft('');
  };
  return (
    <div className="chips">
      {scene.chips.map((c) => (
        <span className="chip" key={c.word}>
          {c.icon && <Icon name={c.icon} size={13} />}
          {c.word}
          <button onClick={() => onSet(words.filter((w) => w !== c.word))} aria-label={`remove ${c.word}`}>
            ✕
          </button>
        </span>
      ))}
      {edited && (
        <button className="btn small quiet" onClick={onReset} title="back to the automatic words">
          auto
        </button>
      )}
      <span className="chip add">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
            if (e.key === 'Escape') setDraft('');
          }}
          placeholder="add a word"
          aria-label={`add a word to scene ${scene.id}`}
          style={{ border: 0, background: 'none', width: '6.5rem', padding: 0, fontSize: 'var(--text-xs)' }}
        />
        {draft && (
          <button onClick={add} aria-label="add">
            ⏎
          </button>
        )}
      </span>
    </div>
  );
}

function SceneRow({ scene, current, status, options, onPatch, onSeek, splitIndex }: {
  scene: Scene;
  current: boolean;
  status: ProjectStatus;
  options: PlanOptions;
  onPatch: (plan: Partial<PlanOptions>) => void;
  onSeek: (t: number) => void;
  splitIndex: number | null;
}) {
  const [open, setOpen] = useState(false);
  const haveAssets = status.sources.assets.map((a) => a.name);
  const missing = scene.asset && !haveAssets.includes(scene.asset);
  const setHeading = (value: string) => onPatch({ headings: { [scene.id]: value } });
  const resetHeading = () => onPatch({ headings: { [scene.id]: null } });
  const setKeywords = (words: string[]) => onPatch({ keywords: { [scene.id]: words } });
  const setAsset = (name: string | null) => onPatch({ assets: { [scene.id]: name } });

  return (
    <li className={`scene ${current ? 'current' : ''}`}>
      <div className="top">
        <span className="id">{scene.id}</span>
        <input
          type="text"
          value={scene.heading}
          aria-label={`heading of ${scene.id}`}
          onChange={(e) => setHeading(e.target.value)}
        />
        {scene.headingEdited ? (
          <button className="btn small quiet" onClick={resetHeading} title="back to the automatic heading">
            auto
          </button>
        ) : null}
        <span className="meta nowrap">
          {fmtTime(scene.seconds)} · {scene.words.length} words
          {scene.unmatched ? ` · ${scene.unmatched} unconfirmed` : ''}
        </span>
      </div>

      <div
        className="text"
        style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: open ? 99 : 2, WebkitBoxOrient: 'vertical' }}
      >
        {scene.text}
      </div>

      <div className="row" style={{ marginTop: '0.35rem' }}>
        <button className="btn small quiet" onClick={() => onSeek(Math.max(0, (scene.words[0]?.start ?? scene.start) - 0.2))}>
          ▶ play from here
        </button>
        <button className="btn small quiet" onClick={() => setOpen(!open)}>
          {open ? 'Shorten' : 'Show all'}
        </button>
        <button
          className="btn small"
          disabled={splitIndex === null}
          title={splitIndex === null ? 'put the player inside this scene first' : `cut at word ${splitIndex}`}
          onClick={() =>
            splitIndex !== null &&
            onPatch({ cuts: [...options.cuts, splitIndex], merges: options.merges.filter((m) => m !== splitIndex) })
          }
        >
          ✂ split at playhead
        </button>
        <button className="btn small" disabled={scene.index === 0} onClick={() => onPatch({ merges: [...options.merges, scene.from] })}>
          ⇡ merge with the one before
        </button>
      </div>

      <ChipEditor
        scene={scene}
        onSet={setKeywords}
        onReset={() => onPatch({ keywords: { [scene.id]: null } })}
        edited={Object.prototype.hasOwnProperty.call(options.keywords, scene.id)}
      />

      <div className="row" style={{ gap: '0.4rem' }}>
        <span className="mono dim">image</span>
        <select
          value={scene.asset || ''}
          onChange={(e) => setAsset(e.target.value || null)}
          aria-label={`image for ${scene.id}`}
          style={{ width: 'auto', minWidth: '9rem', fontSize: 'var(--text-xs)' }}
        >
          <option value="">none</option>
          {haveAssets.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {missing && <span className="mono err">waiting for {scene.asset}</span>}
        {open && (
          <span className="mono dim">
            words {scene.from + 1}–{scene.to}
          </span>
        )}
      </div>
    </li>
  );
}

export function Plan({ plan, status, options, time, currentWord, onPatch, onAnalyze, onReplan, onSeek, busy }: {
  plan: PlanAnswer | null;
  status: ProjectStatus;
  options: PlanOptions;
  time: number;
  currentWord: number | null;
  onPatch: (plan: Partial<PlanOptions>) => void;
  onAnalyze: () => void;
  onReplan: (values: Pick<PlanOptions, 'wordsPerScene' | 'maxSceneSeconds'>) => Promise<void>;
  onSeek: (t: number) => void;
  busy: boolean;
}) {
  const current = plan?.scenes.find((s) => time >= s.start - 0.01 && time < s.end) || null;

  if (!plan) {
    return (
      <>
        <Hang title="Scene plan" />
        <p className="lede">
          Upload the transcript and the timings on the Sources step, then read them. The plan appears here: one scene per idea, each
          with its heading, its key words and its moment in the recording.
        </p>
        <div className="row">
          <button className="btn primary" onClick={onAnalyze} disabled={busy || !status.sources.transcript?.ok || !status.sources.timestamps?.ok}>
            Read the sources
          </button>
          <span className="mono dim">needs transcript.txt and timings.json</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Hang
        title="Scene plan"
        note={`${plan.scenes.length} scenes · ${fmtTime(plan.stats.duration)} · ${Math.round(plan.stats.matchRate * 100)}% of words confirmed`}
      />
      <p className="lede">
        Every piece of this is yours: rename a scene, change its key words, split it where the player stands, merge it back into the
        one before. The build writes the files again from this plan, so nothing here is lost on a refresh.
      </p>

      <Panel title="How the transcript is cut">
        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <Seg value={options.strategy} options={STRATEGIES} onChange={(v) => onPatch({ strategy: v })} label="scene split" />
        </div>
        <ScenePlanForm options={options} busy={busy} onSubmit={onReplan} />
        <p className="mono dim" style={{ marginTop: '0.4rem' }}>
          {options.cuts.length} hand-made cut{options.cuts.length === 1 ? '' : 's'} · {options.merges.length} merge
          {options.merges.length === 1 ? '' : 's'}
        </p>
      </Panel>

      <ol className="scenes" style={{ marginTop: 'var(--space-sm)' }}>
        {plan.scenes.map((scene) => (
          <SceneRow
            key={scene.id}
            scene={scene}
            current={current?.id === scene.id}
            status={status}
            options={options}
            onPatch={onPatch}
            onSeek={onSeek}
            splitIndex={current?.id === scene.id && currentWord !== null && currentWord > scene.from ? currentWord : null}
          />
        ))}
      </ol>
      {plan.warnings.length > 0 && (
        <ul className="readout" style={{ marginTop: 'var(--space-xs)', padding: 0 }}>
          {plan.warnings.map((w) => (
            <li key={w} className="mono warn" style={{ listStyle: 'none', fontSize: 'var(--text-xs)' }}>
              {w}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
