import { useEffect, useId, useRef, useState } from 'react';
import type { PlanOptions } from '../api';
import { ApiError } from '../api';
import { PLAN_FIELDS, type PlanFieldName } from '../../shared/plan-validation.js';
import { FormField, validateInput } from './FormField';
import { ErrorSummary } from './ErrorSummary';

type Values = Pick<PlanOptions, PlanFieldName>;
export function ScenePlanForm({ options, busy, onSubmit }: {
  options: Values;
  busy: boolean;
  onSubmit: (values: Values) => Promise<void>;
}) {
  const baseId = useId();
  const form = useRef<HTMLFormElement>(null);
  const inFlight = useRef(false);
  const [values, setValues] = useState({ wordsPerScene: String(options.wordsPerScene), maxSceneSeconds: String(options.maxSceneSeconds) });
  const [errors, setErrors] = useState<Partial<Record<PlanFieldName, string>>>({});
  const [attempt, setAttempt] = useState(0);
  const [serverError, setServerError] = useState('');
  const [pending, setPending] = useState(false);
  // Refresh saved defaults when the loaded project/settings change, not while typing.
  useEffect(() => {
    setValues({ wordsPerScene: String(options.wordsPerScene), maxSceneSeconds: String(options.maxSceneSeconds) });
  }, [options.wordsPerScene, options.maxSceneSeconds]);
  const names = Object.keys(PLAN_FIELDS) as PlanFieldName[];
  const fieldId = (name: PlanFieldName) => `${baseId}-${name}`;
  const summary = names.filter((name) => errors[name]).map((name) => ({ id: fieldId(name), label: PLAN_FIELDS[name].label, message: errors[name]! }));
  return (
    <form ref={form} className="scene-plan-form" noValidate aria-label="Scene plan settings" onSubmit={async (event) => {
      event.preventDefault();
      if (inFlight.current || busy) return;
      const next: Partial<Record<PlanFieldName, string>> = {};
      for (const name of names) {
        next[name] = validateInput(form.current!.elements.namedItem(name) as HTMLInputElement, PLAN_FIELDS[name].label);
      }
      setErrors(next);
      setServerError('');
      if (Object.values(next).some(Boolean)) { setAttempt((value) => value + 1); return; }
      inFlight.current = true;
      setPending(true);
      try {
        await onSubmit({ wordsPerScene: Number(values.wordsPerScene), maxSceneSeconds: Number(values.maxSceneSeconds) });
        setAttempt(0);
      } catch (error) {
        const fieldErrors: Partial<Record<PlanFieldName, string>> = {};
        if (error instanceof ApiError) {
          for (const name of names) {
            const message = error.fieldErrors?.[name];
            if (typeof message === 'string' && message) fieldErrors[name] = message;
          }
        }
        setErrors({ ...next, ...fieldErrors });
        setServerError(Object.keys(fieldErrors).length ? '' : 'Could not save settings or start re-planning. Your entries are still here. Check the connection to Studio, then try Re-plan again.');
        setAttempt((value) => value + 1);
      } finally { inFlight.current = false; setPending(false); }
    }}>
      <ErrorSummary errors={attempt ? summary : []} serverError={serverError} attempt={attempt} />
      <div className="row" style={{ gap: 'var(--space-sm)', alignItems: 'flex-start' }}>
        {names.map((name) => {
          const { label, min, max } = PLAN_FIELDS[name];
          return <FormField key={name} id={fieldId(name)} name={name} label={label} aria-label={label}
            type="number" required min={min} max={max} step={1} hint={`Whole number from ${min} to ${max}.`}
            value={values[name]} error={errors[name]} readOnly={pending || busy}
            onChange={(event) => setValues({ ...values, [name]: event.target.value })}
            onBlur={(event) => setErrors((previous) => ({ ...previous, [name]: validateInput(event.target, label) }))}
          />;
        })}
        <button className="btn" type="submit" disabled={busy || pending}>{pending ? 'Saving…' : 'Re-plan'}</button>
      </div>
      <p className="field-hint">Settings are saved when you choose Re-plan.</p>
    </form>
  );
}
