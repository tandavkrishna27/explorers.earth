import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../store/store";
import { explorersApiClient } from "./explorersApiClient";

function signIn(accountId: string) {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: `user-${accountId}`,
    username: accountId, email: `${accountId}@example.invalid`, onboardingStatus: "complete", revision: 1 });
}

describe("canonical API session expiry", () => {
  beforeEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals(); });
  it("handles simultaneous definitive 401 responses with one generation transition", async () => {
    signIn("account-a");
    const before = useAuthStore.getState().generation;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 })));
    const results = await Promise.allSettled([explorersApiClient.getMyProfile(), explorersApiClient.getMyProfile()]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(useAuthStore.getState().generation).toBe(before + 1);
    expect(useAuthStore.getState().status).toBe("signed-out");
  });
  it("never lets an old 401 log out a new A→B→A session", async () => {
    signIn("account-a");
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const old = explorersApiClient.getMyProfile();
    signIn("account-b"); signIn("account-a");
    const current = useAuthStore.getState().generation;
    release(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }));
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().generation).toBe(current);
    expect(useAuthStore.getState().status).toBe("active-complete");
  });
  it("keeps an active session on 403, 404 and transport outage", async () => {
    signIn("account-a");
    for (const status of [403, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status })));
      await expect(explorersApiClient.getMyProfile()).rejects.toMatchObject({ status });
      expect(useAuthStore.getState().status).toBe("active-complete");
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(explorersApiClient.getMyProfile()).rejects.toThrow("offline");
    expect(useAuthStore.getState().status).toBe("active-complete");
  });
});
