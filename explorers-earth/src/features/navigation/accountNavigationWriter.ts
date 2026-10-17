import type { IntentAuthority, NavigationPatch, NavigationSnapshot } from './categoryNavigationPolicy';

export type Transaction = {
  read: () => Promise<NavigationSnapshot>;
  commit: (patch: NavigationPatch) => Promise<NavigationSnapshot>;
  isCurrent: () => boolean;
};
export type AccountNavigationWriter = {
  run: <T>(origin: IntentAuthority, work: (transaction: Transaction) => Promise<T>) => Promise<T>;
};
export type MusicPinVerifier = (transaction: Transaction, origin: IntentAuthority) => Promise<'public' | 'not-public' | 'unknown'>;
export type NavigationOutcome =
  | { kind: 'confirmed'; snapshot: NavigationSnapshot }
  | { kind: 'blocked'; reason: string }
  | { kind: 'uncertain' | 'conflict' | 'cleanup-pending'; snapshot?: NavigationSnapshot };

/** Safe, user-facing classification only; upstream errors may contain credentials. */
export class NavigationError extends Error {
  constructor(public readonly kind: 'blocked' | 'uncertain' | 'conflict', message: string, public readonly snapshot?: NavigationSnapshot) {
    super(message);
    this.name = 'NavigationError';
  }
}

// Pending writes outlive React controllers: invalidating their authority cannot
// cancel a mutation already admitted by the server. Keep its queue until settled.
const queuesByOwner = new WeakMap<object, Map<string, Promise<void>>>();

/** Serializes app/client-local transactions, not other tabs/devices. */
export function createAccountNavigationWriter(api: {
  read: (origin: IntentAuthority) => Promise<NavigationSnapshot>;
  commit: (origin: IntentAuthority, patch: NavigationPatch) => Promise<NavigationSnapshot>;
  isCurrent: (origin: IntentAuthority) => boolean;
}, queueOwner: object = api): AccountNavigationWriter {
  let queues = queuesByOwner.get(queueOwner);
  if (!queues) {
    queues = new Map<string, Promise<void>>();
    queuesByOwner.set(queueOwner, queues);
  }
  return {
    run(origin, work) {
      // Copy the authority at enqueue time, not when this request eventually runs.
      const captured = Object.freeze({ ...origin });
      const key = JSON.stringify([captured.userDocumentId, captured.accountDocumentId]);
      const previous = queues.get(key) ?? Promise.resolve();
      const run = previous.then(async () => {
        let open = true;
        const isCurrent = () => open && api.isCurrent(captured);
        const assertCurrent = () => {
          if (!isCurrent()) throw new NavigationError('blocked', 'Account changed. Reopen this control and try again.');
        };
        const transaction: Transaction = {
          isCurrent,
          async read() {
            assertCurrent();
            const snapshot = await api.read(captured);
            assertCurrent();
            return snapshot;
          },
          async commit(patch) {
            assertCurrent();
            const snapshot = await api.commit(captured, patch);
            assertCurrent();
            return snapshot;
          },
        };
        try { assertCurrent(); const result = await work(transaction); assertCurrent(); return result; }
        finally { open = false; }
      });
      const tail = run.then(() => undefined, () => undefined);
      queues.set(key, tail);
      void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
      return run;
    },
  };
}
