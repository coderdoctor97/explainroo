import { useMemo } from 'react';
import type { Look as LookSettings, PlanAnswer, PlanOptions, ProjectStatus, Style } from '../api';
import { Frame } from '../components/Frame';
import { Hang, Panel, Seg, Toggle } from '../components/ui';

const LAYOUTS: [LookSettings['layout'], string][] = [
  ['sync', 'Word by word'],
  ['cards', 'Cards'],
  ['poster', 'Poster'],
];

const CAPTIONS: [string, string][] = [
  ['auto', 'Auto'],
  ['true', 'On'],
  ['false', 'Off'],
];

export function Look({ look, styles, status, plan, planOptions, title, time, onPatch, onTitle }: {
  look: LookSettings;
  styles: Style[];
  status: ProjectStatus;
  plan: PlanAnswer | null;
  planOptions: PlanOptions;
  title: string;
  time: number;
  onPatch: (look: Partial<LookSettings>) => void;
  onTitle: (title: string) => void;
}) {
  const style = styles.find((s) => s.id === look.style) || styles[0];
  const sceneAt = useMemo(() => {
    if (!plan) return null;
    return plan.scenes.find((s) => time >= s.start - 0.01 && time < s.end) || plan.scenes[0] || null;
  }, [plan, time]);

  if (!style) return null;

  return (
    <>
      <Hang title="Look" note={style.name} />
      <p className="lede">
        The look changes the whole video: colours, fonts, how lines are drawn, how scenes change and what the music sounds like. All
        five come from explainroo itself, so a video made here matches one made by hand.
      </p>

      <Panel title="Style">
        <div className="row" style={{ gap: 'var(--space-sm)', alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: '1 1 18rem' }}>
            <span>dropdown · the video's look</span>
            <select aria-label="look style" value={look.style} onChange={(e) => onPatch({ style: e.target.value })}>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.fits}
                </option>
              ))}
            </select>
          </label>
          <div className="swatches" aria-hidden="true">
            {[style.swatch.bg, style.swatch.ink, style.swatch.muted, style.swatch.accent].map((c) => (
              <span key={c} className="swatch" style={{ background: c }} />
            ))}
          </div>
        </div>
        <p className="mono dim" style={{ marginTop: '0.4rem' }}>
          {style.blurb} Scene changes: {look.transition === 'auto' ? style.transition : look.transition}. Music:{' '}
          {look.music ? style.music : 'off'}. Type: {style.fonts.display} + {style.fonts.body}.
        </p>
      </Panel>

      <div className="grid-2" style={{ marginTop: 'var(--space-sm)' }}>
        <Panel title="What each scene shows">
          <Seg value={look.layout} options={LAYOUTS} onChange={(v) => onPatch({ layout: v })} label="scene layout" />
          <p className="dim" style={{ fontSize: 'var(--text-sm)', marginTop: '0.4rem' }}>
            {look.layout === 'sync'
              ? 'The narration itself appears, word by word, on the exact words you uploaded. Needs no images at all.'
              : look.layout === 'cards'
                ? 'The key words of each scene arrive as cards while the voice talks about them.'
                : 'One big line and one number per scene. Quiet and typographic.'}
          </p>
        </Panel>

        <Panel title="Title and captions">
          <label className="field">
            <span>title (also the video's name)</span>
            <input type="text" aria-label="video title" value={title} onChange={(e) => onTitle(e.target.value)} placeholder="How DNS finds a website" />
          </label>
          <div className="row" style={{ marginTop: 'var(--space-2xs)', gap: 'var(--space-sm)' }}>
            <div>
              <div className="mono dim" style={{ marginBottom: '0.2rem' }}>
                captions
              </div>
              <Seg
                value={String(look.captions)}
                options={CAPTIONS}
                onChange={(v) => onPatch({ captions: v === 'auto' ? 'auto' : v === 'true' })}
                label="captions"
              />
            </div>
            <div>
              <div className="mono dim" style={{ marginBottom: '0.2rem' }}>
                music
              </div>
              <Toggle checked={look.music} onChange={(v) => onPatch({ music: v })} label={look.music ? 'on' : 'off'} />
            </div>
          </div>
          <p className="dim" style={{ fontSize: 'var(--text-xs)', marginTop: '0.4rem' }}>
            Captions are burned in at the bottom for vertical and square videos when they are on Auto.
          </p>
        </Panel>
      </div>

      <div className="grid-2" style={{ marginTop: 'var(--space-sm)' }}>
        <Panel title="Frame">
          <div className="look-preview">
            <Frame
              style={style}
              scene={sceneAt}
              layout={look.layout}
              index={sceneAt?.index || 0}
              total={plan?.scenes.length || 1}
              title={title}
              />
            <p className="mono dim">
              A rough frame in the video's colours and fonts, not a render. Press “Save stills” on the Render step for real frames.
            </p>
          </div>
        </Panel>

        <Panel title="Format and pace">
          <div className="row" style={{ gap: 'var(--space-sm)' }}>
            <label className="field" style={{ flex: '1 1 10rem' }}>
              <span>size</span>
              <select aria-label="video size" value={look.size} onChange={(e) => onPatch({ size: e.target.value })}>
                {['youtube', '16:9', 'shorts', 'tiktok', 'reels', 'vertical', 'instagram', 'linkedin', 'square', '9:16', '4:5', '1:1'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 10rem' }}>
              <span>scene changes</span>
              <select aria-label="scene change" value={look.transition} onChange={(e) => onPatch({ transition: e.target.value })}>
                <option value="auto">auto (the look's own)</option>
                {['fade', 'slide', 'wipe', 'zoom', 'brush', 'cut'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 'var(--space-2xs)' }}>
            <span>pace · {look.pace.toFixed(2)}× (animations and pauses, not the voice)</span>
            <input
              type="range"
              aria-label="pace"
              min={0.7}
              max={1.6}
              step={0.05}
              value={look.pace}
              onChange={(e) => onPatch({ pace: Number(e.target.value) })}
            />
          </label>
          <Toggle checked={look.watermark} onChange={(v) => onPatch({ watermark: v })} label="keep the explainroo.com watermark" />
          <details style={{ marginTop: 'var(--space-2xs)' }}>
            <summary className="mono dim" style={{ cursor: 'pointer', fontSize: 'var(--text-xs)' }}>
              timing around the voice
            </summary>
            <div className="row" style={{ gap: 'var(--space-sm)', marginTop: 'var(--space-2xs)' }}>
              {(
                [
                  ['lead', 'silence before the voice', 0, 2],
                  ['hold', 'silence after the voice', 0, 4],
                  ['end', 'extra at the end', 0, 6],
                ] as [keyof LookSettings, string, number, number][]
              ).map(([key, label, min, max]) => (
                <label key={String(key)} className="field" style={{ flex: '1 1 8rem' }}>
                  <span>
                    {label} · {String(look[key])}s
                  </span>
                  <input
                    type="range"
                    aria-label={String(key)}
                    min={min}
                    max={max}
                    step={0.05}
                    value={Number(look[key])}
                    onChange={(e) => onPatch({ [key]: Number(e.target.value) } as Partial<LookSettings>)}
                  />
                </label>
              ))}
            </div>
          </details>
          <p className="mono dim" style={{ marginTop: 'var(--space-2xs)' }}>
            {status.report ? `last build: ${status.report.scenes.length} scenes · ${status.report.duration.toFixed(1)}s` : 'not built yet'}
            {plan ? ` · ${planOptions.strategy} split · ${plan.stats.audioDuration?.toFixed(1) ?? '?'}s of audio` : ''}
          </p>
        </Panel>
      </div>
    </>
  );
}
