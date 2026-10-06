# Video Accessibility

**Rule**: [html/video-accessibility](https://frontendchecklist.io/rules/html/video-accessibility)  
**Scope**: `frontend/` subfolder

## What the rule requires

Every video and audio element on the page must meet five requirements:

1. **Controls** — the user must be able to play, pause, seek, and change volume.
2. **Captions** — a `<track kind="captions">` element (or equivalent) for deaf and hard-of-hearing viewers.
3. **ARIA label** — `aria-label` or `aria-labelledby` so screen readers can name the player.
4. **No autoplay** — the page must not start media without the user asking.
5. **Transcript** — a text transcript the viewer can read alongside or instead of the video.

## How explainroo implements this

### The `AccessibleVideo` component

`frontend/src/components/AccessibleVideo.tsx` wraps a `<video>` element with all the accessibility requirements:

- `controls` — always present, the user can operate the player.
- `aria-label="Video player – {title}"` — screen readers announce the video title.
- `preload="metadata"` — the browser only loads enough to show the first frame, not the entire video.
- **No autoplay** — the component does not accept an `autoplay` prop. The video only plays when the user presses Play.
- **Captions** — pass `captions={[{ src, srclang, label }]}` and the component renders `<track kind="captions">` elements. The API server generates WebVTT from the word timings at `/api/projects/:id/captions.vtt`.
- **Transcript** — pass `transcriptUrl` (the API serves it at `/api/projects/:id/transcript.txt`) or `transcriptText` and the component shows a "Show transcript" button that toggles a collapsible region.
- **Pause on page hide** — when the viewer switches tabs, the video pauses automatically.

### The caption pipeline

The explainroo engine already burns captions into the video frames (drawn on the canvas by `engine/captions.js`). The MP4 therefore shows the words as they are spoken, regardless of whether the viewer has captions on. The WebVTT track is a second layer — it is what the HTML5 `<video>` player shows when the viewer turns captions on in the player UI, and it is what screen readers use.

The WebVTT is generated server-side from the same word timings the engine uses:

```
GET /api/projects/:id/captions.vtt
```

returns a standard WebVTT file with one cue per phrase. The phrases are built by the same logic the Transport uses for the karaoke line: break at a long pause, at a sentence end, or when the line gets too long.

### The transcript

```
GET /api/projects/:id/transcript.txt
```

returns the same words as plain text, one phrase per line. The transcript is fetched lazily — the component only requests it when the viewer clicks "Show transcript".

### The audio element

The `<audio>` element in `App.tsx` is the voice-over player, controlled by the Transport component. It has `aria-label="Voice-over audio"`, no autoplay, and pauses when the viewer switches tabs.

## How to supply caption files

The captions are generated automatically from the word timings. If you want to provide your own WebVTT file:

1. Create a `.vtt` file in the standard format:
   ```
   WEBVTT

   1
   00:00:01.000 --> 00:00:03.500
   A cache is a small copy

   2
   00:00:03.600 --> 00:00:06.200
   of something slow, kept close by
   ```
2. Upload it as a source file alongside the transcript and timings.
3. Pass the URL to the `AccessibleVideo` component's `captions` prop.

## How to add audio-description tracks

Audio descriptions narrate the visual content for blind viewers. To add one:

1. Create a separate audio track (e.g., `description.mp3`) with narration of the visuals.
2. Create a WebVTT file with `kind="descriptions"` pointing at the audio track.
3. Pass it as a caption track with `kind: 'descriptions'` (the component supports this via the `captions` prop, which accepts any track kind).

## How to link a transcript

The transcript is served automatically at `/api/projects/:id/transcript.txt`. The `AccessibleVideo` component fetches it lazily when the viewer clicks "Show transcript". To provide your own transcript, pass `transcriptText="..."` instead of `transcriptUrl`.

## Why autoplay is disabled

Autoplay violates WCAG 2.2 SC 1.4.11 (Non-text Contrast) and creates problems for:

- **Screen reader users** — autoplaying audio drowns out the screen reader.
- **Cognitive load** — unexpected motion and sound make the page harder to use.
- **Mobile users** — autoplay wastes bandwidth and battery.

The `AccessibleVideo` component does not accept an `autoplay` prop. If a project needs background video, use `preload="metadata"` and let the user press Play.

## The guard

`frontend/scripts/check-video-accessibility.mjs` enforces the rule at build time and in CI. It scans every HTML file and every component file (TSX, JSX, Vue, Svelte, etc.) and flags:

- `<video>` without `controls`
- `<video>` or `<audio>` without `aria-label` or `aria-labelledby`
- `<video>` or `<audio>` with `autoplay`
- `<video>` without `<track kind="captions">`

The guard is wired into `npm run lint:html` and `npm run test:ui`.
