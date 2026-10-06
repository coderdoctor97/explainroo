import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

export async function renderComponents() {
  const vite = await createServer({
    root: fileURLToPath(new URL("../../", import.meta.url)),
    configFile: fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, proxy: undefined },
    appType: 'custom', logLevel: 'error',
  });
  try {
    const App = (await vite.ssrLoadModule('/src/App.tsx')).default;
    const { Panel } = await vite.ssrLoadModule('/src/components/ui.tsx');
    const { Transport } = await vite.ssrLoadModule('/src/components/Transport.tsx');
    const render = (component, props, children) => renderToStaticMarkup(React.createElement(component, props, children));
    return {
      start: render(App),
      panel: render(Panel, { title: 'Preview' }, 'Scene preview'),
      transport: render(Transport, {
        words: [], scenes: [], duration: 0, time: 0, playing: false, ready: false,
        onToggle() {}, onSeek() {}, onStep() {},
      }),
    };
  } finally { await vite.close(); }
}

export function documentFor(markup) {
  const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  return new JSDOM(html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`), { runScripts: 'outside-only' });
}

// jsdom cannot test visual contrast or actual screen-reader output. Run only
// structural rules, including best-practice landmark and heading checks.
export async function semanticAxeViolations(document) {
  const dom = new JSDOM(document.documentElement.outerHTML, { runScripts: 'outside-only' });
  try {
    dom.window.eval(axe.source);
    const rules = axe.getRules().map((rule) => rule.ruleId)
      .filter((id) => id.startsWith('landmark-') || ['region', 'heading-order', 'page-has-heading-one'].includes(id));
    const result = await dom.window.axe.run(dom.window.document, { runOnly: { type: 'rule', values: rules } });
    return Array.from(result.violations, ({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }));
  } finally { dom.window.close(); }
}
