import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { EarthLoader } from "../components/EarthLoader";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { isManualAuthEnabled } from "../config/featureFlags";
import { useEffect } from "react";
import AuthShell from "../components/auth/AuthShell";

/**
 * Ticket 2.4. Password authentication does not exist canonically - `betterAuth.ts` sets
 * `emailAndPassword: {enabled: false}` and Login offers only Google - so there is no
 * canonical operation for this page to call, and the Strapi one it used to call wrote
 * credentials that no sign-in path would have accepted.
 *
 * The page already redirects to Google sign-in (ENABLE_MANUAL_AUTH is false), which is the
 * visible change ticket 2.4 line 45 records as agreed. That redirect runs in an effect, so
 * it happens a frame after the first render; this makes the submit path refuse by
 * construction rather than merely be unreached in practice.
 */
const manualAuthUnavailable = () => {
  throw new Error('Password sign-in is unavailable. Please continue with Google.');
};

const ForgotPassword = () => {
  const { t } = useTranslation();
  const loading = false;
  const navigate = useNavigate();

  // MANUAL AUTH DISABLED - Redirect to login for OAuth-only mode
  useEffect(() => {
    if (!isManualAuthEnabled()) {
      toast.error(t('auth.manualAuthDisabled') || 'Password reset is not available. Please sign in with Google.');
      navigate('/login', { replace: true });
    }
  }, [navigate, t]);

  const initialValues = { email: "" };

  const validationSchema = Yup.object({
    email: Yup.string().email(t('auth.validations.email.invalidFormat')).required(t('auth.validations.email.required')),
  });

  const handleSubmit = async (_values: typeof initialValues) => {
    manualAuthUnavailable();
  };

  if (loading)
    return (
      <div className="bg-black">
        <EarthLoader context="login" />
      </div>
    );

  return (
    <>
      <SEO
        title="Forgot Password - explorers"
        description="Reset your explorers password"
        canonical={createCanonicalUrl("/forgot-password")}
        noIndex={true}
      />

      <AuthShell>
        <main className="ea-card">
          <div className="ea-eyebrow">
            <span className="ea-spark" />
            {t("auth.eyebrow.resetPassword", { defaultValue: "Reset password" })}
          </div>

          <h1 className="ea-title">{t("auth.validations.forgotPassword.title")}</h1>
          <p className="ea-sub">{t("auth.validations.forgotPassword.description")}</p>

          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
          >
            <Form className="ea-form">
              <div className="ea-field">
                <label htmlFor="email" className="ea-label">
                  {t("auth.validations.forgotPassword.emailLabel")}
                </label>
                <Field
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("auth.validations.forgotPassword.emailPlaceholder")}
                  className="ea-input"
                />
                <ErrorMessage name="email" component="div" className="ea-fielderr" />
              </div>

              <button type="submit" className="ea-primary">
                {t("auth.validations.forgotPassword.sendResetLink")}
              </button>
            </Form>
          </Formik>

          <p className="ea-altrow">
            <Link to="/login">{t("auth.validations.forgotPassword.backToLogin")}</Link>
          </p>
        </main>
      </AuthShell>
    </>
  );
};

export default ForgotPassword;
