const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const { load: parseYaml } = require(require.resolve('js-yaml', { paths: [resolve(root, 'tunes')] }));
const read = file => readFileSync(resolve(root, file), 'utf8');
const digest = '06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53';
test('production and fixture builders use the reviewed Node 24.22.1 image', () => {
  for (const file of ['tunes/Dockerfile', 'explorers-earth/Dockerfile', 'explorers-earth/Dockerfile.music-fixture']) {
    assert.match(read(file), new RegExp(`FROM ghcr\\.io/tandavkrishna27/mirror/node:24\\.22\\.1-alpine@sha256:${digest}`));
    assert.match(read(file), /npm ci.*--engine-strict/);
  }
  assert.match(read('tunes/scripts/music-docker-release-authority.ts'), new RegExp(`node@sha256:${digest}`));
});
test('development, CI, and protected native authorities agree on Node 24.22.1', () => {
  for (const file of ['package.json', 'tunes/package.json', 'explorers-earth/package.json']) {
    assert.equal(JSON.parse(read(file)).engines.node, '^24.22.1');
    const lock = JSON.parse(read(file.replace('package.json', 'package-lock.json')));
    assert.equal(lock.packages[''].engines.node, '^24.22.1');
  }
  for (const file of ['.nvmrc', 'tunes/.nvmrc', 'explorers-earth/.nvmrc']) assert.equal(read(file).trim(), '24.22.1');
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6/);
  assert.match(workflow, /8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7/);
  for (const file of ['tunes/scripts/music-release-launcher.ps1', 'tunes/scripts/music-release-launcher.sh']) {
    assert.match(read(file), /v24\.22\.1/);
    assert.doesNotMatch(read(file), /v22\.12\.0/);
  }
  assert.doesNotMatch(read('tunes/scripts/music-cli.ts'), /Node >=22\.12 is required/);
});
test('every active workflow setup-node selector uses the exact supported runtime', () => {
  const directory = resolve(root, '.github/workflows');
  let activeSelectors = 0;
  for (const file of readdirSync(directory).filter(file => /\.ya?ml$/.test(file))) {
    const workflow = parseYaml(read(`.github/workflows/${file}`));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      // An explicit disabled job cannot install dependencies. Conditional jobs
      // remain active: evaluate their selected runtime whenever they run.
      if (job.if === false || /^\s*\$\{\{\s*false\s*\}\}\s*$/.test(String(job.if))) continue;
      for (const step of job.steps ?? []) {
        if (!/^actions\/setup-node@/.test(step.uses ?? '')) continue;
        activeSelectors++;
        assert.equal(String(step.with?.['node-version']), '24.22.1', `${file}:${jobName}:${step.name ?? step.uses}`);
      }
    }
  }
  assert.ok(activeSelectors > 0, 'workflow discovery must find active setup-node selectors');
});
