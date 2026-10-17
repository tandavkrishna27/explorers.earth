import { describe, expect, it, vi } from "vitest";
import { createMusicRolloutClient, subscribeMusicRollout } from "../musicRollout";

const scopeA = { userDocumentId: "user-a", accountDocumentId: "account-a" };
const closed = { ownerWorkspace: false, guestWorkspace: false, playlistImports: false, exposureId: "closed", expiresAt: "2026-08-26T00:01:00.000Z" };

describe("music runtime rollout", () => {
  it("parses the strict runtime exposure and caches it only until its bounded expiry", async () => {
    let now = Date.parse("2026-08-26T00:00:00.000Z");
    const request = vi.fn(async () => new Response(JSON.stringify({ ...closed, ownerWorkspace: true }), { status: 200 }));
    const rollout = createMusicRolloutClient(request, () => now);
    expect((await rollout.get(scopeA)).ownerWorkspace).toBe(true);
    await rollout.get(scopeA);
    expect(request).toHaveBeenCalledTimes(1);
    now += 60_001;
    await rollout.get(scopeA);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fails malformed and unavailable decisions closed", async () => {
    const malformed = createMusicRolloutClient(async () => new Response(JSON.stringify({ ownerWorkspace: true }), { status: 200 }));
    const unavailable = createMusicRolloutClient(async () => { throw new Error("offline"); });
    expect(await malformed.get(scopeA)).toMatchObject({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false });
    expect(await unavailable.get(scopeA)).toMatchObject({ ownerWorkspace: false, guestWorkspace: false, playlistImports: false });
  });

  it("clears account-scoped decisions during an account switch", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(closed), { status: 200 }));
    const rollout = createMusicRolloutClient(request);
    await rollout.get(scopeA);
    rollout.clear(scopeA);
    await rollout.get(scopeA);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("invalidates and aborts an in-flight A decision across A to B to A without populating A cache", async () => {
    const scopeB = { userDocumentId: "user-a", accountDocumentId: "account-b" };
    let resolveOldA!: (response: Response) => void;
    const signals: AbortSignal[] = [];
    const request = vi.fn((input: { signal?: AbortSignal }) => {
      signals.push(input.signal!);
      if (request.mock.calls.length === 1) return new Promise<Response>((resolve) => { resolveOldA = resolve; });
      const enabled = request.mock.calls.length === 2;
      return Promise.resolve(new Response(JSON.stringify({ ...closed, ownerWorkspace: enabled }), { status: 200 }));
    });
    const rollout = createMusicRolloutClient(request as never, () => Date.parse("2026-08-26T00:00:00.000Z"));
    const oldA = rollout.get(scopeA);
    rollout.clear(scopeA);
    expect(signals[0].aborted).toBe(true);
    expect((await rollout.get(scopeB)).ownerWorkspace).toBe(true);
    expect((await rollout.get(scopeA)).ownerWorkspace).toBe(false);
    resolveOldA(new Response(JSON.stringify({ ...closed, ownerWorkspace: true }), { status: 200 }));
    expect((await oldA).ownerWorkspace).toBe(false);
    await rollout.get(scopeA);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("renews exposure at expiry and fails a previously enabled workspace closed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-26T00:00:00.000Z");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...closed, ownerWorkspace: true, expiresAt: "2026-08-26T00:00:01.000Z" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const rollout = createMusicRolloutClient(request);
    const decisions: boolean[] = [];
    const unsubscribe = subscribeMusicRollout(rollout, scopeA, (exposure) => decisions.push(exposure.ownerWorkspace));

    await vi.advanceTimersByTimeAsync(0);
    expect(decisions).toEqual([true]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(decisions).toEqual([true, false]);
    expect(request).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.useRealTimers();
  });
});
