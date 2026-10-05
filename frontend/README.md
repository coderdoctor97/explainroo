# explainroo studio

A local web app for making an explainroo video from **your own** recording:
you bring `transcript.txt`, `timestamp.json` and `voiceover.wav`, the studio
does the rest and hands you an MP4.

```bash
npm install
npm run dev                 # http://localhost:5173
node bin/explainroo.js studio --port 4000
```

Nothing is sent anywhere. There is no voice model, no speech-to-text model and
no API key: the timings you uploaded are the timings in the video.

## What it does

| Step | What you do | What happens |
| --- | --- | --- |
| **Sources** | drag the three files in, add images if a scene needs one | the files are copied into `studio-workspace/` and read; nothing is parsed until you ask |
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
    check-doctype.mjs   the html/doctype guard: <!DOCTYPE html> as the very first bytes
    check-sri.mjs       the html/subresource-integrity guard: nothing from another origin, or pinned and hashed
    check-viewport.mjs  the html/viewport guard: one responsive viewport, zoom left on
  src/
    api.ts              one typed function per route; all URLs are relative
    App.tsx             the shell: projects, steps, transport, persistence
    components/         ui.tsx (controls), Transport.tsx, Frame.tsx, Readout.tsx
    stages/             Sources.tsx, Plan.tsx, Look.tsx, Render.tsx
    styles/             tokens.css (the design system), app.css
  server/
    store.js            studio-workspace: projects, sources, assets, settings
    timestamps.js       reads the many shapes a timing file comes in
    plan.js             alignment, scene splitting, headings, keywords, the voice cache
    generate.js         script.md, scenes.js, video.json
    build.js            analyze / build / status / doctor
    api.js              the HTTP API (127.0.0.1 only, reached through /api)
    selftest.mjs        npm run test:studio — 31 checks, no browser
    uitest.mjs          npm run test:ui — 68 checks (72 with a build), React in jsdom, real API, the head guards
```

## Tests

```bash
npm run typecheck      # tsc, no emit
npm run test           # the repo's own tests
npm run test:studio    # the back end: parsing, planning, voice cache, generation
npm run test:ui        # the front end: mount the app, click it, read the DOM
npm run build          # bundle the page into frontend-dist/
node frontend/scripts/check-charset.mjs  # the charset guard alone, every HTML file
node frontend/scripts/check-doctype.mjs  # the doctype guard alone, every HTML file
node frontend/scripts/check-viewport.mjs # the viewport guard alone, every HTML file
node frontend/scripts/check-sri.mjs      # the subresource integrity guard alone, every HTML file
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

The subresource integrity guard follows the same shape for the
html/subresource-integrity rule, and today it has nothing to hash: the studio
loads no script and no stylesheet from anybody else's server. React and
roughjs are bundled out of `node_modules` by Vite, the three faces are woff2
files the repo fetched once (`../scripts/fetch-fonts.mjs`) and the API serves
from `/api/fonts/`, and every URL the page writes is relative. So the guard is
a line in the sand rather than a list of hashes. It fails the moment a
`<script src>`, a `<link rel="stylesheet">` or a preload hint for one of them
points at another origin without `integrity="sha384-…"` and
`crossorigin="anonymous"`; when a digest is one a browser cannot use (the
wrong algorithm, hex instead of base64, the wrong number of bytes, or sha256
alone where sha384 is wanted); when the URL is not pinned to one version,
because `@latest` and a hash cannot both be true; when it is fetched over
`http:`; and when a *first-party* file carries a hash, which is a page that
stops loading the next time the bundle changes. `vite build` writes
`crossorigin` on the page's own module script and stylesheet — that is how a
module is always fetched — and the guard reads those as first-party and leaves
them alone.

The same script computes the hashes, from the bytes that were downloaded
rather than from a snippet somebody pasted:

```bash
node frontend/scripts/check-sri.mjs --hash https://cdn.jsdelivr.net/npm/roughjs@4.6.6/dist/rough.min.js --snippet
node frontend/scripts/check-sri.mjs --hash <url|file> --expect "sha384-…"
```

`--hash` also reports whether the CDN answered with the CORS header SRI
depends on: without `Access-Control-Allow-Origin` the browser refuses the file
whether the digest is right or not, and the answer then is to self-host it,
the way this repo self-hosts its fonts. `--expect` asks the other question —
does the hash already written down still match what the CDN serves?

`test:ui` runs the guard over `index.html`, over `frontend-dist/` when there
is a build, and over the page the dev server serves with Vite's own scripts
injected; then it turns the guard on itself, because a guard that passes
everything is worse than no guard. A CDN script with no hash has to fail, one
changed character in a digest has to fail, different bytes under the same
digest — the compromise SRI exists for — has to fail, and so do `@latest`,
`http:`, `crossorigin="use-credentials"` and a first-party file with a hash.
The digests themselves are held against what `openssl` prints for the same
bytes.

`test:ui` mounts the real components in jsdom against a real API, then does
what a person does: reads the sources, renames a heading, adds a word, merges
two scenes, picks a look, changes the pace, builds, and reloads. It draws no
pixels, so it says nothing about how the page looks; it says everything about
whether it works.

## Limits

- Rendering needs Chrome (to draw) and ffmpeg (to write the MP4), the same two
  things the command line needs. The studio shows both, honestly, before you
  press a button.
- The auto headings, keywords and icons are deterministic heuristics, not a
  model: they are meant to be edited, and the plan step exists for that.
- The API listens on 127.0.0.1 only and the page talks to its own origin. If
  you run it behind a proxy or a tunnel, set `STUDIO_ALLOWED_HOSTS` (comma
  separated) or `STUDIO_ALLOW_ALL_HOSTS=1`, and `STUDIO_HMR_PORT=443` when the
  proxy terminates TLS.
