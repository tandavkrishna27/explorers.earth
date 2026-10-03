import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import { authClient } from "../lib/authClient";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import useAuthStore from "../store/store";

export default function ReactivateAccount() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const authStatus = useAuthStore((state) => state.status);
  const start = () => {
    if (starting) return;
    setStarting(true);
    void authClient.startGoogleSignIn(true).catch(() => {
      setError("Recovery could not start. Check your connection and try again.");
      setStarting(false);
    });
  };
  return <>
    <SEO title="Recover Account – explorers" description="Recover your deactivated account with Google."
      canonical={createCanonicalUrl("/reactivate")} noIndex={true} />
    <div className="dashboard-theme dashboard-theme-dark min-h-screen flex font-poppins items-center justify-center bg-black text-white px-4 sm:px-6 py-10">
      <div className="relative w-full max-w-md mx-auto">
        <div className="backdrop-blur-sm bg-dashboard-sidebar border border-dashboard p-6 sm:p-8 rounded-2xl shadow-dashboard-elevated text-center">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-3">Recover your account</h1>
          <p className="text-sm text-gray-400 mb-6">Continue with the Google identity connected to this account to reactivate it or cancel a pending deletion.</p>
          {(error || authStatus === "error") && <p role="alert" className="text-red-400 text-sm mb-4">
            {error || "Recovery could not start. Check your connection and try again."}
          </p>}
          <button type="button" onClick={start} disabled={starting}
            className="w-full py-2.5 px-4 rounded-xl font-medium shadow-dashboard-elevated text-sm bg-dashboard-accent hover:bg-dashboard-accent/90 text-dashboard disabled:opacity-60">
            {starting ? "Connecting to Google..." : "Continue with Google"}
          </button>
          <button type="button" onClick={() => navigate("/login")}
            className="mt-4 text-sm text-dashboard-accent hover:underline">Back to sign in</button>
        </div>
      </div>
    </div>
  </>;
}
