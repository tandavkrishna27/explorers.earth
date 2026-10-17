import { parseMusicPublicationResponse, type MusicPublicationCommandResponse, type MusicPublicationMode } from '../../../../tunes/shared/musicPublicationContract';
import { completeMusicPublicationCommand, getOrCreateMusicPublicationCommand, type MusicPublicationOwnerScope } from './musicPublicationCommandRegistry';
import { NavigationError, type AccountNavigationWriter, type Transaction } from '../navigation/accountNavigationWriter';
import type { IntentAuthority } from '../navigation/categoryNavigationPolicy';
import type { OperationStore, PendingOperation } from './musicPublishOperationStore';
import { MusicClientError } from '../../lib/localTunesApiClient';
export type Snapshot = {
    scope: MusicPublicationOwnerScope;
    profile: 'Yes' | 'No' | null;
    mode: MusicPublicationMode;
    publicSlug: string;
    savedPins: unknown;
};
export type PublishState = {
    kind: 'loading' | 'published' | 'draft' | 'needs-attention' | 'saving' | 'unknown' | 'conflict';
    confirmed?: Snapshot;
    desired?: MusicPublicationMode;
    errorCode?: 'profile-save' | 'publication-save' | 'verification' | 'scope-changed' | 'replay-expired';
};
export type Ports = {
    read(): Promise<Snapshot>;
    saveProfile(value: 'Yes' | 'No'): Promise<void>;
    publish(mode: MusicPublicationMode, key: string): Promise<MusicPublicationCommandResponse>;
    discover(publicSlug: string): Promise<void>;
    isCurrent(): boolean;
};
export type PublishOutcome = {
    status: 'verified';
    response?: MusicPublicationCommandResponse;
} | {
    status: 'needs-attention' | 'conflict' | 'unknown';
};
export type Coordinator = {
    getSnapshot(): PublishState;
    subscribe(listener: () => void): () => void;
    read(): Promise<void>;
    request(mode: MusicPublicationMode): Promise<PublishOutcome>;
    resume(): Promise<PublishOutcome>;
    dispose(): void;
};
const cleanPins = (pins: unknown) => pins === null || (Array.isArray(pins) && pins.every((pin) => typeof pin === 'string') && !pins.includes('public_music'));
const matches = (snapshot: Snapshot, mode: MusicPublicationMode) => snapshot.mode === mode
    && (mode === 'public' ? snapshot.profile === 'Yes' : snapshot.profile === 'No' && cleanPins(snapshot.savedPins));
const classification = (snapshot: Snapshot): PublishState['kind'] => matches(snapshot, 'public') ? 'published' : matches(snapshot, 'private') ? 'draft' : 'needs-attention';
const sameScope = (left: MusicPublicationOwnerScope, right: MusicPublicationOwnerScope) => left.userDocumentId === right.userDocumentId && left.accountDocumentId === right.accountDocumentId;
class ScopeChanged extends Error {
}
/** App/client-local serialization and verification at read time, not cross-device intent ordering. */
export function createMusicPublishCoordinator(createPorts: (transaction: Transaction) => Ports, origin: IntentAuthority, store: OperationStore, writer: AccountNavigationWriter): Coordinator {
    const captured = Object.freeze({ ...origin });
    const scope = { userDocumentId: captured.userDocumentId, accountDocumentId: captured.accountDocumentId };
    let state: PublishState = { kind: 'loading' };
    let disposed = false;
    const listeners = new Set<() => void>();
    let active: {
        mode?: MusicPublicationMode;
        promise: Promise<PublishOutcome>;
    } | undefined;
    // Only a conflict already surfaced to the caller authorizes a subsequent request()
    // as an explicit "Confirm new …" action. read()/resume() never retire a key.
    let recovery: {
        key: string;
        errorCode: 'verification' | 'replay-expired';
    } | undefined;
    const update = (next: PublishState) => {
        if (disposed)
            return;
        state = next;
        for (const listener of listeners)
            listener();
    };
    const assertCurrent = (ports: Ports) => {
        if (disposed || !ports.isCurrent()) throw new ScopeChanged();
    };
    const readFresh = async (ports: Ports): Promise<Snapshot> => {
        assertCurrent(ports);
        const snapshot = await ports.read();
        assertCurrent(ports);
        if (!snapshot?.scope || !sameScope(snapshot.scope, scope))
            throw new ScopeChanged();
        if (!['Yes', 'No', null].includes(snapshot.profile) || !['public', 'private', 'unlisted'].includes(snapshot.mode)
            || typeof snapshot.publicSlug !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(snapshot.publicSlug))
            throw new Error('Music read was not verified.');
        return { scope: { ...scope }, profile: snapshot.profile, mode: snapshot.mode, publicSlug: snapshot.publicSlug,
            savedPins: Array.isArray(snapshot.savedPins) ? [...snapshot.savedPins] : snapshot.savedPins };
    };
    const contradiction = (operation: PendingOperation, snapshot: Snapshot) => (operation.phase === 'verifying' && (operation.mode !== snapshot.mode
        || (operation.mode === 'public' && snapshot.profile !== 'Yes')
        || (operation.mode === 'unlisted' && !matches(snapshot, 'unlisted'))))
        || (operation.mode !== 'private' && operation.phase !== 'requested'
            && snapshot.profile !== (operation.mode === 'public' ? 'Yes' : 'No'));
    const conflict = (operation: PendingOperation, confirmed: Snapshot | undefined, errorCode: 'verification' | 'replay-expired' = 'verification'): PublishOutcome => {
        recovery = { key: operation.key, errorCode };
        update({ kind: 'conflict', confirmed, desired: operation.mode, errorCode });
        return { status: 'conflict' };
    };
    const scopeFailure = (): PublishOutcome => { update({ kind: 'unknown', errorCode: 'scope-changed' }); return { status: 'unknown' }; };
    async function execute(mode: MusicPublicationMode | undefined, resume: boolean, confirmedRecoveryKey?: string): Promise<PublishOutcome> {
        if (disposed)
            return { status: 'unknown' };
        try {
            const outcome = await writer.run<PublishOutcome>(captured, async (transaction) => {
                const ports = createPorts(transaction);
                let latest: Snapshot | undefined;
                let operation: PendingOperation | undefined;
                let stage: NonNullable<PublishState['errorCode']> = 'verification';
                assertCurrent(ports);
                try {
                    latest = await readFresh(ports);
                    operation = store.load(scope);
                    if (operation && !sameScope(operation.scope, scope))
                        throw new ScopeChanged();
                    const desired = resume ? operation?.mode : mode;
                    if (!desired) {
                        update({ kind: classification(latest), confirmed: latest });
                        return { status: classification(latest) === 'needs-attention' ? 'needs-attention' : 'verified' };
                    }
                    let replacement = false;
                    if (operation && confirmedRecoveryKey === operation.key && !resume) {
                        assertCurrent(ports);
                        if (store.load(scope)?.key !== operation.key)
                            return conflict(operation, latest);
                        completeMusicPublicationCommand(scope, operation.mode, operation.key);
                        store.clear(scope);
                        operation = undefined;
                        recovery = undefined;
                        replacement = true;
                    }
                    else if (operation && (operation.mode !== desired || recovery?.key === operation.key || contradiction(operation, latest))) {
                        return conflict(operation, latest, recovery?.errorCode);
                    }
                    // Unlisted requests intentionally obtain a capability via the existing command;
                    // hydration never does. Public/private can be verified no-ops when no key is pending.
                    if (!operation && !replacement && desired !== 'unlisted' && matches(latest, desired)) {
                        if (desired === 'public') {
                            await ports.discover(latest.publicSlug);
                            assertCurrent(ports);
                        }
                        update({ kind: classification(latest), confirmed: latest });
                        return { status: 'verified' };
                    }
                    if (!operation) {
                        const command = getOrCreateMusicPublicationCommand(scope, desired);
                        operation = { version: 1, scope: { ...scope }, mode: desired, key: command.key, phase: 'requested' };
                        assertCurrent(ports);
                        store.save(operation);
                    }
                    const currentOperation = operation;
                    const phase = (value: PendingOperation['phase']) => {
                        assertCurrent(ports);
                        if (store.load(scope)?.key !== currentOperation.key)
                            throw new Error('Music pending command changed.');
                        currentOperation.phase = value;
                        store.save(currentOperation);
                    };
                    update({ kind: 'saving', confirmed: latest, desired });
                    if (desired !== 'private') {
                        stage = 'profile-save';
                        assertCurrent(ports);
                        await ports.saveProfile(desired === 'public' ? 'Yes' : 'No');
                        assertCurrent(ports);
                        phase('profile-saved');
                    }
                    stage = 'publication-save';
                    phase('publication-sent');
                    const response = parseMusicPublicationResponse(await ports.publish(desired, currentOperation.key), desired);
                    assertCurrent(ports);
                    phase('verifying');
                    if (desired === 'private') {
                        // A same-key replay returns its old response without reapplying
                        // privacy. Confirm the current backend mode before account cleanup.
                        stage = 'verification';
                        latest = await readFresh(ports);
                        if (latest.mode !== 'private' || latest.publicSlug !== response.publication.publicSlug)
                            return conflict(currentOperation, latest);
                        stage = 'profile-save';
                        await ports.saveProfile('No');
                        assertCurrent(ports);
                    }
                    stage = 'verification';
                    latest = await readFresh(ports);
                    if (!matches(latest, desired) || latest.publicSlug !== response.publication.publicSlug)
                        return conflict(currentOperation, latest);
                    if (desired === 'public') {
                        await ports.discover(latest.publicSlug);
                        assertCurrent(ports);
                    }
                    if (store.load(scope)?.key !== currentOperation.key)
                        return conflict(currentOperation, latest);
                    assertCurrent(ports);
                    completeMusicPublicationCommand(scope, desired, currentOperation.key);
                    store.clear(scope);
                    recovery = undefined;
                    update({ kind: classification(latest), confirmed: latest });
                    return { status: 'verified', response };
                }
                catch (error) {
                    if (disposed || error instanceof ScopeChanged || !ports.isCurrent())
                        return scopeFailure();
                    if (operation && error instanceof MusicClientError && ['PUBLICATION_REPLAY_EXPIRED', 'IDEMPOTENCY_CONFLICT'].includes(error.upstreamCode ?? '')) {
                        return conflict(operation, latest, error.upstreamCode === 'PUBLICATION_REPLAY_EXPIRED' ? 'replay-expired' : 'verification');
                    }
                    if (recovery) {
                        update({ kind: 'conflict', confirmed: latest, desired: operation?.mode, errorCode: recovery.errorCode });
                        return { status: 'conflict' };
                    }
                    if (stage === 'profile-save') {
                        try {
                            const confirmed = await readFresh(ports);
                            update({ kind: 'needs-attention', confirmed, desired: operation?.mode, errorCode: 'profile-save' });
                            return { status: 'needs-attention' };
                        }
                        catch (readError) {
                            if (readError instanceof ScopeChanged || !ports.isCurrent())
                                return scopeFailure();
                        }
                    }
                    update({ kind: 'unknown', confirmed: stage === 'verification' ? undefined : latest, desired: operation?.mode, errorCode: stage });
                    return { status: 'unknown' };
                }
            });
            // A completion subscriber can synchronously close the sharing dialog.
            // The writer validates authority, but disposal belongs to this coordinator.
            return disposed ? { status: 'unknown' } : outcome;
        }
        catch {
            // The writer rejects stale authority before opening/after closing the transaction.
            return scopeFailure();
        }
    }
    function start(mode: MusicPublicationMode | undefined, resume: boolean): Promise<PublishOutcome> {
        if (active)
            return active.mode === mode ? active.promise : Promise.resolve({ status: 'needs-attention' });
        const key = !resume ? recovery?.key : undefined;
        const promise = execute(mode, resume, key);
        active = { mode, promise };
        void promise.finally(() => { if (active?.promise === promise)
            active = undefined; });
        return promise;
    }
    return {
        getSnapshot: () => state, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        async read() {
            if (disposed)
                return;
            try {
                await writer.run(captured, async (transaction) => {
                    const ports = createPorts(transaction);
                    const confirmed = await readFresh(ports);
                    const pending = store.load(scope);
                    if (pending && (recovery?.key === pending.key || contradiction(pending, confirmed))) {
                        conflict(pending, confirmed, recovery?.errorCode);
                        return;
                    }
                    update({ kind: pending ? 'needs-attention' : classification(confirmed), confirmed, ...(pending ? { desired: pending.mode } : {}) });
                });
            }
            catch (error) {
                if (error instanceof ScopeChanged || (error instanceof NavigationError && error.kind === 'blocked'))
                    scopeFailure();
                else if (recovery)
                    update({ ...state, kind: 'conflict', errorCode: recovery.errorCode });
                else
                    update({ kind: 'unknown', errorCode: 'verification' });
            }
        },
        request: (mode) => start(mode, false), resume: () => start(undefined, true),
        dispose: () => { disposed = true; listeners.clear(); state = { kind: 'unknown', errorCode: 'scope-changed' }; },
    };
}
