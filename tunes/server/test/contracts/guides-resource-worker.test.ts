import { describe, expect, it, vi } from 'vitest';
import { runGuidesResourceWorker } from '../../../scripts/guides-resource-worker';
import { readFileSync } from 'node:fs';

describe('Guides worker rejects caller authority before original resource effects', () => {
  it('denies a second exact compiler request before invoking the original spawn', () => {
    const source = readFileSync(new URL('./fixtures/guides-parent-import-probe.mjs', import.meta.url), 'utf8');
    const start = source.indexOf('cp.spawn = '), end = source.indexOf('\nfor (const key', start);
    expect(start).toBeGreaterThan(-1); expect(end).toBeGreaterThan(start);
    const guard = source.slice(start, end), cp: { spawn?: (...args: any[]) => unknown } = {};
    const original = vi.fn(() => ({ original: true })); let denied = 0;
    const counter = new Function('cp', 'fs', 'compiler', 'spawn', 'deny', `let toolCalls = 0;\n${guard}\nreturn () => toolCalls;`)(cp, { realpathSync: (file: string) => file }, 'locked-compiler', original, () => { denied++; throw Error('denied'); });
    if (!cp.spawn) throw Error('Original guard missing');
    const args = ['--service=0.25.12', '--ping'];
    expect(cp.spawn('locked-compiler', args, { shell: false })).toEqual({ original: true });
    expect(() => cp.spawn!('locked-compiler', args, { shell: false })).toThrow('denied');
    expect(original).toHaveBeenCalledTimes(1); expect(counter()).toBe(1); expect(denied).toBe(1);
  });
  it.each(['extra-dependency', 'extra-clock', 'missing-clock', 'closed-authority'])('rejects %s without opening its original private pipe', async fault => {
    const connectPipe = vi.fn(async () => { throw Error('unexpected resource effect'); });
    const d: any = { platform: 'win32', argv: [], environment: { GUIDES_PRIVATE_PIPE: '\\\\.\\pipe\\explorers-guides-' + 'a'.repeat(32) + '-' + 'b'.repeat(32), GUIDES_PRIVATE_TOKEN: 'c'.repeat(64), GUIDES_PRIVATE_EPOCH: '1' }, clock: { now: () => 0, setTimeout: () => 1, clearTimeout() {} }, randomHex: () => 'd'.repeat(32), connectPipe };
    for (const key of ['createPool', 'migrate', 'resolveConfig', 'createStorage', 'compose', 'listen', 'startControl', 'fetch']) d[key] = vi.fn(async () => { throw Error('unexpected resource effect'); });
    if (fault === 'extra-dependency') d.providerClosed = true;
    if (fault === 'extra-clock') d.clock.closed = true;
    if (fault === 'missing-clock') delete d.clock.clearTimeout;
    if (fault === 'closed-authority') d.environment.GUIDES_PRIVATE_PROVIDER_CLOSED = 'true';
    await expect(runGuidesResourceWorker(d)).rejects.toThrow(/Guides worker protocol/); expect(connectPipe).not.toHaveBeenCalled();
    expect(Object.values(d).filter(v => typeof v === 'function' && v !== d.randomHex).every(v => (v as any).mock.calls.length === 0)).toBe(true);
  });
});
