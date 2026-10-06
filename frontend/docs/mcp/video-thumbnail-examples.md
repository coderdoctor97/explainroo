# Video thumbnail reference implementations

The requested MCP endpoints failed at TLS connection time. The local attempt
record is [`../../mcp_rules/video-thumbnail.json`](../../mcp_rules/video-thumbnail.json),
not a fetched rule export. Searches used authenticated `gh api`; the initial
queries/results are in `video-thumbnail-searches.json`. The Video.js search
was broadened from `path:examples` to `extension:html` to locate its guide.

Three relevant implementations/libraries were inspected through GitHub's
contents API:

1. **MDN HTML video example** —
   [extra-video-features.html](https://github.com/mdn/learning-area/blob/d55e1c2e3ff401519811b64e5b2a7d3643b43d0f/html/multimedia-and-embedding/video-and-audio-content/extra-video-features.html)
   ```html
   <video controls width="400" height="400"
          loop muted preload="auto" poster="poster.png">
   ```
   Static relative sibling image; includes MP4/WebM sources and a download link
   for browsers without video support. That link is **not** a failed-poster
   fallback, and the sample does not implement failed-image recovery. Only the
   poster-reference pattern is adopted here, not looping or preload-auto.

2. **Video.js poster option** —
   [options.html](https://github.com/videojs/video.js/blob/1aea7c9cdec4e530cb5b96efdb98768e9e1cedf0/docs/legacy-docs/guides/options.html#poster)
   ```html
   <video poster="myPoster.jpg" ...>
   ```
   The guide also supports `{ "poster": "myPoster.jpg" }` player options and
   describes using a video frame or custom title screen. It does not specify a
   broken-poster fallback in this section. No Video.js dependency is necessary
   for this project's native player.

3. **Astro's Mux integration** —
   [Mux guide](https://github.com/withastro/docs/blob/5ad9aaeef5e168786baecb4ab337e912d87cb733/src/content/docs/en/guides/media/mux.mdx)
   ```astro
   <MuxPlayer
     playbackId="DS00Spx1CV902MCtPj5WknGlR102V5HFkDe"
     metadata={{ video_title: 'My Astro Video' }}
   />
   ```
   Mux Player provides automatic thumbnail/poster images from hosted video
   assets. The guide separately exposes standard poster/controls attributes on
   `mux-video`. It does not document missing-image fallback in the inspected
   example. Studio remains local: existing saved stills supply thumbnails and
   a bundled image replaces the need for a hosted thumbnail service.

## Accessibility decisions

`video` has no poster-alt attribute, and `figure` does not take image alt text.
Keep the player's accessible name, native controls, caption tracks and
transcript. The thumbnail is a visual preview, not a replacement for captions
or a separate interactive play button. This implementation leaves playback,
preload, captions and transcript behavior unchanged. Reference examples are
not treated as proof of complete accessibility conformance.
