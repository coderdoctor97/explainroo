## Accessible Form Validation — Implementation Summary

### Scope

All changes for this task are inside `frontend/` in the connected
`coderdoctor97/explainroo` repository. This summary is here, rather than at
repository root, to honor the earlier explicit frontend-only restriction.
The session remains on `arena/1efb8264-explainroo`.

### Files Changed

- `src/components/FormField.tsx` — Reusable visibly labelled field with native
  constraints, required indicator, hint/error IDs, ARIA state and a persistent
  inline alert region. Exports a validator for required, length, email/URL,
  pattern, numeric bounds/step, and custom validation.
- `src/components/ErrorSummary.tsx` — Focused alert summary with field links and
  explicit link-to-input focus handling.
- `src/components/ScenePlanForm.tsx` — Blur/submit validation for two required
  numeric settings, retained drafts, submit locking and API error handling.
- `src/stages/Plan.tsx` — Replaced silent numeric clamping with the validated
  Scene plan form; retained the existing split-strategy controls.
- `src/App.tsx` — Saves validated settings before requesting re-plan; propagates
  failures to the form and keys the Plan stage by project to reset local state.
- `src/api.ts` — Preserves HTTP status and structured field errors in `ApiError`.
- `shared/plan-validation.js`, `shared/plan-validation.d.ts` — Existing numeric
  limits shared by the form and API, plus server-side numeric validation.
- `server/api.js` — Rejects invalid supplied plan values with HTTP 422 and field
  errors before any write; still supports partial PATCH requests.
- `src/styles/app.css` — Scoped error borders/text, white error backgrounds,
  visible focus rings and text-based required/error indicators.
- `tests/form-validation/form-validation.test.js` — Component, keyboard,
  validation, focus, API-failure, axe and contrast tests.
- `tests/form-validation/api.test.js` — Real API rejection/no-write and valid
  partial-save tests, plus server-validator edge cases.
- `server/uitest.mjs` — Real React/API invalid → correction → re-plan flow.
- `package.json`, `package-lock.json` — Frontend-local test command and pinned
  Testing Library DOM/user-event dev dependencies. No root dependencies changed.
- `.checklist/form-validation-rule.md` — Failed MCP access record and explicitly
  attributed working criteria from the user's prompt, not an official export.
- `references/form-validation/*` — Search results and inspected reference notes.
- `IMPLEMENTATION_SUMMARY.md` — This summary.

### What Was Implemented

- Both validated fields have visible associated labels, native `required`,
  `aria-required`, and visible “required” text.
- Untouched fields omit `aria-invalid`; blur/submit sets it to true or false.
  Errors connect through `aria-describedby` and `aria-errormessage`; hint links
  remain intact when errors clear.
- Dedicated inline `role="alert"` elements remain mounted. Error text changes
  on blur and submit, not each keystroke.
- Invalid submissions show a linked summary as the first child of the form and
  move focus to it. Tab reaches its links; activating a link focuses the field.
- `noValidate` suppresses competing native validation bubbles, while native
  constraints/validity APIs support the accessible feedback logic.
- Required numeric settings retain their existing ranges: words per scene
  8–120 and maximum scene duration 4–40, in whole-number increments.
- **Behavior change:** these two settings are now saved on valid Re-plan
  submission, rather than silently clamped/saved on every change. The form
  explicitly explains this. Split strategy and per-scene editing are unchanged.
- Client errors block requests. The API independently validates supplied values
  and rejects invalid patches without partially saving. Server field errors
  map to the same labels and descriptions; general failures show actionable
  retry feedback. If analysis fails after saving, settings may already be saved;
  retrying safely submits those settings again.
- Pending submissions prevent duplicate requests and edits. Values remain
  available after failure. No unrelated demo form or new project-name constraint
  was introduced.

### Tests Added

**14 new tests:** 11 component/validator/accessibility tests and 3 API/server
validation tests. Added five end-to-end-flow assertions to the existing
React/jsdom plus real-API UI runner.

Coverage includes initial state, empty required blur, no keystroke validation,
correction on blur, summary focus, links, simulated Tab/Enter resubmission,
successful submission, structured server errors, connection failures,
duplicate-submit prevention, validators, label/ID relationships, error-state
axe checks, actual stylesheet color contrast, API rejection without writes,
and valid partial PATCH behavior.

### Verification

| Check | Result |
| --- | --- |
| `npm run --prefix frontend test:validation` | 14/14 passed |
| `npm run --prefix frontend test:input-types` | 6/6 passed |
| `npm run --prefix frontend test:semantic` | 10/10 passed |
| `npm run --prefix frontend lint:semantic` | 7/7 passed |
| `npm run lint:html` | Passed |
| `npm test` | 44 passed, 1 existing browser test skipped |
| `npm run test:studio` | 32 checks passed |
| `npm run test:ui` | 153/155 passed; two pre-existing fixture failures |
| `npm run build` | Passed |
| `npm run typecheck` | Existing TS6133: unused `i` in `src/captions-vtt.ts:45` |
| `git diff --check` | Passed |

The unchanged UI failures concern generated script src expressions and the
video-without-controls fixture. No new failing checks were observed.

The new form's submitted error state passes the axe audit with color-contrast
disabled because jsdom has no layout engine. A separate calculation reads the
actual error color from CSS and verifies at least 4.5:1 on its explicit white
background. A visible blue focus outline is also supplied. This is not a visual
rendering or comprehensive WCAG conformance claim.

### Acceptance Review and Limitations

Verified in automated DOM/component/API tests for the integrated Scene plan form:

- [x] Visible associated labels and visible required indicators.
- [x] Hint/error descriptions and aria-errormessage resolve to the correct IDs.
- [x] aria-invalid distinguishes untouched, invalid and checked-valid states.
- [x] Inline errors and summary are discoverable alert regions.
- [x] Submit failures show a top-of-form summary and move focus.
- [x] Summary links focus the associated fields.
- [x] Specific actionable messages, text-based indicators and checked colors.
- [x] Validation happens on blur/submit, not on each keystroke.
- [x] Client, server-error, success, correction and retry paths are tested.
- [ ] Real-browser keyboard behavior and screen-reader announcements manually checked.
- [ ] Full visual inspection, zoom/high-contrast and device testing completed.
- [ ] Official checklist MCP criteria fetched or remote verification passed.

No Chrome/Chromium is available in this environment. User-event simulates Tab
and Enter in jsdom; finding alert roles does not prove audible announcements.
The checks above cover the integrated form, not a new accessibility claim for
every existing upload or playback control in Studio.

Both MCP services failed at TLS connection time. The primary/related rule text
and official priority metadata could not be retrieved. The connected repository
and authenticated `gh` were used as fallback; GOV.UK summary implementation and
React Aria TextField tests were inspected. No remote pass is claimed.

For manual follow-up: open Scene plan, clear words per scene, tab away, submit,
activate each summary link with Enter, correct the values and resubmit. Repeat
with the API unavailable and a screen reader enabled. Confirm announcement
clarity, visible focus, retained values and readable errors at increased zoom.

Install root dependencies as usual, then `npm ci --prefix frontend` before
running the frontend test commands above.
