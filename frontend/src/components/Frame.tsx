import type { Scene, Style } from '../api';

// A rough frame of one scene, painted with the video's own colours and fonts.
// It is not a render: it is the honest shape of the look, which type, which
// accent, what sits where. The real frames come from "Save stills".
export function Frame({
  style,
  scene,
  layout,
  index = 0,
  total = 1,
  title,
}: {
  style: Style;
  scene: Scene | null;
  layout: string;
  index?: number;
  total?: number;
  title: string;
}) {
  const role = style.id === 'paper' || style.id === 'chalk' || style.id === 'blueprint' ? 'display' : 'body';
  const font = (r: 'display' | 'body') => `"${style.fonts[r] || 'Space Grotesk'}", var(--font-body)`;
  const chips = scene?.chips.slice(0, layout === 'cards' ? 4 : 3) || [];
  const narration = scene?.text || 'Your narration appears here, word by word, as the voice says it.';
  const heading = scene?.heading || title || 'The heading of a scene';
  const pad = (n: number) => String(n).padStart(2, '0');

  if (layout === 'poster') {
    return (
      <div className="frame" style={{ background: style.swatch.bg, color: style.swatch.ink, fontFamily: font('body') }}>
        <div className="f-count">
          {pad(index + 1)} / {pad(total)}
        </div>
        <div className="f-head" style={{ fontFamily: font('display'), fontSize: 'clamp(1.3rem, 3.4vw, 2.2rem)', maxWidth: '86%', margin: 'auto', textAlign: 'center' }}>
          {heading}
        </div>
        <div className="f-note" style={{ textAlign: 'center', marginTop: 0 }}>
          one line, one number, in the video's own type
        </div>
      </div>
    );
  }

  return (
    <div className="frame" style={{ background: style.swatch.bg, color: style.swatch.ink, fontFamily: font('body') }}>
      <div className="f-count">
        {pad(index + 1)} / {pad(total)}
      </div>
      <div className="f-head" style={{ fontFamily: font('display') }}>
        {heading}
      </div>
      <div className="f-rule" style={{ background: style.swatch.accent }} />
      <div className="f-body" style={{ fontFamily: font(role) }}>
        {layout === 'cards' ? chips.map((c) => c.word).join(' · ') || narration : narration}
      </div>
      <div className="f-chips">
        {(layout === 'cards' ? [] : chips).map((c) => (
          <span key={c.word} className="f-chip" style={{ borderColor: style.swatch.accent, color: style.swatch.accent }}>
            {c.word}
          </span>
        ))}
      </div>
    </div>
  );
}
