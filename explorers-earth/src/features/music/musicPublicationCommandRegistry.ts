import {
  createMusicPublicationIdempotencyKey,
  type MusicPublicationMode,
} from "../../../../tunes/shared/musicPublicationContract";

export interface MusicPublicationOwnerScope {
  userDocumentId: string;
  accountDocumentId: string;
}

interface PendingPublicationCommand {
  owner: MusicPublicationOwnerScope;
  mode: MusicPublicationMode;
  requestFingerprint: string;
  key: string;
}

const pendingCommands = new Map<string, PendingPublicationCommand>();

function fingerprint(mode: MusicPublicationMode): string {
  return `music-publication/v1:${mode}`;
}

function registryKey(owner: MusicPublicationOwnerScope, mode: MusicPublicationMode): string {
  return JSON.stringify([owner.userDocumentId, owner.accountDocumentId, fingerprint(mode)]);
}

export function getOrCreateMusicPublicationCommand(
  owner: MusicPublicationOwnerScope,
  mode: MusicPublicationMode,
): PendingPublicationCommand {
  const index = registryKey(owner, mode);
  const current = pendingCommands.get(index);
  if (current) return current;
  const created = {
    owner: { ...owner },
    mode,
    requestFingerprint: fingerprint(mode),
    key: createMusicPublicationIdempotencyKey(Date.now(), crypto.randomUUID()),
  };
  pendingCommands.set(index, created);
  return created;
}

export function completeMusicPublicationCommand(
  owner: MusicPublicationOwnerScope,
  mode: MusicPublicationMode,
  key: string,
): void {
  const index = registryKey(owner, mode);
  if (pendingCommands.get(index)?.key === key) pendingCommands.delete(index);
}

export function clearMusicPublicationCommands(owner?: MusicPublicationOwnerScope): void {
  if (!owner) {
    pendingCommands.clear();
    return;
  }
  for (const [key, command] of pendingCommands) {
    if (command.owner.userDocumentId === owner.userDocumentId
        && command.owner.accountDocumentId === owner.accountDocumentId) pendingCommands.delete(key);
  }
}
