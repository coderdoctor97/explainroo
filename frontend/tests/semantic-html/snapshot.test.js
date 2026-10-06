import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticSnapshot } from '../../scripts/check-semantic-html.mjs';
import { documentFor, renderComponents } from './helpers.mjs';

test('semantic snapshots of the real start page, panel and playback footer', async () => {
  const markup = await renderComponents();
  const expected = {
    start: ['header', 'h1: explainroo studio', 'main', 'footer'],
    panel: ['section', 'h3: Preview'],
    transport: ['footer'],
  };
  for (const key of Object.keys(expected)) {
    const dom = documentFor(markup[key]);
    try {
      assert.deepEqual(semanticSnapshot(dom.window.document), expected[key], key);
      if (key === 'panel') {
        const panel = dom.window.document.querySelector('section');
        assert.equal(dom.window.document.getElementById(panel.getAttribute('aria-labelledby')).textContent, 'Preview');
      }
    } finally { dom.window.close(); }
  }
});
