import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { EarthLoader } from "../components/EarthLoader";
import { authClient } from "../lib/authClient";
import useAuthStore from "../store/store";

/** Better Auth has already handled the provider callback and issued an HttpOnly session. */
export default function GoogleAuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let live = true;
    const task = authClient.refresh();
    const generation = useAuthStore.getState().generation;
    void task.then(() => {
      if (!live || useAuthStore.getState().generation !== generation) return;
      const status = useAuthStore.getState().status;
      navigate(status === "active-complete" ? "/home" : status === "active-incomplete" ? "/onboarding"
        : status === "terminal" ? "/reactivate" : "/login?error=oauth_failed", { replace: true });
    });
    return () => { live = false; };
  }, [navigate]);
  return <div className="bg-black"><EarthLoader context="login" statusMessage="Verifying your account..." /></div>;
}
