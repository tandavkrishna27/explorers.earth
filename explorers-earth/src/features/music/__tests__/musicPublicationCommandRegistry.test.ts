import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMusicPublicationCommands,
  completeMusicPublicationCommand,
  getOrCreateMusicPublicationCommand,
} from "../musicPublicationCommandRegistry";

describe("in-memory Music publication command registry", () => {
  beforeEach(() => {
    clearMusicPublicationCommands();
    vi.spyOn(Date, "now").mockReturnValue(1_777_000_000_000);
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, "0")}` });
  });

  it("keys pending commands by immutable owner, mode, and request fingerprint", () => {
    const ownerA = { userDocumentId: "user-a", accountDocumentId: "account-a" };
    const ownerB = { userDocumentId: "user-b", accountDocumentId: "account-b" };
    const aPrivate = getOrCreateMusicPublicationCommand(ownerA, "private");
    const aPublic = getOrCreateMusicPublicationCommand(ownerA, "public");
    const bPrivate = getOrCreateMusicPublicationCommand(ownerB, "private");

    expect(getOrCreateMusicPublicationCommand(ownerA, "private")).toEqual(aPrivate);
    expect(aPrivate.requestFingerprint).toBe("music-publication/v1:private");
    expect(aPrivate.key).toBe("tunes-share-v1-1777000000000-11111111-2222-4333-8444-000000000001");
    expect(new Set([aPrivate.key, aPublic.key, bPrivate.key])).toHaveLength(3);
  });

  it("clears only an exact owner and only completes the exact current key", () => {
    const ownerA = { userDocumentId: "user-a", accountDocumentId: "account-a" };
    const ownerB = { userDocumentId: "user-a", accountDocumentId: "account-b" };
    const a = getOrCreateMusicPublicationCommand(ownerA, "public");
    const b = getOrCreateMusicPublicationCommand(ownerB, "public");
    completeMusicPublicationCommand(ownerA, "public", "wrong-key");
    expect(getOrCreateMusicPublicationCommand(ownerA, "public").key).toBe(a.key);

    clearMusicPublicationCommands(ownerA);
    expect(getOrCreateMusicPublicationCommand(ownerA, "public").key).not.toBe(a.key);
    expect(getOrCreateMusicPublicationCommand(ownerB, "public").key).toBe(b.key);

    completeMusicPublicationCommand(ownerB, "public", b.key);
    expect(getOrCreateMusicPublicationCommand(ownerB, "public").key).not.toBe(b.key);
  });
});
