import { Formik, Form, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import { EarthLoader } from "../components/EarthLoader";
import PasswordInput from "../components/ui/PasswordInput";
import { useTranslation } from "react-i18next";
import { isManualAuthEnabled } from "../config/featureFlags";
import { useEffect } from "react";
import AuthShell from "../components/auth/AuthShell";

/**
 * Ticket 2.4. Password authentication does not exist canonically - betterAuth.ts sets
 * emailAndPassword: {enabled: false} and Login offers only Google - so there is no
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

const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // MANUAL AUTH DISABLED - Redirect to login for OAuth-only mode
  useEffect(() => {
    if (!isManualAuthEnabled()) {
      toast.error(t('auth.manualAuthDisabled') || 'Password reset is not available. Please sign in with Google.');
      navigate('/login', { replace: true });
    }
  }, [navigate, t]);

  const loading = false;

  const initialValues = {
    password: "",
    confirmPassword: "",
  };

  // Simplified validation schema - detailed validation is handled by PasswordInput
  const validationSchema = Yup.object({
    password: Yup.string().required(t('auth.validations.password.required')),
    confirmPassword: Yup.string()
      .oneOf([Yup.ref("password")], t('auth.validations.confirmPassword.mustMatch'))
      .required(t('auth.validations.confirmPassword.confirmRequired')),
  });

  const handleSubmit = async (_values: typeof initialValues) => {
    manualAuthUnavailable();
  };

  if (loading) {
    return (
      <div className="bg-black">
        <EarthLoader context="login" />
      </div>
    );
  }

  return (
    <AuthShell>
      <main className="ea-card">
        <div className="ea-eyebrow">
          <span className="ea-spark" />
          {t("auth.eyebrow.newPassword", { defaultValue: "New password" })}
        </div>

        <h1 className="ea-title">{t("auth.resetPassword.title", { defaultValue: "Set a new password" })}</h1>
        <p className="ea-sub">
          {t("auth.resetPassword.subtitle", { defaultValue: "Choose a strong password you haven't used before." })}
        </p>

        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({ values, setFieldValue }) => (
            <Form className="ea-form">
              <div className="ea-field">
                <PasswordInput
                  value={values.password}
                  onChange={(value) => setFieldValue("password", value)}
                  label={t('auth.resetPassword.newPassword', { defaultValue: 'New password' })}
                  labelColor="white"
                  placeholder={t('auth.resetPassword.newPasswordPlaceholder')}
                  showStrengthMeter={true}
                  className="w-full"
                  data-testid="new-password-input"
                />
                <ErrorMessage name="password" component="div" className="ea-fielderr" />
              </div>

              <div className="ea-field">
                <PasswordInput
                  value={values.confirmPassword}
                  onChange={(value) => setFieldValue("confirmPassword", value)}
                  label={t('auth.resetPassword.confirmPassword', { defaultValue: 'Confirm password' })}
                  labelColor="white"
                  placeholder={t('auth.resetPassword.confirmPasswordPlaceholder')}
                  showStrengthMeter={false}
                  showValidationStatus={false}
                  className="w-full"
                  data-testid="confirm-password-input"
                />
                <ErrorMessage name="confirmPassword" component="div" className="ea-fielderr" />

                {values.confirmPassword && (
                  <div className="mt-2 text-xs" style={{ color: values.password === values.confirmPassword ? "#7fd06a" : "#f0a37f" }}>
                    {values.password === values.confirmPassword
                      ? t('auth.validations.confirmPassword.match')
                      : t('auth.validations.confirmPassword.mustMatch')}
                  </div>
                )}
              </div>

              <button type="submit" className="ea-primary">
                {t("auth.resetPassword.title", { defaultValue: "Reset password" })}
              </button>
            </Form>
          )}
        </Formik>

        <p className="ea-altrow">
          <Link to="/login">{t("auth.validations.forgotPassword.backToLogin")}</Link>
        </p>
      </main>
    </AuthShell>
  );
};

export default ResetPassword;
