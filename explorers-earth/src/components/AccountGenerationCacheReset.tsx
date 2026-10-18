import { useEffect, useRef } from "react";
import { useApolloClient } from "@apollo/client";
import useAuthStore from "../store/store";
import { queryClient } from "../lib/queryClient";

/**
 * Clear mounted private caches on each auth-generation change, so nothing read for one
 * account survives into the next one in the same tab.
 *
 * This is the non-Music half of the former AuthSyncManager, kept when P3-4 removed Music
 * (the other half reset the Music identity and workspace). It does not bootstrap cookie
 * authority: the surfaces that gate on auth status do that through useSessionBootstrap.
 */
export default function AccountGenerationCacheReset() {
  const apollo = useApolloClient();
  const generation = useAuthStore((state) => state.generation);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current === null) { previous.current = generation; return; }
    if (previous.current === generation) return;
    previous.current = generation;
    void queryClient.cancelQueries();
    queryClient.removeQueries({ queryKey: ["explorers-account"] });
    void apollo.clearStore();
  }, [apollo, generation]);
  return null;
}
