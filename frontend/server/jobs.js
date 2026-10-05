// Long steps (build, render, stills) run in the background. The page polls
// the job and shows the same log lines the command line would print.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logPath } from './store.js';

const jobs = new Map();
const MAX_LINES = 4000;
const KEEP = 12;

export function startJob({ projectId, kind, label, run }) {
  const running = [...jobs.values()].find((j) => j.projectId === projectId && j.status === 'running');
  if (running) return { ...running, busy: true };
  const id = crypto.randomBytes(5).toString('hex');
  const job = {
    id,
    projectId,
    kind,
    label,
    status: 'running',
    lines: [],
    progress: null,
    updatedAt: Date.now(),
    startedAt: Date.now(),
    endedAt: null,
    result: null,
    error: null,
  };
  jobs.set(id, job);
  const file = projectId ? path.join(logPath(projectId), `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`) : null;
  const log = (msg) => {
    const line = String(msg);
    job.lines.push(line);
    if (job.lines.length > MAX_LINES) job.lines.splice(0, job.lines.length - MAX_LINES);
    job.updatedAt = Date.now();
    if (file) {
      try {
        fs.appendFileSync(file, `${line}\n`);
      } catch {
        /* a log file is nice to have, not required */
      }
    }
  };
  job.log = log;
  // Live progress for the page's progress bar. run() gets it as the second
  // argument: report({ phase, done, total }). It never throws, so a progress
  // update can never break the job itself.
  const report = (p) => {
    try {
      if (!p || typeof p !== 'object') return;
      const done = Number(p.done);
      const total = Number(p.total);
      const percent =
        Number.isFinite(done) && Number.isFinite(total) && total > 0
          ? Math.max(0, Math.min(1, done / total))
          : null;
      job.progress = {
        phase: String(p.phase || p.label || kind),
        done: Number.isFinite(done) ? done : null,
        total: Number.isFinite(total) ? total : null,
        percent,
        detail: p.detail != null ? String(p.detail) : null,
      };
      job.updatedAt = Date.now();
    } catch {
      /* progress is best effort */
    }
  };
  job.report = report;

  Promise.resolve()
    .then(() => run(log, report))
    .then((result) => {
      job.status = 'done';
      job.result = result ?? job.result;
    })
    .catch((e) => {
      job.status = 'error';
      job.error = e && e.message ? e.message : String(e);
      log(`error: ${job.error}`);
    })
    .finally(() => {
      job.endedAt = Date.now();
      prune();
    });
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function jobFor(projectId) {
  return [...jobs.values()].reverse().find((j) => j.projectId === projectId) || null;
}

export function jobList() {
  return [...jobs.values()].map(publicJob);
}

export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    projectId: job.projectId,
    kind: job.kind,
    label: job.label,
    status: job.status,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    updatedAt: job.updatedAt || null,
    progress: job.progress || null,
    lines: job.lines,
  };
}

function prune() {
  const done = [...jobs.values()].filter((j) => j.status !== 'running').sort((a, b) => a.endedAt - b.endedAt);
  while (done.length > KEEP) jobs.delete(done.shift().id);
}
