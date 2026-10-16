// Guards both halves of the fixture image's shared-contract admission: the generated
// .dockerignore allow-lists AND the hand-maintained COPY list in
// Dockerfile.music-fixture. `tunes/shared/*` is default-deny, so a contract that the
// frontend imports but neither file admits makes `RUN npm run build` fail inside Docker,
// and platform-fixture then dies in provision -- a full CI round trip to discover.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// Both quote styles: the frontend imports tunes/shared with double quotes in 14 files,
// and at least one contract is imported ONLY that way, so a single-quote-only pattern
// would miss a real regression.
const IMPORT = /from\s+["'][^"']*tunes\/shared\/([A-Za-z0-9_.-]+)["']/g;

function frontendSharedImports() {
  const walk = (dir) => readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
  const required = new Set();
  for (const file of walk(path.join(root, 'explorers-earth/src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      required.add(match[1].endsWith('.ts') ? match[1] : `${match[1]}.ts`);
    }
  }
  return required;
}

test('every tunes/shared contract imported by frontend source is COPYed into the fixture image', () => {
  const dockerfile = readFileSync(path.join(root, 'explorers-earth/Dockerfile.music-fixture'), 'utf8');
  const copied = new Set([...dockerfile.matchAll(/^COPY\s+tunes\/shared\/([^\s]+)\s/gm)].map((m) => m[1]));
  const missing = [...frontendSharedImports()].filter((name) => !copied.has(name)).sort();
  assert.deepEqual(missing, [], `Dockerfile.music-fixture does not COPY: ${missing.join(', ')}`);
});

test('every tunes/shared contract imported by frontend source is admitted by both ignore files', () => {
  const missing = [];
  for (const ignore of ['.dockerignore', 'explorers-earth/Dockerfile.music-fixture.dockerignore']) {
    const admitted = new Set([...readFileSync(path.join(root, ignore), 'utf8')
      .matchAll(/^!tunes\/shared\/([^\s]+)$/gm)].map((m) => m[1]));
    for (const name of frontendSharedImports()) if (!admitted.has(name)) missing.push(`${ignore}: ${name}`);
  }
  assert.deepEqual(missing.sort(), [], `build context excludes: ${missing.join(', ')}`);
});
