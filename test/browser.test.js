import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findChrome } from '../src/browser.js';

test('finds the headless shell that Playwright installs on Windows', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'explainroo-pw-'));
  const exe = path.join(base, 'chromium_headless_shell-1300', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  const saved = { pw: process.env.PLAYWRIGHT_BROWSERS_PATH, ex: process.env.EXPLAINROO_CHROME, cp: process.env.CHROME_PATH };
  try {
    process.env.PLAYWRIGHT_BROWSERS_PATH = base;
    delete process.env.EXPLAINROO_CHROME;
    delete process.env.CHROME_PATH;
    assert.equal(findChrome(), exe);
  } finally {
    for (const [k, v] of [['PLAYWRIGHT_BROWSERS_PATH', saved.pw], ['EXPLAINROO_CHROME', saved.ex], ['CHROME_PATH', saved.cp]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
});
