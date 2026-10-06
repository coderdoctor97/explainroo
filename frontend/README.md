# explainroo studio

A local web app for making an explainroo video from **your own** recording:
you bring `transcript.txt`, `timestamp.json` and `voiceover.wav`, the studio
does the rest and hands you an MP4.

```bash
npm install
npm run dev                 # http://localhost:5173
node bin/explainroo.js studio --port 4000
```

Nothing is sent anywhere and no API key is used. The timings you uploaded are
the timings in the video; if you have none, **Make from the voice-over** runs
the same local Whisper model the command line uses for its speech check and
writes `timestamps.json` for you.

## What it does

| Step | What you do | What happens |
| --- | --- | --- |
| **Sources** | drag the three files in (or make the timings from the voice-over), add images if a scene needs one | the files are copied into `studio-workspace/` and read; nothing is parsed until you ask |
| **Scene plan** | rename headings, edit the words shown on screen, split a scene at the playhead, merge two | the transcript is cut into scenes at sentences, paragraphs or every N words; the plan is saved per project |
| **Look** | pick one of the five looks, the size, the pace, captions, music | the look is the same `theme` setting a hand-written project uses, so a studio video matches one made by an agent |
| **Build and render** | build, check, save stills, render | a normal explainroo project is written, then the repo's own engine draws it and ffmpeg writes the MP4 |

The studio is deliberately thin: everything after the build is the code in
`src/` and `engine/`, unchanged, so `npm run check`, `npm run render` and the
generated project work exactly as they do for a hand-written video.

### The model-free path

`video.json` gets `"_external": true`, and the build writes what the voice
stage would otherwise have produced:

```
studio-workspace/projects/<id>/
  sources/          your three files (and any images), untouched
  video/            the explainroo project
    video.json      title, theme, size, pace, captions, music, watermark
    script.md       the scenes and the words the voice says
    scenes.js       what each scene draws, timed to your word times
    assets/         your images, copied next to the project
    build/voice/    one WAV per scene + a JSON of word times and marks
    build/studio-report.json   what was built, and what is missing
  out/              video.mp4, draft.mp4, stills/*.png
```

`src/voice.js` sees `_external` and loads the per-scene WAV slices and word
times instead of running Kokoro; `src/pipeline.js` then builds the timeline
the same way it always does. If a scene changed after the build, the voice
cache is refused with a clear message instead of a wrong video.

### When something is missing

The studio never invents an asset. If a scene is assigned an image that is not
in `sources/`, the build reports the exact file name, the Render step asks for
it, and the next build picks it up. The same is true of the inputs themselves:
a build without a voice-over says which file to drop in, not "undefined is not
a function".

## Design

The front end was designed with the **hallmark** skill and built under the
**caveman** and **ponytail** rules. The three skills are vendored in
`../skill-to-use-the-frontend-wrapper/`; `npm run skills:install` copies their
`SKILL.md` folders into `.claude/skills` (or `~/.claude/skills`) so an agent
can use them here.

**Hallmark.** One macrostructure, one theme, stamped in
`frontend/src/styles/tokens.css`:

```
/* Hallmark · macrostructure: Workbench · theme: Drafting Sheet (custom branch)
 * heading: hanging · body: two-column bench + readout · divider: hairline rule
 * button: outlined + one accent-bordered primary · imagery: none (the video is
 * the image) · reveal: none · nav: side rail · accent: vermilion, under 3%
 * critique: P5 H4 E4 S5 R5 V4
 */
```

- **Workbench**: a tool you sit at, not a wizard. Masthead with the project and
  the one primary action; a numbered rail of steps on the left; the work in the
  middle; a readout on the right that is always telling you the state of the
  project; a transport along the bottom with the words of the voice-over.
- **Drafting Sheet**: warm paper neutrals in OKLCH, one vermilion accent used
  only for the current state and the primary action (well under 3% of a view),
  hairline rules instead of boxes, a hanging heading with a mono note, and
  data set in mono so timings read like measurements.
- Three faces only: Instrument Serif for display, Space Grotesk for the
  interface, JetBrains Mono for numbers, times and file names. The video's own
  fonts (Kalam, Cabin Sketch, Architects Daughter…) are used *inside* the frame
  preview, never in the interface.
- The preview frame is honest: it is the look's colours and fonts at 16:9, and
  it says out loud that the real frames come from "Save stills".

**Caveman / ponytail.** No new runtime dependencies (React, Vite and TypeScript
only, and Vite/TS are dev-only), no state library, no router, no component kit.
State is one hook in `App.tsx`; every persistent thing is written to
`studio.json` next to the project; the API is a hand-rolled router with no
framework. The server can only ever touch `studio-workspace/`, font files and
icon files.

## Layout

```
frontend/
  index.html            the page shell
  dev.mjs               starts the API, then Vite, and wires /api to it
  scripts/
    check-charset.mjs   the html/charset guard: UTF-8 first in <head>, no BOM
    check-viewport.mjs  the html/viewport guard: one responsive viewport, zoom left on
    check-sri.mjs       the html/subresource-integrity guard for external scripts and stylesheets
    check-unique-ids.mjs the html/unique-id guard: no duplicate ids in a file or a page
    check-defer-async.mjs the html/defer-async guard: every <script src> has defer, async or type="module"
  src/
    api.ts              one typed function per route; all URLs are relative
    App.tsx             the shell: projects, steps, transport, persistence
    components/         ui.tsx (controls), Transport.tsx, Frame.tsx, Readout.tsx
    stages/             Sources.tsx, Plan.tsx, Look.tsx, Render.tsx
    styles/             tokens.css (the design system), app.css
  server/
    store.js            studio-workspace: projects, sources, assets, settings
    timestamps.js       reads the many shapes a timing file comes in
    stt.js              makes timestamps.json from the voice-over (the local Whisper model)
    plan.js             alignment, scene splitting, headings, keywords, the voice cache
    generate.js         script.md, scenes.js, video.json
    build.js            analyze / build / status / doctor
    api.js              the HTTP API (127.0.0.1 only, reached through /api)
    selftest.mjs        npm run test:studio — 32 checks, no browser
    uitest.mjs          npm run test:ui — 88 checks (93 with a build), React in jsdom, real API, the page guards
```

## Tests

```bash
npm run typecheck      # tsc, no emit
npm run test           # the repo's own tests
npm run test:studio    # the back end: parsing, planning, voice cache, generation
npm run test:ui        # the front end: mount the app, click it, read the DOM
npm run build          # bundle the page into frontend-dist/
node frontend/scripts/check-charset.mjs  # the charset guard alone, every HTML file
node frontend/scripts/check-viewport.mjs # the viewport guard alone, every HTML file
node frontend/scripts/check-sri.mjs      # SRI guard, source HTML + frontend-dist/ when built
node frontend/scripts/check-unique-ids.mjs # unique-id guard, HTML + component sources
node frontend/scripts/check-defer-async.mjs # defer-async guard, every <script src> must be non-blocking
```

The charset guard is its own script because it has to run on a checkout with no
dependencies installed: it reads `<meta charset="utf-8">` out of every HTML file
the studio ships — `index.html`, and `frontend-dist/` when there is a build —
and fails if it is not the first element in `<head>`, if there is more than one
declaration, if it starts after the first 1024 bytes, if a legacy
`<meta http-equiv="Content-Type">` is left, or if the file starts with a BOM.
`test:ui` runs it too, checks the same questions against a real DOM, and checks
the page the dev server actually serves.

The viewport guard follows the same shape for the html/viewport and
css/viewport-zoom rules: it reads `<meta name="viewport">` and fails when the
tag is missing, when there is more than one, when it is not in `<head>`, when
it does not start from `width=device-width, initial-scale=1` (`1.0` is the same
number), when `user-scalable=no` is set, or when `maximum-scale` caps zoom
below 2. The two rules are one line in one file, so a regression is a one-line
mistake — this is the guard for it.

The SRI guard walks source and built HTML for cross-origin `<script src>` and
`<link rel="stylesheet" href>` tags. Every such tag must have well-formed
SHA-256, SHA-384 or SHA-512 digest metadata plus `crossorigin="anonymous"`;
SHA-384 is preferred. The guard checks markup and digest format, not that a
hash matches bytes fetched from a CDN. When adding a CDN asset, pin its version
and verify its hash and CORS response. Relative assets remain exempt. As static
HTML does not identify its deployment host, absolute HTTP(S) URLs are treated
as external by default; pass `--origin https://your-host.example` (or set
`SRI_ORIGIN`) when scanning HTML that uses absolute same-origin asset URLs.
`test:ui` runs positive and negative fixtures as well as scanning the
checked-in and built HTML. At present the studio has no external script or
stylesheet URLs: Vite bundles and `/api/fonts/...` requests are same-origin, so
there are no CDN hashes or CORS headers to maintain.

The unique-id guard is the html/unique-id rule, and it reads a file the same
way the head guards do. In an HTML document no `id` value may appear twice; ids
inside a `<template>` are compared with each other and not with the document,
because the spec — and html-validate's `no-dup-id` — treat template content as
a document of its own until it is cloned; `id=""` is rejected because nothing
can reference it. A component or template file (`jsx`, `tsx`, `vue`, `svelte`,
`astro`, `hbs`, `ejs`, `pug`, `php`, `erb`) may not hardcode an id: the same
component rendered twice writes the same id twice, which is how duplicates
reach a page. Generate it instead — React's `useId()`, Vue's `useId()`, or a
counter memoized per instance — accept an optional `id` prop, and build the
dependent ids from it (`${id}-label`, `${id}-input`); an element that really is
rendered once can say `unique-id-ok` on its line. References (`for` on a
label or output, `aria-labelledby`, `aria-describedby`, `aria-controls`,
`aria-owns`, `aria-activedescendant`, `aria-errormessage`, `href="#…"`) are
warnings when they match no id or more than one, since script may still fill
them in. `test:ui` scans `index.html`, the built page, the dev-served page and
every component, runs positive and negative fixtures, then walks the DOM of the
mounted app at each of the four steps with `duplicateIds()` — the same question
axe's `duplicate-id` check asks, and the walk is proved to find a duplicate
before it is trusted. The walk is in the guard rather than a new dependency
because axe's duplicate-id rules are deprecated and disabled in current
axe-core, and the studio ships no linter; the rule is two functions of plain
JavaScript. It is wired into `npm run test:ui` — the studio's own page test —
so the rule stays inside `frontend/` like the guards before it, and runs with
`npm run test:ui` on any checkout and in any CI that runs the test suite.

The defer-async guard is the html/defer-async rule: every `<script src="…">` in
an HTML or component file must carry `defer`, `async` or `type="module"`, so the
parser is not blocked waiting for the script to download and run. Inline scripts
(no `src`) are not checked — they are already synchronous by nature and run where
the parser finds them. A script with `type="module"` does not also need `defer`:
module scripts are deferred by the HTML specification. A script that sets both
`defer` and `async` is reported as a warning — the two conflict, browsers pick
`async`, and writing both is almost always a mistake. A component or template file
(`jsx`, `tsx`, `vue`, `svelte`, `astro`, `hbs`, `ejs`, `pug`, `php`, `erb`) that
injects a plain `<script src>` without one of the three attributes is reported as
a problem: the same component rendered twice writes the same blocking tag twice.
A `src` that looks generated (`{var}`, `${expr}`, `{{mustache}}`, `<% erb %>`) is
left alone — it is not a literal tag until the template language fills it in. The
guard is zero-dependency, uses the same tag reader as the other head guards, and
is wired into `npm run lint:html` and `npm run test:ui`.

`test:ui` mounts the real components in jsdom against a real API, then does
what a person does: reads the sources, renames a heading, adds a word, merges
two scenes, picks a look, changes the pace, builds, and reloads. It draws no
pixels, so it says nothing about how the page looks; it says everything about
whether it works.

## Limits

- Rendering needs Chrome (to draw) and ffmpeg (to write the MP4), the same two
  things the command line needs. The studio shows both, honestly, before you
  press a button.
- **Make from the voice-over** uses the same local speech model the command
  line's speech check uses (`whisper-base.en`, q8, on the CPU, English). It is
  fetched once into `~/.cache/explainroo/models` and then runs offline; the
  first run downloads about 150 MB, later runs take roughly the length of the
  recording. Uploading your own `timestamps.json` never touches the model.
- The auto headings, keywords and icons are deterministic heuristics, not a
  model: they are meant to be edited, and the plan step exists for that.
- The API listens on 127.0.0.1 only and the page talks to its own origin. If
  you run it behind a proxy or a tunnel, set `STUDIO_ALLOWED_HOSTS` (comma
  separated) or `STUDIO_ALLOW_ALL_HOSTS=1`, and `STUDIO_HMR_PORT=443` when the
  proxy terminates TLS.
