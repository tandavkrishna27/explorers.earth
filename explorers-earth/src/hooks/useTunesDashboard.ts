import { useEffect, useSyncExternalStore } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { musicApi, musicIdentityCoordinator, musicJson } from "../features/music/musicApi";
import { subscribeToOwnerMusic } from "../features/music/ownerMusicLiveClient";
import { getMusicCredential, subscribeMusicCredential } from "../lib/musicCredentialStore";
import {
  createMusicWorkspaceClient,
  type MusicDashboardResponse,
  type MusicEntitlementResponse,
  type MusicPlaylist,
  type MusicGuestControls,
} from "../features/music/musicWorkspaceClient";

export interface TunesDashboardData {
  playlists: MusicPlaylist[];
  dashboard: MusicDashboardResponse | null;
  entitlement: MusicEntitlementResponse | null;
  guestControls?: MusicGuestControls | null;
  playlist: MusicDashboardResponse | null;
  guestUrl: string | null;
  localUser: null;
  identityStatus: ReturnType<typeof musicIdentityCoordinator.getSnapshot>;
  requestId?: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<unknown>;
  retryIdentity: () => Promise<void>;
}

export const musicWorkspaceClient = createMusicWorkspaceClient((input) => musicApi.request(input));

export interface MusicWorkspaceScope {
  userDocumentId: string;
  accountDocumentId: string;
}

export function musicWorkspaceQueryKey(scope: MusicWorkspaceScope) {
  return ["music-workspace", scope.userDocumentId, scope.accountDocumentId] as const;
}

export async function clearMusicWorkspaceScope(queryClient: QueryClient, scope: MusicWorkspaceScope): Promise<void> {
  const queryKey = musicWorkspaceQueryKey(scope);
  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.removeQueries({ queryKey, exact: true });
}

export async function clearAllMusicWorkspaceQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ["music-workspace"] });
  queryClient.removeQueries({ queryKey: ["music-workspace"] });
}

const terminalWorkspaceCodes = new Set([
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "TOKEN_REVOKED",
  "IDENTITY_PENDING_DELETION",
  "IDENTITY_TOMBSTONED",
  "IDENTITY_SUSPENDED",
]);

export function retryWorkspaceFailure(failureCount: number, error: unknown): boolean {
  const failure = error as { code?: unknown; upstreamCode?: unknown };
  const code = typeof failure?.code === "string" ? failure.code : "";
  const upstreamCode = typeof failure?.upstreamCode === "string" ? failure.upstreamCode : "";
  if (terminalWorkspaceCodes.has(code) || terminalWorkspaceCodes.has(upstreamCode)) return false;
  return failureCount < 1;
}

function isTerminalWorkspaceFailure(error: unknown): boolean {
  const failure = error as { code?: unknown; upstreamCode?: unknown };
  const code = typeof failure?.code === "string" ? failure.code : "";
  const upstreamCode = typeof failure?.upstreamCode === "string" ? failure.upstreamCode : "";
  return terminalWorkspaceCodes.has(code) || terminalWorkspaceCodes.has(upstreamCode);
}

export function useTunesDashboard(scope?: MusicWorkspaceScope): TunesDashboardData {
  const identityStatus = useSyncExternalStore(
    musicIdentityCoordinator.subscribe,
    musicIdentityCoordinator.getSnapshot,
    musicIdentityCoordinator.getSnapshot,
  );
  const identityDiagnostic = useSyncExternalStore(
    musicIdentityCoordinator.subscribe,
    musicIdentityCoordinator.getDiagnosticSnapshot,
    musicIdentityCoordinator.getDiagnosticSnapshot,
  );
  const credential = useSyncExternalStore(
    subscribeMusicCredential,
    getMusicCredential,
    () => undefined,
  );
  const hasCredential = credential !== undefined;
  const query = useQuery({
    queryKey: scope ? musicWorkspaceQueryKey(scope) : ["music-workspace", "no-user", "no-account"],
    queryFn: () => musicWorkspaceClient.load(),
    enabled: identityStatus === "ready" && scope !== undefined,
    staleTime: 30_000,
    retry: retryWorkspaceFailure,
  });
  useEffect(() => {
    if (query.error && isTerminalWorkspaceFailure(query.error)) {
      musicIdentityCoordinator.reportFailure(query.error);
    }
  }, [query.error]);
  useEffect(() => {
    if (identityStatus !== "ready" || !scope || !hasCredential) return;
    const subscription = subscribeToOwnerMusic({
      // Ticket 6.3. One purpose-limited ticket per connection attempt. The socket no
      // longer rides the owner HTTP credential, so its lifetime is no longer tied to
      // that credential's rotation and a rotation no longer tears the connection down.
      mintTicket: async () => (await musicJson<{ ticket: { token: string } }>(
        "POST", "/api/music/socket-ticket",
      )).ticket.token,
      initialRevision: query.data?.dashboard.queueRevision ?? 0,
      onInvalidate: async () => {
        const result = await query.refetch();
        return { revision: result.data?.dashboard.queueRevision ?? 0 };
      },
    });
    return () => subscription.unsubscribe();
    // Keyed on whether a credential exists rather than on its value: minting a ticket is
    // an owner HTTP call, so the socket still waits for owner authority, but a routine
    // credential rotation no longer tears down and rebuilds the connection.
  }, [hasCredential, identityStatus, scope?.accountDocumentId, scope?.userDocumentId]);
  const visibleData = query.error && isTerminalWorkspaceFailure(query.error) ? undefined : query.data;
  const dashboard = visibleData?.dashboard ?? null;
  return {
    playlists: visibleData?.playlists ?? [],
    dashboard,
    entitlement: visibleData?.entitlement ?? null,
    guestControls: visibleData?.guestControls ?? null,
    playlist: dashboard,
    guestUrl: dashboard?.publication.publicSlug ?? null,
    localUser: null,
    identityStatus,
    requestId: identityDiagnostic.requestId,
    isLoading: identityStatus === "setting_up" || (scope !== undefined && query.isLoading),
    error: query.error ? "Music is temporarily unavailable." : null,
    refetch: query.refetch,
    retryIdentity: () => musicIdentityCoordinator.retry(),
  };
}
