---
name: explainroo
description: Make a narrated explainer video (MP4) with explainroo, using a voice model on this computer and no API key. Use when the user asks for an explainer, how-to, walkthrough, launch or tutorial video, an animated diagram with a voice-over, or a short for YouTube, Reels or TikTok.
---

# Make an explainer video with explainroo

explainroo turns a narration script and a small JavaScript scene file into an
MP4. A voice model reads the script, every word gets a time, Chrome draws the
frames, and explainroo adds music and sound effects.

## Find or install explainroo

Try these first:

```bash
command -v explainroo
ls "${EXPLAINROO_HOME:-$HOME/.explainroo}/bin/explainroo.js"
```

If neither exists, install it. It needs Node.js 20 or newer, ffmpeg, and
Chrome or Chromium.

```bash
git clone https://github.com/vincentsch/explainroo.git "$HOME/.explainroo"
cd "$HOME/.explainroo" && npm install
node bin/explainroo.js doctor --fetch
```

Below, `explainroo` means the linked command or
`node "$HOME/.explainroo/bin/explainroo.js"`.

## Read AGENTS.md

`AGENTS.md` in the explainroo folder has the steps, the writing rules, the
settings and the full scene API. Read it before you start.

## Make the video

Create the project where the user wants it, for example `./video`:

```bash
explainroo init video --theme paper --title "..."
```

Then follow the steps in AGENTS.md. Tell the user where `video/out/video.mp4`
is, how long it is, and what `explainroo verify video` said.
