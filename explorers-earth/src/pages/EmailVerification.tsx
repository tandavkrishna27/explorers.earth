import { memo, useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import useEmailStore from "../store/useEmailStore";
import { useTranslation } from "react-i18next";
import AuthShell from "../components/auth/AuthShell";

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const EmailVerification = () => {
  const { t } = useTranslation();
  const [timer, setTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const { email } = useEmailStore();

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleResendEmail = async () => {
    if (timer > 0) return;

    // The email is held in a client store; if it's missing (e.g. a refresh or
    // direct navigation), guide the user back to login rather than POSTing an
    // empty address that silently fails.
    if (!email) {
      toast.error(t('toast.error.emailNotFound', { defaultValue: 'We could not find your email. Please log in to continue.' }));
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_REST_API_URL}/send-email-confirmation`,
        { email }
      );

      if (response.data) {
        setTimer(120);
        toast.success(t('toast.success.emailVerificationSent'));
      }
    } catch (error) {
      console.error("Error resending email:", error);
      toast.error(t('toast.error.emailVerificationFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <main className="ea-card ea-center">
        <div className="ea-iconwrap"><MailIcon /></div>

        <div className="ea-eyebrow" style={{ justifyContent: "center" }}>
          <span className="ea-spark" />
          {t("auth.eyebrow.verifyEmail", { defaultValue: "Verify email" })}
        </div>

        <h1 className="ea-title">{t('emailVerification.title')}</h1>
        <p className="ea-sub">{t('emailVerification.description')}</p>
        {email && (
          <p className="ea-note"><span className="ea-email-chip">{email}</span></p>
        )}

        <button
          type="button"
          onClick={handleResendEmail}
          className="ea-primary"
          disabled={timer > 0 || loading || !email}
        >
          {loading
            ? t('toast.info.sending')
            : timer > 0
              ? `${t('emailVerification.resendIn')} ${Math.floor(timer / 60)}:${(timer % 60).toString().padStart(2, "0")}`
              : t('emailVerification.resendEmail')}
        </button>

        {!email && (
          <p className="ea-note">
            {t("emailVerification.noEmailHint", { defaultValue: "Log in again to resend your verification email." })}
          </p>
        )}

        <p className="ea-altrow">
          <Link to="/login">{t('emailVerification.backToLogin')}</Link>
        </p>
      </main>
    </AuthShell>
  );
};

export default memo(EmailVerification);
