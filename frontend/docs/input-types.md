# Semantic input types audit

Scope: **frontend/ only**, in the selected `coderdoctor97/explainroo` checkout.
No root, engine, or vendored skill files were changed for this task.

## Production input inventory

Line numbers and types are from the pre-change source. Complete opening tags,
including event handlers and companion attributes, are recorded in
[inputs-before.json](../references/input-types/inputs-before.json).
Counts are JSX declaration sites, not the number of repeated rendered controls.

| File | Line | Previous type | Purpose | Recommended type | Change? |
| --- | --- | --- | --- | --- | --- |
| `frontend/src/App.tsx` | 241 | `text` | New video topic | `text` | No |
| `frontend/src/App.tsx` | 326 | `text` | Video title in masthead | `text` | No |
| `frontend/src/components/Transport.tsx` | 86 | `range` | Voice-over playback position | `range` | No |
| `frontend/src/components/ui.tsx` | 54 | `checkbox` | Boolean toggle (music / watermark) | `checkbox` | No |
| `frontend/src/stages/Look.tsx` | 84 | `text` | Video title in Look | `text` | No |
| `frontend/src/stages/Look.tsx` | 154 | `range` | Animation pace | `range` | No |
| `frontend/src/stages/Look.tsx` | 181 | `range` | Silence before/after voice and end hold (mapped) | `range` | No |
| `frontend/src/stages/Plan.tsx` | 37 | `(missing)` | Add a scene keyword | `text` | Yes |
| `frontend/src/stages/Plan.tsx` | 79 | `text` | Scene heading | `text` | No |
| `frontend/src/stages/Plan.tsx` | 206 | `number` | Words per scene | `number` | No |
| `frontend/src/stages/Plan.tsx` | 218 | `number` | Maximum scene duration in seconds | `number` | No |
| `frontend/src/stages/Sources.tsx` | 59 | `file` | Upload transcript, timings, or audio (shared Drop) | `file` | No |
| `frontend/src/stages/Sources.tsx` | 179 | `file` | Upload an image | `file` | No |

**Production inputs audited: 13. Changed: 1. Already correct: 12.**

The only remediation is `type="text"` on `ChipEditor` in `Plan.tsx`. A keyword
is content, not a search query, email, URL or numeric identifier. This makes
the intended type explicit without changing the browser's previous default.
The existing controlled value, Enter/Escape handlers, Unicode-aware keyword
processing and accessible label remain unchanged.

No autocomplete token describes a scene keyword. No numeric keyboard, pattern,
`required`, or personal-information autofill hint is added. The other fields
already use appropriate text, number, file, range or checkbox types; their
bounds, steps and handlers are untouched.

## Non-production input occurrences

The pre-existing `frontend/server/uitest.mjs` also contains four HTML input
strings used to test the unique-ID checker, not rendered product forms:

| Pre-change line | Tag(s) | Purpose | Decision |
| --- | --- | --- | --- |
| 571 | `<input id="name" type="text">` | Valid labelled ID fixture | Keep. |
| 603 | `<input id="field" />` twice | Deliberately duplicated ID fixture | Keep; not a production field. |
| 609 | `<input id={id} />` | Generated JSX ID fixture | Keep; not a production field. |

Thus the pre-change scope contained 17 tag occurrences: 13 production sites
and 4 test-fixture occurrences. New negative tests intentionally include absent
or incorrect types; do not “fix” them. Audit/reference files quote markup and
are likewise not UI entry points. `frontend/index.html` contains no inputs.

## Regression tests

```sh
# From the repository root, after installing root dependencies:
npm ci --prefix frontend
npm run --prefix frontend test:input-types
npm run --prefix frontend test:semantic
npm run test:ui
npm run lint:html
npm test
npm run build
```

Six new tests cover real React-rendered Plan/start inputs, free-form Unicode
keyword validity, unchanged numeric bounds/validation messages, negative type
fixtures, and focused axe input-label/autocomplete/ARIA checks. Tests check
`getAttribute('type')`, not `.type`, because the latter hides a missing or
invalid attribute by returning the browser default.

The rendered-DOM guard in `scripts/check-input-types.mjs` maps the audited
accessible names to expected types and reports unknown purposes for review.
The full existing UI runner checks all inputs plus focused axe rules on
Sources, Scene plan, Look, Build and render, and after refresh. Its existing
keyword-entry test still confirms that Enter persists the added word.

No new email/URL/date validation or mandatory field was introduced, so an
invalid-form submission test for those types is not applicable. The existing
numeric constraints are tested through DOM validity APIs, not claimed as a
real-browser submission or validation-bubble test.

## Verification

- New input suite: **6/6 passed**.
- Existing semantic suite: **10/10 passed**.
- Input-type and focused axe assertions: passed at all five UI checkpoints.
- Existing unit suite: **44 passed, 1 skipped** (Chrome unavailable).
- HTML lint and production build: **passed**.
- Full UI suite: **142/144 passed**; the same two previously documented
  generated-script-expression and video-without-controls fixture failures.
- Typecheck: existing unused `i` at `src/captions-vtt.ts:45`; unchanged here.
- No new failures observed in the exercised checks. The full suite is not green.
- Browser/mobile keyboard, autofill and native validation bubbles were not
  manually verified: no Chrome/Chromium is installed. Desktop emulation would
  not prove real mobile keyboard behavior in any case.
- Both MCP endpoints failed at TLS connection time. No official rule export,
  related-rule data or remote pass is claimed. See the
  [attempt log](../references/input-types/mcp-status.json) and
  [reference patterns](../references/input-types/README.md).

Rule requested: https://frontendchecklist.io/rules/html/input-types

## Files changed

| File | Change |
| --- | --- |
| `src/stages/Plan.tsx` | One missing `type="text"` added. |
| `scripts/check-input-types.mjs` | Guard for explicit, purpose-appropriate rendered types. |
| `tests/input-types/*` | Six regression tests and focused axe helper. |
| `server/uitest.mjs` | Live-app type/axe assertions across all workflow stages. |
| `package.json` | Frontend-local test command; no dependency changes. |
| `docs/input-types.md`, `references/input-types/*` | Audit, full pre-change tags, search results and MCP limitations. |
