// Installs the skills that ship in this folder into an agent's skill
// directory, so an agent can use them on this machine:
//
//   node scripts/install-agent-skills.mjs                 project: .claude/skills
//   node scripts/install-agent-skills.mjs --global        personal: ~/.claude/skills
//   node scripts/install-agent-skills.mjs --target DIR    anywhere you like
//   node scripts/install-agent-skills.mjs --list          what is available
//   node scripts/install-agent-skills.mjs --dry-run
//   node scripts/install-agent-skills.mjs --only hallmark
//
// Two sets are installed:
//   skills/*                                  explainroo's own skill
//   skill-to-use-the-frontend-wrapper/*/skills  the three front-end skills
//
// Nothing is downloaded: everything is already in this folder, and the copy
// is the same SKILL.md layout Claude Code and the other agents expect.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function skillsIn(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => ({ name: e.name, from: path.join(dir, e.name), own: dir.startsWith(path.join(ROOT, 'skills')) }));
}

function catalog() {
  const out = skillsIn(path.join(ROOT, 'skills'));
  const wrapper = path.join(ROOT, 'skill-to-use-the-frontend-wrapper');
  if (fs.existsSync(wrapper)) {
    for (const bundle of fs.readdirSync(wrapper)) {
      for (const skill of skillsIn(path.join(wrapper, bundle, 'skills'))) {
        if (!out.some((s) => s.name === skill.name)) out.push({ ...skill, bundle });
      }
    }
  }
  return out;
}

function copyDir(from, to, dry) {
  const files = [];
  const walk = (src, dst) => {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) walk(s, d);
      else {
        files.push(path.relative(from, s));
        if (!dry) fs.copyFileSync(s, d);
      }
    }
  };
  walk(from, to);
  return files;
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const all = catalog();
if (flag('list') || !all.length) {
  process.stdout.write(`skills in this folder:\n`);
  for (const s of all) process.stdout.write(`  ${s.name.padEnd(24)} ${path.relative(ROOT, s.from)}${s.bundle ? ` (${s.bundle})` : ''}\n`);
  process.exit(all.length ? 0 : 1);
}

const only = value('only');
const chosen = only ? all.filter((s) => s.name === only) : all;
if (only && !chosen.length) {
  process.stderr.write(`no skill called "${only}" — try --list\n`);
  process.exit(1);
}

const target = value('target') || (flag('global') ? path.join(os.homedir(), '.claude', 'skills') : path.join(ROOT, '.claude', 'skills'));
const dry = flag('dry-run');

process.stdout.write(`${dry ? 'would install' : 'installing'} ${chosen.length} skill(s) into ${target}\n`);
let total = 0;
for (const skill of chosen) {
  const to = path.join(target, skill.name);
  const files = copyDir(skill.from, to, dry);
  total += files.length;
  process.stdout.write(`  ${skill.name.padEnd(24)} ${files.length} file(s) ← ${path.relative(ROOT, skill.from)}\n`);
}
process.stdout.write(`${dry ? '' : `${total} file(s) written. `}Restart your agent, or reload it, to see them.\n`);
if (dry) process.stdout.write('Run it again without --dry-run to write the files.\n');
