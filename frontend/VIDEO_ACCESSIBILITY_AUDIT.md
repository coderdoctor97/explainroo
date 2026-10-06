# Video Accessibility Audit — html/video-accessibility

**Rule**: [html/video-accessibility](https://frontendchecklist.io/rules/html/video-accessibility)  
**Date**: 2026-10-06  
**Scope**: `frontend/` subfolder (all changes applied strictly to the frontend subfolder)

## Summary

The frontend had two media elements that did not fully comply with the accessibility rule:

1. **`frontend/src/stages/Render.tsx`** — a raw `<video>` tag without `aria-label`, caption tracks, or transcript.
2. **`frontend/src/App.tsx`** — an `<audio>` element without `aria-label`.

Both have been fixed.

## Pre-change findings

| File | Element | Problem | Status |
|------|---------|---------|--------|
| `frontend/src/stages/Render.tsx` | `<video controls src="...">` | No `aria-label`, no `<track kind="captions">`, no transcript | ❌ Fixed |
| `frontend/src/App.tsx` | `<audio>` | No `aria-label` | ❌ Fixed |

## Post-change state

| File | Element | Changes | Status |
|------|---------|---------|--------|
| `frontend/src/stages/Render.tsx` | `<AccessibleVideo>` | Replaced raw `<video>` with the new `AccessibleVideo` component that adds `aria-label`, `<track kind="captions">`, transcript toggle, and pause-on-hide. Captions are served as WebVTT from `/api/projects/:id/captions.vtt`. | ✅ Fixed |
| `frontend/src/App.tsx` | `<audio>` | Added `aria-label="Voice-over audio"` and `visibilitychange` handler to pause when the tab is hidden. | ✅ Fixed |

## What the AccessibleVideo component provides

| Requirement | How it is met |
|-------------|---------------|
| Controls | `controls` attribute always present |
| Captions | `<track kind="captions">` from the `captions` prop; WebVTT generated from word timings |
| ARIA label | `aria-label="Video player – {title}"` always present |
| No autoplay | Component does not accept an `autoplay` prop |
| Transcript | "Show transcript" button fetches from `/api/projects/:id/transcript.txt` |
| Pause on hide | `visibilitychange` listener pauses the video when the tab is hidden |

## Caption pipeline

The engine burns captions into the video frames (`engine/captions.js`). The WebVTT track is a second layer for the HTML5 player and screen readers. The API server generates it from the same word timings:

- `GET /api/projects/:id/captions.vtt` — WebVTT captions
- `GET /api/projects/:id/transcript.txt` — plain text transcript

Both endpoints use the same phrase-building logic as the engine and the Transport karaoke display.

## Guard script

`frontend/scripts/check-video-accessibility.mjs` verifies:

- Every `<video>` has `controls`, `aria-label`, no `autoplay`, and `<track kind="captions">`
- Every `<audio>` has `aria-label` and no `autoplay`
- Component files (TSX, JSX, etc.) are checked for raw media tags missing accessibility attributes
- The `AccessibleVideo` component itself is exempt from the per-attribute checks (it adds them at render time)

Wired into `npm run lint:html` and `npm run test:ui`.
