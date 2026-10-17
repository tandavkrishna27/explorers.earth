import { describe, expect, it } from 'vitest';
import { discoveryReport } from '../playwrightDiscovery';

describe('Playwright discovery process evidence', () => {
  it('reports loader errors from JSON stdout when stderr is empty', () => {
    expect(() => discoveryReport('category.config.ts', { status: 1, signal: null, stderr: '',
      stdout: JSON.stringify({ errors: [{ message: "Cannot find package 'zod' imported from tunes/shared/explorersBookContract.ts" }] }) }))
      .toThrow(/category\.config\.ts.*status=1.*Cannot find package 'zod'/s);
  });
  it('reports killed processes and spawn failures without parsing empty stdout', () => {
    expect(() => discoveryReport('config.ts', { status: null, signal: 'SIGTERM', stdout: '', stderr: '', error: new Error('spawn failed') }))
      .toThrow(/signal=SIGTERM.*spawn failed/s);
  });
  it('rejects successful processes containing discovery errors or malformed JSON', () => {
    expect(() => discoveryReport('config.ts', { status: 0, signal: null, stdout: '{"errors":[{"message":"bad import"}]}', stderr: '' })).toThrow('bad import');
    expect(() => discoveryReport('config.ts', { status: 0, signal: null, stdout: 'not JSON', stderr: '' })).toThrow(/invalid JSON.*not JSON/s);
  });
  it('preserves successful suite identities and rejects missing suites', () => {
    const suites = [{ title: 'category', specs: [{ title: 'owner privacy' }] }];
    expect(discoveryReport('config.ts', { status: 0, signal: null, stdout: JSON.stringify({ suites }), stderr: '' }).suites).toEqual(suites);
    expect(() => discoveryReport('config.ts', { status: 0, signal: null, stdout: '{}', stderr: '' })).toThrow('missing suites');
  });
});
