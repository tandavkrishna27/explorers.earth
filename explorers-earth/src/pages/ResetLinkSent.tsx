import { useLocation, useNavigate, Link } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { forgotPasswordMutation } from "../features/Authentication/api/mutation";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { isManualAuthEnabled } from "../config/featureFlags";
import AuthShell from "../components/auth/AuthShell";

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const ResetLinkSent = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email as string | undefined;

  const [forgotPassword, { loading }] = useMutation(forgotPasswordMutation);

  // Cooldown state
  const [cooldown, setCooldown] = useState(0);

  // MANUAL AUTH DISABLED - Redirect to login for OAuth-only mode
  useEffect(() => {
    if (!isManualAuthEnabled()) {
      toast.error(t('auth.manualAuthDisabled') || 'Password reset is not available. Please sign in with Google.');
      navigate('/login', { replace: true });
    }
  }, [navigate, t]);

  // Countdown timer logic
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    // The email is only held in router state; if it's gone (e.g. a refresh),
    // send the user back to request a fresh link instead of failing silently.
    if (!email) {
      toast.error(t('toast.error.emailNotFound'));
      navigate("/forgot-password");
      return;
    }

    try {
      const response = await forgotPassword({
        variables: { email },
      });

      if (response.data.forgotPassword.ok) {
        toast.success(t('toast.success.resetLinkResent'));
        setCooldown(30); // Start 30 sec cooldown
      } else {
        toast.error(t('toast.error.resetLinkResendFailed'));
      }
    } catch {
      toast.error(t('toast.error.resetLinkResendFailed'));
    }
  };

  return (
    <AuthShell>
      <main className="ea-card ea-center">
        <div className="ea-iconwrap"><MailIcon /></div>

        <div className="ea-eyebrow" style={{ justifyContent: "center" }}>
          <span className="ea-spark" />
          {t("auth.eyebrow.checkInbox", { defaultValue: "Check your inbox" })}
        </div>

        <h1 className="ea-title">
          {t("auth.resetLinkSent.title", { defaultValue: "Reset link sent" })}
        </h1>
        <p className="ea-sub">
          {t("auth.resetLinkSent.description", {
            defaultValue: "Check your email for a link to reset your password. It expires soon.",
          })}
        </p>
        {email && (
          <p className="ea-note">
            <span className="ea-email-chip">{email}</span>
          </p>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={loading || cooldown > 0}
          className="ea-primary"
        >
          {loading
            ? t("auth.resetLinkSent.resending", { defaultValue: "Sending…" })
            : cooldown > 0
              ? t("auth.resetLinkSent.resendWithCooldown", { cooldown, defaultValue: "Resend in {{cooldown}}s" })
              : t("auth.resetLinkSent.resendMail", { defaultValue: "Resend email" })}
        </button>

        <p className="ea-altrow">
          <Link to="/login">{t("auth.validations.forgotPassword.backToLogin")}</Link>
        </p>
      </main>
    </AuthShell>
  );
};

export default ResetLinkSent;
