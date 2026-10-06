# HTML standards validation

## Scope and tool

Only `frontend/` changed for this task. The default validator recursively
checks production `.html`/`.htm` files under this directory (currently one:
`index.html`) and renders the actual React App's start state to HTML. Raw TSX
is not HTML and is not fed to the checker.

The existing UI runner also validates Sources, Scene plan, the submitted
Scene plan error state, Look, Build and render, and the refreshed page. These
are six exercised DOM snapshots, not exhaustive coverage of every conditional
state. DOM serialization can conceal parser repairs to HTML strings; checking
the original entry-point source and raw server-rendered start markup complements
runtime checks. The validator does not execute scripts or upload HTML anywhere.

Tool: pinned `html-validate` with `html-validate:standard`, plus explicit
project document requirements. This is useful local standards-oriented coverage,
**not W3C Nu certification**. Java is not installed, Nu was not run, and MCP
rule retrieval failed. Do not label this work a verified W3C/checklist pass.

## Run from the repository root

```sh
npm ci
npm ci --prefix frontend
npm run --prefix frontend validate:html
npm run --prefix frontend test:html
npm run test:ui
```

For machine-readable stdout without npm's command banner:

```sh
node frontend/scripts/validate-html.mjs
```

Explicit files are supported, including regression fixtures or, after a build,
`frontend-dist/index.html`. Relative arguments resolve from the caller's working
directory. The default scan stays inside frontend; external inputs are opt-in.
An unreadable file, configuration failure or zero discovered files fails the
command. Errors exit 1; warnings remain in the report but do not fail it.

## Configuration decisions

`.htmlvalidate.json` enables the standards preset: permitted nesting and
parents, required attributes/content, deprecated markup, allowed attribute
values, closing order, duplicate IDs/attributes, label references, and more.
It adds:

- `missing-doctype` and `doctype-html` for HTML5 document declarations.
- Required, nonempty `html[lang]` metadata.
- `no-implicit-close` as an **explicit-closing project policy**, stricter than
  HTML's allowance for some optional end tags.
- Runner checks for HTML5 doctype first and exactly one UTF-8 meta charset in
  head. Encoding/viewport timing checks remain in the existing HTML lint suite.

No genuine standards diagnostic has been suppressed. These requested style
restrictions are deliberately not enabled because they are not HTML validity
requirements:

- Boolean attributes may be bare (`disabled`) or have valid empty/name values;
  values are **not** mandatory. React emits valid empty boolean values.
- Trailing slashes on HTML void elements are permitted, though unnecessary.
- Inline `style` attributes are valid and widely used for dynamic UI layout.
- Inline scripts are valid HTML. CSP and script-loading policy are separate;
  this validator does not certify CSP compliance.

No product HTML was changed merely to satisfy a style preference. No production
standards violations were found in the checked documents, so zero markup fixes
were needed. There are no newly introduced standards deviations to annotate.

## Tests and exclusions

`tests/html-validation/` contains 12 tests with positive and negative fixtures:
missing doctype/lang/charset, unclosed tags, invalid nesting, duplicate IDs,
valid boolean/inline markup, supplemental document rules, CLI failure codes,
parseable JSON and default source/render integration.

Fixtures end in `.html.txt`: their bytes are HTML and are passed directly to
the validator, but intentionally broken examples must not be mistaken for
shipping documents by the existing HTML lint scripts. The default production
walk skips `tests`, `references`, `node_modules`, `.git`, and `.reports`.
Explicit file arguments still validate fixtures. No existing lint rules were
weakened to accommodate negative tests.

## Reports

Ignored generated artifacts live under `frontend/.reports/`:

- `html-validation.json`: source documents and server-rendered start page from
  the most recent CLI invocation (or the explicitly requested files).
- `html-validation-ui.json`: six named runtime snapshots from the UI suite.

Reports include tool, scope, document count, error/warning counts, file names,
rule IDs, messages, line/column positions and selectors where available.
Project-level supplemental checks point to line 1. The CLI removes stale
reports before starting, so a missing file cannot leave behind a false pass.

## CI boundary

No `.github/` directory exists in the checkout and creating a root workflow
would violate the frontend-only scope. Automatic push/PR validation, artifact
upload and branch-protection enforcement are therefore **not configured**.
A workflow under `frontend/.github/` would not be recognized by GitHub; none
was added. No local git hooks were installed.

A future authorized root workflow should install both lockfiles, run the
commands above, and upload `frontend/.reports/*.json` with an `if: always()`
artifact step. Keep the command's failure status: do not use `continue-on-error`
to conceal validation errors. Existing unrelated UI-test failures must be
resolved separately before the entire UI job can be green. Branch protection
must also explicitly require that job to block merges.

## Verification for this task

- One production HTML file + one raw React-rendered start document + six runtime
  snapshots: **8 document checks, 0 HTML errors, 0 warnings**.
- New HTML validation suite: **12/12 passed**, including deliberately failing
  fixtures and nonzero CLI exit verification.
- Existing input tests **6/6**, semantic tests **10/10**, form-validation tests
  **14/14**, root unit tests **44 passed / 1 existing browser test skipped**.
- Existing HTML lint and production build: **passed**.
- UI suite: **159/161 passed**. All six new HTML checks pass; the same known
  generated-script-expression and video-without-controls fixture failures remain.
- Manual browser spot-checks: not run (Chrome/Chromium unavailable).
- CI status: **not configured**, not “passing.” Official Nu/MCP status:
  **not verified**. HTML elsewhere in the repository is outside this task's scope.

Checklist attempt details and inspected examples are under
`references/html-validation/`.
