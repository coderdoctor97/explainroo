// Rendered-DOM checks shared by the semantic tests and the full Studio UI test.
// Layout-only divs (app, bench, row, grid, scrub) deliberately remain generic.
export function checkSemanticHtml(document, { workspace = !!document.querySelector('.app') } = {}) {
  const problems = [];
  const requireCount = (selector, count) => {
    const actual = document.querySelectorAll(selector).length;
    if (actual !== count) problems.push(`${selector}: expected ${count}, found ${actual}`);
  };
  requireCount('main', 1);
  requireCount('h1', 1);
  // A header within main is a section header, not the page banner.
  requireCount('header:not(main header):not(section header):not(article header):not(aside header):not(nav header)', 1);
  requireCount('footer:not(main footer):not(section footer):not(article footer):not(aside footer):not(nav footer)', 1);
  if (workspace) {
    requireCount('nav', 1);
    requireCount('aside', 1);
  }
  if (document.querySelector('main main, aside main, nav main, header main, footer main')) problems.push('main must not be nested in another landmark');
  const name = (el) => el.getAttribute('aria-label')?.trim() ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((id) => document.getElementById(id)?.textContent.trim() || '').join(' ').trim();
  for (const el of document.querySelectorAll('nav, aside, section')) {
    if (!name(el)) problems.push(`${el.localName} needs an accessible name`);
  }
  const structural = /^(?:header|masthead|nav|navigation|rail|main|main-content|aside|sidebar|readout|footer|transport|panel)$/;
  for (const el of document.querySelectorAll('div')) {
    if ([...el.classList, el.id].some((token) => structural.test(token))) {
      problems.push(`structural div: ${el.id || el.className}`);
    }
  }
  let previous = 0;
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const level = Number(el.localName[1]);
    if (level > previous + 1) problems.push(`heading skips from h${previous} to h${level}`);
    previous = level;
  }
  return problems;
}

export function semanticSnapshot(document) {
  return [...document.querySelectorAll('header, nav, main, aside, footer, section, h1, h2, h3')]
    .map((el) => `${el.localName}${/^h[123]$/.test(el.localName) ? `: ${el.textContent.trim()}` : ''}`);
}
