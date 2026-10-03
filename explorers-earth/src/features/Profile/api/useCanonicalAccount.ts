import { useQuery } from "@tanstack/react-query";
import useAuthStore from "../../../store/store";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import useSetupStore from "../../../store/useSetupStore";
import { useEffect } from "react";

export function useCanonicalAccount(options: { skip?: boolean } = {}) {
  const identityKey = useAuthStore((state) => state.user?.id ?? "cookie-session");
  const generation = useAuthStore((state) => state.generation);
  const bindAccount = useSetupStore((state) => state.bindAccount);
  const account = useQuery({
    queryKey: ["explorers-account", identityKey, generation],
    queryFn: async ({ signal }) => {
      const profile = await explorersApiClient.getMyProfile(signal);
      if (useAuthStore.getState().generation !== generation) throw new Error("Session changed");
      return profile;
    },
    enabled: !options.skip,
    retry: false,
    staleTime: 0,
  });
  useEffect(() => {
    if (account.data && useAuthStore.getState().generation === generation) bindAccount(account.data.id, account.data.onboardingStatus, generation);
  }, [account.data, bindAccount, generation]);
  return account;
}
