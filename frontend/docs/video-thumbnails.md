# Video thumbnails

## Audit and implementation

Scope: only `frontend/`. There is one production `<video>` declaration,
`src/components/AccessibleVideo.tsx`, used by `src/stages/Render.tsx`.
The component previously forwarded an optional `poster`, but Render supplied
none. Existing video strings in checker tests are fixtures, not product players;
`layout: 'poster'` describes scene layout, not an HTML video poster.

- Render now supplies the first saved scene still when available. The existing
  API returns a sorted list and serves it at the same project file endpoint
  already used by the still gallery.
- AccessibleVideo always emits a nonempty poster, including in server-rendered
  markup. The bundled preview stays visible until a custom image loads with a
  nonzero natural width.
- Empty/whitespace, missing, failed or zero-width custom images retain the
  bundled preview. Effect cleanup prevents a stale image request from replacing
  a newer poster. The fallback is not retried indefinitely.
- The Image probe handles image failures; the video's error event cannot be
  relied upon for poster failures. It downloads an image, not the video.
- There is no lazy-loading delay for the default preview. Playback, controls,
  preload="metadata", captions and transcripts are unchanged.

## Asset and deployment

`src/assets/video-thumbnail/placeholder.webp` is an original, geometric Studio
preview: **640×360, 1,766 bytes**. It was created from simple vector shapes and
encoded at WebP quality 85, with no external stock-image license or model/API.
It is deliberately visible rather than a one-pixel stand-in. It is a generic
fallback, not a purported frame from the user's video.

The component imports it with Vite's `?no-inline` suffix. Vite emits a hashed
asset and respects deployment `base`; there is no hard-coded `/public` or
localhost browser URL. No external image service is required. Existing stills
remain same-origin API URLs. A saved still may represent an earlier build;
use **Save stills** to refresh project-specific previews after editing a video.

`sharp` is a frontend dev dependency used to decode images in tests. It is not
imported into the browser bundle.

## Tests and enforcement

From repository root, after installing root dependencies:

```sh
npm ci --prefix frontend
npm run --prefix frontend test:posters
npm test --prefix frontend
npm run --prefix frontend validate:html
npm run lint:html
npm run build
```

The new aggregate `npm test --prefix frontend` runs all frontend test folders,
including poster tests, so CI can use one command. The existing HTML validator
now requires a nonempty `poster` on rendered video elements; the existing UI
runner uses that configuration as well. Negative tests prove missing/empty
poster failures.

Eleven new tests cover defaults and server-rendering, custom image success,
image failure and zero width, stale callbacks, actual Render still selection,
HTTP delivery and image decoding, asset size, accessibility, validator failure
fixtures and nested-base production output. The HTTP test starts and closes a
real Vite server, fetches the emitted poster URL, and decodes its bytes with
sharp. Image event tests simulate success/failure in jsdom. These are component
and HTTP/build integration tests, **not real-browser E2E tests**.

No root GitHub Actions file was changed: the task remains frontend-only and no
root workflow exists. Automatic PR checks and branch protection remain
unconfigured. A future authorized root CI job must install both lockfiles and
run the commands above; placing a workflow inside frontend would not activate it.

## Verification and limitations

- Poster suite: **11/11 passed**.
- Prior suites: HTML **12/12**, semantic **10/10**, input types **6/6**, form
  validation **14/14**; root unit tests **44 passed, 1 existing browser skip**.
- HTML lint, zero-error HTML validation, and production build: **passed**.
- The emitted production bundle includes the hashed WebP. A build test also
  verifies a `/nested/` deployment base and decodes the emitted image.
- Focused player axe test: **passed**, color-contrast disabled in jsdom.
- Existing UI suite: **159/161**, with the same two known script-expression and
  video-without-controls fixture failures; no new failures observed.
- Typecheck: unchanged unused `i` at `src/captions-vtt.ts:45`.
- The fallback asset was visually inspected. Actual browser image loading,
  playback and screen-reader behavior were not manually tested because Chrome
  is unavailable. No screenshot or real-browser `naturalWidth` result is claimed.
- MCP primary/related-rule retrieval failed at TLS time; no official rule
  export or remote verification pass is claimed.

References: [GitHub examples](mcp/video-thumbnail-examples.md) and
[connection record](../mcp_rules/video-thumbnail.json).
