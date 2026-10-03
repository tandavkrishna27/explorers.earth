import { useEffect, useRef } from "react";
import { useApolloClient } from "@apollo/client";
import useAuthStore from "../store/store";
import { authClient } from "../lib/authClient";
import { queryClient } from "../lib/queryClient";
import { musicApi, musicIdentityCoordinator } from "../features/music/musicApi";
import { clearMusicPublicationCommands } from "../features/music/musicPublicationCommandRegistry";
import { clearAllMusicWorkspaceQueries } from "../hooks/useTunesDashboard";

/** Bootstrap cookie authority once and clear mounted private caches on each generation change. */
export default function AuthSyncManager() {
  const apollo = useApolloClient();
  const { generation } = useAuthStore();
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
  return null;
}
