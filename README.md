<p align="center">
  <a href="https://www.explainroo.com">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/media/logo-dark.png">
      <img src="docs/media/logo-light.png" alt="explainroo" width="340">
    </picture>
  </a>
</p>

<p align="center">
  <b>Explainer videos made by your AI agent.</b><br>
  Free and open source. The voice, the timing and the rendering all run on your computer.
</p>

<p align="center">
  <a href="https://www.explainroo.com">Website</a> &nbsp;·&nbsp;
  <a href="https://www.explainroo.com/videos/">Example videos</a> &nbsp;·&nbsp;
  <a href="https://www.explainroo.com/docs/">Docs</a> &nbsp;·&nbsp;
  <a href="AGENTS.md">AGENTS.md</a>
</p>

<p align="center">
  <a href="https://www.explainroo.com/videos/how-explainroo-makes-a-video/">
    <img src="docs/media/intro.gif" alt="The explainroo intro video" width="720">
  </a>
  <br>
  <sub>A coding agent made this video with explainroo. <a href="https://www.explainroo.com/videos/how-explainroo-makes-a-video/">Watch it with sound</a>.</sub>
</p>

## Make a video

> [!TIP]
> **Point your AI agent at this repo and tell it what video you want.**
> It works with Claude Code, Codex, Pi and other coding agents. Right now it
> works best with Claude Code and Opus 5.5.

Copy this into your agent and put your topic in place of the brackets:

```text
Make me a short explainer video about [your topic].
Use explainroo for it: clone https://github.com/vincentsch/explainroo,
read its AGENTS.md and follow the steps.
```

The agent downloads explainroo, sets it up, writes the video and checks it.
At the end you have an MP4 file.

## What explainroo does

explainroo is a free tool that lets a coding agent make explainer videos.
Those are the short videos where a voice explains a topic and simple drawings
show up while it speaks.

The agent writes two files. `script.md` has the words the voice will say.
`scenes.js` draws the pictures with a bit of JavaScript. Each drawing can be
tied to a word in the script, so it shows up when the voice says that word.
explainroo does the rest:

- **The voice.** [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) is an
  open voice model. It reads the script aloud on your own computer. You can
  pick from 28 voices. You don't need an account or an API key.
- **The timing.** [Whisper](https://github.com/openai/whisper) listens to the
  recording and writes down when each word is spoken. That is how a picture
  shows up right when the voice names it.
- **The pictures.** Chrome runs in the background and draws each frame of the
  video. It can draw lines that look hand drawn with
  [Rough.js](https://roughjs.com), 1,800 [Lucide](https://lucide.dev) icons,
  charts, code and your own screenshots.
- **The sound.** explainroo writes background music for each video and adds
  small sound effects. It turns the music down whenever the voice speaks.
- **The file.** ffmpeg puts the voice, the pictures and the music together
  into an MP4 at the right loudness.

An agent can't watch a video, so explainroo gives it other ways to check its
work. It can save a still picture of each scene. It can make a sheet of small
frames that shows how the video moves along. A layout check finds text that
is cut off or sits on top of something else. A speech check catches words the
voice got wrong.

explainroo's own part runs on your computer. The voice, the timing and the
drawing of the frames send nothing anywhere and cost nothing. Your coding
agent is a separate service with its own terms and costs. For how-to topics
the agent can also make illustrations with an AI image model through
OpenRouter. That is optional, and you pay per image.

## Looks, sizes and pace

<p align="center">
  <img src="docs/media/looks.jpg" alt="The same diagram in the paper, clean, chalk, blueprint and midnight looks" width="720">
</p>

- **Five looks.** Paper, clean, chalk, blueprint and midnight. The same video
  works in each of them.
- **Sizes.** There is a size for YouTube, YouTube Shorts, TikTok, Instagram
  Reels, Instagram and LinkedIn feed posts, and a square one. On Shorts,
  TikTok and Reels, explainroo keeps the text away from the buttons the app
  puts on top of the video.
- **Pace.** Set `pace` to 1.2 and the whole video gets 20% quicker. That
  includes the voice, the pauses and each animation.
- **Captions.** They light up word by word. You get them for vertical, 4:5
  and square videos.

## Install it yourself

You need three things on your computer. Node.js 20.11 or newer runs
explainroo. ffmpeg builds the video file. Chrome or Chromium draws the
pictures. The first setup downloads the voice model and the word timing model
once, about 400 MB together. You don't need a graphics card. I develop and
test explainroo on Linux. It should work on macOS and Windows too, but I have
tested it less there so far.

```bash
git clone https://github.com/vincentsch/explainroo.git
cd explainroo
npm install
node bin/explainroo.js doctor --fetch
```

Then start your agent in the `explainroo` folder and ask for a video, for
example "Make a 60 second video about how HTTPS keeps a password secret."
Everything the agent needs is in [AGENTS.md](AGENTS.md). The finished video
ends up in `videos/<name>/out/video.mp4`. The files for three example videos
are in [examples/](examples/). The full documentation is on
[explainroo.com](https://www.explainroo.com/docs/).

## The watermark

Each video has a small "explainroo.com" in one corner. You can turn it off
with `"watermark": false` in the video's `video.json`. I'd ask you to keep it
if you can. It helps other people find this free project, and that is the
best way to give something back.

## Credits and license

The voice comes from [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M).
The word timing comes from [Whisper](https://github.com/openai/whisper),
which runs through
[Transformers.js](https://github.com/huggingface/transformers.js). The
drawings use [Rough.js](https://roughjs.com) and [Lucide](https://lucide.dev)
icons. [Playwright](https://playwright.dev) runs Chrome in the background.
The fonts are under the SIL Open Font License, and
[ffmpeg](https://ffmpeg.org) makes the video file. explainroo itself is MIT
licensed.
