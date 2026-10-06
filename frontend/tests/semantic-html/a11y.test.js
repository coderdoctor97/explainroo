import test from 'node:test';
import assert from 'node:assert/strict';
import { documentFor, renderComponents, semanticAxeViolations } from './helpers.mjs';

test('axe: real start page has no landmark or heading violations', async () => {
  const dom = documentFor((await renderComponents()).start);
  try { assert.deepEqual(await semanticAxeViolations(dom.window.document), []); }
  finally { dom.window.close(); }
});

test('axe detects duplicate main landmarks', async () => {
  const dom = documentFor('<header><h1>Studio</h1></header><main></main><main></main><footer></footer>');
  try {
    const violations = await semanticAxeViolations(dom.window.document);
    assert.ok(violations.some(({ id }) => id === 'landmark-no-duplicate-main'));
  } finally { dom.window.close(); }
});
