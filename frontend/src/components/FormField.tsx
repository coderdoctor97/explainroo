import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  // undefined = untouched; empty string = checked and valid.
  error?: string;
};

export function FormField({ id, label, hint, error, required, ...input }: Props) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const descriptions = [input['aria-describedby'], hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  return (
    <div className="validated-field">
      <label htmlFor={id}>
        {label}{required && <span className="required-note"> (required)</span>}
      </label>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      <input
        {...input}
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error === undefined ? undefined : Boolean(error)}
        aria-describedby={descriptions || undefined}
        aria-errormessage={error ? errorId : undefined}
      />
      {/* Keep the live region mounted so blur-time text updates are announced. */}
      <p id={errorId} className="field-error" role="alert" aria-atomic="true">
        {error ? `Error: ${error}` : ''}
      </p>
    </div>
  );
}

// Native constraints plus optional application-specific validation. Phone
// numbers have no universal syntax: use pattern/title or a custom validator.
export function validateInput(input: HTMLInputElement, label: string, custom?: (value: string) => string): string {
  const value = input.value;
  if (input.validity.badInput) return `Enter ${label} as a number.`;
  if (input.required && !value.trim()) return `Enter ${label}.`;
  if (!value) return '';
  if (input.validity.typeMismatch) return `Enter a valid ${input.type === 'email' ? 'email address' : 'URL'} for ${label}.`;
  if (input.minLength >= 0 && value.length < input.minLength) return `Use at least ${input.minLength} characters for ${label}.`;
  if (input.maxLength >= 0 && value.length > input.maxLength) return `Use no more than ${input.maxLength} characters for ${label}.`;
  if (input.validity.patternMismatch) return input.title || `Enter ${label} in the format shown in the hint.`;
  if (input.type === 'number') {
    if (!Number.isFinite(input.valueAsNumber)) return `Enter ${label} as a number.`;
    if (input.validity.rangeUnderflow) return `Enter ${label} of at least ${input.min}.`;
    if (input.validity.rangeOverflow) return `Enter ${label} of no more than ${input.max}.`;
    if (input.validity.stepMismatch) return input.step === '1' || !input.step
      ? `Enter ${label} as a whole number.`
      : `Enter ${label} in increments of ${input.step}.`;
  }
  return custom?.(value) || '';
}
