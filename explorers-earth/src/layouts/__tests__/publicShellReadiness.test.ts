import { describe, expect, it } from "vitest";
import {
  createPublicShellReadiness,
  settlePublicIdentity,
  settlePublicRoute,
  settleUsernameValidation,
  shouldShowColdEntryOverlay,
  syncPublicShell,
} from "../publicShellReadiness";

describe("public shell readiness", () => {
  it("starts cold for a normalized username and content route", () => {
    const cold = createPublicShellReadiness("Alice", "alice:/route-a");

    expect(cold).toEqual({
      usernameKey: "alice",
      contentRouteKey: "alice:/route-a",
      validation: "pending",
      identity: "pending",
      routeReady: false,
      shellRevealed: false,
    });
    expect(shouldShowColdEntryOverlay(cold)).toBe(true);
  });

  it("reveals only after validation, matching identity, and the current route settle in every ordering", () => {
    const orders = [
      ["validation", "identity", "route"],
      ["validation", "route", "identity"],
      ["identity", "validation", "route"],
      ["identity", "route", "validation"],
      ["route", "validation", "identity"],
      ["route", "identity", "validation"],
    ] as const;

    for (const order of orders) {
      let state = createPublicShellReadiness("alice", "alice:/route-a");

      for (const event of order) {
        state = event === "validation"
          ? settleUsernameValidation(state, "alice", "valid")
          : event === "identity"
            ? settlePublicIdentity(state, "alice", "settled")
            : settlePublicRoute(state, "alice:/route-a", true);
      }

      expect(state, order.join(" -> ")).toMatchObject({
        validation: "valid",
        identity: "settled",
        routeReady: true,
        shellRevealed: true,
      });
      expect(shouldShowColdEntryOverlay(state), order.join(" -> ")).toBe(false);
    }
  });

  it("keeps the shell cold when the current route reports not ready", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const validated = settleUsernameValidation(cold, "alice", "valid");
    const identified = settlePublicIdentity(validated, "alice", "settled");
    const notReady = settlePublicRoute(identified, "alice:/route-a", false);

    expect(notReady).toMatchObject({ routeReady: false, shellRevealed: false });
    expect(shouldShowColdEntryOverlay(notReady)).toBe(true);
  });

  it("returns to a cold, visible-overlay route state when readiness changes from true to false before reveal", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const routeReady = settlePublicRoute(cold, "alice:/route-a", true);
    const routeNotReady = settlePublicRoute(routeReady, "alice:/route-a", false);

    expect(routeNotReady).toMatchObject({ routeReady: false, shellRevealed: false });
    expect(shouldShowColdEntryOverlay(routeNotReady)).toBe(true);
    expect(settlePublicRoute(routeNotReady, "alice:/route-a", false)).toBe(routeNotReady);
  });

  it("keeps a revealed shell visible when readiness changes from true to false", () => {
    const revealed = settlePublicRoute(
      settlePublicIdentity(
        settleUsernameValidation(createPublicShellReadiness("alice", "alice:/route-a"), "alice", "valid"),
        "alice",
        "settled",
      ),
      "alice:/route-a",
      true,
    );
    const routeNotReady = settlePublicRoute(revealed, "alice:/route-a", false);

    expect(routeNotReady).toMatchObject({ routeReady: false, shellRevealed: true });
    expect(shouldShowColdEntryOverlay(routeNotReady)).toBe(false);
    expect(settlePublicRoute(routeNotReady, "alice:/route-a", false)).toBe(routeNotReady);
  });

  it("treats a terminal route query or render error as ready for cold reveal", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const validated = settleUsernameValidation(cold, "alice", "valid");
    const identified = settlePublicIdentity(validated, "alice", "settled");
    const terminalError = settlePublicRoute(identified, "alice:/route-a", true);

    expect(terminalError).toMatchObject({ routeReady: true, shellRevealed: true });
    expect(shouldShowColdEntryOverlay(terminalError)).toBe(false);
  });

  it("makes terminal invalid validation a non-revealing terminal state", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const invalid = settleUsernameValidation(cold, "alice", "terminal-invalid");
    const identityAfterInvalid = settlePublicIdentity(invalid, "alice", "settled");
    const routeAfterInvalid = settlePublicRoute(identityAfterInvalid, "alice:/route-a", true);

    expect(routeAfterInvalid).toMatchObject({
      validation: "terminal-invalid",
      identity: "settled",
      routeReady: true,
      shellRevealed: false,
    });
    expect(settleUsernameValidation(invalid, "alice", "valid")).toBe(invalid);
    expect(shouldShowColdEntryOverlay(routeAfterInvalid)).toBe(false);
  });

  it("resets only current-route readiness on a same-username pathname change before reveal", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const validated = settleUsernameValidation(cold, "alice", "valid");
    const routeAReady = settlePublicRoute(validated, "alice:/route-a", true);
    const routeB = syncPublicShell(routeAReady, "alice", "alice:/route-b");

    expect(routeB).toMatchObject({
      usernameKey: "alice",
      contentRouteKey: "alice:/route-b",
      validation: "valid",
      identity: "pending",
      routeReady: false,
      shellRevealed: false,
    });
    expect(shouldShowColdEntryOverlay(routeB)).toBe(true);
  });

  it("keeps revealed shell chrome visible while same-username pathname changes load", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const ready = settlePublicRoute(
      settlePublicIdentity(
        settleUsernameValidation(cold, "alice", "valid"),
        "alice",
        "settled",
      ),
      "alice:/route-a",
      true,
    );
    const routeB = syncPublicShell(ready, "alice", "alice:/route-b");

    expect(routeB).toMatchObject({
      contentRouteKey: "alice:/route-b",
      routeReady: false,
      shellRevealed: true,
    });
    expect(shouldShowColdEntryOverlay(routeB)).toBe(false);
  });

  it("resets all cold state when the normalized username changes", () => {
    const revealed = settlePublicRoute(
      settlePublicIdentity(
        settleUsernameValidation(createPublicShellReadiness("alice", "alice:/route-a"), "alice", "valid"),
        "alice",
        "settled",
      ),
      "alice:/route-a",
      true,
    );
    const bob = syncPublicShell(revealed, "BOB", "bob:/route-c");

    expect(bob).toEqual({
      usernameKey: "bob",
      contentRouteKey: "bob:/route-c",
      validation: "pending",
      identity: "pending",
      routeReady: false,
      shellRevealed: false,
    });
    expect(shouldShowColdEntryOverlay(bob)).toBe(true);
  });

  it("ignores stale validation, identity, and route completions", () => {
    const bob = syncPublicShell(
      createPublicShellReadiness("alice", "alice:/route-a"),
      "bob",
      "bob:/route-b",
    );
    const staleValidation = settleUsernameValidation(bob, "alice", "valid");
    const staleIdentity = settlePublicIdentity(bob, "alice", "settled");
    const staleRoute = settlePublicRoute(bob, "alice:/route-a", true);
    const routeB = syncPublicShell(
      createPublicShellReadiness("alice", "alice:/route-a"),
      "alice",
      "alice:/route-b",
    );
    const staleSameUsernameRoute = settlePublicRoute(routeB, "alice:/route-a", true);

    expect(staleValidation).toBe(bob);
    expect(staleIdentity).toBe(bob);
    expect(staleRoute).toBe(bob);
    expect(staleSameUsernameRoute).toBe(routeB);
  });

  it("is idempotent for repeated completions and does not hide a revealed shell during background identity revalidation", () => {
    const cold = createPublicShellReadiness("alice", "alice:/route-a");
    const validated = settleUsernameValidation(cold, "alice", "valid");
    expect(settleUsernameValidation(validated, "alice", "valid")).toBe(validated);

    const identified = settlePublicIdentity(validated, "alice", "settled");
    expect(settlePublicIdentity(identified, "alice", "settled")).toBe(identified);

    const revealed = settlePublicRoute(identified, "alice:/route-a", true);
    expect(settlePublicRoute(revealed, "alice:/route-a", true)).toBe(revealed);
    expect(syncPublicShell(revealed, "alice", "alice:/route-a")).toBe(revealed);
    expect(revealed.shellRevealed).toBe(true);
    expect(shouldShowColdEntryOverlay(revealed)).toBe(false);
  });

  it("normalizes username identity comparisons internally", () => {
    const cold = createPublicShellReadiness("Alice", "alice:/route-a");
    const valid = settleUsernameValidation(cold, "ALICE", "valid");
    const identified = settlePublicIdentity(valid, "aLiCe", "settled");
    const revealed = settlePublicRoute(identified, "alice:/route-a", true);

    expect(revealed).toMatchObject({ usernameKey: "alice", shellRevealed: true });
  });

  it("retains current-route readiness for search and hash-only navigation using the same content-route key", () => {
    const cold = createPublicShellReadiness("alice", "alice:/places");
    const routeReady = settlePublicRoute(cold, "alice:/places", true);
    const searchOrHashChange = syncPublicShell(routeReady, "alice", "alice:/places");

    expect(searchOrHashChange).toBe(routeReady);
    expect(searchOrHashChange).toMatchObject({ routeReady: true, shellRevealed: false });
  });
});
