import { useCallback, useEffect, useRef, useState } from 'react';
import defaultPoster from '../assets/video-thumbnail/placeholder.webp?no-inline';
import { type Phrase, transcriptFromPhrases } from '../captions-vtt';

// An accessible <video> wrapper. The Front-End Checklist rule
// html/video-accessibility says every video player needs:
//
//   · controls (the user must be able to play, pause, seek, and change volume)
//   · captions (a <track kind="captions"> for deaf and hard-of-hearing viewers)
//   · no autoplay (the page must not start playing without asking)
//   · an aria-label so screen readers can describe the player
//   · a transcript the viewer can read alongside or instead of the video
//   · pause on page hide (visibilitychange) so a tab the viewer switches
//     away from does not keep talking
//
// The explainroo engine burns captions into the video frames, so the MP4
// already shows the words as they are spoken. This component adds the
// player-level tracks and transcript the HTML5 spec and WCAG expect.

// Vite emits a hashed, base-aware URL in production; no hard-coded public root.
export const DEFAULT_VIDEO_POSTER = defaultPoster;

type CaptionTrack = {
  src: string;
  srclang: string;
  label: string;
  default?: boolean;
};

type Props = {
  src: string;
  title: string;
  poster?: string;
  captions?: CaptionTrack[];
  transcriptPhrases?: Phrase[];
  transcriptText?: string;
  transcriptUrl?: string;
  width?: number;
  height?: number;
};

export function AccessibleVideo({ src, title, poster, captions, transcriptPhrases, transcriptText, transcriptUrl, width, height }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const candidatePoster = poster?.trim() || null;
  const [loadedPoster, setLoadedPoster] = useState<string | null>(null);
  // A video error event reports media errors, not reliably poster failures.
  // Keep the bundled preview visible until a supplied image actually loads.
  useEffect(() => {
    if (!candidatePoster || candidatePoster === defaultPoster) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setLoadedPoster(image.naturalWidth > 0 ? candidatePoster : null);
    };
    image.onerror = () => { if (active) setLoadedPoster(null); };
    image.src = candidatePoster;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [candidatePoster]);
  const resolvedPoster = candidatePoster && loadedPoster === candidatePoster ? candidatePoster : defaultPoster;
  const [showTranscript, setShowTranscript] = useState(false);
  const [fetchedTranscript, setFetchedTranscript] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const transcriptId = useRef(`transcript-${Math.random().toString(36).slice(2, 8)}`);

  // Pause when the viewer switches to another tab or minimises the window.
  // The video keeps its position, so pressing play when the tab comes back
  // picks up where it left off.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !video.paused) {
        video.pause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const toggleTranscript = useCallback(() => {
    setShowTranscript((v) => {
      const next = !v;
      // Fetch the transcript the first time the viewer opens it. A transcript
      // passed as text or phrases is already available, so this only fires for
      // the URL variant — and only once.
      if (next && fetchedTranscript === null && transcriptUrl && !transcriptText && !transcriptPhrases) {
        fetch(transcriptUrl)
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
          .then((text) => setFetchedTranscript(text))
          .catch(() => setTranscriptError('the transcript could not be loaded'));
      }
      return next;
    });
  }, [fetchedTranscript, transcriptUrl, transcriptText, transcriptPhrases]);

  const transcriptContent = transcriptText || (transcriptPhrases ? transcriptFromPhrases(transcriptPhrases) : fetchedTranscript) || '';
  const hasTranscript = !!(transcriptContent || transcriptUrl);

  return (
    <div className="accessible-video stack">
      <video
        ref={videoRef}
        controls
        preload="metadata"
        src={src}
        poster={resolvedPoster}
        width={width}
        height={height}
        aria-label={`Video player – ${title}`}
        aria-describedby={transcriptContent ? transcriptId.current : undefined}
      >
        {captions?.map((track) => (
          <track
            key={track.src}
            kind="captions"
            src={track.src}
            srcLang={track.srclang}
            label={track.label}
            default={track.default}
          />
        ))}
        Your browser does not support the video element.
      </video>

      {hasTranscript && (
        <div className="transcript-toggle">
          <button
            type="button"
            className="btn small quiet"
            onClick={toggleTranscript}
            aria-expanded={showTranscript}
            aria-controls={transcriptId.current}
          >
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </button>
          {showTranscript && (
            <div
              id={transcriptId.current}
              className="transcript"
              role="region"
              aria-label={`Transcript of ${title}`}
            >
              {transcriptError ? (
                <p className="dim">{transcriptError}</p>
              ) : transcriptContent ? (
                <p className="mono" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {transcriptContent}
                </p>
              ) : (
                <p className="dim">loading transcript…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
