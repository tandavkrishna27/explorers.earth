import { readCanonicalNavigationContent, type NavigationContent } from './canonicalNavigationContent';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { explorersApiClient } from '../../lib/explorersApiClient';
import useAuthStore from '../../store/store';
import { createAccountNavigationWriter, NavigationError, type AccountNavigationWriter, type MusicPinVerifier, type NavigationOutcome, type Transaction } from './accountNavigationWriter';
import { createCategoryNavigationApi } from './categoryNavigationApi';
import { CATEGORY_IDS, planCategoryIntent, type CategoryId, type GenericNavigationIntent, type IntentAuthority, type NavigationSnapshot } from './categoryNavigationPolicy';
import { publishPublicProfileInvalidation, type PublicProfileInvalidationAction, type PublicProfileInvalidationCategory } from '../PublicHome/api/publicProfileInvalidation';

export type NavigationPendingOperation = Readonly<{
  id: string;
  kind: "category" | "auto-pinning";
  category?: CategoryId;
  action: "publish" | "unpublish" | "pin" | "unpin" | "set-auto-pinning";
}>;

type NavigationState = {
  snapshot?: NavigationSnapshot;
  content?: NavigationContent;
  authority?: IntentAuthority;
  busy: boolean;
  pending: readonly NavigationPendingOperation[];
  error?: string;
};
const CHANNEL = 'explorers-category-navigation';
const VERSION = 'category-navigation/v1';
// Authority epochs cannot repeat when the dashboard provider is remounted.
let nextGeneration = 0;

function isGenericIntent(value: unknown): value is GenericNavigationIntent {
  if (!value || typeof value !== 'object') return false;
  const intent = value as { category?: unknown; action?: unknown };
  return CATEGORY_IDS.some((category) => category === intent.category)
    && ['publish', 'unpublish', 'pin', 'unpin'].some((action) => action === intent.action)
    && !(intent.category === 'public_music' && (intent.action === 'publish' || intent.action === 'unpublish'));
}

function createNavigationController(verifier: () => MusicPinVerifier | undefined) {
  let state: NavigationState = { busy: false, pending: [] };
  let generation = ++nextGeneration;
  let readSequence = 0;
  let nextOperationId = 0;
  let operations = 0;
  let mounted = false;
  let observedSessionGeneration = useAuthStore.getState().generation;
  let stopAuth: (() => void) | undefined;
  let channel: BroadcastChannel | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: NavigationState) => { state = next; for (const listener of listeners) listener(); };
  const isCurrent = (origin: IntentAuthority) => {
    const auth = useAuthStore.getState();
    return mounted && !!origin && auth.isAuthenticated && auth.status === 'active-complete' && auth.generation === observedSessionGeneration && !auth.user?.blocked
      && auth.user?.id === origin.userDocumentId && auth.accountId === origin.accountDocumentId && generation === origin.generation
      && state.authority?.accountDocumentId === origin.accountDocumentId;
  };
  const api = createCategoryNavigationApi({ profile: explorersApiClient, isCurrent });
  const invalidate = () => {
    generation = ++nextGeneration; readSequence++; operations = 0;
    publish({ busy: false, pending: [] });
  };
  async function refresh() {
    if (!mounted || listeners.size === 0) return;
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated || auth.status !== 'active-complete' || !auth.user?.id || !auth.accountId || auth.user.blocked) return;
    const sessionGeneration = auth.generation;
    // Compatibility aliases: auth identity and canonical account, never Strapi subjects.
    const scope = { userDocumentId: auth.user.id, accountDocumentId: auth.accountId };
    const startedGeneration = generation;
    const sequence = ++readSequence;
    try {
      const snapshot = await api.readAccount(scope);
      if (!mounted || listeners.size === 0 || generation !== startedGeneration || sequence !== readSequence
        || useAuthStore.getState().generation !== sessionGeneration) return;
      const authority = Object.freeze({ ...snapshot.scope, generation });
      publish({ snapshot, authority, busy: operations > 0, pending: state.pending });
      const content = await readCanonicalNavigationContent(scope, () => isCurrent(authority) && sequence === readSequence);
      if (!isCurrent(authority) || sequence !== readSequence) return;
      publish({ ...state, content });
    } catch (error) {
      if (!mounted || listeners.size === 0 || generation !== startedGeneration || sequence !== readSequence
        || useAuthStore.getState().generation !== sessionGeneration) return;
      publish({ ...state, error: error instanceof NavigationError ? error.message : 'Category settings could not be loaded. Refresh to try again.' });
    }
  }
  // Focus/online/navigation-change events invalidate data, not session authority.
  const refreshActive = () => { void refresh(); };
  const broadcast = (origin: IntentAuthority) => {
    try {
      const event = { version: VERSION, kind: 'changed', eventId: crypto.randomUUID(),
        scope: { userDocumentId: origin.userDocumentId, accountDocumentId: origin.accountDocumentId } };
      try { channel?.postMessage(event); } catch { /* Delivery is not write authority. */ }
      try { window.localStorage.setItem(CHANNEL, JSON.stringify(event)); window.localStorage.removeItem(CHANNEL); } catch { /* Storage may be disabled. */ }
    } catch { /* Even event creation may be unavailable; the save was still verified. */ }
  };
  const publishPublicInvalidation = (
    origin: IntentAuthority,
    category: PublicProfileInvalidationCategory,
    action: PublicProfileInvalidationAction,
  ) => {
    const username = useAuthStore.getState().user?.username;
    if (typeof username !== 'string' || username.trim().length === 0) return;
    let eventId: string;
    try { eventId = crypto.randomUUID(); } catch { eventId = `public-${Date.now()}-${Math.random()}`; }
    try { publishPublicProfileInvalidation({ accountDocumentId: origin.accountDocumentId, username, category, action, eventId }); } catch { /* Verified save remains successful if delivery is unavailable. */ }
  };
  const receive = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const event = value as { version?: unknown; kind?: unknown; eventId?: unknown; scope?: { userDocumentId?: unknown; accountDocumentId?: unknown } };
    const current = state.authority;
    if (event.version === VERSION && event.kind === 'changed' && typeof event.eventId === 'string' && event.eventId.length > 0
      && current && event.scope?.userDocumentId === current.userDocumentId && event.scope.accountDocumentId === current.accountDocumentId) refreshActive();
  };
  const onMessage = (event: MessageEvent) => receive(event.data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== CHANNEL || !event.newValue) return;
    try { receive(JSON.parse(event.newValue)); } catch { /* Untrusted event. */ }
  };
  function mount() {
    if (mounted) return;
    mounted = true;
    stopAuth = useAuthStore.subscribe((next, previous) => {
      if (next.generation === previous.generation && next.isAuthenticated === previous.isAuthenticated && next.user?.id === previous.user?.id && next.accountId === previous.accountId && next.status === previous.status
        && next.user?.blocked === previous.user?.blocked) return;
      observedSessionGeneration = next.generation;
      invalidate(); void refresh();
    });
    try {
      if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel(CHANNEL); channel.addEventListener('message', onMessage); }
    } catch { /* A disabled channel does not disable owner checks. */ }
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refreshActive);
    window.addEventListener('online', refreshActive);
  }
  const rawWriter = createAccountNavigationWriter({
    isCurrent, read: api.read,
    async commit(origin, patch) {
      const snapshot = await api.commit(origin, patch);
      if (!isCurrent(origin)) throw new NavigationError('blocked', 'Account changed. Reopen this control.');
      readSequence++;
      publish({ snapshot, authority: state.authority, content: state.content, busy: operations > 0, pending: state.pending });
      broadcast(origin);
      return snapshot;
    },
  }, explorersApiClient);
  const writer: AccountNavigationWriter = {
    async run(origin, work) {
      const captured = Object.freeze({ ...origin });
      if (!isCurrent(captured)) throw new NavigationError('blocked', 'Account changed. Reopen this control and try again.');
      operations++;
      publish({ ...state, busy: true, error: undefined });
      try { return await rawWriter.run(captured, work); }
      finally {
        if (isCurrent(captured)) { operations--; publish({ ...state, busy: operations > 0 }); }
      }
    },
  };
  async function execute(
    origin: IntentAuthority,
    work: (transaction: Transaction) => Promise<NavigationOutcome>,
    pendingInput?: Omit<NavigationPendingOperation, "id">,
  ): Promise<NavigationOutcome> {
    const captured = Object.freeze({ ...origin });
    const pending = pendingInput && Object.freeze({ ...pendingInput, id: `${captured.generation}:${++nextOperationId}` });
    if (pending) publish({ ...state, pending: [...state.pending, pending] });
    try {
      const result = await writer.run(captured, work);
      if (!isCurrent(captured)) return { kind: 'blocked', reason: 'Account changed. Reopen this control.' };
      if ('snapshot' in result && result.snapshot) {
        readSequence++;
        publish({ ...state, snapshot: result.snapshot, error: result.kind === 'cleanup-pending' ? 'Category is hidden. Saved navigation still needs owner cleanup; refresh and retry cleanup.' : undefined });
      } else if (result.kind === 'blocked') publish({ ...state, error: result.reason });
      return result;
    } catch (error) {
      if (!isCurrent(captured)) return { kind: 'blocked', reason: 'Account changed. Reopen this control.' };
      const failure = error instanceof NavigationError ? error : new NavigationError('uncertain', 'Navigation could not be verified. Refresh before trying again.');
      publish({ ...state, error: failure.message, ...(failure.snapshot ? { snapshot: failure.snapshot } : {}) });
      return failure.kind === 'blocked' ? { kind: 'blocked', reason: failure.message } : { kind: failure.kind, ...(failure.snapshot ? { snapshot: failure.snapshot } : {}) };
    } finally {
      if (pending && state.pending.some((operation) => operation.id === pending.id)) {
        publish({ ...state, pending: state.pending.filter((operation) => operation.id !== pending.id) });
      }
    }
  }
  async function request(intent: GenericNavigationIntent, origin: IntentAuthority): Promise<NavigationOutcome> {
    // This public executor may never perform Music publication, even via an unsafe cast.
    if (!isGenericIntent(intent)) return { kind: 'blocked', reason: 'Unsupported category action.' };
    const command = { ...intent };
    const captured = Object.freeze({ ...origin });
    return execute(captured, async (transaction) => {
      const snapshot = await transaction.read();
      if (command.action === 'pin') {
        if (snapshot.visibility[command.category] !== 'Yes') return { kind: 'blocked', reason: 'not-public' };
        if (command.category === 'public_music') {
          let result: 'public' | 'not-public' | 'unknown' = 'unknown';
          try { result = await verifier()?.(transaction, captured) ?? 'unknown'; } catch { /* A Music outage fails closed for new pins only. */ }
          if (!transaction.isCurrent()) throw new NavigationError('blocked', 'Account changed. Reopen this control.');
          if (result !== 'public') return { kind: 'blocked', reason: result === 'not-public' ? 'not-public' : 'unknown' };
        }
      }
      // No content-eligibility read at all now: neither visibility nor placement
      // depends on current inventory, which also drops a round-trip from both paths.
      // Music keeps its own publication verification above.
      const plan = planCategoryIntent(snapshot, command);
      if (plan.kind === 'blocked') return plan;
      if (plan.kind === 'noop') return { kind: 'confirmed', snapshot };
      const confirmed = await transaction.commit(plan.patch);
      publishPublicInvalidation(captured, command.category, command.action);
      return { kind: plan.cleanupPending ? 'cleanup-pending' : 'confirmed', snapshot: confirmed };
    }, { kind: 'category', category: command.category, action: command.action });
  }
  async function setAutoPinning(enabled: boolean, origin: IntentAuthority): Promise<NavigationOutcome> {
    if (typeof enabled !== 'boolean') return { kind: 'blocked', reason: 'Invalid navigation preference.' };
    return execute(origin, async (transaction) => {
      const snapshot = await transaction.read();
      if (snapshot.autoPinning === enabled) return { kind: 'confirmed', snapshot };
      const confirmed = await transaction.commit({ auto_pinning: enabled });
      publishPublicInvalidation(origin, 'public_profile', 'set-auto-pinning');
      return { kind: 'confirmed', snapshot: confirmed };
    }, { kind: 'auto-pinning', action: 'set-auto-pinning' });
  }
  return {
    writer, isCurrent, request, setAutoPinning, refresh, mount,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      mount();
      const first = listeners.size === 0;
      listeners.add(listener);
      if (first) void refresh();
      return () => { listeners.delete(listener); if (listeners.size === 0) invalidate(); };
    },
    unmount() {
      mounted = false; invalidate(); stopAuth?.();
      channel?.removeEventListener('message', onMessage); channel?.close(); channel = undefined;
      window.removeEventListener('storage', onStorage); window.removeEventListener('focus', refreshActive); window.removeEventListener('online', refreshActive);
    },
  };
}

const NavigationContext = createContext<ReturnType<typeof createNavigationController> | undefined>(undefined);

export function CategoryNavigationProvider({ children, verifyMusicPin }: { children: ReactNode; verifyMusicPin?: MusicPinVerifier }) {
  const verifier = useRef(verifyMusicPin);
  useLayoutEffect(() => { verifier.current = verifyMusicPin; }, [verifyMusicPin]);
  const controller = useMemo(() => createNavigationController(() => verifier.current), []);
  useLayoutEffect(() => { controller.mount(); return () => controller.unmount(); }, [controller]);
  return <NavigationContext.Provider value={controller}>{children}</NavigationContext.Provider>;
}

function useNavigationController() {
  const controller = useContext(NavigationContext);
  if (!controller) throw new Error('CategoryNavigationProvider is required.');
  return controller;
}

export function useCategoryNavigation() {
  const controller = useNavigationController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...state, request: controller.request, setAutoPinning: controller.setAutoPinning, refresh: controller.refresh };
}

/** Music uses this SAME writer; its workflow must use the supplied transaction, never reenter run. */
export function useAccountNavigationWriter() {
  const controller = useNavigationController();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { writer: controller.writer, authority: state.authority, isCurrent: controller.isCurrent, refresh: controller.refresh };
}
