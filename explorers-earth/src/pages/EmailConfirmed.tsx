import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthShell from "../components/auth/AuthShell";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const EmailConfirmed = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <AuthShell>
      <main className="ea-card ea-center">
        <div className="ea-iconwrap is-success"><CheckIcon /></div>

        <div className="ea-eyebrow" style={{ justifyContent: "center" }}>
          <span className="ea-spark" />
          {t("auth.eyebrow.verified", { defaultValue: "Verified" })}
        </div>

        <h1 className="ea-title">
          {t("emailConfirmed.title", { defaultValue: "Email verified" })}
        </h1>
        <p className="ea-sub">
          {t("emailConfirmed.description", {
            defaultValue: "Your email is confirmed. You're all set to sign in.",
          })}
        </p>

        <button type="button" onClick={() => navigate("/login")} className="ea-primary">
          {t("emailConfirmed.goToLogin", { defaultValue: "Go to login" })}
        </button>
      </main>
    </AuthShell>
  );
};

export default memo(EmailConfirmed);
