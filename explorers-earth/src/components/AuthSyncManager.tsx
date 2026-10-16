import { useEffect, useRef, useSyncExternalStore } from "react";
import { useApolloClient } from "@apollo/client";
import useAuthStore from "../store/store";
import { authClient } from "../lib/authClient";
import { queryClient } from "../lib/queryClient";
import { musicApi, musicIdentityCoordinator } from "../features/music/musicApi";
import { musicSessionBoundary } from "../features/music/musicSessionBoundary";
import { clearMusicPublicationCommands } from "../features/music/musicPublicationCommandRegistry";
import { clearAllMusicWorkspaceQueries } from "../hooks/useTunesDashboard";

/** Bootstrap cookie authority once and clear mounted private caches on each generation change. */
export default function AuthSyncManager() {
  const apollo = useApolloClient();
  const { generation, status, isAuthenticated, user, accountId } = useAuthStore();
  // An account-generation event from another tab resets the Music coordinator, so owner
  // provisioning has to run again here. Nothing consumed these two boundary members,
  // which is why a reset tab stayed unprovisioned until a full page load.
  const musicGeneration = useSyncExternalStore(
    musicSessionBoundary.subscribeAccountGeneration,
    musicSessionBoundary.getAccountGenerationSnapshot,
    musicSessionBoundary.getAccountGenerationSnapshot,
  );
  const previous = useRef<number | null>(null);
  useEffect(() => { void authClient.refresh(); }, []);
  useEffect(() => {
    if (previous.current === null) { previous.current = generation; return; }
    if (previous.current === generation) return;
    previous.current = generation;
    musicApi.logout();
    musicIdentityCoordinator.reset();
    clearMusicPublicationCommands();
    void clearAllMusicWorkspaceQueries(queryClient);
    void queryClient.cancelQueries();
    queryClient.removeQueries({ queryKey: ["explorers-account"] });
    void apollo.clearStore();
  }, [apollo, generation]);

  // ADR-006: the canonical session is the Music owner's authority, so owner
  // provisioning is reconciled from the verified account here. Nothing called
  // reconcile() before, which left musicIdentityCoordinator.isReadyFor() permanently
  // false, and with it `eligible` in MusicPublishProvider - so every Music
  // publication control rendered disabled in the real application.
  const userDocumentId = user?.id;
  useEffect(() => {
    if (!isAuthenticated || status !== "active-complete" || !userDocumentId || !accountId) return;
    // Google-only by configuration; the server takes the subject from the Actor, so
    // these identifiers scope the client's own readiness, not the request.
    // A provisioning failure is already observable through the coordinator's own
    // state, which the Music surfaces render as an outage with an explicit retry, and
    // it must not break the Explorers shell. `void` does not handle a rejection, so
    // absorb it here instead of letting it escape as an unhandled rejection.
    musicIdentityCoordinator.reconcile({
      provider: "google",
      authenticated: true,
      verified: true,
      userDocumentId,
      account: { documentId: accountId },
    }).catch(() => {});
  }, [isAuthenticated, status, userDocumentId, accountId, generation, musicGeneration]);

  return null;
}
