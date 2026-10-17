import type { MusicEntitlementState } from "./musicEntitlementContract";

export type MusicLifecycle = "active" | "pending_deletion" | "tombstoned" | "suspended";
export type MusicOnboarding = "complete" | "incomplete" | "unknown";
// `unknown` is a settled server entitlement value with core read/write access.
// `unresolved` means the entitlement request has not produced a value yet.
export type MusicEntitlement = MusicEntitlementState | "unresolved";
export type MusicIdentity = "ready" | "setting_up" | "retryable" | "unavailable" | "conflict";
export type MusicContent = "loading" | "failure" | "stale" | "ready";

export interface MusicSurfaceSignals {
  lifecycle: MusicLifecycle;
  authenticated: boolean;
  onboarding: MusicOnboarding;
  entitlement: MusicEntitlement;
  identity: MusicIdentity;
  content: MusicContent;
  playlistCount: number;
}

export type MusicSurfaceKind =
  | "pending_deletion" | "deleted" | "suspended" | "auth_required" | "onboarding_incomplete"
  | "identity_conflict" | "entitlement_unknown" | "setting_up" | "setup_retryable" | "setup_unavailable" | "content_loading" | "content_failure"
  | "content_stale" | "ready_empty" | "ready_content";

export interface MusicSurfaceState {
  kind: MusicSurfaceKind;
  message?: string;
  action?: "check_status" | "sign_in" | "finish_profile" | "get_help" | "try_again";
  secondaryAction?: MusicSurfaceState["action"];
  live: "off" | "polite" | "assertive";
  blocksContent: boolean;
}

const state = (
  kind: MusicSurfaceKind,
  message?: string,
  action?: MusicSurfaceState["action"],
  live: MusicSurfaceState["live"] = "off",
  blocksContent = true,
  secondaryAction?: MusicSurfaceState["action"],
): MusicSurfaceState => ({ kind, message, action, secondaryAction, live, blocksContent });

/** The sole precedence selector for the signed-in Music surface. */
export function selectMusicSurfaceState(signals: MusicSurfaceSignals): MusicSurfaceState {
  if (signals.lifecycle === "pending_deletion") return state("pending_deletion", "Account deletion is in progress.", "check_status", "assertive");
  if (signals.lifecycle === "tombstoned") return state("deleted", "Account deletion is in progress.", "check_status", "assertive");
  if (signals.lifecycle === "suspended") return state("suspended", "Music is unavailable while your Explorer account is deactivated.", undefined, "assertive");
  if (!signals.authenticated) return state("auth_required", "Sign in again to continue with Music.", "sign_in", "assertive");
  if (signals.onboarding === "incomplete") return state("onboarding_incomplete", "Finish your Explorer profile to use Music.", "finish_profile", "polite");
  if (signals.onboarding === "unknown") return state("content_loading", "Loading Music…", undefined, "polite");
  if (signals.identity === "conflict") return state("identity_conflict", "We couldn’t finish setting up Music for this account.", "get_help", "assertive");
  if (signals.identity === "setting_up") return state("setting_up", "Setting up Music…", undefined, "polite");

  if (signals.identity === "retryable") return state("setup_retryable", "Music is taking longer than expected. Your Explorers account is ready.", "try_again", "polite");
  if (signals.identity === "unavailable") return state("setup_unavailable", "Music is temporarily unavailable.", "try_again", "polite", true, "get_help");
  if (signals.content === "loading") return state("content_loading", "Loading Music…", undefined, "polite");
  if (signals.content === "failure") return state("content_failure", "Music is temporarily unavailable.", "try_again", "polite");
  if (signals.content === "stale") return state("content_stale", "May be out of date", "try_again", "polite", false);
  if (signals.entitlement === "unresolved") return state("entitlement_unknown");
  if (signals.playlistCount === 0) return state("ready_empty", "Create your first playlist", undefined, "off", false);
  return state("ready_content", undefined, undefined, "off", false);
}
