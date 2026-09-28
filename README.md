# explainroo

## Point your AI agent (Claude Code, Codex, Pi and others) at this repo and tell it what video you want.

Copy this into your AI agent and put your topic in place of the brackets:

```text
Make me a short explainer video about [your topic]. Use explainroo for it: clone https://github.com/vincentsch/explainroo, read its AGENTS.md and follow the steps.
```

> Right now explainroo works best with Claude Code and Opus 5.5.

[![Watch the explainroo video](docs/media/intro.gif)](https://github.com/vincentsch/explainroo/releases/download/v0.1.0/explainroo-intro.mp4)

*This video explains explainroo, and a coding agent made it with explainroo
([watch it with sound](https://github.com/vincentsch/explainroo/releases/download/v0.1.0/explainroo-intro.mp4)).*

explainroo is a free, open source kit that coding agents use to make
narrated explainer videos. The agent writes the script and a bit of
JavaScript that draws the pictures. explainroo reads the script aloud with a
voice model on your computer, shows each picture when the voice mentions it,
adds music and sound effects, and saves an MP4. You don't need an API key,
unless you want AI images.

## Getting started

You need Node.js 20 or newer, ffmpeg, and Chrome or Chromium.

```bash
git clone https://github.com/vincentsch/explainroo.git
cd explainroo
npm install
node bin/explainroo.js doctor --fetch
```

Then start your agent in the `explainroo` folder and ask for a video, for
example "Make a 60 second video about how HTTPS keeps a password secret."
Everything the agent needs is in [AGENTS.md](AGENTS.md). The finished video
ends up in `videos/<name>/out/video.mp4`.

## More

- The full documentation and more videos made with explainroo:
  [explainroo.com](https://www.explainroo.com)
- The source of three example videos: [examples/](examples/)

## The watermark

Videos have a small "explainroo.com" in the corner. You can turn it off with
`"watermark": false` in the video's `video.json`. I'd ask you to keep it if
you can. It helps other people find this free project, and that is the best
way to give something back.

## Credits and license

explainroo uses [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) for the
voice, [Whisper](https://github.com/openai/whisper) through
[Transformers.js](https://github.com/huggingface/transformers.js) for word
timing, [Rough.js](https://roughjs.com), [Lucide](https://lucide.dev) icons,
[Playwright](https://playwright.dev), fonts under the SIL Open Font License,
and [ffmpeg](https://ffmpeg.org). explainroo itself is MIT licensed.
