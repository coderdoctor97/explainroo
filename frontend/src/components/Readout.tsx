import { fmtBytes, fmtTime, type PlanAnswer, type ProjectState } from '../api';

function Row({ k, v, cls }: { k: string; v: string; cls?: string }) {
  return (
    <>
      <dt>{k}</dt>
      <dd className={cls}>{v}</dd>
    </>
  );
}

export function Readout({ state, plan }: { state: ProjectState; plan: PlanAnswer | null }) {
  const { status, studio } = state;
  const report = status.report;
  const files = Object.values(status.sources);
  const uploaded = (['transcript', 'timestamps', 'audio'] as const).filter((k) => status.sources[k].ok).length;
  const missing = report?.missing ?? [];
  const warnings = [...(plan?.warnings ?? []), ...(report?.warnings ?? [])].filter((w, i, a) => a.indexOf(w) === i);

  return (
    <>
      <h2>Readout</h2>
      <dl>
        <Row k="files" v={`${uploaded} / 3`} cls={uploaded === 3 ? 'tick' : undefined} />
        <Row k="images" v={String(status.sources.assets.length)} />
        {plan && <Row k="scenes" v={String(plan.scenes.length)} />}
        {plan && <Row k="narration" v={fmtTime(plan.stats.duration)} />}
        {plan && <Row k="words" v={`${plan.stats.transcriptWords}`} />}
        {plan && <Row k="confirmed" v={`${Math.round(plan.stats.matchRate * 100)}%`} cls={plan.stats.matchRate < 0.97 ? 'warn' : undefined} />}
        {plan?.stats.audioDuration != null && <Row k="audio" v={fmtTime(plan.stats.audioDuration)} />}
        <Row k="look" v={studio.look.style} />
        <Row k="size" v={studio.look.size} />
        <Row k="built" v={status.built ? 'yes' : 'no'} cls={status.built ? 'tick' : undefined} />
        {status.voice && <Row k="scene audio" v={`${status.voice.wavs} wav`} />}
        {report && <Row k="project" v={fmtTime(report.duration)} />}
        {status.out?.video && <Row k="video" v={fmtBytes(status.out.video.bytes)} cls="tick" />}
        {status.out?.draft && <Row k="draft" v={fmtBytes(status.out.draft.bytes)} />}
        {plan?.stats.level === 'segment' && <Row k="timings" v="sentence level" cls="warn" />}
      </dl>

      {missing.length > 0 && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <h2>Waiting for</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {missing.map((m) => (
              <li key={m} className="mono err" style={{ fontSize: 'var(--text-xs)' }}>
                {m} — attach it on the Sources or Plan step
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <h2>Worth knowing</h2>
          <ul>
            {warnings.slice(0, 4).map((w) => (
              <li key={w} className="warn" style={{ fontSize: 'var(--text-xs)' }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Where it lives</h2>
      <p className="mono dim" style={{ fontSize: 'var(--text-xs)', wordBreak: 'break-word' }}>
        studio-workspace/projects/{state.id}/video
      </p>
      {files.length ? null : null}
      <p className="dim" style={{ fontSize: 'var(--text-xs)' }}>
        This folder is a normal explainroo project. Nothing is sent anywhere: the audio, the timings and the words stay on this
        machine.
      </p>
    </>
  );
}
