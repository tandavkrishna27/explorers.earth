import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApolloClient } from "@apollo/client";
import useAuthStore from "../store/store";
import { closeLocalMusicSession } from "../features/music/musicSessionBoundary";
import { queryClient } from "../lib/queryClient";
import { clearAllMusicWorkspaceQueries } from "./useTunesDashboard";
import { authClient } from "../lib/authClient";
import useSetupStore from "../store/useSetupStore";

/**
 * Shared logout flow used by the header and the sidebar account menu.
 * Clears all auth/session state (storage, cookies), redirects to /login,
 * and shows a confirmation toast. Single source of truth so the two entry
 * points can never drift.
 */
export const useLogout = () => {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const client = useApolloClient();

  return async (options: { serverRevoked?: boolean } = {}) => {
    const logoutAttemptId = useAuthStore.getState().setLogoutError(true);
    logout();
    closeLocalMusicSession();

    // Clear all explorers storage
    localStorage.removeItem("auth-storage");
    localStorage.removeItem("qrtoken");

    useSetupStore.setState({ accountScope: null, sessionGeneration: null, isProfileComplete: false, isRecommendationsComplete: false });
    void queryClient.cancelQueries();
    queryClient.removeQueries({ queryKey: ["explorers-account"] });

    // Reset the Apollo cache so the next login/account starts from server truth
    // (prevents a stale `accounts` read from surviving a same-tab account switch).
    try {
      await Promise.all([
        client.clearStore(),
        clearAllMusicWorkspaceQueries(queryClient),
      ]);
    } catch (err) {
      console.warn("Failed to clear Apollo cache on logout:", err);
    }

    try {
      if (!options.serverRevoked) await authClient.signOut();
      useAuthStore.getState().setLogoutError(false, logoutAttemptId);
      navigate("/login");
      toast(t("toast.success.loggedOutSuccessfully"));
    } catch {
      navigate("/login?error=logout_incomplete");
      toast.error("Server sign-out failed. Retry to finish signing out.");
    }
  };
};
