import { useId } from 'react';

// One id, unique per component instance, and stable between a server render and
// the hydration that follows it.
//
// React's useId() does the hard part: every mounted instance of a component gets
// its own value, assigned in the same order on the server and in the browser, so
// a component rendered N times never writes one id N times. That is the Front-End
// Checklist rule html/unique-id — the frontend/scripts/check-unique-id.mjs guard
// refuses a hardcoded id in this folder for exactly that reason. This adds only
// what useId() leaves out:
//
//   · a readable prefix, so the DOM says panel-_R_3_ rather than _R_3_
//   · characters that are safe in a CSS selector. React 19's value already is;
//     React 18's ":r3:" is not, and document.querySelector('#:r3:') throws on it,
//     so anything but a letter, a digit, "-" or "_" is dropped
//   · an optional override, for a caller who needs to know the id — a test, a
//     deep link, a stylesheet. Give the same override to two mounted instances
//     and they are duplicates again, so only pass one where you know there is
//     exactly one of them on the page.
//
// Ids that depend on each other are built from the same value, so a control and
// the things that name it stay a set and nothing dangles:
//
//   const id = useUniqueId('pace', props.id);
//   <label htmlFor={id + '-input'}>Pace</label>
//   <input id={id + '-input'} aria-describedby={id + '-hint'} />
//   <p id={id + '-hint'}>Animations and pauses, not the voice.</p>
export function useUniqueId(prefix = 'id', override?: string | null): string {
  // Called before anything returns: a hook cannot be conditional.
  const generated = useId();
  const asked = (override ?? '').trim();
  if (asked) return asked;
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '');
  const head = safe(prefix) || 'id';
  const tail = safe(generated);
  return tail ? `${head}-${tail}` : head;
}
