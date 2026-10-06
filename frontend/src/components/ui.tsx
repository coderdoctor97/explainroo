import { useEffect, useId, useState } from 'react';
import { api } from '../api';

// ---------- Lucide icons, drawn from the repo's own icon set ----------

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const [paths, setPaths] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .icon(name)
      .then((r) => alive && setPaths(r.paths))
      .catch(() => alive && setPaths(null));
    return () => {
      alive = false;
    };
  }, [name]);
  if (!paths) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

// ---------- small controls ----------

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="row" style={{ gap: '0.4rem' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span style={{ fontSize: 'var(--text-sm)' }}>{label}</span>
    </label>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const headingId = useId();
  return (
    <section className="panel" aria-labelledby={headingId}>
      <h3 id={headingId}>{title}</h3>
      {children}
    </section>
  );
}

export function Log({ lines, empty }: { lines: string[]; empty?: string }) {
  return <pre className="log">{lines.length ? lines.join('\n') : empty || ''}</pre>;
}

export function Hang({ title, note, children }: { title: string; note?: string; children?: React.ReactNode }) {
  return (
    <header className="hang">
      <h2>{title}</h2>
      {note && <p>{note}</p>}
      {children}
    </header>
  );
}
