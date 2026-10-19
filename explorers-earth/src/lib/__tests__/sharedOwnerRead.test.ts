import { beforeEach, describe, expect, it, vi } from 'vitest';
import useAuthStore from '../../store/store';
import { shareOwnerRead } from '../sharedOwnerRead';

// Two components on one owner page each read the whole category. Concurrent identical reads
// for the same account and auth generation share one request instead of issuing two.
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('shareOwnerRead', () => {
  beforeEach(() => useAuthStore.setState({ generation: 4, accountId: 'account-1' }));

  it('starts one read for concurrent callers and gives both the result', async () => {
    const read = deferred<string>(); const start = vi.fn(() => read.promise);
    const a = shareOwnerRead('books', undefined, start), b = shareOwnerRead('books', undefined, start);
    expect(start).toHaveBeenCalledTimes(1);
    read.resolve('content');
    await expect(Promise.all([a, b])).resolves.toEqual(['content', 'content']);
  });

  it('keeps the read alive for the remaining caller when one aborts, and aborts it when all do', async () => {
    const read = deferred<string>(); let signal!: AbortSignal;
    const start = vi.fn((s: AbortSignal) => { signal = s; return read.promise; });
    const first = new AbortController(), second = new AbortController();
    const a = shareOwnerRead('movies', first.signal, start), b = shareOwnerRead('movies', second.signal, start);
    first.abort(); await expect(a).rejects.toBeTruthy();
    expect(signal.aborted).toBe(false);
    read.resolve('kept'); await expect(b).resolves.toBe('kept');
    const lone = new AbortController(), next = deferred<string>(); let nextSignal!: AbortSignal;
    const c = shareOwnerRead('movies', lone.signal, (s) => { nextSignal = s; return next.promise; });
    lone.abort(); await expect(c).rejects.toBeTruthy();
    expect(nextSignal.aborted).toBe(true);
  });

  it('starts a fresh read after the shared one settles, per category, account and generation', async () => {
    const start = vi.fn(async () => 'value');
    await shareOwnerRead('games', undefined, start);
    await shareOwnerRead('games', undefined, start);
    expect(start).toHaveBeenCalledTimes(2);
    const hold = deferred<string>(); const held = vi.fn(() => hold.promise);
    void shareOwnerRead('apps', undefined, held); void shareOwnerRead('people', undefined, held);
    useAuthStore.setState({ generation: 5 }); void shareOwnerRead('apps', undefined, held);
    expect(held).toHaveBeenCalledTimes(3);
    hold.resolve('done');
  });

  it('does not let a later refetch join a read that started before it', async () => {
    const early = deferred<string>(); const start = vi.fn().mockReturnValueOnce(early.promise).mockResolvedValueOnce('fresh');
    const first = shareOwnerRead('places', undefined, start);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(shareOwnerRead('places', undefined, start)).resolves.toBe('fresh');
    expect(start).toHaveBeenCalledTimes(2);
    early.resolve('stale'); await expect(first).resolves.toBe('stale');
  });

  it('shares a failure with every waiting caller', async () => {
    const read = deferred<string>(); const start = vi.fn(() => read.promise);
    const a = shareOwnerRead('products', undefined, start), b = shareOwnerRead('products', undefined, start);
    read.reject(new Error('read failed'));
    await expect(a).rejects.toThrow('read failed'); await expect(b).rejects.toThrow('read failed');
  });
});
