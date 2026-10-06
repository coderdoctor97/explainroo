# Semantic layout audit

Scope: only `frontend/` changes for this task, in the connected explainroo
repository. The session branch is fixed; no alternate repository or branch was
created. Earlier language-attribute changes elsewhere are not part of this
semantic-layout commit.

## Audit and decisions

Line numbers below refer to the pre-change source. The complete div inventory
is in [div-audit-before.txt](../references/semantic-html/div-audit-before.txt).

| Location | Before | Decision |
| --- | --- | --- |
| `src/App.tsx:232` | `.start` wrapper with no landmarks | Retain sizing wrapper; introduce header, main and footer around their actual content. |
| `src/App.tsx:239` | `.row` | Retain: form-control layout, not a landmark. |
| `src/App.tsx:304,349` | `.app`, `.bench` | Retain: grid/layout wrappers containing existing landmarks. |
| `src/App.tsx:305,350,372,448` | header, named nav, main, aside | Preserve; give aside a name and change the wordmark span to the page h1. |
| `src/components/ui.tsx:41` | `.seg` with named group role | Retain: interactive control group, not document navigation. |
| `src/components/ui.tsx:62` | `.panel` with h3 | Named section; useId connects each section to its own heading. |
| `src/components/ui.tsx:75` | header with h2 | Preserve: heading for content within main, not a duplicate site banner. |
| `src/components/Transport.tsx:64` | `.transport` | Page footer, named Voice-over playback. Audio and live status now belong to this landmark too. |
| `src/components/Transport.tsx:65–100` | line, row, scrub, track, fill, tick, cursor, time, karaoke | Retain: presentation and playback UI, not standalone sections. |
| Other inventory entries | drop zones, rows, grids, progress tracks, preview frames and status groups | Retain: layout/control internals. No article/figure added without a matching purpose. |

The start screen has no workflow navigation or complementary readout until a
project is open. Do not create empty nav/aside landmarks there just to satisfy
a tag count. Every workbench stage has a header, named nav, one main, a named
aside and a footer. Heading order is h1 → h2 → h3. Native semantics need no
redundant `role` attributes.

Class selectors remain scoped to the components; replacing them with global
`header`/`footer` selectors would also style nested headers incorrectly. The
wordmark explicitly resets h1 defaults to retain the existing appearance.

## Install and run

From the repository root (root dependencies must also be installed):

```sh
npm ci
npm ci --prefix frontend
npm run --prefix frontend lint:semantic
npm run --prefix frontend test:semantic
npm run test:ui
npm run lint:html
npm run build
```

`frontend/package.json` and its lockfile isolate axe-core under the permitted
folder. No root dependency or workflow files were modified.

- DOM lint checks missing/duplicate landmarks, structural div aliases, named
  navigation/sections and heading order. Negative fixtures prove failures.
- Compact semantic snapshots render the real React start page, Panel and
  Transport, not hand-authored copies of the application.
- axe-core checks landmark, region and heading rules in jsdom. This is not a
  full accessibility audit or screen-reader/browser verification.
- The existing UI test runs DOM lint and axe after Sources, Scene plan, Look,
  Build and render, and a refresh, using the actual React app and API.

### CI boundary

The checks are wired into the existing `npm run test:ui` runner. Automatic
GitHub Actions execution on every push was **not** configured: `.github/` is
outside the expressly allowed `frontend/` scope. A future root CI change must
install both lockfiles and run the commands above; a workflow stored inside
frontend would not be recognized by GitHub Actions.

## Verification (2026-10-06)

- Semantic suite: **10/10 passed**.
- Workbench: semantic lint and axe passed at all five checkpoints.
- Root unit suite: **44 passed, 1 existing browser test skipped**.
- HTML lint and production build: **passed**.
- Full UI suite: **131/133 passed**. The existing generated-script-expression
  and video-without-controls fixture failures remain; both were reproduced
  with the baseline suite during the previous task.
- Typecheck is blocked by an existing unused `i` in
  `src/captions-vtt.ts:45` (also present in the pre-change source).
- Checklist MCP request failed with a TLS error. No remote pass is claimed.
  See [the local attempt log](../references/semantic-html/checklist-status.json)
  and [reference searches](../references/semantic-html/README.md).
- Before/after screenshots and manual assistive-technology checks were not run.

Rule requested: [HTML5 Semantic Elements](https://frontendchecklist.io/rules/html/html5-semantic-elements).
