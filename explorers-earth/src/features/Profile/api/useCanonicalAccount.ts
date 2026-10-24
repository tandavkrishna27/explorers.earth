import { useQuery } from "@tanstack/react-query";
import useAuthStore from "../../../store/store";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import useSetupStore from "../../../store/useSetupStore";
import { recordViewedAccount } from "../../../lib/viewedRevisions";
import { useEffect } from "react";

/**
 * The one canonical-account read. The session generation is part of the key, so a new
 * session never reads the previous one's account; saves refetch it explicitly.
 */
export const canonicalAccountQuery = (identityKey: string, generation: number) => ({
  queryKey: ["explorers-account", identityKey, generation] as const,
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const profile = await explorersApiClient.getMyProfile(signal);
    if (useAuthStore.getState().generation !== generation) throw new Error("Session changed");
    // The revision this view shows is the one any save from it must be based on.
    recordViewedAccount(profile.revision);
    return profile;
  },
  retry: false,
  // Header, Sidenav, ProtectedRoute and Home mount together; they share one read.
  staleTime: 30_000,
});

export function useCanonicalAccount(options: { skip?: boolean } = {}) {
  const identityKey = useAuthStore((state) => state.user?.id ?? "cookie-session");
  const generation = useAuthStore((state) => state.generation);
  const bindAccount = useSetupStore((state) => state.bindAccount);
  const account = useQuery({ ...canonicalAccountQuery(identityKey, generation), enabled: !options.skip });
  useEffect(() => {
    if (account.data && useAuthStore.getState().generation === generation) bindAccount(account.data.id, account.data.onboardingStatus, generation);
  }, [account.data, bindAccount, generation]);
  return account;
}
