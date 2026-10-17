import { describe, expect, it } from "vitest";
import {
  selectMusicSurfaceState,
  type MusicSurfaceSignals,
} from "../musicState";

const ready: MusicSurfaceSignals = {
  lifecycle: "active",
  authenticated: true,
  onboarding: "complete",
  entitlement: "included",
  identity: "ready",
  content: "ready",
  playlistCount: 1,
};

describe("Music surface state policy", () => {
  it.each([
    [{ lifecycle: "pending_deletion" }, "pending_deletion", "Account deletion is in progress."],
    [{ lifecycle: "tombstoned" }, "deleted", "Account deletion is in progress."],
    [{ lifecycle: "suspended" }, "suspended", "Music is unavailable while your Explorer account is deactivated."],
    [{ authenticated: false }, "auth_required", "Sign in again to continue with Music."],
    [{ onboarding: "incomplete" }, "onboarding_incomplete", "Finish your Explorer profile to use Music."],
    [{ onboarding: "unknown" }, "content_loading", "Loading Music…"],
    [{ identity: "conflict" }, "identity_conflict", "We couldn’t finish setting up Music for this account."],
    [{ entitlement: "unresolved" }, "entitlement_unknown", undefined],
    [{ identity: "setting_up" }, "setting_up", "Setting up Music…"],
    [{ identity: "retryable" }, "setup_retryable", "Music is taking longer than expected. Your Explorers account is ready."],
    [{ identity: "unavailable" }, "setup_unavailable", "Music is temporarily unavailable."],
    [{ content: "loading" }, "content_loading", "Loading Music…"],
    [{ content: "failure" }, "content_failure", "Music is temporarily unavailable."],
    [{ content: "stale" }, "content_stale", "May be out of date"],
    [{ content: "ready", playlistCount: 0 }, "ready_empty", "Create your first playlist"],
    [{ content: "ready", playlistCount: 2 }, "ready_content", undefined],
  ] as const)("selects %s as %s", (override, kind, message) => {
    const state = selectMusicSurfaceState({ ...ready, ...override });
    expect(state.kind).toBe(kind);
    expect(state.message).toBe(message);
  });

  it("enforces lifecycle/auth/onboarding/conflict/setup/content/entitlement precedence", () => {
    const state = selectMusicSurfaceState({
      ...ready,
      lifecycle: "pending_deletion",
      authenticated: false,
      onboarding: "incomplete",
      identity: "conflict",
      entitlement: "unknown",
      content: "failure",
    });
    expect(state.kind).toBe("pending_deletion");

    expect(selectMusicSurfaceState({ ...ready, authenticated: false, identity: "conflict", entitlement: "unknown" }).kind)
      .toBe("auth_required");
    expect(selectMusicSurfaceState({ ...ready, onboarding: "incomplete", identity: "conflict", entitlement: "unknown" }).kind)
      .toBe("onboarding_incomplete");
    expect(selectMusicSurfaceState({ ...ready, identity: "conflict", entitlement: "unknown" }).kind)
      .toBe("identity_conflict");
    expect(selectMusicSurfaceState({ ...ready, identity: "retryable", entitlement: "unknown" })).toMatchObject({
      kind: "setup_retryable", action: "try_again",
    });
    expect(selectMusicSurfaceState({ ...ready, entitlement: "unknown", content: "failure" })).toMatchObject({
      kind: "content_failure", action: "try_again",
    });
    expect(selectMusicSurfaceState({ ...ready, entitlement: "unknown", content: "stale" })).toMatchObject({
      kind: "content_stale", action: "try_again", blocksContent: false,
    });
    expect(selectMusicSurfaceState({ ...ready, identity: "retryable", content: "failure" }).kind)
      .toBe("setup_retryable");
    expect(selectMusicSurfaceState({ ...ready, identity: "unavailable", content: "failure" })).toMatchObject({
      kind: "setup_unavailable", action: "try_again", secondaryAction: "get_help",
    });
  });

  it("keeps healthy and background convergence silent", () => {
    expect(selectMusicSurfaceState(ready)).toMatchObject({ kind: "ready_content", message: undefined, live: "off" });
  });

  it("blocks core Music with a silent skeleton only while entitlement is unresolved", () => {
    expect(selectMusicSurfaceState({ ...ready, entitlement: "unresolved" })).toMatchObject({
      kind: "entitlement_unknown",
      message: undefined,
      blocksContent: true,
    });
  });

  it.each(["unknown", "included", "eligible", "entitled", "revoked"] as const)("keeps core Music ready for canonical %s state", (entitlement) => {
    // Break caught: a premium-policy state is mistaken for lifecycle suspension, quota, or read-only core access.
    expect(selectMusicSurfaceState({ ...ready, entitlement })).toMatchObject({
      kind: "ready_content",
      blocksContent: false,
      live: "off",
    });
  });
});
