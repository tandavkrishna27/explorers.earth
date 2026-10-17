import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthSyncManager from "../AuthSyncManager";
import useAuthStore from "../../store/store";
import { musicIdentityCoordinator } from "../../features/music/musicApi";
import { resetSessionBootstrapForTests, useSessionBootstrap } from "../../lib/sessionBootstrap";

// The bootstrap moved out of AuthSyncManager, so these cases mount it alongside a gate
// the way the app does: AuthSyncManager clears caches, a gating surface starts the
// verification. Both still have to be mounted for this behaviour to hold.
function Shell() { useSessionBootstrap(); return <AuthSyncManager />; }

vi.mock("@apollo/client", () => ({ useApolloClient: () => ({ clearStore: async () => undefined }) }));

describe("auth bootstrap", () => {
  // These cases model a reload, so the store must start where a page load starts.
  beforeEach(() => { useAuthStore.getState().logout(); useAuthStore.setState({ status: "loading" }); vi.restoreAllMocks(); resetSessionBootstrapForTests(); });
  it("verifies the cookie and account before granting authority after reload", async () => {
    localStorage.setItem("auth-storage", JSON.stringify({ state: { isAuthenticated: true, token: "old" }, version: 0 }));
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input === "/api/auth/get-session"
      ? new Response(JSON.stringify({ user: { id: "user-a", email: "a@example.invalid" }, session: { id: "s" } }), { status: 200 })
      : new Response(JSON.stringify({ account: { id: "account-a", handle: "alice", revision: 1, onboardingStatus: "complete" } }), { status: 200 })));
    render(<Shell />);
    await waitFor(() => expect(useAuthStore.getState().status).toBe("active-complete"));
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("keeps the Explorers shell authenticated when Music provisioning fails", async () => {
    // reconcile() rejects whenever Music authorization is unavailable, and nothing
    // renders that rejection here: the Music surfaces read the coordinator's own
    // state and offer retry. An unabsorbed rejection escapes as an unhandled
    // rejection, which fails the whole run even with every test passing.
    const reconcile = vi.spyOn(musicIdentityCoordinator, "reconcile")
      .mockRejectedValue(new Error("Music authorization is temporarily unavailable."));
    vi.stubGlobal("fetch", vi.fn(async (input: string) => input === "/api/auth/get-session"
      ? new Response(JSON.stringify({ user: { id: "user-a", email: "a@example.invalid" }, session: { id: "s" } }), { status: 200 })
      : new Response(JSON.stringify({ account: { id: "account-a", handle: "alice", revision: 1, onboardingStatus: "complete" } }), { status: 200 })));
    render(<Shell />);
    await waitFor(() => expect(reconcile).toHaveBeenCalled());
    expect(useAuthStore.getState().status).toBe("active-complete");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
