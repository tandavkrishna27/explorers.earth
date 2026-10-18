'use strict';

// Decides whether a pull request changes nothing but Markdown, so the `changes` job in
// ci.yml and test.yml can let the heavy lanes skip while their aggregate jobs
// (`replatform-required`, `music-required`) still run and still gate the merge.
//
// Fail closed, always. Every doubt answers `false`, which runs every lane:
//   - any event other than `pull_request` (push, schedule and manual runs feed release
//     preflight, which needs the full validation at the exact source SHA),
//   - a checkout that is not the two-parent merge commit GitHub builds for a PR,
//   - an empty diff, a git failure, or a single changed path that is not Markdown.
//
// "Markdown" is deliberately narrower than `docs/**`. docs/ also holds JSON, SQL, .cjs and
// .ts inputs that contract tests and the image build read, so those still count as code.
// Markdown that tests read (docs, READMEs, CLAUDE.md) is still verified on a docs-only PR
// by the `docs-contracts` and `contracts` jobs, which never skip.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const MARKDOWN = /\.(?:md|mdx)$/i;

function classifyChangedFiles(files) {
  return files.length > 0 && files.every(file => MARKDOWN.test(file));
}

function decide({ event, parents, files }) {
  if (event !== 'pull_request') return { docsOnly: false, reason: `event "${event || ''}" always runs every lane` };
  if (parents !== 2) return { docsOnly: false, reason: `HEAD has ${parents} parent(s), not the two-parent PR merge commit` };
  if (files.length === 0) return { docsOnly: false, reason: 'empty diff' };
  const code = files.filter(file => !MARKDOWN.test(file));
  if (code.length) return { docsOnly: false, reason: `${code.length} non-Markdown path(s), first: ${code[0]}` };
  return { docsOnly: true, reason: `${files.length} Markdown file(s) only` };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function inspect() {
  const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/).length - 1;
  if (parents !== 2) return { parents, files: [] };
  // `--no-renames` lists both ends of a rename, so moving code into a .md name cannot hide.
  const files = git(['diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD']).split('\0').filter(Boolean);
  return { parents, files };
}

function main(env = process.env) {
  let result;
  try {
    result = decide({ event: env.EVENT_NAME, ...inspect() });
  } catch (error) {
    result = { docsOnly: false, reason: `could not read the diff (${error.message.split('\n')[0]})` };
  }
  const line = `docs_only=${result.docsOnly}`;
  console.log(`${line} - ${result.reason}`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${line}\n`);
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `**docs-only classification:** \`${result.docsOnly}\` - ${result.reason}\n`);
  }
  return result;
}

if (require.main === module) main();

module.exports = { classifyChangedFiles, decide, main };
