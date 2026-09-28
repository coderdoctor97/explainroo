# explainroo for coding agents

This file tells you, the coding agent, how to make a video with explainroo.
The user usually gives you a topic and maybe a length or a style. You write
the words and the pictures, explainroo does the rest.

explainroo turns two files into a narrated MP4. `script.md` holds what the
voice says. `scenes.js` draws what the viewer sees, and every drawing can
appear on a word the voice says. A voice model (Kokoro) reads the script on
this computer, and Whisper writes down when each word is spoken. Chrome draws
the frames in the background, explainroo adds music and sound effects, and
ffmpeg makes the MP4. No API key is needed unless the user wants AI images.

The full documentation for people is at https://www.explainroo.com/docs/.

## Before you start

If the user pasted the prompt from the README or explainroo.com and you are
not in an explainroo folder yet, clone it into the current folder first,
unless the user named another place:

```bash
git clone https://github.com/vincentsch/explainroo.git
cd explainroo
```

Run this once in the explainroo folder:

```bash
npm install
node bin/explainroo.js doctor --fetch
```

`doctor` checks Node, ffmpeg and Chrome and downloads the speech models
(about 400 MB, only the first time). In the commands below,
`node bin/explainroo.js` can also be `explainroo` if the user ran `npm link`.
Every command takes the project folder first and accepts `--json`.

### When to ask the user

Decide the normal things yourself: the look, the length, the voice, the
layout, the wording. Ask only when you cannot go on without an answer, and ask
everything you need in one message. Typical reasons to ask:

- The topic is unclear, or you need a fact you cannot check.
- The user wants AI images and there is no OpenRouter key (see Images).
- The user wants something explainroo cannot do, like real video footage.

## Making a video, step by step

1. **Learn the subject.** Read the code, docs or pages the user points to.
   Write down the facts you will use. Never make up numbers, quotes or claims.
   If a number matters and you cannot check it, leave it out.

2. **Create the project.**

   ```bash
   node bin/explainroo.js init videos/<name> --theme paper --title "..."
   ```

   Projects go in `videos/`, which git ignores. Pick the look for the
   audience: `paper` (friendly, hand drawn, the default), `clean` (products
   and business), `chalk` (teaching), `blueprint` (engineering), `midnight`
   (developer tools). Add `--size 9:16` for Shorts, Reels and TikTok.

3. **Write `script.md`.** The narration comes first and sets the timing for
   everything else. See "How to write the narration" below.

4. **Make the voice.**

   ```bash
   node bin/explainroo.js voice videos/<name>
   ```

   It prints how long each scene is and how many words the speech check
   confirmed. If a word is not confirmed, the voice probably said it wrong.
   Fix it with `{shown|spoken}` in the script and run the command again. Only
   changed scenes are made again.

5. **Plan the pictures.** For each scene, decide what is on screen when each
   marker or important word is spoken, where it sits, and what leaves. Keep
   things in the same place from scene to scene.

6. **Make images, if the video needs them.** Icons and diagrams cover most
   technical topics. For everyday how-to topics (cooking, cars, gardening)
   pictures work better. See "Images" below.

7. **Write `scenes.js`.** One function per scene. Tie every picture to the
   narration with `at: 'word'` or `at: '#marker'`. The scene API is at the
   end of this file.

8. **Check.**

   ```bash
   node bin/explainroo.js check videos/<name>
   ```

   Fix every error and every warning. Hints are your call.

9. **Look at the frames.** You cannot watch the video, so this is how you see
   it.

   ```bash
   node bin/explainroo.js still videos/<name>                 # the end of each scene
   node bin/explainroo.js still videos/<name> intro@2.5 12.0  # any moment
   node bin/explainroo.js sheet videos/<name> --scene intro   # one scene over time
   node bin/explainroo.js sheet videos/<name>                 # the whole video
   ```

   Open the images and judge them like a viewer. Is the text big enough? Is
   anything cut off or on top of something else? Is half the frame empty?
   Does the sheet show something new every few seconds? Fix it and look
   again.

10. **Render and verify.**

    ```bash
    node bin/explainroo.js render videos/<name> --draft   # quick half-size version
    node bin/explainroo.js render videos/<name>           # final video
    node bin/explainroo.js verify videos/<name>
    ```

    `verify` measures the loudness, looks for black frames and silence, and
    listens to the final mix to make sure the voice is still clear over the
    music.

11. **Tell the user** where `out/video.mp4` is, how long it is, what verify
    said, and what you could not check.

## How to write the narration

Unless the user asks for another style, write the way a person explains
something to a friend at a table.

- Use regular, down-to-earth English and everyday words. Explain things in
  simple terms. If you need a technical word, say what it means the first
  time.
- Keep sentences short, about 8 to 18 words, one idea each.
- Say who does what: "The browser asks a resolver."
- Every sentence adds a fact. Cut half sentences that repeat something.
- Do not use em dashes or dashes between phrases. Use a comma or a new
  sentence.
- Leave out slogans and punchlines ("Just code."), "not X, but Y" twists,
  colon reveals, chains of three short sentences, metaphors, and filler words
  like "just", "simply", "really", "actually" and "exactly".
- Do not tell the viewer to do obvious things ("Let's dive in", "Stay tuned").
- End with a plain sentence that sums up the main point.

Length and pace:

- Aim for 45 to 120 seconds unless the user says otherwise. A finished video
  carries about 150 words a minute, pauses included.
- Start with the question or problem, explain it in small steps, give one
  concrete example, then sum up.
- One idea per scene, usually 1 to 3 sentences (4 to 15 seconds).
- Lists read aloud ("A, B, C and D") only work when each item appears on
  screen.

Script syntax:

```markdown
# Title of the video

## scene-id {hold=1.5}
Narration for this scene. [#marker] A marker names a moment you can animate on.
[pause 0.6] adds silence. {SQL|sequel} shows "SQL" in captions but says "sequel".
> Lines starting with > are notes for you and are not spoken.
```

- `## scene-id` starts a scene. The id must match a function in `scenes.js`.
- Put a `[#marker]` wherever a picture should change. Every sentence should
  trigger at least one picture.
- Use `{shown|spoken}` for anything the voice may misread: acronyms
  (`{CLI|C L I}`), versions (`{v2.1|version two point one}`), symbols and
  domains (`{example.com|example dot com}`, otherwise the voice says "example
  comm").
- Scene attributes: `hold` (seconds after the voice, default 0.7), `min`
  (minimum length), `lead` (seconds before the voice, default 0.35),
  `transition` (`fade`, `slide`, `wipe`, `zoom`, `brush`, `cut`).
- A scene without narration lasts `min` seconds (default 3).

## What makes the pictures good

- **Show it when it is said.** A picture appears as the voice mentions it.
  Use word cues.
- **Something changes every 2 to 4 seconds**: a new element, an arrow, a
  highlight or a camera move. `check` points out long still stretches.
- **Short screen text.** Labels, numbers and key phrases of a few words. The
  whole narration never goes on screen. For that, turn on captions
  (`"captions": true`), and then do not also show the sentence the voice is
  saying.
- **Few things at once.** At most five or six elements. Clear the stage with
  `out` before the next idea.
- **Big and readable.** Titles 80 to 110 px, labels 40 to 56 px, small text
  at least 32 px on a 1920 x 1080 canvas. Stay inside `s.safe`.
- **Same meaning, same color.** Give each thing one color and one place and
  keep them. Use the accent color for the one thing that matters most.
- **Real examples.** A real command, a real number with its source or a real
  screen is better than three boxes with general words.
- **A clear last frame** that shows the main point.

## Images

explainroo can make illustrations with AI image models through OpenRouter.
This is optional and costs money on the user's OpenRouter account, roughly 7
to 13 cents per image at the time of writing.

If the user wants images and there is no key, ask them for an OpenRouter API
key (from openrouter.ai/keys). Save it in a `.env` file in the explainroo
folder as `OPENROUTER_API_KEY=...`, or use an environment variable. Git
ignores `.env`. Never print the key or put it in a script, a commit or a log.

```bash
node bin/explainroo.js image videos/<name> cables "Two cars parked nose to nose with their hoods open, jumper cables between the batteries"
node bin/explainroo.js images videos/<name>    # what was made and what it cost
```

This saves `assets/cables.png`. Use it in a scene with
`s.image('assets/cables.png', { w: 1100, frame: 'card', at: 'cables' })`.

- `--model best` (default) uses OpenAI GPT Image 2. It does what you ask and
  is worth the price for most images.
- `--model cheap` uses Google Gemini 3.1 Flash Image. It costs about half,
  but often ignores parts of the prompt.
- `--aspect 16:9` (default for landscape videos), `9:16`, `1:1`, `4:3`,
  `3:2` and their portrait forms.
- `--ref assets/a.png` sends an earlier image along, so a person or object
  keeps the same look. Several files are separated by commas.
- Every image gets a default style (flat, soft colors, no text). Set your own
  in `video.json` with `"images": { "style": "...", "model": "best" }`, or
  leave it off with `--no-style`.

**Always open every image and check it.** Image models get details wrong:
extra fingers, cables on the wrong terminal, text that looks like writing but
is not. If anything is wrong, change the prompt and make it again. Keep text
out of images and put words on screen with `s.text` instead. Use images for
things icons cannot show, and keep one style through the whole video.

## The watermark

Every video gets a small "explainroo.com" in the bottom right corner. The
user can turn it off with `"watermark": false` in `video.json`, or change it
to their own text. If the user asks about it, tell them it is their choice,
and that keeping it helps more people find this free project.

## Project files and settings

```
videos/<name>/
  video.json    look, size, voice, music, captions, watermark
  script.md     the narration, one "## scene-id" per scene
  scenes.js     one drawing function per scene
  assets/       images: screenshots, logos, generated illustrations
  build/        voice, timing and audio made by explainroo (safe to delete)
  out/          video.mp4, draft.mp4, stills/, sheets, report.json
```

`video.json` settings, all optional:

| Setting | Default | What it does |
|---|---|---|
| `title` | from the script | shown in the preview |
| `theme` | `paper` | `paper`, `clean`, `chalk`, `blueprint`, `midnight` |
| `size` | `16:9` | `16:9`, `9:16`, `1:1`, `4:5` or `WIDTHxHEIGHT` |
| `fps` | 30 | 24, 25, 30, 50 or 60 |
| `voice` | `af_heart` | see `explainroo voices` |
| `speed` | 0.9 | voice speed, 0.6 to 1.6 |
| `music` | `true` | `true` (the look's style), `warm`, `upbeat`, `calm`, `tech`, `playful`, `{ "style", "volume" }` or `false` |
| `sfx` | `true` | sound effects: `true`, `"minimal"` or `false` |
| `captions` | `"auto"` | text of the narration at the bottom; auto turns it on for vertical and square videos |
| `transition` | `"auto"` | the look's default, or `fade`, `slide`, `wipe`, `zoom`, `brush`, `cut` |
| `lead`, `hold`, `end` | 0.35, 0.7, 1.4 | seconds before the voice, after it, and extra at the very end |
| `sentenceGap`, `paragraphGap` | 0.3, 0.55 | pauses in the narration |
| `loudness` | -14 | target loudness in LUFS |
| `boil` | 0 | redraws per second of hand-drawn lines; 0 keeps them still |
| `watermark` | `"explainroo.com"` | text in the bottom right corner, or `false` |
| `images` | none | `{ "model": "best" or "cheap", "style": "..." }` |

The looks:

| Look | What it looks like | Transition | Music |
|---|---|---|---|
| `paper` | marker drawings on warm paper | brush | warm |
| `clean` | flat cards with soft shadows | slide | upbeat |
| `chalk` | chalk on a green board | brush | calm |
| `blueprint` | white drawings on blueprint blue | wipe | tech |
| `midnight` | dark background with glowing colors | zoom | tech |

## Commands

| Command | What it does |
|---|---|
| `init <dir>` | creates a project (`--theme`, `--size`, `--voice`, `--title`) |
| `voice [project]` | makes the narration and the word times, cached per scene |
| `preview [project]` | a live preview in the browser that reloads when you save |
| `still [project] [times]` | PNG pictures at `12.5`, `scene`, `scene@2.4` or `scene@end` |
| `sheet [project]` | a contact sheet of the video or of one scene (`--scene`, `--every`) |
| `check [project]` | finds layout, timing and pronunciation problems |
| `render [project]` | the MP4 (`--draft`, `--from`, `--to`, `--workers`, `--out`) |
| `verify [project]` | checks the finished file: loudness, black frames, silence, clear voice |
| `image [project] <name> "<prompt>"` | makes an illustration with OpenRouter |
| `images [project]` | lists the images and what they cost |
| `voices`, `say "text"` | lists the 28 voices, or makes a sample |
| `themes`, `icons <word>` | lists the looks, searches the 1,854 icons |
| `doctor` | checks the setup (`--fetch` downloads the speech models) |

## Scene API

Each scene function draws one frame. explainroo calls it for every frame with
a fresh `s`, so the whole scene depends only on time. Do not keep state
between calls and do not use timers. Give each element an `at` time and the
look animates it in. Give it an `out` time and it animates out.

```js
export default {
  intro(s) {
    s.title('How DNS works', { at: 0 });
    s.icon('globe', { y: 700, at: 'browser' });
  },
};
```

The canvas is 1920 x 1080 for 16:9 (1080 x 1920 for 9:16, 1080 x 1080 for
1:1, 1080 x 1350 for 4:5). Coordinates are pixels from the top left. `x` and
`y` are the center of an element unless the method says otherwise.

### Time

| Member | Meaning |
|---|---|
| `s.t` | seconds since the scene started |
| `s.T` | seconds since the video started |
| `s.dur` | length of the scene in seconds |
| `s.voice` | `{ start, end }` of the narration in the scene |
| `s.words` | the spoken words: `{ text, start, end }` in scene seconds |
| `s.cue(word, n = 1)` | when the n-th time a word or phrase is spoken starts |
| `s.cueEnd(word, n = 1)` | when it ends |
| `s.mark(name)` | the time of a `[#name]` marker |
| `s.time(v)` | turns a number, a word or `"#marker"` into seconds |
| `s.p(at, dur = 0.6, ease = 'inOut')` | 0 to 1 progress for your own animation |
| `s.since(at)`, `s.between(a, b)` | seconds since a time, or whether now is between two times |
| `s.video` | `{ duration, frames, fps, width, height, scenes }` of the whole video |

Every `at` and `out` accepts seconds (`2.4`), a spoken word (`'resolver'`) or
a marker (`'#ask'`). Word cues ignore case and punctuation, and a phrase works
too. A wrong word or marker stops with an error that lists the closest words.

Easing names: `linear`, `in`, `out`, `inOut`, `outBack`, `outElastic`,
`outQuart`, `inOutSine`. `s.ease.out(p)`, `s.lerp(a, b, p)` and
`s.clamp(v, lo, hi)` are there for your own math.

### Layout

| Member | Meaning |
|---|---|
| `s.W`, `s.H`, `s.cx`, `s.cy` | canvas size and center |
| `s.safe` | `{ x, y, w, h, left, top, right, bottom }` with a 7% margin |
| `s.row(n, { width, x })` | n x positions spread over a width |
| `s.col(n, { height, y })` | n y positions spread over a height |
| `s.grid(cols, rows, { x, y, w, h, gap })` | cells `{ x, y, w, h }`, row by row |
| `s.get(id)` | size and position of an element drawn earlier with that `id` |

Most elements return `{ x, y, w, h, left, right, top, bottom }`, so you can
place the next thing below or beside them.

### Options most elements take

| Option | Meaning |
|---|---|
| `at`, `out` | when it appears and when it leaves |
| `enter` | `draw`, `write`, `type`, `words`, `sync`, `pop`, `rise`, `fade`, `zoom`, `drop`, `slide-left`, `slide-right`, `slide-up`, `slide-down`, `none` |
| `exit` | `fade`, `pop`, `rise`, `drop`, `slide-left`, `slide-right`, `none` |
| `dur` | length of the entrance in seconds |
| `id` | a name for arrows, `annotate` and `s.get` |
| `color` | a color name (`blue`, `accent`, `ink`, `muted`, ...) or any CSS color |
| `opacity`, `scale`, `rotate` | extra changes, `rotate` in degrees |
| `float` | pixels of slow drift that keeps a still element alive |
| `sfx` | the sound on entrance, or `false` |

In `paper`, `chalk` and `blueprint`, shapes are drawn line by line and text is
written on. In `clean` and `midnight`, shapes pop and text rises. Use
`at: -1` for things that were already on screen in the previous scene: they
are there from the start and make no sound.

### Text

```js
s.title('How DNS works', { at: 0 });                     // display font, 104 px, at 44% height
s.subtitle('the phone book of the internet', { at: 1 }); // 46 px, muted, at 60% height
s.text('Every site has an *address*', { y: 300, size: 64, at: 'address' });
s.note('about 20 ms', { x: 1400, y: 820, at: 3 });        // 32 px, muted
```

`s.text(str, options)`: `x`, `y`, `size` (48), `font` (`display`, `body`,
`hand`, `mono`), `weight` or `bold: true`, `align` (`left` means x is the left
edge), `valign` (`top` means y is the top), `maxWidth`, `lineHeight`, `color`,
`mark` (color of `*starred*` words), `bg` (a card behind the text), `padding`,
`radius`, `border`. Entrances for text include `write`, `type` (with `cps`),
`words` and `sync`, which shows each word as the voice says it. Words in
`*stars*` get the accent color. `\n` starts a new line.

### Shapes and arrows

```js
s.box('Resolver', { id: 'res', x: 960, y: 540, icon: 'server', color: 'blue', at: 'resolver' });
s.circle({ id: 'you', x: 400, y: 540, r: 90, label: 'You', at: 0.5 });
s.arrow('you', 'res', { label: 'asks', at: 'asks' });
s.arrow([300, 900], [1600, 900], { bend: 0.3, dashed: true, at: 5 });
s.line([[200, 800], [900, 700]], { color: 'accent', at: 2 });
s.path('M0 0 C 200 -150 400 150 600 0', { x: 660, y: 540, at: 3 });
```

`s.box(label, options)` is a card that fits its label: `w`, `h`, `minW`,
`minH`, `size`, `font`, `icon`, `iconSize`, `iconColor`, `color` (outline and
a light fill), `fill`, `stroke`, `width`, `dashed`, `border: false`,
`radius`, `shape: 'ellipse'`, `textColor`, `fillStyle` (hand-drawn looks:
`solid`, `hachure`, `cross-hatch`, `zigzag`, `dots`). `s.circle({ r, label })`
takes the same options.

`s.arrow(from, to, options)`: `from` and `to` are `[x, y]`, `{ x, y }` or the
`id` of an element drawn earlier, and then the arrow stops at its edge.
Options: `bend` (about -1 to 1), `head` (`end`, `start`, `both`, `none`),
`label`, `labelSize`, `labelColor`, `labelOffset`, `gap`, `dashed`, `width`,
`headSize`. `s.connect` is the same.

### Icons and images

```js
s.icon('database', { x: 1500, y: 540, size: 140, color: 'purple', at: 'database' });
s.icon('lock', { bg: 'circle', color: 'green', label: 'Encrypted', at: 4 });
s.image('assets/app.png', { w: 1100, frame: 'browser', url: 'app.example.com', at: 0.5 });
s.image('assets/cables.png', { w: 1000, frame: 'card', at: 'cables', kenburns: true });
```

The 1,854 icons come from Lucide. Search with `explainroo icons <word>`; old
Lucide names work too. Icon options: `size` (120), `color`, `weight` (2),
`bg` (`true`, `'circle'`, `'square'` or a color), `bgScale`, `label`,
`labelSize`.

`s.image(src, options)` draws a file from `assets/`: `w` and/or `h` (the
image keeps its shape), `fit` (`cover` or `contain`), `radius`, `frame`
(`none`, `card`, `browser`, `window`, `phone`), `url` (for the browser frame),
`border`, `shadow: false`, `kenburns: true` for a slow zoom.

### Pointing things out

```js
s.text('It is *not* magic', { id: 'claim', y: 400, at: 0 });
s.annotate('claim', { type: 'underline', at: 'magic' });
s.annotate({ x: 960, y: 700, w: 400, h: 90 }, { type: 'circle', color: 'red', at: 3 });
```

`s.annotate(target, options)` marks an element or a box: `type` is
`underline`, `circle`, `box`, `highlight`, `strike`, `cross` or `bracket`.
Options: `color`, `padding`, `width`, `dur`.

### Lists, numbers and charts

```js
s.list(['Browser cache', 'Resolver', 'Root server'], { x: 360, y: 280, at: 'first', stagger: 1.1 });
s.number(1500000, { suffix: ' requests', at: 'million', y: 480 });
s.bars([{ label: '2023', value: 19 }, { label: '2024', value: 31 }], { at: 1, suffix: 'k' });
s.lineChart([3, 5, 4, 8, 13, 21], { labels: ['M', 'T', 'W', 'T', 'F', 'S'], at: 1 });
s.pie([{ label: 'Images', value: 55 }, { label: 'Other', value: 45 }], { donut: 0.55, at: 1 });
```

- `s.list(items, options)`: items are text or `{ text, at, icon, color, out }`.
  `x` is the left edge and `y` the top. Options: `size` (50), `width`, `gap`,
  `bullet` (`dot`, `dash`, `number`, `check`, `arrow` or an icon name),
  `bulletColor`, `at` (a start time or a list of times), `stagger` (0.7),
  `enter`.
- `s.number(value, options)` counts up with ticks: `from`, `dur` (1.4),
  `prefix`, `suffix`, `decimals`, `separator`, `group: false`, plus text
  options.
- `s.bars(data, options)`: items are `{ label, value, color, at }`, and a bar
  with its own `at` grows when that word is spoken. Options: `x`, `y`, `w`,
  `h`, `max`, `stagger`, `growDur`, `values: false`, `prefix`, `suffix`,
  `format(v)`, `labelSize`, `valueSize`, `fillStyle`.
- `s.lineChart(values, options)`: `x`, `y`, `w`, `h`, `min`, `max`,
  `labels`, `dots: false`, `area: false`, `color`, `dur`.
- `s.pie(data, options)`: `x`, `y`, `r`, `donut` (0 to 0.8), `labels: false`,
  `labelOffset`, `dur`.

### Code and terminal

```js
s.code("const res = await fetch(url);", { lang: 'js', title: 'app.js', at: 0.5 });
s.terminal(['$ npm install', 'added 42 packages in 3s'], { at: 1 });
```

`s.code(source, options)`: `lang` (`js`, `ts`, `py`, `go`, `rust`, `php`,
`sh`, `sql`, `json`, `md`), `size` (32), `w`, `title` (or `false`),
`lineNumbers: false`, `reveal` (`type`, `lines`, `none`), `cps`, `lineDelay`,
`highlight` (line numbers) and `highlightAt`. `check` reports lines that are
wider than the window.

`s.terminal(lines, options)`: lines starting with `$ ` are typed commands,
other lines are output. A line can also be `{ cmd, at }` or
`{ out, at, color }`. Options: `w`, `size`, `rows`, `title`, `prompt`, `cps`
(22), `outputDelay`, `lineGap`.

### Camera, groups and your own drawing

- `s.camera([{ at, x, y, zoom, dur, rotate }])` moves the view. Call it first
  in the scene function.
- `s.group({ x, y, scale, rotate, at, out, enter }, () => { ... })` moves a
  set of elements together. Inside, positions are relative to `x`, `y`.
- `s.draw({ x, y, at, out }, (ctx, life) => { ... })` gives you the canvas 2D
  context for anything the kit does not cover. `life.p` is the 0 to 1
  entrance progress. `s.ctx` is also available.
- `s.burst({ x, y, at, count, colors })` fires confetti.
- `s.bg(color)` paints over the background.
- `s.rand(i)`, `s.noise(x)` and `s.wiggle(amount, speed)` give randomness
  that is the same on every render.

### Sound

Elements make sounds when they enter, chosen by the look: drawn lines
scribble, cards pop, arrows whoosh, list items play rising notes, numbers
tick, typing clicks, and scenes change with a swipe. `sfx: false` silences one
element, and `"sfx": "minimal"` in `video.json` keeps only transitions and the
sounds you add.

`s.sfx(name, at, { gain, dur, pitch })` adds a sound: `pop`, `click`,
`whoosh`, `swipe`, `tick`, `type`, `ding`, `chime`, `thud`, `scribble`,
`chalk`, `rise`, `sparkle`, `blip`, `error`. `dur` sets the length of `type`,
`scribble`, `chalk` and `rise` (`rise` ends at `at + dur`). The music is made
to fit the video and gets quieter while the voice speaks.

### Colors and fonts

Color names: `accent`, `ink`, `muted`, `bg`, `surface`, `red`, `orange`,
`yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `gray`. Each look has its
own version of each color, so scenes keep working when you change the look.
`s.color(name)` returns the CSS color and `s.tint(name)` the light fill. Font
roles: `display`, `body`, `hand`, `mono`.

## Things that break

- Calling an element only sometimes (`if (s.t > 3) s.box(...)`). Always call
  it and use `at` and `out`. Sound effects and checks depend on this.
- An arrow or annotation that points to an `id` drawn later in the function.
- `s.camera()` after other elements. It has to come first.
- An `at` later than the end of the scene. Make the scene longer with
  `{hold=2}` or `{min=6}` in the script.
- Randomness from anything other than `s.rand()`, `s.noise()` or
  `Math.random()` inside the scene function.
- Text in AI images. Put words on screen with `s.text`.

## Working on explainroo itself

- `src/` is the Node side: script, voice, word timing, timeline, server,
  rendering, checks and images. `engine/` runs in the page: the scene API
  (`stage.js`), drawing (`pen.js`), looks, transitions, captions and audio
  (`engine/audio/`).
- Run `npm test` after changes. For engine changes, render the videos in
  `examples/` and look at their stills and sheets.
- `dev/audio-lab.mjs` renders every music style and sound and measures them.
- `npm run build:icons` rebuilds the icons from `lucide-static`, and
  `npm run build:fonts` downloads the fonts again.
