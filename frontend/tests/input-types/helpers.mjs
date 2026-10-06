import { JSDOM } from 'jsdom';
import axe from 'axe-core';

export async function inputAxeViolations(document) {
  const dom = new JSDOM(document.documentElement.outerHTML, { runScripts: 'outside-only' });
  try {
    dom.window.eval(axe.source);
    const { violations } = await dom.window.axe.run(dom.window.document, {
      runOnly: { type: 'rule', values: ['label', 'label-title-only', 'autocomplete-valid', 'aria-input-field-name', 'aria-valid-attr-value'] },
    });
    return Array.from(violations, ({ id, nodes }) => ({ id, targets: Array.from(nodes, (node) => node.target) }));
  } finally { dom.window.close(); }
}
