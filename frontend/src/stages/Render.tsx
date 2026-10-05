import { useEffect, useState } from 'react';
import { api, fmtBytes, fmtTime, type Doctor, type Job, type ProjectStatus, type Studio } from '../api';
import { Hang, Log, Panel } from '../components/ui';

type Kind = 'build' | 'check' | 'still' | 'renderDraft' | 'renderVideo';

const STEPS: { kind: Kind; label: string; what: string }[] = [
  { kind: 'build', label: 'Build the project', what: 'writes script.md, scenes.js, video.json and one WAV per scene' },
  { kind: 'check', label: 'Check the drawing', what: 'finds text that is cut off or overlapping (needs Chrome)' },
  { kind: 'still', label: 'Save stills', what: 'one PNG per scene, so you can see the look (needs Chrome)' },
  { kind: 'renderDraft', label: 'Render a draft', what: 'half size, quick, for judging the whole thing (needs ffmpeg)' },
  { kind: 'renderVideo', label: 'Render the video', what: 'out/video.mp4 (needs ffmpeg)' },
];

function JobBlock({ job }: { job: Job }) {
  return (
    <div className="stack" style={{ marginTop: 'var(--space-2xs)' }}>
      <div className="status-line">
        {job.status === 'running' && <span className="pulse" />}
        <span className="mono">
          {job.label} · {job.status}
          {job.status === 'done' && job.endedAt ? ` in ${((job.endedAt - job.startedAt) / 1000).toFixed(1)}s` : ''}
        </span>
      </div>
      <Log lines={job.lines} />
      {job.error && <p className="mono err">{job.error}</p>}
      {job.status === 'error' && job.kind === 'render' && (
        <p className="mono dim">
          The render needs Chrome (to draw) and ffmpeg (to write the file). They are checked above.
        </p>
      )}
    </div>
  );
}

export function Render({ id, status, studio, job, doctor, busy, run, onRefresh }: {
  id: string;
  status: ProjectStatus;
  studio: Studio;
  job: Job | null;
  doctor: Doctor | null;
  busy: boolean;
  run: (kind: Kind) => void;
  onRefresh: () => void;
}) {
  const [files, setFiles] = useState<{ name: string; text: string } | null>(null);
  const [which, setWhich] = useState<'script.md' | 'scenes.js' | 'video.json'>('script.md');

  useEffect(() => {
    let alive = true;
    if (!status.built) return setFiles(null);
    fetch(api.fileUrl(id, which))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${which} is not built yet`))))
      .then((text) => alive && setFiles({ name: which, text }))
      .catch((e: Error) => alive && setFiles({ name: which, text: e.message }));
    return () => {
      alive = false;
    };
  }, [id, which, status.built, status.report?.builtAt]);

  const video = status.out?.video;
  const draft = status.out?.draft;
  const missing = status.report?.missing ?? [];

  return (
    <>
      <Hang title="Build and render" note={studio.look.style} />
      <p className="lede">
        The build writes a normal explainroo project: <span className="mono">video/</span> holds{' '}
        <span className="mono">script.md</span>, <span className="mono">scenes.js</span>, <span className="mono">video.json</span> and
        the per-scene audio. Rendering runs the same engine the command line uses, so{' '}
        <span className="mono">node bin/explainroo.js render video</span> would do exactly the same thing.
      </p>

      <Panel title="Steps">
        <div className="row" style={{ gap: '0.4rem' }}>
          {STEPS.map((s) => (
            <button
              key={s.kind}
              className={`btn ${s.kind === 'renderVideo' ? 'primary' : ''}`}
              disabled={busy}
              title={s.what}
              onClick={() => run(s.kind)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="mono dim" style={{ marginTop: '0.4rem' }}>
          {STEPS.find((s) => s.kind === 'build')?.what}
        </p>
        {missing.length > 0 && (
          <div className="drop over" style={{ marginTop: 'var(--space-xs)' }}>
            <div>
              <div className="title">A scene is waiting for an image</div>
              <div className="hint">
                add {missing.map((m) => <span className="mono" key={m}>{m} </span>)} to <span className="mono">assets/</span> on the
                Sources step (or attach a different one on the Plan step), then build again
              </div>
            </div>
            <div className="actions">
              <button className="btn" onClick={() => run('build')} disabled={busy}>
                Build again
              </button>
            </div>
          </div>
        )}
        {job && <JobBlock job={job} />}
      </Panel>

      <div className="grid-2" style={{ marginTop: 'var(--space-sm)' }}>
        <Panel title="The video">
          {video ? (
            <div className="output stack">
              <video controls src={api.fileUrl(id, 'out/video.mp4')} />
              <p className="mono dim">
                out/video.mp4 · {fmtBytes(video.bytes)} · finished {new Date(video.mtime).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="dim">
              Nothing rendered yet. A draft takes about a minute for a 30 second video on four cores; the final render takes longer.
            </p>
          )}
          {draft && (
            <p className="mono dim" style={{ marginTop: 'var(--space-2xs)' }}>
              draft: out/draft.mp4 · {fmtBytes(draft.bytes)} ·{' '}
              <a href={api.fileUrl(id, 'out/draft.mp4')} download>
                download
              </a>
            </p>
          )}
          {status.stills && status.stills.length > 0 && (
            <>
              <hr className="hr" />
              <div className="stills">
                {status.stills.map((name) => (
                  <figure key={name}>
                    <img src={api.fileUrl(id, `out/stills/${name}`)} alt={`still ${name}`} loading="lazy" />
                    <figcaption>{name.replace(/\.png$/, '')}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel title="This machine">
          {doctor ? (
            <>
              <table className="doctor">
                <tbody>
                  {doctor.rows.map((r) => (
                    <tr key={r.name}>
                      <td className={r.ok ? 'tick' : 'cross'}>{r.ok ? 'ok' : 'missing'}</td>
                      <td>{r.name}</td>
                      <td>{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!doctor.ready && (
                <p className="dim" style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2xs)' }}>
                  Building the project works without these: your words, your timing and your voice are already in the files. Chrome
                  draws the frames and ffmpeg writes the MP4, the same two things the command line needs. Install them, then press
                  Build again.
                </p>
              )}
            </>
          ) : (
            <p className="dim">checking…</p>
          )}
          <hr className="hr" />
          <p className="mono dim">
            {status.report
              ? `last build ${new Date(status.report.builtAt).toLocaleTimeString()} · ${status.report.voiceSeconds.toFixed(1)}s of audio in ${status.report.scenes.length} scenes`
              : 'never built'}
          </p>
          <button className="btn small" onClick={onRefresh} disabled={busy}>
            Refresh the readout
          </button>
        </Panel>
      </div>

      <Panel title="The generated files">
        <div className="row" style={{ gap: '0.4rem' }}>
          {(['script.md', 'scenes.js', 'video.json'] as const).map((f) => (
            <button key={f} className={`btn small ${which === f ? 'on' : ''}`} onClick={() => setWhich(f)}>
              {f}
            </button>
          ))}
          <a className="btn small quiet" href={api.fileUrl(id, which)} download>
            download
          </a>
        </div>
        <Log lines={files ? files.text.split('\n').slice(0, 80) : ['build the project to see these']} />
        <p className="mono dim" style={{ marginTop: '0.4rem' }}>
          This is a real explainroo project: hand it to a coding agent and it can polish scenes.js, add icons or illustrations, or
          render it with the command line. {status.report ? `Built ${fmtTime((Date.now() - status.report.builtAt) / 1000)} ago.` : ''}
        </p>
      </Panel>
    </>
  );
}
