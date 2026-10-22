'use strict';
// Pins the PR e2e lanes to the official Playwright image whose tag equals the locked
// `playwright` version. A mismatch would make every lane download browsers again (or run
// a browser build the specs were not written against), and `--with-deps` would bring back
// the apt download that cost up to 16 minutes per lane (WPCI, 2026-10-23).
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
// js-yaml is what the tunes workflow contract tests already use (music-documentation-contract.test.ts);
// `static` installs tunes before it runs node --test.
const { load: parse } = require('../tunes/node_modules/js-yaml');

const root = join(__dirname, '..');
const workflow = parse(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'explorers-earth/package-lock.json'), 'utf8'));
const version = lock.packages['node_modules/playwright'].version;
const lanes = ['e2e-category-a', 'e2e-category-b', 'e2e-public-shell', 'e2e-music-account'];

test('every PR e2e lane runs in the Playwright image matching the lockfile', () => {
  for (const name of lanes) {
    const container = workflow.jobs[name].container;
    assert.ok(container, `${name} has no container`);
    assert.equal(container.image, `mcr.microsoft.com/playwright:v${version}-noble`, name);
    assert.equal(container.options, '--user 1001', name);
  }
});

test('no ci.yml job installs Playwright system packages with apt', () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps || []) {
      assert.doesNotMatch(String(step.run || ''), /--with-deps/, `${name}: ${step.name || step.run}`);
    }
  }
});
