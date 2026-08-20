import { useMutation } from "@apollo/client";
import { resetPasswordMutation } from "../features/Authentication/api/mutation";
import { Formik, Form, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { EarthLoader } from "../components/EarthLoader";
import { ApolloError } from "@apollo/client";
import PasswordInput from "../components/ui/PasswordInput";
import { validatePassword } from "../utils/passwordValidator";
import { useTranslation } from "react-i18next";
import { isManualAuthEnabled } from "../config/featureFlags";
import { useEffect } from "react";
import AuthShell from "../components/auth/AuthShell";

const ResetPassword = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code");

  // MANUAL AUTH DISABLED - Redirect to login for OAuth-only mode
  useEffect(() => {
    if (!isManualAuthEnabled()) {
      toast.error(t('auth.manualAuthDisabled') || 'Password reset is not available. Please sign in with Google.');
      navigate('/login', { replace: true });
    }
  }, [navigate, t]);

  const [resetPassword, { loading }] = useMutation(resetPasswordMutation);

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

  const handleSubmit = async (values: typeof initialValues) => {
    if (!code) {
      toast.error(t('toast.error.invalidToken'));
      console.error("Code is missing from URL!");
      return;
    }

    // Validate password using centralized validator
    const passwordValidation = validatePassword(values.password, {}, t);
    if (!passwordValidation.isValid) {
      toast.error(t('toast.error.validationError'));
      return;
    }

    try {
      const variables = {
        password: values.password,
        passwordConfirmation: values.confirmPassword,
        code,
      };

      const response = await resetPassword({ variables });

      if (response.data?.resetPassword?.user) {
        toast.success(t('toast.success.passwordResetSuccessful'));
        navigate("/login");
      } else {
        const message = response.data?.resetPassword?.message || t('toast.error.passwordResetFailed');
        toast.error(message);
        console.error("Server message:", message);
      }
    } catch (error: unknown) {
      console.error("Caught Error object:", error);

      if (error instanceof ApolloError) {
        const serverError = error.graphQLErrors?.[0]?.message;
        if (serverError) {
          if (serverError.toLowerCase().includes("invalid token") ||
            serverError.toLowerCase().includes("expired token")) {
            toast.error(t('toast.error.expiredToken'));
          } else if (serverError.toLowerCase().includes("password") &&
            serverError.toLowerCase().includes("weak")) {
            toast.error(t('toast.error.passwordTooWeak'));
          } else if (serverError.toLowerCase().includes("validation")) {
            toast.error(t('toast.error.validationError'));
          } else {
            toast.error(t('toast.error.passwordResetFailed'));
          }
        } else {
          toast.error(t('toast.error.passwordResetFailed'));
        }
        console.error("GraphQL Error from Server:", serverError);
      } else {
        toast.error(t('toast.error.passwordResetFailed'));
      }
    }
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
