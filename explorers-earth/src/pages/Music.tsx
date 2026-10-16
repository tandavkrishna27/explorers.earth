import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import MusicDashboard from "../components/MusicDashboard";
import SEO from "../components/SEO";
import { useCanonicalAccount } from "../features/Profile/api/useCanonicalAccount";
import {
  selectMusicSurfaceState,
  type MusicEntitlement,
  type MusicIdentity,
  type MusicLifecycle,
  type MusicOnboarding,
} from "../features/music/musicState";
import { useTunesDashboard, type TunesDashboardData } from "../hooks/useTunesDashboard";
import useAuthStore from "../store/store";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import type { MusicPublicationOwnerScope } from "../features/music/musicPublicationCommandRegistry";
import { createMusicRolloutClient, subscribeMusicRollout, type MusicRolloutScope } from "../features/music/musicRollout";
import { musicApi } from "../features/music/musicApi";

const musicRollout = createMusicRolloutClient((input) => musicApi.request(input));
const localOwnerWorkspacePreview = import.meta.env.DEV;

export function resolveOwnerWorkspaceExposure(exposed: boolean, localPreview: boolean): boolean {
  return localPreview || exposed;
}


const actionLabels = {
  check_status: "Check status",
  sign_in: "Sign in",
  finish_profile: "Finish profile",
  get_help: "Get help",
  try_again: "Try again",
} as const;

function lifecycleFrom(data: TunesDashboardData): MusicLifecycle {
  if (data.identityStatus === "pending_deletion") return "pending_deletion";
  if (data.identityStatus === "suspended") return "suspended";
  return "active";
}

function identityFrom(data: TunesDashboardData): MusicIdentity {
  if (data.identityStatus === "conflict") return "conflict";
  if (data.identityStatus === "retryable") return "retryable";
  if (data.identityStatus === "unavailable") return "unavailable";
  if (data.identityStatus === "ready") return "ready";
  return "setting_up";
}

function entitlementFrom(data: TunesDashboardData): MusicEntitlement {
  // The workspace query cannot fetch entitlement before identity is ready. Treat
  // that absence as neutral so a retryable identity failure remains actionable;
  // once identity is ready, a missing entitlement is a real checking state.
  if (!data.entitlement) return data.identityStatus === "ready" ? "unresolved" : "included";
  return data.entitlement.state;
}

/**
 * Ticket 6.x / step 8. Whether this Explorer has an account Music can be set up for.
 *
 * This used to read `usersPermissionsUser` from Strapi and infer the answer from three
 * fields being non-empty - Account_Name, Account_Type, mobile_number - plus `provider` and
 * `confirmed`. Canonically all five of those are one column: `onboarding_status`. The
 * account itself records whether onboarding finished, so there is nothing to infer.
 *
 * The provider and confirmation checks are gone for a different reason: the canonical
 * profile read only answers for an authenticated Google user at all - `canonicalApp`
 * refuses with 403 unless an `auth_account` row with `provider_id='google'` exists - so an
 * unverified or non-Google identity never produces an account here to judge.
 *
 * "unknown" is kept and still distinct from "incomplete". It is the answer while the read
 * is in flight or has failed, and conflating it with "incomplete" would tell a creator with
 * a finished account to go and finish it every time the network blinked.
 */
export function onboardingFromEligibility(eligibility: {
  isPending: boolean;
  error?: unknown;
  data?: { onboardingStatus?: string | null } | null;
}): MusicOnboarding {
  if (eligibility.isPending || eligibility.error || !eligibility.data) return "unknown";
  return eligibility.data.onboardingStatus === "complete" ? "complete" : "incomplete";
}

export function MusicPageContent({
  authenticated,
  onboarding,
  data,
  scope,
  onAction,
  statusRef,
  ownerWorkspace = false,
}: {
  authenticated: boolean;
  onboarding: MusicOnboarding;
  data: TunesDashboardData;
  scope?: MusicPublicationOwnerScope;
  onAction: (action: keyof typeof actionLabels) => void;
  statusRef?: RefObject<HTMLDivElement>;
  ownerWorkspace?: boolean;
}) {
  const state = selectMusicSurfaceState({
    lifecycle: lifecycleFrom(data),
    authenticated: authenticated && data.identityStatus !== "auth_required",
    onboarding,
    entitlement: entitlementFrom(data),
    identity: identityFrom(data),
    content: data.error ? (data.dashboard ? "stale" : "failure") : data.isLoading ? "loading" : "ready",
    playlistCount: data.playlists.length,
  });
  const entitlementLoading = state.kind === "entitlement_unknown";
  const showInlineStatus = !entitlementLoading && !["ready_empty", "ready_content"].includes(state.kind);
  const blocksContent = state.blocksContent || entitlementLoading;
  const role = state.live === "assertive" ? "alert" : "status";

  return (
    <section aria-labelledby="music-page-title" className="dashboard-theme min-h-full bg-dashboard-bg px-4 py-5 text-dashboard sm:px-6 md:py-7">
      <div className={`mx-auto ${ownerWorkspace ? "max-w-6xl" : "max-w-4xl"}`}>
        <h1 id="music-page-title" className={ownerWorkspace ? "sr-only" : "text-2xl font-semibold tracking-tight text-dashboard sm:text-3xl"}>Music</h1>
        {showInlineStatus && (
          <div ref={statusRef} tabIndex={-1} role={role} aria-live={state.live === "off" ? undefined : state.live} aria-atomic="true" className="mt-2 min-h-6 text-base text-dashboard-light outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent">
            {state.message}
          </div>
        )}

        {blocksContent ? (
          <section className="mt-6 rounded-2xl border border-dashboard bg-dashboard-sidebar p-5 sm:p-7">
            {["setting_up", "entitlement_unknown", "content_loading"].includes(state.kind) && (
              <div aria-hidden="true" className="space-y-3">
                <div className="h-11 w-full animate-pulse rounded-xl bg-dashboard-muted motion-reduce:animate-none" />
                <div className="h-32 w-full animate-pulse rounded-xl bg-dashboard-muted motion-reduce:animate-none" />
              </div>
            )}
            {state.action && (
              <button type="button" onClick={() => onAction(state.action!)} className="min-h-11 min-w-11 rounded-xl bg-dashboard-accent px-4 text-sm font-semibold text-[var(--dash-accent-text)] outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dashboard-bg">
                {actionLabels[state.action]}
              </button>
            )}
            {state.secondaryAction && (
              <button type="button" onClick={() => onAction(state.secondaryAction!)} className="ml-2 min-h-11 min-w-11 rounded-xl border border-dashboard bg-dashboard-muted px-4 text-sm font-semibold text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dashboard-bg">
                {actionLabels[state.secondaryAction]}
              </button>
            )}
            {data.requestId && (
              <details className="mt-4 text-sm text-dashboard-light">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-2">Request ID: {data.requestId}</p>
              </details>
            )}
          </section>
        ) : (
          <div className="mt-5 space-y-5">
            {state.action && (
              <button type="button" onClick={() => onAction(state.action!)} className="min-h-11 min-w-11 rounded-xl border border-dashboard bg-dashboard-muted px-4 text-sm font-semibold text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dashboard-bg">
                {actionLabels[state.action]}
              </button>
            )}
            {state.secondaryAction && (
              <button type="button" onClick={() => onAction(state.secondaryAction!)} className="min-h-11 min-w-11 rounded-xl border border-dashboard bg-dashboard-muted px-4 text-sm font-semibold text-dashboard outline-none focus-visible:ring-2 focus-visible:ring-dashboard-accent focus-visible:ring-offset-2 focus-visible:ring-offset-dashboard-bg">
                {actionLabels[state.secondaryAction]}
              </button>
            )}
            <MusicDashboard data={data} scope={scope!} readOnly={state.kind === "content_stale"} complete={ownerWorkspace} />
          </div>
        )}
      </div>
    </section>
  );
}

const MusicPage = () => {
  const { user, isAuthenticated, accountId } = useAuthStore();
  const navigate = useNavigate();
  const statusRef = useRef<HTMLDivElement>(null);
  const eligibility = useCanonicalAccount();
  const onboardingComplete = onboardingFromEligibility(eligibility) === "complete";
  // The owner scope must be keyed on the canonical account id. AuthSyncManager
  // reconciles Music provisioning with that id, and musicIdentityCoordinator.isReadyFor()
  // compares `userDocumentId:accountDocumentId` against the key the reconcile completed
  // with - so a Strapi document id here could never match, which left every Music
  // publication control disabled. The eligibility read decides *whether* this Explorer has
  // a usable account; the store supplies its id.
  const scope = onboardingComplete && user?.documentId && accountId ? {
    userDocumentId: user.documentId,
    accountDocumentId: accountId,
  } : undefined;
  const data = useTunesDashboard(scope);
  const [ownerWorkspace, setOwnerWorkspace] = useState(false);
  const previousScope = useRef<MusicRolloutScope>();
  useEffect(() => {
    const previous = previousScope.current;
    if (previous && (!scope || previous.userDocumentId !== scope.userDocumentId || previous.accountDocumentId !== scope.accountDocumentId)) musicRollout.clear(previous);
    previousScope.current = scope;
    setOwnerWorkspace(false);
    if (!scope || data.identityStatus !== "ready") return;
    return subscribeMusicRollout(musicRollout, scope, (exposure) => {
      setOwnerWorkspace(resolveOwnerWorkspaceExposure(exposure.ownerWorkspace, localOwnerWorkspacePreview));
    });
  }, [scope?.userDocumentId, scope?.accountDocumentId, data.identityStatus]);
  const onboarding = onboardingFromEligibility(eligibility);

  const action = (value: keyof typeof actionLabels) => {
    if (value === "try_again") {
      void data.retryIdentity().then(() => data.refetch()).catch(() => undefined).finally(() => statusRef.current?.focus());
      return;
    }
    if (value === "sign_in") navigate("/login");
    else if (value === "finish_profile") navigate("/onboarding");
    else if (value === "check_status") navigate("/settings");
    else navigate("/contact");
  };

  return (
    <>
      <SEO
        title="Music | explorers"
        description="Create playlists and share music from your Explorer profile."
        canonical={createCanonicalUrl("/recommendations/music")}
        type="website"
        noIndex
        siteName="explorers"
      />
      <MusicPageContent authenticated={isAuthenticated} onboarding={onboarding} data={data} scope={scope} onAction={action} statusRef={statusRef} ownerWorkspace={ownerWorkspace} />
    </>
  );
};

export default MusicPage;
