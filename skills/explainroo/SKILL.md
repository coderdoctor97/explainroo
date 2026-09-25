---
name: explainroo
description: Make a narrated explainer video (MP4) from code with explainroo, using a local voice model and no API keys. Use when the user asks for an explainer, walkthrough, launch or tutorial video, an animated diagram with voice-over, or a short for YouTube, Reels or TikTok.
---

# Make an explainer video with explainroo

explainroo turns a narration script and a small JavaScript scene file into a
finished MP4: a local voice reads the script, every word is timed, frames are
drawn in headless Chrome, and music and sound effects are generated to fit.

## 1. Find or install explainroo

Use the first that works:

```bash
command -v explainroo                                  # installed with npm link
ls "${EXPLAINROO_HOME:-$HOME/.explainroo}/bin/explainroo.js"
```

If neither exists, install it (needs Node.js 20+, ffmpeg and Chrome or Chromium):

```bash
git clone https://github.com/vincentsch/explainroo.git "$HOME/.explainroo"
cd "$HOME/.explainroo" && npm install
node bin/explainroo.js doctor --fetch
```

Below, `explainroo` means either the linked command or
`node "$HOME/.explainroo/bin/explainroo.js"`.

## 2. Read the guide

Read `AGENTS.md` in the explainroo folder before you start, and keep
`docs/api.md` open while writing scenes. They define the workflow, the quality
bar and the scene API.

## 3. Make the video

Create the project where the user wants it (default: `./video` in the current
folder):

```bash
explainroo init video --theme paper --title "..."
```

Then follow the workflow from AGENTS.md: write `script.md`, run
`explainroo voice video`, write `scenes.js`, run `explainroo check video`,
look at `explainroo still video` and `explainroo sheet video` output, then
`explainroo render video` and `explainroo verify video`.

Report the path to `video/out/video.mp4`, its length and the verify summary.
