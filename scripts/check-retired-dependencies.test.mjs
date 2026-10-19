import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixtures = fileURLToPath(new URL('./__fixtures__/retired-deps/', import.meta.url));

function scan(...args) {
  // spawnSync, not execFileSync: a failing scan exits 1, and the report is what we want to read.
  const run = spawnSync(process.execPath, ['scripts/check-retired-dependencies.mjs', '--json', ...args], { encoding: 'utf8' });
  assert.ok(run.stdout, `scanner printed nothing (exit ${run.status}): ${run.stderr}`);
  return JSON.parse(run.stdout);
}
const fixture = (name) => scan('--root', `${fixtures}${name}`, '--entry', 'server/entry.ts');

test('every production entry point is Strapi-free, with no allowlist', () => {
  const report = scan();
  assert.deepEqual(report.violations, []);
  assert.equal(report.allowlistedEnvReads + report.allowlistedModules + report.allowlistedClientConstructions, 0,
    'an allowlisted Strapi site remains');
  assert.ok(report.entries.includes('tunes/server/deployment/run-migration-gate.ts'), 'the migrate service is not scanned');
});

test('the closure is big enough to mean something', () => {
  const report = scan();
  // VACUITY GUARD: a mis-resolved entry point yields a tiny closure that trivially contains no Strapi.
  assert.ok(report.canonicalModuleCount >= report.minimumModules, `closure shrank to ${report.canonicalModuleCount}`);
});

test('the walker follows @shared/* into a module that reads STRAPI_*', () => {
  const report = fixture('shared-reader');
  assert.deepEqual(report.violations.map((v) => v.invariant), ['no-strapi-variable-in-production-closure']);
  assert.match(report.violations[0].detail, /^shared\/reader\.ts:1 names STRAPI_URL/);
});

test('an unresolvable @shared/* import makes the closure incomplete instead of being dropped', () => {
  const report = fixture('shared-missing');
  assert.deepEqual(report.violations.map((v) => v.invariant), ['closure-incomplete']);
  assert.deepEqual(report.violations[0].sites, ['server/entry.ts -> @shared/missing']);
});

test('a read through any binding, such as environment.STRAPI_X, is a violation', () => {
  assert.deepEqual(fixture('environment-read').violations.map((v) => v.detail),
    ['server/entry.ts:2 names STRAPI_X and is reachable from a production entry point.']);
});

test('a URL string with // does not hide the rest of its line', () => {
  assert.deepEqual(fixture('url-string-line').violations.map((v) => v.detail),
    ['server/entry.ts:2 names STRAPI_X and is reachable from a production entry point.']);
});

test('require() is an edge', () => {
  assert.deepEqual(fixture('require-edge').violations.map((v) => v.invariant), ['no-strapi-module-in-production-closure']);
});

test('control: a comment and a type-only import are not code, and a // inside a string is not a comment', () => {
  assert.deepEqual(fixture('clean-control').violations, []);
  assert.equal(fixture('clean-control').canonicalModuleCount, 1);
});
