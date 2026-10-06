import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { checkInputTypes } from '../../scripts/check-input-types.mjs';
import { documentFor } from '../semantic-html/helpers.mjs';
import { inputAxeViolations } from './helpers.mjs';

let vite, planMarkup, startMarkup;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, proxy: undefined },
    appType: 'custom', logLevel: 'error',
  });
  const { Plan } = await vite.ssrLoadModule('/src/stages/Plan.tsx');
  const App = (await vite.ssrLoadModule('/src/App.tsx')).default;
  const words = [{ display: 'Cache', start: 0, end: 1, index: 0, matched: true }];
  const scene = {
    id: 's01', index: 0, from: 0, to: 1, heading: 'Cache', headingEdited: false,
    text: 'Cache', words, start: 0, end: 1, seconds: 1, asset: null,
    chips: [], number: null, unmatched: 0,
  };
  const options = {
    strategy: 'sentences', wordsPerScene: 36, maxSceneSeconds: 12, minSceneSeconds: 3,
    cuts: [], merges: [], headings: {}, keywords: {}, assets: {},
  };
  planMarkup = renderToStaticMarkup(React.createElement(Plan, {
    plan: { scenes: [scene], words, stats: { duration: 1, matchRate: 1 }, warnings: [] },
    status: { sources: { assets: [] } }, options, time: 0, currentWord: 0,
    onPatch() {}, onAnalyze() {}, onSeek() {}, busy: false,
  }));
  startMarkup = renderToStaticMarkup(React.createElement(App));
});
after(async () => { await vite?.close(); });

function withDocument(markup, run) {
  const dom = documentFor(markup);
  try { return run(dom.window.document); }
  finally { dom.window.close(); }
}

test('Plan renders explicit types for all four input purposes', () => {
  withDocument(planMarkup, (document) => {
    assert.equal(document.querySelectorAll('input').length, 4);
    assert.deepEqual(checkInputTypes(document), []);
    assert.equal(document.querySelector('[aria-label="add a word to scene s01"]').getAttribute('type'), 'text');
  });
});

test('start screen keeps a free-form text topic', () => {
  withDocument(startMarkup, (document) => {
    assert.equal(document.querySelectorAll('input').length, 1);
    assert.deepEqual(checkInputTypes(document), []);
  });
});

test('keyword entry remains optional free-form text without new validation restrictions', () => {
  withDocument(planMarkup, (document) => {
    const input = document.querySelector('[aria-label="add a word to scene s01"]');
    for (const value of ['', 'cache', 'ক্যাশ', '42', "don't"]) {
      input.value = value;
      assert.equal(input.checkValidity(), true);
      assert.equal(input.validationMessage, '');
    }
    assert.equal(input.required, false);
    assert.equal(input.hasAttribute('pattern'), false);
  });
});

test('existing number inputs retain native bounds and validation feedback', () => {
  withDocument(planMarkup, (document) => {
    for (const [name, min, max] of [['words per scene', 8, 120], ['longest scene seconds', 4, 40]]) {
      const input = document.querySelector(`[aria-label="${name}"]`);
      input.value = String(min - 1);
      assert.equal(input.checkValidity(), false);
      assert.equal(input.validity.rangeUnderflow, true);
      assert.notEqual(input.validationMessage, '');
      input.value = String(max + 1);
      assert.equal(input.validity.rangeOverflow, true);
      input.value = String(min);
      assert.equal(input.checkValidity(), true);
    }
  });
});

test('type guard rejects missing, invalid, wrong and unreviewed types', () => {
  for (const attribute of ['', 'type="txt"', 'type="email"']) {
    withDocument(`<input aria-label="add a word to scene s01" ${attribute}>`, (document) => {
      assert.equal(checkInputTypes(document).length, 1);
    });
  }
  withDocument('<input type="text" aria-label="New field">', (document) => {
    assert.match(checkInputTypes(document)[0], /unreviewed/);
  });
});

test('axe: rendered start and Plan inputs retain labels and valid attributes', async () => {
  for (const markup of [startMarkup, planMarkup]) {
    const dom = documentFor(markup);
    try { assert.deepEqual(await inputAxeViolations(dom.window.document), []); }
    finally { dom.window.close(); }
  }
});
