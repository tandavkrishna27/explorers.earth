import useAuthStore from '../store/store';

type Entry = { promise: Promise<unknown>; controller: AbortController; waiters: number };
const inFlight = new Map<string, Entry>();

/**
 * Joins a whole-category owner read already in flight for the same category, account and
 * auth generation, instead of starting another. An owner category page mounts more than one
 * reader (the page and its top-picks manager), and each used to issue the full read.
 *
 * Each caller keeps its own cancellation: aborting one caller only detaches it, and the
 * shared read is aborted once no caller is waiting. Only callers starting in the same task
 * share, so a later refetch always starts its own read and observes fresh state.
 */
export function shareOwnerRead<T>(category: string, signal: AbortSignal | undefined,
  start: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { generation, accountId } = useAuthStore.getState();
  const key = JSON.stringify([category, generation, accountId]);
  let entry = inFlight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created: Entry = { controller, waiters: 0, promise: Promise.resolve() };
    created.promise = start(controller.signal).finally(() => { if (inFlight.get(key) === created) inFlight.delete(key); });
    // Every caller attaches its own handlers; this one only keeps an orphaned rejection quiet.
    created.promise.catch(() => undefined);
    inFlight.set(key, created);
    // Only readers that start in the same task join: the components of one page mount in one
    // commit. A refetch after a write starts later, so it never joins a read begun before it.
    setTimeout(() => { if (inFlight.get(key) === created) inFlight.delete(key); }, 0);
    entry = created;
  }
  const shared = entry;
  shared.waiters++;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const detach = () => {
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      shared.waiters--;
    };
    const onAbort = () => {
      if (settled) return;
      detach();
      if (shared.waiters === 0) {
        if (inFlight.get(key) === shared) inFlight.delete(key);
        shared.controller.abort(signal?.reason);
      }
      reject(signal?.reason ?? new DOMException('Owner read cancelled', 'AbortError'));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    shared.promise.then(
      (value) => { if (!settled) { detach(); resolve(value as T); } },
      (error) => { if (!settled) { detach(); reject(error); } },
    );
  });
}
