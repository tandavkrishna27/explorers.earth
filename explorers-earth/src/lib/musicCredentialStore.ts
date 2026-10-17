export interface MusicCredential {
  token: string;
  expiresAt: number;
}

type MusicCredentialListener = (credential: MusicCredential | undefined) => void;

let currentCredential: MusicCredential | undefined;
const listeners = new Set<MusicCredentialListener>();

export function setMusicCredential(credential: MusicCredential): void {
  if (!credential.token || credential.token.length > 4_096
      || !Number.isSafeInteger(credential.expiresAt) || credential.expiresAt < 1) {
    throw new Error("Invalid Music credential");
  }
  currentCredential = Object.freeze({ ...credential });
  notify();
}

export function getMusicCredential(now = Date.now()): MusicCredential | undefined {
  if (currentCredential && now >= currentCredential.expiresAt) clearMusicCredential();
  return currentCredential;
}

export function clearMusicCredential(): void {
  if (!currentCredential) return;
  currentCredential = undefined;
  notify();
}

export function subscribeMusicCredential(listener: MusicCredentialListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener(currentCredential);
}
