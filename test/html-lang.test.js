import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Parse the shipped documents, not an App mounted into a synthetic HTML shell.
// English is the UI language; update these expectations with any future locale.
for (const file of ['frontend/index.html', 'engine/studio.html', 'engine/frame.html']) {
  test(`${file} declares English on the root HTML element`, () => {
    const html = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const dom = new JSDOM(html);
    try {
      const lang = dom.window.document.documentElement.lang;
      assert.equal(lang, 'en');
      assert.equal(new Intl.Locale(lang).language, 'en');
    } finally {
      dom.window.close();
    }
  });
}
