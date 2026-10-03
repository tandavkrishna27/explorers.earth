import useAuthStore from "../../../store/store";
import { useCanonicalAccount } from "../../Profile/api/useCanonicalAccount";
import { toProfileViewModel } from "../../Profile/api/profileClient";

/** The canonical creator account supplies onboarding and public-handle authority. */
export const useCurrentUser = (options: { skipQuery?: boolean; onboardingOnly?: boolean } = {}) => {
  const identity = useAuthStore((state) => state.user);
  const query = useCanonicalAccount({ skip: options.skipQuery });
  const account = query.data;
  const fetchedUser = account ? {
    documentId: account.id,
    username: account.handle ?? "",
    email: identity?.email ?? "",
    accounts: [toProfileViewModel(account)],
    onboardingStatus: account.onboardingStatus,
  } : null;
  return {
    user: fetchedUser,
    username: account?.handle ?? "",
    isUsernameSynced: true,
    loading: query.isPending && query.isFetching,
    error: query.error,
    refetch: query.refetch,
    isReady: Boolean(account && !query.error),
    isEmpty: !query.isFetching && !account,
  };
};

export const useUserForOnboarding = (skipQuery = false) => useCurrentUser({ onboardingOnly: true, skipQuery });
