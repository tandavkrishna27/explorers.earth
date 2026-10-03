import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { authClient } from "../lib/authClient";

type State = { kind: "loading" } | { kind: "ready"; revision: number } | { kind: "submitting" } |
  { kind: "success" } | { kind: "error"; message: string };

export default function ReactivateConfirm() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void fetch("/api/explorers/v1/recovery/status", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Recovery proof is expired or unavailable. Start again with Google.");
        const body = await response.json() as { recovery?: { status?: string; revision?: number } };
        const recovery = body.recovery;
        if (!recovery || !["suspended", "pending_deletion"].includes(recovery.status ?? "") || !Number.isSafeInteger(recovery.revision)) {
          throw new Error("This account cannot be recovered.");
        }
        if (live) setState({ kind: "ready", revision: recovery.revision! });
      }).catch((error) => { if (live) setState({ kind: "error", message: error.message }); });
    return () => { live = false; };
  }, []);

  const complete = async () => {
    if (state.kind !== "ready") return;
    const revision = state.revision;
    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/explorers/v1/recovery/complete", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: revision }) });
      if (!response.ok) throw new Error("Recovery could not finish. The proof may have expired or already been used.");
      setState({ kind: "success" });
    } catch (error) { setState({ kind: "error", message: (error as Error).message }); }
  };

  return <>
    <SEO title="Recover Account – explorers" description="Confirm recovery of your deactivated account."
      canonical={createCanonicalUrl("/reactivate-confirm")} noIndex={true} />
    <div className="dashboard-theme dashboard-theme-dark min-h-screen flex font-poppins items-center justify-center bg-black text-white px-4 sm:px-6 py-10">
      <div className="relative w-full max-w-md mx-auto">
        <div className="backdrop-blur-sm bg-dashboard-sidebar border border-dashboard p-8 rounded-2xl shadow-dashboard-elevated text-center">
          {state.kind === "loading" && <p>Checking Google recovery...</p>}
          {state.kind === "ready" && <>
            <h1 className="text-xl sm:text-2xl font-bold mb-3">Restore your account</h1>
            <p className="text-sm text-gray-400 mb-6">Your Google identity was verified. Confirm to restore access or cancel pending deletion.</p>
            <button type="button" onClick={complete} className="w-full py-2.5 px-4 rounded-xl bg-dashboard-accent text-dashboard">Reactivate account</button>
          </>}
          {state.kind === "submitting" && <p>Reactivating your account...</p>}
          {state.kind === "success" && <>
            <h1 className="text-xl sm:text-2xl font-bold mb-3">Account reactivated</h1>
            <p className="text-sm text-gray-400 mb-6">Sign in with Google again to create a fresh session.</p>
            <button type="button" onClick={() => { void authClient.startGoogleSignIn(); }}
              className="w-full py-2.5 px-4 rounded-xl bg-dashboard-accent text-dashboard">Sign in with Google</button>
          </>}
          {state.kind === "error" && <>
            <p role="alert" className="text-red-400 mb-4">{state.message}</p>
            <button type="button" onClick={() => navigate("/reactivate")}
              className="w-full py-2.5 px-4 rounded-xl bg-dashboard-accent text-dashboard">Try Google recovery again</button>
          </>}
        </div>
      </div>
    </div>
  </>;
}
