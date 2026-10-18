const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyChangedFiles, decide } = require('./ci-docs-only.cjs');

const script = path.join(__dirname, 'ci-docs-only.cjs');

test('Markdown-only change sets classify as docs-only', () => {
  for (const files of [['README.md'], ['docs/replatform/ci-optimization-plan.md', 'CLAUDE.md'], ['a/b/NOTES.MD'], ['docs/x.mdx'], ['dir with space/readme.md']]) {
    assert.equal(classifyChangedFiles(files), true, files.join(', '));
  }
});

test('anything that is not Markdown is code, including everything under docs/ that is not .md', () => {
  const codeish = [
    ['docs/architecture/music-runtime-surface-inventory.json'],
    ['docs/replatform-audit/canonical-closure.cjs'],
    ['docs/replatform-audit/auth-qualification/generated-core.sql'],
    ['docs/design-system/mockups/page/homepage.html'],
    ['README.md', 'explorers-earth/src/pages/RecommendationsHub.tsx'],
    ['docs/guide.md', '.github/workflows/ci.yml'],
    ['notes.md.ts'], ['notes.md.bak'], ['md'], ['.md.sh'], ['script.mdx.js'],
    ['package.json'], ['tunes/server/storage.ts'],
  ];
  for (const files of codeish) assert.equal(classifyChangedFiles(files), false, files.join(', '));
});

test('an empty diff is never docs-only', () => {
  assert.equal(classifyChangedFiles([]), false);
  assert.equal(decide({ event: 'pull_request', parents: 2, files: [] }).docsOnly, false);
});

test('only a pull_request on a two-parent merge commit can be docs-only', () => {
  const files = ['docs/a.md'];
  assert.equal(decide({ event: 'pull_request', parents: 2, files }).docsOnly, true);
  for (const event of ['push', 'schedule', 'workflow_dispatch', 'merge_group', '', undefined]) {
    assert.equal(decide({ event, parents: 2, files }).docsOnly, false, String(event));
  }
  for (const parents of [0, 1, 3]) assert.equal(decide({ event: 'pull_request', parents, files }).docsOnly, false, `parents=${parents}`);
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function fixture(prFiles, { merge = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-docs-only-'));
  git(dir, 'init', '-q', '-b', 'main');
  for (const [key, value] of [['user.email', 't@example.test'], ['user.name', 't'], ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) git(dir, 'config', key, value);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'docs', 'a.md'), 'one\n');
  fs.writeFileSync(path.join(dir, 'app.ts'), 'export {};\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'checkout', '-q', '-b', 'pr');
  for (const [file, body] of Object.entries(prFiles)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  }
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'pr');
  // The base moves on, as it does while a PR waits: the merge commit must still diff against it.
  git(dir, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(dir, 'unrelated.ts'), 'export const moved = 1;\n');
  git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base moved');
  if (merge) {
    git(dir, 'checkout', '-q', '-b', 'merge');
    git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
  } else git(dir, 'checkout', '-q', 'pr');
  return dir;
}

function run(dir, event) {
  const output = path.join(dir, 'github-output.txt');
  fs.rmSync(output, { force: true });
  const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, EVENT_NAME: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '' } });
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '' };
}

test('real PR merge commit: Markdown-only diff against the moved base is docs-only', () => {
  const dir = fixture({ 'docs/a.md': 'two\n', 'docs/new/b.md': 'b\n', 'README.md': 'r\n' });
  try {
    const { output } = run(dir, 'pull_request');
    assert.equal(output, 'docs_only=true\n');
    // The base's own non-Markdown commit is not part of the PR and must not count against it.
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('real PR merge commit: one code file, a docs JSON, or a rename out of code runs everything', () => {
  for (const prFiles of [
    { 'docs/a.md': 'two\n', 'app.ts': 'export const changed = true;\n' },
    { 'docs/architecture/inventory.json': '{}\n' },
    { '.github/workflows/ci.yml': 'name: x\n' },
  ]) {
    const dir = fixture(prFiles);
    try { assert.equal(run(dir, 'pull_request').output, 'docs_only=false\n', Object.keys(prFiles).join(', ')); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const dir = fixture({ 'docs/b.md': 'b\n' });
  try {
    git(dir, 'checkout', '-q', 'pr'); git(dir, 'mv', 'app.ts', 'docs/app.md'); git(dir, 'commit', '-q', '-m', 'rename code to .md');
    git(dir, 'checkout', '-q', 'main'); git(dir, 'checkout', '-q', '-B', 'merge2'); git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    assert.equal(run(dir, 'pull_request').output, 'docs_only=false\n', 'a rename lists both ends, so code cannot hide behind a .md name');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the same Markdown-only diff is not docs-only for push, schedule or dispatch, or without a merge commit', () => {
  const dir = fixture({ 'docs/a.md': 'two\n' });
  try {
    for (const event of ['push', 'schedule', 'workflow_dispatch']) assert.equal(run(dir, event).output, 'docs_only=false\n', event);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const flat = fixture({ 'docs/a.md': 'two\n' }, { merge: false });
  try { assert.equal(run(flat, 'pull_request').output, 'docs_only=false\n', 'single-parent HEAD'); }
  finally { fs.rmSync(flat, { recursive: true, force: true }); }
});

test('outside a git work tree it fails closed instead of throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-docs-only-nogit-'));
  try {
    const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8', env: { ...process.env, EVENT_NAME: 'pull_request', GITHUB_OUTPUT: path.join(dir, 'out.txt'), GIT_CEILING_DIRECTORIES: path.dirname(dir) } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8'), 'docs_only=false\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
