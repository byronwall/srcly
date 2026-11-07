import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const siteDir = resolve(import.meta.dirname, '..');
const distDir = join(siteDir, 'dist');
const repoDir = resolve(siteDir, '..');
const tempDir = mkdtempSync(join(tmpdir(), 'srcly-pages-'));

function git(args, cwd = tempDir) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
}

try {
  if (!readdirSync(distDir).length) throw new Error(`Build output is empty: ${distDir}`);
  const remote = git(['remote', 'get-url', 'origin'], repoDir);
  const refs = git(['ls-remote', '--heads', remote, 'gh-pages']);
  const hasBranch = refs.length > 0;

  if (hasBranch) {
    git(['clone', '--quiet', '--single-branch', '--branch', 'gh-pages', remote, tempDir]);
  } else {
    git(['init', '--quiet', '--initial-branch=gh-pages']);
    git(['remote', 'add', 'origin', remote]);
  }

  for (const name of readdirSync(tempDir)) {
    if (name !== '.git') rmSync(join(tempDir, name), { recursive: true, force: true });
  }
  cpSync(distDir, tempDir, { recursive: true });
  writeFileSync(join(tempDir, '.nojekyll'), '');

  git(['config', 'user.name', 'Byron Wall']);
  git(['config', 'user.email', 'byron@byroni.us']);
  git(['add', '--all']);
  git(['commit', '--allow-empty', '-m', 'Deploy site']);
  git(['push', 'origin', 'HEAD:gh-pages']);
  process.stdout.write('Published site/dist to gh-pages.\n');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
