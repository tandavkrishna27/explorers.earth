import { parseMusicPublicationIdempotencyKey, type MusicPublicationMode } from '../../../../tunes/shared/musicPublicationContract';
import type { MusicPublicationOwnerScope } from './musicPublicationCommandRegistry';
export type PendingOperation = {
    version: 1;
    scope: MusicPublicationOwnerScope;
    mode: MusicPublicationMode;
    key: string;
    phase: 'requested' | 'profile-saved' | 'publication-sent' | 'verifying';
};
export type OperationStore = {
    load(scope: MusicPublicationOwnerScope): PendingOperation | undefined;
    save(operation: PendingOperation): void;
    clear(scope: MusicPublicationOwnerScope): void;
};
const scopeKey = (scope: MusicPublicationOwnerScope) => `explorers-music-publish/v1:${JSON.stringify([scope.userDocumentId, scope.accountDocumentId])}`;
const validScope = (scope: MusicPublicationOwnerScope) => scope
    && typeof scope.userDocumentId === 'string' && typeof scope.accountDocumentId === 'string'
    && /^[A-Za-z0-9_-]{1,255}$/.test(scope.userDocumentId) && /^[A-Za-z0-9_-]{1,255}$/.test(scope.accountDocumentId);
function parse(value: unknown, scope: MusicPublicationOwnerScope): PendingOperation | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const operation = value as PendingOperation;
    if (Object.keys(operation).sort().join(',') !== 'key,mode,phase,scope,version' || operation.version !== 1
        || !operation.scope || Object.keys(operation.scope).sort().join(',') !== 'accountDocumentId,userDocumentId'
        || !validScope(operation.scope) || scopeKey(operation.scope) !== scopeKey(scope)
        || !['public', 'private', 'unlisted'].includes(operation.mode) || !['requested', 'profile-saved', 'publication-sent', 'verifying'].includes(operation.phase)
        || typeof operation.key !== 'string' || parseMusicPublicationIdempotencyKey(operation.key) === undefined)
        return undefined;
    return { version: 1, scope: { ...operation.scope }, mode: operation.mode, key: operation.key, phase: operation.phase };
}
/** Storage denial preserves only this instance's memory; reload recovery is unavailable. */
export function createMusicPublishOperationStore(storage?: Storage): OperationStore {
    let disk = storage;
    if (disk === undefined) {
        try {
            disk = globalThis.sessionStorage;
        }
        catch { /* denied: memory only */ }
    }
    const memory = new Map<string, PendingOperation>();
    const volatile = new Set<string>();
    const clear = (scope: MusicPublicationOwnerScope) => {
        const key = scopeKey(scope);
        memory.delete(key);
        try {
            disk?.removeItem(key);
            volatile.delete(key);
        }
        catch {
            volatile.add(key);
        }
    };
    return {
        load(scope) {
            if (!validScope(scope))
                return undefined;
            const key = scopeKey(scope);
            if (disk && !volatile.has(key)) {
                try {
                    const raw = disk.getItem(key);
                    if (raw === null) {
                        memory.delete(key);
                        return undefined;
                    }
                    let operation: PendingOperation | undefined;
                    try {
                        if (raw.length <= 4096)
                            operation = parse(JSON.parse(raw), scope);
                    }
                    catch { /* malformed */ }
                    if (!operation) {
                        clear(scope);
                        return undefined;
                    }
                    memory.set(key, operation);
                }
                catch {
                    volatile.add(key);
                }
            }
            const operation = memory.get(key);
            return operation ? parse(operation, scope) : undefined;
        },
        save(operation) {
            const selected = { version: operation.version, scope: { userDocumentId: operation.scope?.userDocumentId, accountDocumentId: operation.scope?.accountDocumentId }, mode: operation.mode, key: operation.key, phase: operation.phase };
            const safe = parse(selected, selected.scope);
            if (!safe)
                throw new Error('Music publication pending metadata is invalid.');
            const key = scopeKey(safe.scope);
            memory.set(key, safe);
            try {
                disk?.setItem(key, JSON.stringify(safe));
                volatile.delete(key);
            }
            catch {
                volatile.add(key);
            }
        },
        clear,
    };
}
