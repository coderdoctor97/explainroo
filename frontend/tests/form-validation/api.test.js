import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePlanSettings } from '../../shared/plan-validation.js';

let api, dir, id, oldWorkspace;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-form-validation-'));
  oldWorkspace = process.env.STUDIO_WORKSPACE;
  process.env.STUDIO_WORKSPACE = dir;
  const { startStudioApi } = await import('../../server/api.js');
  api = await startStudioApi({ port: 0 });
  const response = await fetch(`${api.url}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Form validation test' }) });
  assert.equal(response.status, 201);
  ({ id } = await response.json());
});
after(async () => {
  await api?.close();
  if (oldWorkspace === undefined) delete process.env.STUDIO_WORKSPACE;
  else process.env.STUDIO_WORKSPACE = oldWorkspace;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
const state = async () => (await (await fetch(`${api.url}/api/projects/${id}`)).json()).studio;
const patch = (plan) => fetch(`${api.url}/api/projects/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }),
});

test('API rejects invalid numeric settings with field errors and no partial write', async () => {
  const before = await state();
  const response = await patch({ wordsPerScene: 7, maxSceneSeconds: 41 });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.match(body.fieldErrors.wordsPerScene, /8 to 120/);
  assert.match(body.fieldErrors.maxSceneSeconds, /4 to 40/);
  assert.deepEqual(await state(), before);
});

test('API accepts valid settings and preserves partial PATCH behavior', async () => {
  assert.equal((await patch({ wordsPerScene: 24, maxSceneSeconds: 16 })).status, 200);
  assert.equal((await patch({ wordsPerScene: 32 })).status, 200);
  assert.equal((await state()).plan.wordsPerScene, 32);
  assert.equal((await state()).plan.maxSceneSeconds, 16);
});

test('server validator rejects missing values, strings, non-finite and fractional numbers when supplied', () => {
  for (const value of [undefined, null, '', '24', NaN, Infinity, 8.5, 7, 121]) {
    assert.ok(validatePlanSettings({ wordsPerScene: value }).wordsPerScene, String(value));
  }
  assert.deepEqual(validatePlanSettings({}), {});
  assert.deepEqual(validatePlanSettings({ wordsPerScene: 8, maxSceneSeconds: 40 }), {});
});
