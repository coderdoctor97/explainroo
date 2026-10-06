import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSemanticHtml } from '../../scripts/check-semantic-html.mjs';
import { documentFor, renderComponents } from './helpers.mjs';

test('real start page meets the semantic layout contract', async () => {
  const dom = documentFor((await renderComponents()).start);
  try { assert.deepEqual(checkSemanticHtml(dom.window.document), []); }
  finally { dom.window.close(); }
});

const valid = '<header><h1>Studio</h1></header><nav aria-label="Steps"></nav><main><h2>Sources</h2><section aria-label="Uploads"><h3>Files</h3></section></main><aside aria-label="Readout"></aside><footer></footer>';
for (const tag of ['header', 'nav', 'main', 'aside', 'footer']) {
  test(`lint rejects a missing ${tag} and a structural div replacement`, () => {
    const dom = documentFor(valid.replace(new RegExp(`<${tag}([^>]*)>`), `<div class="${tag}"$1>`).replace(`</${tag}>`, '</div>'));
    try {
      const problems = checkSemanticHtml(dom.window.document, { workspace: true });
      assert.ok(problems.some((p) => p.startsWith(`${tag}`)), problems.join('\n'));
      assert.ok(problems.some((p) => p.startsWith('structural div')));
    } finally { dom.window.close(); }
  });
}
test('lint rejects unnamed navigation, duplicate mains and skipped headings', () => {
  const dom = documentFor(valid.replace('aria-label="Steps"', '').replace('<h2>Sources</h2>', '<h4>Sources</h4><main></main>'));
  try {
    const problems = checkSemanticHtml(dom.window.document, { workspace: true });
    assert.ok(problems.includes('nav needs an accessible name'));
    assert.ok(problems.some((p) => p.startsWith('main:')));
    assert.ok(problems.some((p) => p.startsWith('heading skips')));
  } finally { dom.window.close(); }
});
