#!/usr/bin/env node
// Cut a release: bump semver in package.json + public/manifest.json, commit, tag vX.Y.Z.
// Usage:
//   pnpm release <patch|minor|major|X.Y.Z> [--push]
// The Release workflow then builds, signs and publishes on the pushed tag
// (see .github/workflows/release.yml).

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const run = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

const [bump, ...flags] = process.argv.slice(2);
const push = flags.includes('--push');

if (!bump || !/^(patch|minor|major|\d+\.\d+\.\d+)$/.test(bump)) {
  console.error('Usage: pnpm release <patch|minor|major|X.Y.Z> [--push]');
  process.exit(1);
}

// --- guards ---------------------------------------------------------------
if (run('git status --porcelain')) {
  console.error('✋ Working tree is not clean: commit or stash your changes first.');
  process.exit(1);
}
const branch = run('git branch --show-current');
if (branch !== 'main') {
  console.error(`✋ You are on "${branch}", releases must be cut from "main".`);
  process.exit(1);
}

const pkgPath = path.join(ROOT, 'package.json');
const manifestPath = path.join(ROOT, 'public', 'manifest.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function semverBump(version, kind) {
  const [ma, mi, pa] = version.split('.').map(Number);
  if (kind === 'major') return `${ma + 1}.0.0`;
  if (kind === 'minor') return `${ma}.${mi + 1}.0`;
  return `${ma}.${mi}.${pa + 1}`;
}

const current = pkg.version;
const next = ['patch', 'minor', 'major'].includes(bump) ? semverBump(current, bump) : bump;

if (next === current) {
  console.error(`✋ Next version (${next}) equals current (${current}); nothing to release.`);
  process.exit(1);
}
if (manifest.version !== current) {
  console.error(`✋ package.json (${current}) and manifest (${manifest.version}) already differ — sync them first.`);
  process.exit(1);
}
console.log(`Releasing v${current} → v${next}`);

// --- bump both sources in lockstep -----------------------------------------
pkg.version = next;
manifest.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

run(`git add package.json ${path.relative(ROOT, manifestPath)}`);
run(`git commit -m "chore(release): v${next}"`);
run(`git tag v${next}`);
console.log(`✔ committed and tagged v${next}`);

if (push) {
  run(`git push origin HEAD v${next}`);
  console.log(`✔ pushed — the Release workflow will build, sign and publish v${next} on the tag.`);
} else {
  console.log(`Next: git push origin ${branch} v${next}   (or re-run with --push)`);
}
