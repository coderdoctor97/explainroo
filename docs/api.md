# Scene API

Every scene in `script.md` has a function with the same id in `scenes.js`:

```js
export default {
  intro(s) {
    s.title('How DNS works', { at: 0 });
    s.icon('globe', { y: 700, at: 'browser' });
  },
};
```

The function draws **one frame**. explainroo calls it for every frame with a
fresh `s`, so the whole scene is a function of time: never keep state between
calls, and never use timers. Give each element an `at` time and the theme
animates it in; give it an `out` time and it animates out.

The canvas is 1920x1080 for 16:9 (1080x1920 for 9:16, 1080x1080 for 1:1,
1080x1350 for 4:5). Coordinates are pixels from the top-left. Positions (`x`,
`y`) are the **center** of an element unless the method says otherwise.

## Contents

- [Time](#time)
- [Layout](#layout)
- [Common options](#common-options)
- [Text](#text)
- [Shapes and arrows](#shapes-and-arrows)
- [Icons and images](#icons-and-images)
- [Emphasis](#emphasis)
- [Lists, numbers and charts](#lists-numbers-and-charts)
- [Code and terminal](#code-and-terminal)
- [Camera, groups and custom drawing](#camera-groups-and-custom-drawing)
- [Sound](#sound)
- [Colors and fonts](#colors-and-fonts)
- [Themes](#themes)
- [Rules](#rules)

## Time

| Member | Meaning |
|---|---|
| `s.t` | seconds since this scene started |
| `s.T` | seconds since the video started |
| `s.dur`, `s.end` | length of this scene in seconds |
| `s.voice` | `{ start, end }` of the narration inside the scene |
| `s.words` | every narrated word: `{ text, start, end }` in scene seconds |
| `s.cue(word, n = 1)` | when the n-th occurrence of a word or phrase starts being spoken |
| `s.cueEnd(word, n = 1)` | when it finishes |
| `s.mark(name)` | the time of a `[#name]` marker in the narration |
| `s.time(v)` | turns a number, a spoken word or `"#mark"` into seconds |
| `s.p(at, dur = 0.6, ease = 'inOut')` | 0 to 1 progress of your own animation |
| `s.since(at)` | seconds since `at` (negative before) |
| `s.between(a, b)` | true while `a <= t < b` |

Every `at` and `out` option accepts the same three forms:

```js
s.box('Resolver', { at: 2.4 });          // seconds into the scene
s.box('Resolver', { at: 'resolver' });   // when the word "resolver" is spoken
s.box('Resolver', { at: '#ask' });       // at the [#ask] marker in script.md
```

Word cues ignore case and punctuation. A phrase works too (`'right server'`).
An unknown word or marker throws an error that lists the closest words, so
`explainroo check` finds typos.

Easing names: `linear`, `in`, `out`, `inOut`, `outBack`, `outElastic`,
`outQuart`, `inOutSine`. `s.ease.out(p)` and friends are available directly,
with `s.lerp(a, b, p)` and `s.clamp(v, lo, hi)`.

## Layout

| Member | Meaning |
|---|---|
| `s.W`, `s.H` | canvas width and height |
| `s.cx`, `s.cy` | canvas center |
| `s.safe` | `{ x, y, w, h, left, top, right, bottom }`, the area with a 7% margin |
| `s.row(n, { width, x })` | n x positions spread over `width` (default 72% of W) |
| `s.col(n, { height, y })` | n y positions spread over `height` |
| `s.grid(cols, rows, { x, y, w, h, gap })` | cells `{ x, y, w, h }`, row by row |
| `s.get(id)` | geometry of an element drawn earlier with that `id` |

Most elements return their geometry: `{ x, y, w, h, left, right, top, bottom }`.
Use it to place the next element:

```js
const card = s.box('Cache', { x: 500, y: 540, at: 1 });
s.note('checked first', { x: card.x, y: card.bottom + 40, at: 1.4 });
```

## Common options

Most elements accept these:

| Option | Meaning |
|---|---|
| `at` | when it appears (default `0`) |
| `out` | when it leaves (default: never) |
| `enter` | `draw`, `write`, `type`, `words`, `sync`, `pop`, `rise`, `fade`, `zoom`, `drop`, `slide-left`, `slide-right`, `slide-up`, `slide-down`, `none` |
| `exit` | `fade`, `pop`, `rise`, `drop`, `slide-left`, `slide-right`, `none` |
| `dur` | length of the entrance in seconds |
| `id` | a name so arrows, `annotate` and `s.get` can find it |
| `color` | a theme color name (`blue`, `accent`, `ink`, `muted`, ...) or any CSS color |
| `opacity`, `scale`, `rotate` | extra transform (`rotate` in degrees) |
| `float` | pixels of gentle idle drift, to keep a still element alive |
| `sfx` | sound on entrance: a sound name, or `false` for silence |

The theme picks sensible entrances: in `paper`, `chalk` and `blueprint` shapes
are drawn stroke by stroke and text is written on; in `clean` and `midnight`
shapes pop and text rises.

## Text

```js
s.title('How DNS works', { at: 0 });                 // display font, 104px, centered at 44% height
s.subtitle('the internet phone book', { at: 0.8 });   // body font, 46px, muted, at 60% height
s.text('Every site has an *address*', { y: 300, size: 64, at: 'address' });
s.note('about 20 ms', { x: 1400, y: 820, at: 3 });    // 32px, muted
```

`s.text(str, options)`:

| Option | Default | Meaning |
|---|---|---|
| `x`, `y` | center | anchor point |
| `size` | 48 | font size in px |
| `font` | `body` | `display`, `body`, `hand` or `mono` |
| `weight` / `bold` | theme | font weight, or `bold: true` |
| `align` | `center` | `left` (x is the left edge), `center`, `right` |
| `valign` | `middle` | `top` (y is the top), `middle`, `bottom` |
| `maxWidth` | 80% of W | wrap width |
| `lineHeight` | 1.24 | line spacing |
| `color` | `ink` | text color |
| `mark` | `accent` | color for `*accented*` words |
| `bg` | none | `true` or a color: draws a rounded card behind the text |
| `padding`, `radius`, `border` | | card options when `bg` is set |
| `enter` | theme | also `write` (written on), `type` (typewriter, `cps` chars per second), `words` (word by word), `sync` (each word appears as it is spoken) |

Wrap words in `*asterisks*` to color them with the accent: `'*Three* steps'`.
A newline (`\n`) forces a line break.

`enter: 'sync'` shows the words in time with the narration. It works best for
a short quote or key phrase that the narrator says word for word.

## Shapes and arrows

```js
s.box('Resolver', { id: 'res', x: 960, y: 540, icon: 'server', color: 'blue', at: 'resolver' });
s.circle({ id: 'you', x: 400, y: 540, r: 90, label: 'You', color: 'green', at: 0.5 });
s.arrow('you', 'res', { label: 'asks', at: 'asks' });
s.arrow([300, 900], [1600, 900], { bend: 0.3, dashed: true, color: 'muted', at: 5 });
s.line([[200, 800], [900, 700], [1700, 820]], { color: 'accent', at: 2 });
s.path('M0 0 C 200 -150 400 150 600 0', { x: 660, y: 540, at: 3 });
```

`s.box(label, options)` draws a rounded card that sizes itself to its label.

| Option | Meaning |
|---|---|
| `w`, `h`, `minW`, `minH` | fixed or minimum size (otherwise fits the label) |
| `size`, `font`, `weight` | label font (default 44px, body font, semi-bold) |
| `icon`, `iconSize`, `iconColor` | an icon above the label |
| `color` | outline color and a light tint for the fill |
| `fill` | explicit fill color (`'none'` for an outline only) |
| `stroke`, `width`, `dashed`, `border: false` | outline options |
| `radius` | corner radius |
| `shape` | `rect` (default) or `ellipse` |
| `textColor` | label color (chosen automatically for contrast otherwise) |
| `fillStyle` | hand-drawn looks: `solid`, `hachure`, `cross-hatch`, `zigzag`, `dots` |

`s.circle({ r, label, ... })` takes the same options as a box.

`s.arrow(from, to, options)`: `from` and `to` are `[x, y]`, `{ x, y }` or the
`id` of an element drawn earlier (the arrow then stops at its edge).

| Option | Meaning |
|---|---|
| `bend` | curve amount, about -1 to 1 (0 is straight) |
| `head` | `end` (default), `start`, `both`, `none` |
| `label`, `labelSize`, `labelColor`, `labelOffset` | text beside the middle of the arrow |
| `gap` | space between the arrow and the elements it connects (default 14) |
| `dashed`, `width`, `headSize`, `color` | styling |

`s.connect(a, b, options)` is the same as `s.arrow`.

Arrows and lines are drawn from start to end by default.

## Icons and images

```js
s.icon('database', { x: 1500, y: 540, size: 140, color: 'purple', at: 'database' });
s.icon('lock', { bg: 'circle', color: 'green', label: 'Encrypted', at: 4 });
s.image('assets/app.png', { w: 1100, frame: 'browser', url: 'app.example.com', at: 0.5 });
```

There are 1,854 icons from [Lucide](https://lucide.dev). Search them with
`explainroo icons <word>`. Icon options: `size` (default 120), `color`,
`weight` (stroke weight in icon units, default 2), `bg` (`true`, `'circle'`,
`'square'` or a color), `bgScale`, `label`, `labelSize`.

`s.image(src, options)` draws a file from the project's `assets/` folder:
`w` and/or `h` (keeps the aspect ratio), `fit` (`cover` or `contain`),
`radius`, `frame` (`none`, `browser`, `window`, `phone`), `url` (for the browser
frame), `border`, `shadow: false`, `kenburns: true` for a slow push-in.

## Emphasis

```js
s.text('It is *not* magic', { id: 'claim', y: 400, at: 0 });
s.annotate('claim', { type: 'underline', at: 'magic' });
s.annotate({ x: 960, y: 700, w: 400, h: 90 }, { type: 'circle', color: 'red', at: 3 });
```

`s.annotate(target, options)` marks an element (`id`) or a box
`{ x, y, w, h }`. `type`: `underline`, `circle`, `box`, `highlight`, `strike`,
`cross`, `bracket`. Options: `color` (default accent), `padding`, `width`, `dur`.

## Lists, numbers and charts

```js
s.list(['Browser cache', 'Resolver', 'Root server', 'Name server'], { x: 360, y: 280, at: 'first', stagger: 1.1 });
s.list([{ text: 'Fast', at: 'fast' }, { text: 'Free', at: 'free' }], { bullet: 'check' });
s.number(1500000, { suffix: ' requests', at: 'million', y: 480 });
s.bars([{ label: '2022', value: 12 }, { label: '2023', value: 19 }, { label: '2024', value: 31 }], { at: 1, suffix: 'k' });
s.lineChart([3, 5, 4, 8, 13, 21], { labels: ['M', 'T', 'W', 'T', 'F', 'S'], at: 1 });
s.pie([{ label: 'Images', value: 55 }, { label: 'Scripts', value: 30 }, { label: 'Other', value: 15 }], { donut: 0.55, at: 1 });
```

`s.list(items, options)`: items are strings or `{ text, at, icon, color, out }`.
`x` is the **left** edge and `y` the **top** of the list. Options: `size` (50),
`width`, `gap`, `bullet` (`dot`, `dash`, `number`, `check`, `arrow` or any icon
name), `bulletColor`, `at` (first item, or an array of times), `stagger`
(seconds between items, default 0.7), `enter`. Each item plays a rising note.

`s.number(value, options)` counts up from `from` (default 0) over `dur`
(default 1.4 s) with ticks: `prefix`, `suffix`, `decimals`, `separator`,
`group: false`, plus text options (`size` 150, display font, accent color).

`s.bars(data, options)`: `x`, `y`, `w`, `h`, `max`, `stagger`, `growDur`,
`values: false`, `prefix`, `suffix`, `format(v)`, `labelSize`, `valueSize`,
`fillStyle`. Each item may have its own `color`.

`s.lineChart(values, options)`: `x`, `y`, `w`, `h`, `min`, `max`, `labels`,
`dots: false`, `area: false`, `color`, `dur`.

`s.pie(data, options)`: `x`, `y`, `r`, `donut` (0 to 0.8), `labels: false`,
`labelOffset`, `dur`.

## Code and terminal

```js
s.code(`const res = await fetch(url);\nconst data = await res.json();`, { lang: 'js', title: 'app.js', at: 0.5 });
s.terminal(['$ npm install explainroo', 'added 42 packages in 3s', '$ npx explainroo render'], { at: 1 });
```

`s.code(source, options)`: `lang` (`js`, `ts`, `py`, `go`, `rust`, `php`, `sh`,
`sql`, `json`), `size` (32), `w`, `title` (a file name, or `false` for no title
bar), `lineNumbers: false`, `reveal` (`type` default, `lines`, `none`), `cps`
(typing speed), `lineDelay`, `highlight` (line numbers to highlight, 1-based)
and `highlightAt`.

`s.terminal(lines, options)`: lines starting with `$ ` are typed commands,
other lines are output. Lines can also be `{ cmd, at }` or
`{ out, at, color }`. Options: `w`, `size`, `rows` (minimum height), `title`,
`prompt`, `cps` (22), `outputDelay`, `lineGap`. Typing plays keyboard sounds.

## Camera, groups and custom drawing

```js
intro(s) {
  s.camera([{ at: 'zoom', x: 1400, y: 500, zoom: 1.8, dur: 1.2 }, { at: '#back', x: 960, y: 540, zoom: 1 }]);
  // ...everything drawn after this call is seen through the camera
}
```

`s.camera(keys)` must be called **first** in the scene function. Each key moves
the view to `x`, `y` (the point shown in the center), `zoom`, and optionally
`rotate`, over `dur` seconds (default 1.1) with `ease`.

`s.group({ x, y, scale, rotate, at, out, enter }, () => { ... })` moves a set of
elements together. Coordinates inside are relative to `x`, `y`; times stay
scene times.

`s.draw({ x, y, at, out, enter }, (ctx, life) => { ... })` is an escape hatch
for anything the kit does not cover: `ctx` is the raw canvas 2D context moved
to `x`, `y`, and `life.p` is the 0 to 1 entrance progress, `life.local` the
seconds since `at`. `s.ctx` is also available directly.

`s.burst({ x, y, at, count, colors, spread, power, size })` fires confetti.

`s.bg(color)` paints over the theme background.

`s.rand(i, seed)`, `s.noise(x, seed)` and `s.wiggle(amount, speed, seed)` give
repeatable randomness. `Math.random()` is also repeatable inside a scene, but
use `s.rand(i)` when an element needs its own stable value.

## Sound

Entrances make sounds automatically, chosen by the theme: hand-drawn strokes
scribble, cards pop, arrows whoosh, list items play rising notes, numbers
tick, typing clicks, and every scene change swipes. Set `sfx: false` on an
element to silence it, or `"sfx": "minimal"` in `video.json` to keep only
transitions and the sounds you add yourself.

`s.sfx(name, at, { gain, dur, pitch })` adds a sound. Names: `pop`, `click`,
`whoosh`, `swipe`, `tick`, `type`, `ding`, `chime`, `thud`, `scribble`,
`chalk`, `rise`, `sparkle`, `blip`, `error`. `dur` sets the length of `type`,
`scribble`, `chalk` and `rise` (`rise` ends at `at + dur`, so start it before
a reveal). `pitch` picks the step of `blip` in the music's scale.

Music is generated to fit the video and ducks under the narration. Choose it
in `video.json`: `"music": "warm"` (or `upbeat`, `calm`, `tech`, `playful`),
`"music": { "style": "calm", "volume": 0.35 }`, or `"music": false`.

## Colors and fonts

Color names: `accent`, `ink`, `muted`, `bg`, `surface`, `red`, `orange`,
`yellow`, `green`, `teal`, `blue`, `purple`, `pink`, `gray`. Each theme maps
them to its own palette, so a scene keeps working when you switch themes.
`s.color(name)` returns the CSS color; `s.tint(name)` returns the light fill.
Any CSS color string also works.

Font roles: `display` (titles), `body`, `hand` (handwriting), `mono` (code).

## Themes

| Theme | Look | Transition | Music |
|---|---|---|---|
| `paper` | hand-drawn marker on warm paper | brush | warm |
| `clean` | crisp flat cards with soft shadows | slide | upbeat |
| `chalk` | chalk on a green board, hatched fills | brush | calm |
| `blueprint` | technical drafting on blueprint blue | wipe | tech |
| `midnight` | dark developer look with glowing accents | zoom | tech |

Set it in `video.json` (`"theme": "chalk"`). Set a scene's transition in
`script.md` (`## intro {transition=cut}`): `fade`, `slide`, `wipe`, `zoom`,
`brush`, `cut`.

## Rules

- Draw the whole frame every call. Never store state outside the function.
- Call every element on every frame, and control visibility with `at` and
  `out` instead of `if (s.t > 3)`. Sound effects and checks rely on it.
- Tie reveals to the narration: `at: 'word'` or `at: '#mark'`, not guessed
  seconds.
- Keep text at 32px or larger on a 1920x1080 canvas, and inside `s.safe`.
- Draw things you refer to by `id` before the arrows or annotations that use
  them.
