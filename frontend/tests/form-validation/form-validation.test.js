import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';

let dom, vite, root, ScenePlanForm, FormField, validateInput, ApiError, user;
const saved = new Map();
before(async () => {
  dom = new JSDOM('<!doctype html><html lang="en"><head><title>Validation test</title></head><body><main><h1>Scene plan</h1><div id="root"></div></main></body></html>', { url: 'http://studio.test', pretendToBeVisual: true, runScripts: 'outside-only' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle']) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: key === 'window' ? dom.window : dom.window[key], writable: true, configurable: true });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  user = userEvent.setup({ document: dom.window.document });
  const { createRoot } = await import('react-dom/client');
  root = createRoot(document.getElementById('root'));
  vite = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)),
    configFile: fileURLToPath(new URL('../../../vite.config.ts', import.meta.url)),
    server: { middlewareMode: true, hmr: false, proxy: undefined }, appType: 'custom', logLevel: 'error',
  });
  ({ ScenePlanForm } = await vite.ssrLoadModule('/src/components/ScenePlanForm.tsx'));
  ({ FormField, validateInput } = await vite.ssrLoadModule('/src/components/FormField.tsx'));
  ({ ApiError } = await vite.ssrLoadModule('/src/api.ts'));
});
afterEach(async () => { await act(async () => root.render(null)); });
after(async () => {
  await act(async () => root?.unmount());
  await vite?.close();
  dom?.window.close();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const $ = (selector) => document.querySelector(selector);
const words = () => $('input[name="wordsPerScene"]');
const seconds = () => $('input[name="maxSceneSeconds"]');
const action = (fn) => act(fn);
async function mount(onSubmit = async () => {}, props = {}) {
  await act(async () => root.render(React.createElement(ScenePlanForm, {
    options: { wordsPerScene: 36, maxSceneSeconds: 12 }, busy: false, onSubmit, ...props,
  })));
}
async function submit() { await action(() => user.click($('button[type="submit"]'))); }

// Browser-style interaction is simulated with user-event; not a claim about
// real screen-reader speech, native mobile keyboards or actual browser layout.
test('untouched fields have visible associated labels, required state and hint-only descriptions', async () => {
  await mount();
  for (const input of [words(), seconds()]) {
    assert.ok(input.labels[0].textContent.includes('(required)'));
    assert.equal(input.required, true);
    assert.equal(input.getAttribute('aria-required'), 'true');
    assert.equal(input.getAttribute('aria-invalid'), null);
    assert.equal(input.getAttribute('aria-errormessage'), null);
    assert.match(document.getElementById(input.getAttribute('aria-describedby')).textContent, /Whole number/);
    assert.equal(document.getElementById(`${input.id}-error`).textContent, '');
  }
  assert.equal($('.error-summary'), null);
});

test('blur announces a required error; typing does not validate; next blur clears it', async () => {
  await mount();
  await action(() => user.clear(words()));
  assert.equal(words().getAttribute('aria-invalid'), null);
  await action(() => user.tab());
  assert.equal(words().getAttribute('aria-invalid'), 'true');
  const errorId = words().getAttribute('aria-errormessage');
  const error = document.getElementById(errorId);
  assert.equal(error.getAttribute('role'), 'alert');
  assert.match(error.textContent, /Enter words per scene/);
  assert.ok(words().getAttribute('aria-describedby').split(' ').includes(errorId));
  await action(() => user.type(words(), '24'));
  assert.equal(error.textContent, 'Error: Enter words per scene.');
  await action(() => user.tab());
  assert.equal(words().getAttribute('aria-invalid'), 'false');
  assert.equal(words().getAttribute('aria-errormessage'), null);
  assert.equal(error.textContent, '');
  assert.equal(words().getAttribute('aria-describedby'), `${words().id}-hint`);
});

test('invalid submit focuses first-in-form alert summary with links to every error', async () => {
  let calls = 0;
  await mount(async () => { calls++; });
  await action(() => user.clear(words()));
  await action(() => user.clear(seconds()));
  await submit();
  const summary = $('.error-summary');
  assert.equal($('form').firstElementChild, summary);
  assert.equal(summary.getAttribute('role'), 'alert');
  assert.equal(document.activeElement, summary);
  assert.equal(summary.querySelectorAll('a').length, 2);
  assert.equal(calls, 0);
  await action(() => user.tab());
  assert.equal(document.activeElement, summary.querySelector('a'));
  await action(() => user.keyboard('{Enter}'));
  assert.equal(document.activeElement, words());
});

test('keyboard-only error, correction and Enter resubmission succeeds', async () => {
  const calls = [];
  await mount(async (values) => { calls.push(values); });
  await action(() => user.tab());
  assert.equal(document.activeElement, words());
  await action(() => user.keyboard('{Control>}a{/Control}{Backspace}{Enter}'));
  assert.equal(document.activeElement, $('.error-summary'));
  await action(() => user.tab());
  await action(() => user.keyboard('{Enter}'));
  assert.equal(document.activeElement, words());
  await action(() => user.keyboard('24{Enter}'));
  assert.deepEqual(calls, [{ wordsPerScene: 24, maxSceneSeconds: 12 }]);
  assert.equal($('.error-summary'), null);
});

test('API field errors are linked, focused and cleared after correction and retry', async () => {
  let calls = 0;
  await mount(async () => {
    if (++calls === 1) throw new ApiError('Check settings', 422, { wordsPerScene: 'Use 24 words for this project.' });
  });
  await submit();
  assert.equal(document.activeElement, $('.error-summary'));
  assert.equal(words().getAttribute('aria-invalid'), 'true');
  assert.match(document.getElementById(words().getAttribute('aria-errormessage')).textContent, /Use 24/);
  assert.equal(words().value, '36');
  await action(() => user.clear(words()));
  await action(() => user.type(words(), '24'));
  await submit();
  assert.equal(calls, 2);
  assert.equal($('.error-summary'), null);
  assert.equal(words().getAttribute('aria-invalid'), 'false');
});

test('general API failure keeps values and focuses actionable retry feedback', async () => {
  await mount(async () => { throw new Error('network failed'); });
  await submit();
  assert.equal(document.activeElement, $('.error-summary'));
  assert.match($('.error-summary').textContent, /entries are still here.*try Re-plan again/);
  assert.equal(words().value, '36');
  assert.equal(seconds().value, '12');
  await action(() => user.tab());
  assert.equal(document.activeElement, words());
});

test('pending submission prevents duplicate requests and temporary edits', async () => {
  let resolve, calls = 0;
  await mount(() => { calls++; return new Promise((r) => { resolve = r; }); });
  await submit();
  assert.equal($('button').disabled, true);
  assert.equal(words().readOnly, true);
  await act(async () => $('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(calls, 1);
  await act(async () => resolve());
  assert.equal($('button').disabled, false);
  assert.equal(words().readOnly, false);
});

test('reusable validator supports lengths, email, phone patterns, numeric bounds and custom rules', async () => {
  const input = document.createElement('input');
  input.type = 'text'; input.required = true;
  assert.equal(validateInput(input, 'name'), 'Enter name.');
  input.value = 'ab'; input.minLength = 3;
  assert.match(validateInput(input, 'name'), /at least 3/);
  input.removeAttribute('minlength'); input.maxLength = 3; input.value = 'abcd';
  assert.match(validateInput(input, 'name'), /no more than 3/);
  input.removeAttribute('maxlength'); input.type = 'email'; input.value = 'not-email';
  assert.match(validateInput(input, 'email'), /valid email address/);
  input.type = 'tel'; input.pattern = '[0-9]{3}'; input.title = 'Use three digits.'; input.value = 'abc';
  assert.equal(validateInput(input, 'phone'), 'Use three digits.');
  input.removeAttribute('pattern'); input.type = 'number'; input.min = '8'; input.max = '120'; input.step = '1';
  input.value = '7'; assert.match(validateInput(input, 'count'), /at least 8/);
  input.value = '121'; assert.match(validateInput(input, 'count'), /no more than 120/);
  input.value = '8.5'; assert.match(validateInput(input, 'count'), /whole number/);
  input.value = '24'; assert.equal(validateInput(input, 'count', () => 'Choose another count.'), 'Choose another count.');
});

test('FormField preserves extra descriptions and supplies unique error wiring', async () => {
  await act(async () => root.render(React.createElement('div', null,
    React.createElement('p', { id: 'extra' }, 'Extra guidance'),
    React.createElement(FormField, { id: 'first', label: 'Email', type: 'email', hint: 'Use a work address.', error: 'Enter an email address.', 'aria-describedby': 'extra' }),
    React.createElement(FormField, { id: 'second', label: 'Phone', type: 'tel', error: '' }),
  )));
  assert.equal($('#first').getAttribute('aria-describedby'), 'extra first-hint first-error');
  assert.equal($('#second').getAttribute('aria-invalid'), 'false');
  assert.equal(new Set([...document.querySelectorAll('[id]')].map((el) => el.id)).size, document.querySelectorAll('[id]').length);
});

test('axe finds no automated violations in the submitted error state (contrast tested separately)', async () => {
  await mount();
  await action(() => user.clear(words()));
  await action(() => user.clear(seconds()));
  await submit();
  dom.window.eval(axe.source);
  const result = await dom.window.axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
  assert.deepEqual(Array.from(result.violations, (v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), []);
});

test('validation text colors meet WCAG AA on their explicit white background', () => {
  const luminance = (hex) => {
    const values = hex.match(/[a-f\d]{2}/gi).map((x) => parseInt(x, 16) / 255).map((x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const css = fs.readFileSync(new URL('../../src/styles/app.css', import.meta.url), 'utf8');
  const [, errorColor] = css.match(/\.field-error:not\(:empty\), \.error-summary \{ color: #([a-f0-9]{6}); background: #fff;/);
  assert.ok(1.05 / (luminance(errorColor) + 0.05) >= 4.5);
  assert.ok(1.05 / (luminance('174ea6') + 0.05) >= 3);
});
