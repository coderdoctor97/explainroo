import { useEffect, useId, useRef } from 'react';

export type FieldError = { id: string; label: string; message: string };

export function ErrorSummary({ errors, serverError, attempt }: { errors: FieldError[]; serverError?: string; attempt: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => { if (attempt) ref.current?.focus(); }, [attempt]);
  if (!errors.length && !serverError) return null;
  return (
    <div className="error-summary" ref={ref} tabIndex={-1} role="alert" aria-labelledby={titleId}>
      <p id={titleId}><strong>Re-plan was not completed</strong></p>
      {serverError && <p>{serverError}</p>}
      {errors.length > 0 && <ul>
        {errors.map(({ id, label, message }) => (
          <li key={id}>
            <a href={`#${id}`} onClick={(event) => {
              const field = document.getElementById(id);
              if (field) { event.preventDefault(); field.focus(); }
            }}>{label}: {message}</a>
          </li>
        ))}
      </ul>}
    </div>
  );
}
