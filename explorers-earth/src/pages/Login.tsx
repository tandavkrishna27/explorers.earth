import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SEO from "../components/SEO";
import AuthLayout from "../components/auth/AuthLayout";
import { authClient } from "../lib/authClient";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import useAuthStore from "../store/store";

export default function Login() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const logoutError = useAuthStore((state) => state.logoutError);
  const status = useAuthStore((state) => state.status);
  const begin = () => {
    if (logoutError) return;
    void authClient.startGoogleSignIn().catch(() => setError("Google sign-in is unavailable. Please try again."));
  };
  const retrySignOut = () => { const attemptId = useAuthStore.getState().logoutAttemptId;
    void authClient.signOut().then(() => {
    useAuthStore.getState().setLogoutError(false, attemptId);
    setError("");
  }).catch(() => setError("Server sign-out is still unavailable. Please retry.")); };
  return <>
    <SEO title={t("seo.loginTitle")} description="Sign in to your explorers account with Google."
      canonical={createCanonicalUrl("/login")} noIndex={true} />
    {(error || logoutError || params.has("error") || status === "error") && <div role="alert" className="bg-black text-center text-amber-300 py-3">
      {error || (logoutError ? "Server sign-out is incomplete. Retry signing out before using this account." : "Google sign-in was cancelled or could not finish. Please try again.")}
      {logoutError && <button type="button" onClick={retrySignOut} className="ml-3 underline">Retry sign-out</button>}
    </div>}
    <AuthLayout
      eyebrow={t("auth.brand.tagline", "Every place connects us")}
      title={t("auth.login.title2", "Welcome back, explorer.")}
      subtitle={t("auth.login.sub2", "Your map is right where you left it.")}
      googleLabel={t("auth.signInWithGoogle")}
      onGoogle={begin}
      termsPrefix={t("auth.terms.prefix", "By continuing you agree to our")}
      termsLabel={t("auth.terms.terms", "Terms")}
      privacyLabel={t("auth.terms.privacy", "Privacy Policy")}
      andWord={t("common.and", "and")}
      switchPrompt="Need to restore a deactivated account?"
      switchCta="Recover with Google"
      switchTo="/reactivate"
      secureLabel={t("auth.secureSignIn", "Secure sign-in")}
      helpers={[{ label: t("auth.claimAccount"), to: "/claimaccount" }]}
    />
  </>;
}
