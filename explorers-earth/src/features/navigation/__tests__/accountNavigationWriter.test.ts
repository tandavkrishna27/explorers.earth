import { describe, expect, it } from 'vitest';
import { createAccountNavigationWriter } from '../accountNavigationWriter';
import type { NavigationSnapshot } from '../categoryNavigationPolicy';

const origin = { userDocumentId: 'u1', accountDocumentId: 'a1', generation: 1 };
const snapshot = { scope: origin, revision: 1, categories: [], savedPins: [], autoPinning: false, visibility: {} } as NavigationSnapshot;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };

describe('account navigation writer', () => {
  it('serializes the whole read/work/commit transaction for the same owner', async () => {
    const pause = deferred();
    const events: string[] = [];
    const writer = createAccountNavigationWriter({ isCurrent: () => true, read: async () => snapshot, commit: async () => snapshot });
    const first = writer.run(origin, async (tx) => { events.push('first-read'); await tx.read(); await pause.promise; await tx.commit({ auto_pinning: true }); events.push('first-end'); });
    const second = writer.run(origin, async () => { events.push('second'); });
    await Promise.resolve(); await Promise.resolve();
    expect(events).toEqual(['first-read']);
    pause.resolve(); await Promise.all([first, second]);
    expect(events).toEqual(['first-read', 'first-end', 'second']);
  });

  it('rejects invalidated queued work and checks authority after an awaited read', async () => {
    const pause = deferred(); let current = true; let writes = 0; let queuedWork = false;
    const writer = createAccountNavigationWriter({ isCurrent: () => current, read: async () => { await pause.promise; return snapshot; }, commit: async () => { writes++; return snapshot; } });
    const first = writer.run(origin, async (tx) => { await tx.read(); await tx.commit({ auto_pinning: true }); });
    const second = writer.run(origin, async () => { queuedWork = true; });
    const assertions = Promise.all([expect(first).rejects.toMatchObject({ kind: 'blocked' }), expect(second).rejects.toMatchObject({ kind: 'blocked' })]);
    await Promise.resolve(); current = false; pause.resolve(); await assertions;
    expect(writes).toBe(0); expect(queuedWork).toBe(false);
  });

  it('releases the queue after failure and closes an escaped transaction', async () => {
    let escaped: Parameters<Parameters<ReturnType<typeof createAccountNavigationWriter>['run']>[1]>[0] | undefined;
    let writes = 0;
    const writer = createAccountNavigationWriter({ isCurrent: () => true, read: async () => snapshot, commit: async () => { writes++; return snapshot; } });
    await expect(writer.run(origin, async (tx) => { escaped = tx; throw new Error('failure'); })).rejects.toThrow('failure');
    await writer.run(origin, async (tx) => tx.commit({ auto_pinning: false }));
    await expect(escaped!.commit({ auto_pinning: true })).rejects.toMatchObject({ kind: 'blocked' });
    expect(writes).toBe(1);
  });

  it('retains pending owner transactions across writer replacements sharing one app client', async () => {
    const client = {};
    const pause = deferred();
    const events: string[] = [];
    const api = { isCurrent: () => true, read: async () => snapshot, commit: async () => snapshot };
    const firstWriter = createAccountNavigationWriter(api, client);
    const first = firstWriter.run(origin, async () => { events.push('first'); await pause.promise; events.push('settled'); });
    await Promise.resolve();
    const replacement = createAccountNavigationWriter({ ...api }, client);
    const second = replacement.run({ ...origin, generation: 2 }, async () => { events.push('replacement'); });
    const independent = createAccountNavigationWriter({ ...api }, {});
    await independent.run(origin, async () => { events.push('independent'); });
    const beforeSettlement = [...events];
    pause.resolve(); await Promise.all([first, second]);
    expect(beforeSettlement).toEqual(['first', 'independent']);
    expect(events).toEqual(['first', 'independent', 'settled', 'replacement']);
  });
});
