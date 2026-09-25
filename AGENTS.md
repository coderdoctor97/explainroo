# explainroo: guide for coding agents

You are in the explainroo repository. It turns a narration script and a small
JavaScript file into a narrated explainer video (MP4). You write the script
and the scenes; explainroo speaks the narration with a local voice model,
times every word, draws the frames in headless Chrome, generates music and
sound effects, and encodes the video. No API keys and no video models are
involved.

Read this file once, then keep [docs/api.md](docs/api.md) open while you write
scenes.

## Setup

```bash
npm install
node bin/explainroo.js doctor --fetch   # checks ffmpeg and Chrome, downloads the speech models (~400 MB once)
```

`node bin/explainroo.js` is the CLI (or `explainroo` after `npm link`). Every
command takes the project folder as its first argument and accepts `--json`.

## The workflow

When the user asks for a video, create a project under `videos/` (it is
ignored by git) and work through these steps in order. Do not skip the
checks: you cannot watch the video, so stills, sheets and the check reports
are your eyes and ears.

1. **Understand the subject.** Read the code, docs or pages the user points
   to. Collect the facts you will state. Never invent numbers, quotes or
   claims; if a number matters and you cannot verify it, leave it out.

2. **Create the project.**

   ```bash
   node bin/explainroo.js init videos/<slug> --theme paper --title "..."
   ```

   Pick the theme for the audience: `paper` (friendly, hand-drawn, the
   default), `clean` (product and business), `chalk` (teaching), `blueprint`
   (engineering, systems), `midnight` (developer tools). Use `--size 9:16` for
   Shorts, Reels and TikTok.

3. **Write `script.md` first.** The narration drives everything else.
   - Aim for 45 to 120 seconds unless the user asks otherwise. At the default
     speed a finished video carries about 150 words a minute, pauses
     included.
   - Structure: a hook that poses the question or problem, the explanation in
     small steps, one concrete example, then a short payoff line.
   - One idea per scene, usually 1 to 3 sentences (4 to 15 seconds).
   - Write for the ear: short sentences, plain words, no parentheses, no
     lists read aloud as "A, B, C, D and E" unless each one appears on screen.
   - Put `[#marker]` where a visual should change. Every sentence should
     trigger at least one visual.
   - Use `{shown|spoken}` for anything the voice might misread: acronyms
     (`{SQL|sequel}`, `{CLI|C L I}`), versions (`{v2.1|version two point one}`),
     symbols, domains (`{example.com|example dot com}`, the voice otherwise
     says "example comm") and URLs.

4. **Generate the voice and read the report.**

   ```bash
   node bin/explainroo.js voice videos/<slug>
   ```

   It prints each scene's length and how many words the speech check
   confirmed. Anything under 100% names the words it could not confirm: fix
   them with `{shown|spoken}` and run it again. Only changed scenes are
   regenerated.

5. **Plan each scene** before coding it: what is on screen when each marker
   or key word is spoken, where it sits, and what leaves. Keep the layout
   consistent from scene to scene.

6. **Write `scenes.js`.** One function per scene id. Tie every reveal to the
   narration with `at: 'word'` or `at: '#marker'`. See [docs/api.md](docs/api.md).

7. **Check.**

   ```bash
   node bin/explainroo.js check videos/<slug>
   ```

   Fix every error and every warning. Hints are judgment calls.

8. **Look at the frames.** This is the step that makes the video good.

   ```bash
   node bin/explainroo.js still videos/<slug>                 # the end of every scene
   node bin/explainroo.js still videos/<slug> intro@2.5 12.0  # any moment
   node bin/explainroo.js sheet videos/<slug> --scene intro   # one scene over time
   node bin/explainroo.js sheet videos/<slug>                 # the whole video
   ```

   Open the PNG and JPG files and look at them critically: Is the text large
   and readable? Is anything cut off, overlapping or crammed into a corner? Is
   the frame balanced, or is half of it empty? Does each scene look finished at
   its end? Does the sheet show something new every few seconds? Fix and look
   again until you would be happy to publish it.

9. **Render and verify.**

   ```bash
   node bin/explainroo.js render videos/<slug> --draft   # fast half-size check
   node bin/explainroo.js render videos/<slug>           # final 1080p
   node bin/explainroo.js verify videos/<slug>
   ```

   `verify` measures loudness, looks for black frames and silence, and
   transcribes the final mix to confirm the narration is understandable over
   the music. Fix what it reports.

10. **Report back** with the path to `out/video.mp4`, its length, and the
    verify summary. Mention anything you could not verify.

## What makes an explainer good

- **Show, then say.** The visual for an idea appears as the narrator says it,
  not before and not five seconds later. Use word cues.
- **Something changes every 2 to 4 seconds**: a new element, an arrow, a
  highlight, a camera move. `check` flags long static stretches.
- **Screen text summarizes.** Keep on-screen text to a few words (a label,
  a number, a key phrase). Never put the whole narration on screen; turn on
  captions instead (`"captions": true`).
- **Few things at once.** At most five or six elements on screen. Clear the
  stage with `out` before building the next idea.
- **Big and readable.** Titles 80 to 110px, labels 40 to 56px, notes at least
  32px on a 1920x1080 canvas. Stay inside `s.safe`.
- **Consistent meaning.** Give each actor one color and one position and keep
  them across scenes. Use the accent color for the one thing that matters most.
- **Concrete over abstract.** One real example (a real command, a real number
  with its source, a real screen) beats three generic boxes.
- **End on the takeaway**: one sentence and one clear final frame.

## Things that break

- Calling elements conditionally (`if (s.t > 3) s.box(...)`). Always call
  them and use `at` and `out`; sound effects and checks depend on it.
- Cue words that are not spoken exactly as written (`at: 'DNS'` when the
  narration says `{DNS|D N S}` is fine; cues use the shown text).
- Arrows or annotations that refer to an `id` drawn later in the function.
- `s.camera()` called after other elements; it must come first.
- `at` times later than the end of the scene; the element never appears.
  Lengthen the scene with `{hold=2}` or `{min=6}` in `script.md` instead.
- Randomness from anything other than `s.rand()`, `s.noise()` or
  `Math.random()` inside the scene function.

## Project files

```
videos/<slug>/
  video.json    theme, size, voice, music, captions (see below)
  script.md     narration, one "## scene-id" per scene
  scenes.js     one drawing function per scene
  assets/       your images (screenshots, logos)
  build/        generated voice, timeline and audio (safe to delete)
  out/          video.mp4, draft.mp4, stills/, sheets, report.json
```

`video.json` settings (all optional):

| Setting | Default | Meaning |
|---|---|---|
| `title` | script title | used in the preview |
| `theme` | `paper` | `paper`, `clean`, `chalk`, `blueprint`, `midnight` |
| `size` | `16:9` | `16:9`, `9:16`, `1:1`, `4:5` or `WIDTHxHEIGHT` |
| `fps` | 30 | 24, 25, 30, 50 or 60 |
| `voice` | `af_heart` | run `explainroo voices` |
| `speed` | 0.9 | 0.6 to 1.6 (voice speed) |
| `music` | `true` | `true` (theme style), a style name, `{ "style", "volume" }` or `false` |
| `sfx` | `true` | `true`, `"minimal"` or `false` |
| `captions` | `"auto"` | burned-in captions; auto means on for vertical and square videos |
| `transition` | `"auto"` | theme default, or `fade`, `slide`, `wipe`, `zoom`, `brush`, `cut` |
| `lead`, `hold`, `end` | 0.35, 0.7, 1.4 | seconds before narration, after it, and extra at the very end |
| `sentenceGap`, `paragraphGap` | 0.3, 0.55 | pauses in the narration |
| `loudness` | -14 | target LUFS |
| `boil` | 0 | redraws per second of hand-drawn lines (0 keeps lines still) |

Scene attributes in `script.md`: `## id {hold=1.5 min=5 lead=0.2 transition=cut}`.

## Working on explainroo itself

- `src/` is the Node side: script parsing, voice, alignment, timeline,
  server, rendering and checks. `engine/` runs in the page: the scene API
  (`stage.js`), drawing (`pen.js`), themes, transitions, captions and the
  audio engine (`engine/audio/`).
- Run `npm test` after changes. For engine changes, render the examples in
  `examples/` and look at their stills and sheets.
- `dev/audio-lab.mjs` renders every music style and sound effect and measures
  loudness, true peak and determinism with ffmpeg.
- `npm run build:icons` rebuilds `engine/icons/` from `lucide-static`, and
  `npm run build:fonts` downloads the bundled fonts again.
- Keep the scene API small and forgiving, with error messages that tell an
  agent exactly what to change.
