import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateHtml } from '../../scripts/validate-html.mjs';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (name) => fs.readFileSync(new URL(`fixtures/${name}.html.txt`, import.meta.url), 'utf8');

test('valid complete HTML document passes', async () => {
  const result = await validateHtml(fixture('valid'));
  assert.equal(result.errors, 0);
  assert.equal(result.warnings, 0);
});

for (const [name, rule] of [
  ['invalid-doctype', 'missing-doctype'],
  ['invalid-lang', 'element-required-attributes'],
  ['invalid-charset', 'project/charset'],
  ['unclosed-tag', 'close-order'],
  ['invalid-nesting', 'element-permitted-content'],
  ['duplicate-id', 'no-dup-id'],
]) {
  test(`rejects ${name} with the expected diagnostic`, async () => {
    const result = await validateHtml(fixture(name));
    assert.ok(result.errors > 0);
    assert.ok(result.messages.some((message) => message.ruleId === rule), JSON.stringify(result.messages));
  });
}

test('allows valid boolean syntax, void syntax, inline styles and scripts', async () => {
  const source = fixture('valid').replace('<div>Content</div>', '<input aria-label="First" disabled><input aria-label="Second" disabled=""><div style="color: red">Text</div><script>const sample = 1;</script>');
  assert.equal((await validateHtml(source)).errors, 0);
});

test('rejects incorrect doctype position and non-UTF-8 project encoding', async () => {
  const source = fixture('valid').replace('<!DOCTYPE html>', '<div></div><!DOCTYPE html>').replace('UTF-8', 'latin1');
  const result = await validateHtml(source);
  assert.ok(result.messages.some((m) => m.ruleId === 'project/doctype-first'));
  assert.ok(result.messages.some((m) => m.ruleId === 'project/charset'));
});

test('CLI returns nonzero and parseable JSON for a broken explicit fixture', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-html.mjs', 'tests/html-validation/fixtures/unclosed-tag.html.txt'], { cwd: frontend, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(JSON.parse(result.stdout).errors > 0);
});

test('CLI fails on a missing file instead of claiming an empty pass', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-html.mjs', 'does-not-exist.html'], { cwd: frontend, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HTML validation failed/);
  assert.equal(fs.existsSync(path.join(frontend, '.reports/html-validation.json')), false);
});

test('default CLI scans production HTML and rendered start page, excluding negative fixtures', () => {
  const result = spawnSync(process.execPath, ['scripts/validate-html.mjs'], { cwd: frontend, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.errors, 0);
  assert.ok(report.results.some((entry) => entry.file === 'index.html'));
  assert.ok(report.results.some((entry) => entry.file === 'rendered/start.html'));
  assert.equal(report.results.some((entry) => entry.file.includes('fixtures')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(frontend, '.reports/html-validation.json'), 'utf8')), report);
});
