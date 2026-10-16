import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAccountNavigationWriter } from '../navigation/CategoryNavigationProvider';
import type { IntentAuthority } from '../navigation/categoryNavigationPolicy';
import { createMusicPublishCoordinator, type Coordinator, type PublishOutcome, type PublishState } from './musicPublishCoordinator';
import { createMusicPublishAdapter } from './musicPublishAdapter';
import { createMusicPublishOperationStore } from './musicPublishOperationStore';
import { musicIdentityCoordinator } from './musicApi';
import { musicWorkspaceClient, musicWorkspaceQueryKey } from '../../hooks/useTunesDashboard';
import { queryClient } from '../../lib/queryClient';
import { notifyMusicPublicationVerified, subscribePublicationVerified } from './PublicMusicAvailabilityProvider';
export type { PublishState } from './musicPublishCoordinator';

type Entry = { subscribe(listener: () => void): () => void; getSnapshot(): PublishState; request(mode: Parameters<Coordinator['request']>[0], current: () => boolean): Promise<PublishOutcome>; resume(current: () => boolean): Promise<PublishOutcome>; refresh: Coordinator['read'] };
const RegistryContext = createContext<Map<string, Entry> | undefined>(undefined);
const unavailable: PublishState = { kind: 'unknown', errorCode: 'scope-changed' };
const noSubscription = () => () => undefined;
const getUnavailable = () => unavailable;

/** Inert registry. Account subscription and Music reads belong to active consumers. */
export function MusicPublishProvider({ children }: { children: ReactNode }) {
  const [registry] = useState(() => new Map<string, Entry>());
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useMusicPublish(origin: IntentAuthority | undefined, { ready }: { ready: boolean }) {
  const registry = useContext(RegistryContext);
  if (!registry) throw new Error('MusicPublishProvider is required.');
  const shared = useAccountNavigationWriter();
  useSyncExternalStore(musicIdentityCoordinator.subscribe, musicIdentityCoordinator.getSnapshot, musicIdentityCoordinator.getSnapshot);
  const eligible = !!origin && ready && shared.isCurrent(origin) && musicIdentityCoordinator.isReadyFor(origin);
  const entry = useMemo(() => {
    if (!origin || !eligible) return undefined;
    const captured = Object.freeze({ ...origin });
    const key = JSON.stringify([captured.userDocumentId, captured.accountDocumentId, captured.generation]);
    const existing = registry.get(key);
    if (existing) return existing;
    let consumers = 0;
    let disposed = false;
    let pending = 0;
    let requestingConsumer: (() => boolean) | undefined;
    let reading: Promise<void> | undefined;
    let finalInvalidated = false;
    let notifying = false;
    let stopPublicationSignals: (() => void) | undefined;
    let view: PublishState = { kind: 'loading' };
    const listeners = new Set<() => void>();
    const current = () => !disposed && consumers > 0 && shared.isCurrent(captured) && musicIdentityCoordinator.isReadyFor(captured) && (!requestingConsumer || requestingConsumer());
    const coordinator = createMusicPublishCoordinator(transaction => createMusicPublishAdapter({ workspace: musicWorkspaceClient,
      origin: captured, scope: captured, transaction, isCurrent: current }), captured, createMusicPublishOperationStore(), shared.writer);
    const emit = () => {
      const state = coordinator.getSnapshot();
      view = pending ? { ...state, kind: 'saving' } : state;
      for (const listener of listeners) listener();
    };
    const stop = coordinator.subscribe(emit);
    const refresh = (): Promise<void> => {
      if (!current()) return Promise.resolve();
      if (!reading) {
        finalInvalidated = false;
        reading = coordinator.read().finally(() => {
          reading = undefined;
          // A final event can follow an already-started focus read of the old
          // backend state. Schedule one fresh read after that writer completes.
          if (finalInvalidated && current()) void refresh();
        });
      }
      return reading;
    };
    const onFocus = () => { void refresh(); };
    const onPublicationVerified = () => {
      if (notifying || !current()) return;
      finalInvalidated = true;
      void refresh();
    };
    async function run(work: () => Promise<PublishOutcome>, consumerCurrent: () => boolean): Promise<PublishOutcome> {
      if (pending || !consumerCurrent() || !current()) return { status: 'unknown' };
      requestingConsumer = consumerCurrent;
      pending++; emit();
      try {
        const result = await work();
        if (!current()) return { status: 'unknown' };
        if (result.status === 'verified') {
          // Strapi Yes is only an intermediate step; notify AFTER backend/discovery verification.
          // This entry already verified the result. Other active entries/tabs
          // refresh, but the sender must not enqueue a read on its own writer.
          notifying = true;
          try { notifyMusicPublicationVerified(captured.accountDocumentId); }
          finally { notifying = false; }
          void shared.refresh();
          void queryClient.invalidateQueries({ queryKey: musicWorkspaceQueryKey(captured) }).catch(() => undefined);
        }
        return result; // Capabilities travel to the requesting open dialog only, never registry state.
      } finally { requestingConsumer = undefined; pending--; emit(); }
    }
    const created: Entry = {
      getSnapshot: () => view,
      request: (mode, consumerCurrent) => run(() => coordinator.request(mode), consumerCurrent),
      resume: consumerCurrent => run(() => coordinator.resume(), consumerCurrent),
      refresh,
      subscribe(listener) {
        consumers++; listeners.add(listener);
        if (consumers === 1) {
          window.addEventListener('focus', onFocus); window.addEventListener('online', onFocus);
          stopPublicationSignals = subscribePublicationVerified(captured.accountDocumentId, onPublicationVerified);
          void refresh();
        }
        return () => {
          listeners.delete(listener); consumers--;
          if (!consumers) {
            window.removeEventListener('focus', onFocus); window.removeEventListener('online', onFocus);
            stopPublicationSignals?.(); stopPublicationSignals = undefined;
            // React StrictMode may immediately reattach this same subscription.
            queueMicrotask(() => { if (!consumers) { disposed = true; stop(); coordinator.dispose(); if (registry.get(key) === created) registry.delete(key); } });
          }
        };
      },
    };
    registry.set(key, created);
    return created;
  }, [registry, origin?.userDocumentId, origin?.accountDocumentId, origin?.generation, eligible, shared.writer, shared.isCurrent, shared.refresh]);
  const subscribe = useCallback((listener: () => void) => entry ? entry.subscribe(listener) : noSubscription(), [entry]);
  const state = useSyncExternalStore(subscribe, entry?.getSnapshot ?? getUnavailable, entry?.getSnapshot ?? getUnavailable);
  const consumer = useRef({ eligible, entry, mounted: true });
  consumer.current.eligible = eligible; consumer.current.entry = entry;
  useEffect(() => { consumer.current.mounted = true; return () => { consumer.current.mounted = false; }; }, []);
  const consumerCurrent = useCallback(() => consumer.current.mounted && consumer.current.eligible && consumer.current.entry === entry, [entry]);
  const request: Coordinator['request'] = useCallback(mode => entry && consumerCurrent() ? entry.request(mode, consumerCurrent) : Promise.resolve({ status: 'unknown' }), [entry, consumerCurrent]);
  const resume: Coordinator['resume'] = useCallback(() => entry && consumerCurrent() ? entry.resume(consumerCurrent) : Promise.resolve({ status: 'unknown' }), [entry, consumerCurrent]);
  const refresh = useCallback(() => entry && consumerCurrent() ? entry.refresh() : Promise.resolve(), [entry, consumerCurrent]);
  const canRecover = eligible && state.kind !== 'saving' && state.kind !== 'loading';
  return { state, request, resume, refresh, canChange: canRecover && state.kind !== 'conflict' && !state.desired, canRecover };
}
