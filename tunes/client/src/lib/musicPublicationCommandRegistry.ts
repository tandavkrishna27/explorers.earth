import {
  createMusicPublicationIdempotencyKey,
  type MusicPublicationMode,
} from "../../../shared/musicPublicationContract";

interface PendingPublicationCommand {
  ownerId: number;
  mode: MusicPublicationMode;
  requestFingerprint: string;
  key: string;
}

const pending = new Map<string, PendingPublicationCommand>();

function fingerprint(mode: MusicPublicationMode): string {
  return `music-publication/v1:${mode}`;
}

function index(ownerId: number, mode: MusicPublicationMode): string {
  return JSON.stringify([ownerId, fingerprint(mode)]);
}

export function getOrCreatePendingMusicPublicationCommand(ownerId: number, mode: MusicPublicationMode): PendingPublicationCommand {
  const key = index(ownerId, mode);
  const current = pending.get(key);
  if (current) return current;
  const created = {
    ownerId,
    mode,
    requestFingerprint: fingerprint(mode),
    key: createMusicPublicationIdempotencyKey(Date.now(), crypto.randomUUID()),
  };
  pending.set(key, created);
  return created;
}

export function completePendingMusicPublicationCommand(ownerId: number, mode: MusicPublicationMode, key: string): void {
  const registryKey = index(ownerId, mode);
  if (pending.get(registryKey)?.key === key) pending.delete(registryKey);
}

export function clearPendingMusicPublicationCommands(ownerId?: number): void {
  if (ownerId === undefined) {
    pending.clear();
    return;
  }
  pending.forEach((command, key) => {
    if (command.ownerId === ownerId) pending.delete(key);
  });
}
