import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./queryClient", () => ({ apiRequest: vi.fn() }));

import { apiRequest } from "./queryClient";
import { clearPendingMusicPublicationCommands, requestUnlistedShareCapability } from "./musicPublicationClient";
import {
  completePendingMusicPublicationCommand,
  getOrCreatePendingMusicPublicationCommand,
} from "./musicPublicationCommandRegistry";

describe("Music publication client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(apiRequest).mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "11111111-2222-4333-8444-555555555555" });
    vi.spyOn(Date, "now").mockReturnValue(1_777_500_000_000);
    clearPendingMusicPublicationCommands();
  });

  it("uses one owner-derived unlisted command with an idempotency key", async () => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify({
      version: "music-publication/v1",
      publication: { mode: "unlisted", publicSlug: "owner-slug" },
      capability: "C".repeat(43),
    }), { status: 200 }));

    await expect(requestUnlistedShareCapability(41)).resolves.toBe("C".repeat(43));
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/music/publication", { mode: "unlisted" }, 0, 3, {
      "Idempotency-Key": "tunes-share-v1-1777500000000-11111111-2222-4333-8444-555555555555",
    });
  });

  it.each([0, Number.NaN])("rejects non-immutable owner authority %#", async (ownerId) => {
    await expect(requestUnlistedShareCapability(ownerId)).rejects.toThrow("immutable owner");
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("clears only the requested standalone owner and completes only the exact current key", () => {
    const first = getOrCreatePendingMusicPublicationCommand(41, "unlisted");
    const other = getOrCreatePendingMusicPublicationCommand(99, "unlisted");
    completePendingMusicPublicationCommand(41, "unlisted", "wrong-key");
    expect(getOrCreatePendingMusicPublicationCommand(41, "unlisted")).toEqual(first);

    clearPendingMusicPublicationCommands(41);
    expect(getOrCreatePendingMusicPublicationCommand(41, "unlisted")).not.toBe(first);
    expect(getOrCreatePendingMusicPublicationCommand(99, "unlisted")).toBe(other);
  });

  it("reuses the same in-memory key after an ambiguous lost response and retires it after success", async () => {
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, "0")}` });
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new TypeError("fetch failed after server commit"))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "D".repeat(43),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "E".repeat(43),
      }), { status: 200 }));

    await expect(requestUnlistedShareCapability(41)).rejects.toThrow(/fetch failed/);
    await expect(requestUnlistedShareCapability(41)).resolves.toBe("D".repeat(43));
    await expect(requestUnlistedShareCapability(41)).resolves.toBe("E".repeat(43));
    const keys = vi.mocked(apiRequest).mock.calls.map((call) => call[5]["Idempotency-Key"]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it.each([
    { version: "wrong", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "C".repeat(43) },
    { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "short" },
    { version: "music-publication/v1", publication: { mode: "public", publicSlug: "owner-slug" }, capability: "C".repeat(43) },
    { version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "C".repeat(43), extra: true },
    { version: "music-publication/v1" },
  ])("rejects an invalid publication response without returning capability material %#", async (body) => {
    vi.mocked(apiRequest).mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(requestUnlistedShareCapability(41)).rejects.toThrow("Music sharing returned an invalid response.");
  });

  it.each([
    [399, true],
    [401, true],
    [429, true],
    [500, true],
    [409, true],
    [undefined, true],
  ] as const)("%s response status retains the pending key: %s", async (status, retained) => {
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, "0")}` });
    vi.mocked(apiRequest)
      .mockRejectedValueOnce({ status })
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "F".repeat(43),
      }), { status: 200 }));
    await requestUnlistedShareCapability(41).catch(() => undefined);
    await expect(requestUnlistedShareCapability(41)).resolves.toBe("F".repeat(43));
    const keys = vi.mocked(apiRequest).mock.calls.map((call) => call[5]["Idempotency-Key"]);
    expect(keys[1] === keys[0]).toBe(retained);
  });

  it.each(["offline", null])("retains the pending key for primitive ambiguous failure %#", async (error) => {
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, "0")}` });
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "G".repeat(43),
      }), { status: 200 }));
    await requestUnlistedShareCapability(41).catch(() => undefined);
    await requestUnlistedShareCapability(41);
    const keys = vi.mocked(apiRequest).mock.calls.map((call) => call[5]["Idempotency-Key"]);
    expect(keys[1]).toBe(keys[0]);
  });

  it("retains a malformed-success key and isolates owner switches", async () => {
    let uuid = 0;
    vi.stubGlobal("crypto", { randomUUID: () => `11111111-2222-4333-8444-${String(++uuid).padStart(12, "0")}` });
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "public", publicSlug: "owner-slug" }, capability: "H".repeat(43),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "owner-slug" }, capability: "H".repeat(43),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        version: "music-publication/v1", publication: { mode: "unlisted", publicSlug: "other-slug" }, capability: "I".repeat(43),
      }), { status: 200 }));

    await expect(requestUnlistedShareCapability(41)).rejects.toThrow("invalid response");
    await expect(requestUnlistedShareCapability(41)).resolves.toBe("H".repeat(43));
    await expect(requestUnlistedShareCapability(99)).resolves.toBe("I".repeat(43));
    const keys = vi.mocked(apiRequest).mock.calls.map((call) => call[5]["Idempotency-Key"]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
