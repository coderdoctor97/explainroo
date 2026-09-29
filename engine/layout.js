// Where scene content may go. Normal sizes keep a 7% margin. Platform formats
// (tiktok, reels, shorts, vertical) keep clear of the app's own buttons and
// text, and with captions on, the captions sit at the bottom of that area.
export function layoutAreas(config, W, H) {
  const m = Math.round(Math.min(W, H) * 0.07);
  const f = config.safe;
  if (!f) {
    return { safe: { x: m, y: m, w: W - 2 * m, h: H - 2 * m, left: m, top: m, right: W - m, bottom: H - m }, captions: null };
  }
  const left = Math.round(W * f.left);
  const right = W - Math.round(W * f.right);
  const appTop = Math.round(H * f.top);
  // The watermark sits in the top right corner of the free area.
  const top = config.watermark ? appTop + Math.round(Math.min(W, H) * 0.028 * 1.6) + 16 : appTop;
  const appBottom = H - Math.round(H * f.bottom);
  let bottom = appBottom;
  let captions = null;
  if (config.captions) {
    captions = { cx: (left + right) / 2, bottom: appBottom - 10, maxWidth: right - left };
    // Room for two caption lines (58px text) plus a gap above them.
    bottom = appBottom - 10 - Math.round(58 * 1.3 * 2 + 58 * 0.55) - 24;
  }
  return { safe: { x: left, y: top, w: right - left, h: bottom - top, left, top, right, bottom }, captions, app: { left, top: appTop, right, bottom: appBottom } };
}
