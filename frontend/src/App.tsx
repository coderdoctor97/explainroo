import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fmtTime, type Doctor, type Job, type PlanAnswer, type PlanOptions, type ProjectState, type ProjectSummary, type Studio } from './api';
import { Readout } from './components/Readout';
import { Transport } from './components/Transport';
import { Look } from './stages/Look';
import { Plan } from './stages/Plan';
import { Render } from './stages/Render';
import { Sources } from './stages/Sources';

type Stage = 'sources' | 'plan' | 'look' | 'render';
type JobKind = 'build' | 'check' | 'still' | 'renderDraft' | 'renderVideo';

const STAGES: { id: Stage; name: string }[] = [
  { id: 'sources', name: 'Sources' },
  { id: 'plan', name: 'Scene plan' },
  { id: 'look', name: 'Look' },
  { id: 'render', name: 'Build and render' },
];

export default function App() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [state, setState] = useState<ProjectState | null>(null);
  const [plan, setPlan] = useState<PlanAnswer | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [stage, setStage] = useState<Stage>('sources');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const busy = job?.status === 'running';

  // ---------- loading ----------
  const refresh = useCallback(async (projectId: string, withPlan = true) => {
    const next = await api.state(projectId);
    setState(next);
    if (withPlan && next.status.sources.transcript.ok && next.status.sources.timestamps.ok) {
      setPlan(await api.plan(projectId));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const list = await api.projects();
        setProjects(list.projects);
        const remembered = localStorage.getItem('studio:last');
        const pick = list.projects.find((p) => p.id === remembered) || list.projects[0];
        if (pick) setId(pick.id);
      } catch (e) {
        setError((e as Error).message);
      }
      api.doctor().then(setDoctor).catch(() => setDoctor(null));
    })();
  }, []);

  useEffect(() => {
    if (!id) return;
    setError(null);
    setPlan(null);
    setTime(0);
    setPlaying(false);
    localStorage.setItem('studio:last', id);
    refresh(id).catch((e) => setError((e as Error).message));
    api.latestJob(id).then((j) => j && setJob(j)).catch(() => {});
  }, [id, refresh]);

  // ---------- jobs ----------
  useEffect(() => {
    if (!job || job.status !== 'running' || !id) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.job(job.id);
        setJob(next);
        if (next.status !== 'running') {
          setProjects((await api.projects()).projects);
          await refresh(id);
        }
      } catch (e) {
        setError((e as Error).message);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [job, id, refresh]);

  const run = useCallback(
    async (kind: JobKind) => {
      if (!id) return;
      setError(null);
      try {
        const started =
          kind === 'build'
            ? await api.build(id)
            : kind === 'check'
              ? await api.check(id)
              : kind === 'still'
                ? await api.still(id, [])
                : await api.render(id, { draft: kind === 'renderDraft' });
        setJob(started);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [id],
  );

  const analyze = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setJob(await api.analyze(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  const patch = useCallback(
    async (p: Partial<Studio>) => {
      if (!state) return;
      setState({ ...state, studio: { ...state.studio, ...p, look: { ...state.studio.look, ...p.look }, plan: { ...state.studio.plan, ...p.plan } } });
      try {
        await api.patch(state.id, p);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [state],
  );

  const patchPlan = useCallback((p: Partial<PlanOptions>) => patch({ plan: { ...state!.studio.plan, ...p } }), [patch, state]);

  const afterUpload = useCallback(async () => {
    if (!id) return;
    await refresh(id, false);
    setPlan(null);
  }, [id, refresh]);

  // ---------- playback ----------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const a = audioRef.current;
      if (a) setTime(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seek = useCallback((t: number) => {
    const a = audioRef.current;
    setTime(Math.max(0, t));
    if (a) a.currentTime = Math.max(0, t);
  }, []);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setPlaying(true)).catch((e: Error) => setError(e.message));
    } else {
      a.pause();
      setPlaying(false);
    }
  }, []);

  const currentWord = useMemo(() => {
    if (!plan || !plan.words.length) return null;
    const i = plan.words.findIndex((w) => time >= w.start && time < w.end);
    if (i >= 0) return i;
    // Between words: the next word is the one the playhead is waiting for.
    const next = plan.words.findIndex((w) => w.start > time);
    return next > 0 ? next - 1 : next;
  }, [plan, time]);

  // Space plays and pauses, unless a form control has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const studio = state?.studio;
  const style = state?.styles.find((s) => s.id === studio?.look.style);
  const font = style?.fonts.display;

  const railState: Record<Stage, string> = {
    sources: `${(['transcript', 'timestamps', 'audio'] as const).filter((k) => state?.status.sources[k].ok).length}/3 files`,
    plan: plan ? `${plan.scenes.length} scenes` : 'not read yet',
    look: style ? style.name.split(',')[0] : '—',
    render: state?.status.out?.video ? 'rendered' : state?.status.built ? 'built' : 'not built',
  };

  // ---------- start screen ----------
  if (!id || !state) {
    return (
      <div className="start">
        <h1>explainroo studio</h1>
        <p>
          You bring the words, the word timings and the recording. The studio lines them up, cuts the narration into scenes, writes
          the files explainroo needs and renders the video. No voice model, no speech model, no API keys: the timing you already
          have is the timing you get.
        </p>
        <div className="row" style={{ marginTop: 'var(--space-md)', gap: 'var(--space-2xs)' }}>
          <input
            type="text"
            placeholder="What is the video about?"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const created = await api.create(newName || 'Untitled video');
                setProjects((await api.projects()).projects);
                setId(created.id);
                setNewName('');
              }
            }}
            style={{ maxWidth: '22rem' }}
          />
          <button
            className="btn primary"
            onClick={async () => {
              try {
                const created = await api.create(newName || 'Untitled video');
                setProjects((await api.projects()).projects);
                setId(created.id);
                setNewName('');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Start a video
          </button>
        </div>
        {error && <p className="mono err" style={{ marginTop: 'var(--space-xs)' }}>{error}</p>}
        {projects.length > 0 && (
          <ul className="projects">
            {projects.map((p) => (
              <li key={p.id}>
                <span className="name">{p.name}</span>
                <span className="meta">
                  {p.hasSources}/3 files · {p.built ? 'built' : 'not built'} · {p.rendered ? 'rendered' : 'not rendered'}{' '}
                  <button className="btn quiet small" onClick={() => setId(p.id)}>
                    open
                  </button>
                  <button
                    className="btn quiet small"
                    onClick={async () => {
                      if (!confirm(`Delete "${p.name}" and its files?`)) return;
                      await api.remove(p.id);
                      setProjects((await api.projects()).projects);
                    }}
                  >
                    delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const ready = state.status.sources.audio.ok;

  return (
    <div className="app">
      <header className="masthead">
        <span className="wordmark">
          <b>explainroo</b> <span>studio</span>
        </span>
        <span className="dim">/</span>
        <select
          value={id}
          onChange={(e) => setId(e.target.value)}
          aria-label="video"
          style={{ width: 'auto', maxWidth: '16rem' }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          className="who"
          type="text"
          value={studio?.title || ''}
          placeholder={studio?.name}
          aria-label="video title"
          onChange={(e) => patch({ title: e.target.value })}
          style={{ maxWidth: '16rem', fontSize: 'var(--text-sm)' }}
        />
        <span className="spacer" />
        <button
          className="btn"
          onClick={async () => {
            const name = prompt('What is the new video about?', '');
            if (name === null) return;
            const created = await api.create(name || 'Untitled video');
            setProjects((await api.projects()).projects);
            setId(created.id);
          }}
        >
          New video
        </button>
        <button className="btn primary" onClick={() => run('build')} disabled={!ready || busy} title={ready ? '' : 'upload the voice-over first'}>
          {busy ? 'Working…' : 'Build project'}
        </button>
      </header>

      <div className="bench">
        <nav className="rail" aria-label="steps">
          <h2>Steps</h2>
          <ol>
            {STAGES.map((s) => (
              <li key={s.id}>
                <button aria-current={stage === s.id} onClick={() => setStage(s.id)}>
                  <span
                    className={`dot ${
                      s.id === 'render' && state.status.out?.video ? 'done' : s.id !== 'sources' && railState[s.id] !== 'not read yet' && railState[s.id] !== 'not built' ? 'done' : s.id === 'sources' && railState.sources === '3/3 files' ? 'part' : ''
                    }`}
                  />
                  <span>
                    <span className="name">{s.name}</span>
                    <br />
                    <span className="state">{railState[s.id]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="main">
          {error && (
            <p className="mono err" style={{ marginBottom: 'var(--space-sm)' }}>
              {error}
            </p>
          )}
          {stage === 'sources' && (
            <Sources
              status={state.status}
              plan={plan}
              busy={busy}
              onUpload={async (kind, file) => {
                try {
                  await api.upload(id, kind, file);
                  await afterUpload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
              onRemove={async (kind) => {
                await api.removeSource(id, kind);
                await afterUpload();
              }}
              onAnalyze={analyze}
              onAsset={async (file, name) => {
                try {
                  await api.uploadAsset(id, name, file);
                  await afterUpload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          )}
          {stage === 'plan' && (
            <Plan
              plan={plan}
              status={state.status}
              options={studio!.plan}
              time={time}
              currentWord={currentWord}
              onPatch={patchPlan}
              onAnalyze={analyze}
              onSeek={seek}
              busy={busy}
            />
          )}
          {stage === 'look' && (
            <Look
              look={studio!.look}
              styles={state.styles}
              status={state.status}
              plan={plan}
              planOptions={studio!.plan}
              title={studio!.title}
              time={time}
              onPatch={(l) => patch({ look: { ...studio!.look, ...l } })}
              onTitle={(t) => patch({ title: t })}
            />
          )}
          {stage === 'render' && (
            <Render
              id={id}
              status={state.status}
              studio={studio!}
              job={job}
              doctor={doctor}
              busy={busy}
              run={run}
              onRefresh={() => refresh(id)}
            />
          )}
        </main>

        <aside className="readout">
          <Readout state={state} plan={plan} />
        </aside>
      </div>

      <Transport
        words={plan?.words || []}
        scenes={(plan?.scenes || []).map((s) => ({ id: s.id, start: s.words[0]?.start ?? s.start, end: s.end }))}
        duration={plan?.stats.audioDuration || plan?.stats.duration || 0}
        time={time}
        playing={playing}
        ready={ready}
        font={font}
        onToggle={toggle}
        onSeek={seek}
        onStep={(d) => seek(time + d)}
      />
      <audio
        ref={audioRef}
        src={ready ? api.audioUrl(id) : undefined}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        preload="metadata"
      />
      <span className="visually-hidden" aria-live="polite">
        {job ? `${job.label}: ${job.status}` : ''}
      </span>
    </div>
  );
}

export const fmt = fmtTime;
