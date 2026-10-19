import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanBundle, MIN_JS_BYTES } from './check-platform-bundle-strapi.mjs';

function bundle(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), body);
  return dir;
}
// Above the production floor, so a size finding can never stand in for a signature finding.
const big = 'x'.repeat(MIN_JS_BYTES + 1);

test('an above-floor bundle with no signature is clean (control)', () => {
  assert.deepEqual(scanBundle(bundle({ 'a.js': big }), { phase: 'B' }).findings, []);
});
test('flags each Strapi signature by name', () => {
  for (const marker of ['api.localqr.earth', 'undefined/upload', 'users_permissions_users', '/upload/files/',
    '77.42.95.255', '13.126.235.177']) {
    const findings = scanBundle(bundle({ 'a.js': big + marker }), { phase: 'A' }).findings;
    assert.equal(findings.length, 1, marker);
    assert.ok(findings[0].endsWith(`: ${marker}`), findings[0]);
  }
});
test('a near-empty bundle fails the size floor instead of passing clean', () => {
  assert.deepEqual(scanBundle(bundle({ 'a.js': 'ok' }), { phase: 'A' }).findings.map((f) => /floor/.test(f)), [true]);
});
test('phase B also forbids /graphql in any form, the Apollo client and the guarded legacy origin; phase A does not', () => {
  for (const marker of ['uri:"/graphql"', 'fetch(`${o}/graphql`)', 'ApolloClient', 'e(`http://localhost:1337`)']) {
    assert.equal(scanBundle(bundle({ 'a.js': big + marker }), { phase: 'B' }).findings.length, 1, marker);
    assert.deepEqual(scanBundle(bundle({ 'a.js': big + marker }), { phase: 'A' }).findings, [], marker);
  }
});
