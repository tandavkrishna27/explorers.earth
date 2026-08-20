import { useMutation } from "@apollo/client";
import { forgotPasswordMutation } from "../features/Authentication/api/mutation";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast } from "sonner";
import { EarthLoader } from "../components/EarthLoader";
import { ApolloError } from "@apollo/client";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { isManualAuthEnabled } from "../config/featureFlags";
import { useEffect } from "react";
import AuthShell from "../components/auth/AuthShell";

const ForgotPassword = () => {
  const { t } = useTranslation();
  const [forgotPassword, { loading }] = useMutation(forgotPasswordMutation);
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

  const handleSubmit = async (values: typeof initialValues) => {
    try {
      const response = await forgotPassword({
        variables: { email: values.email },
      });

      if (response.data.forgotPassword.ok) {
        toast.success(t('toast.success.resetLinkSent'));
        navigate("/reset-link-sent", { state: { email: values.email } });
      } else {
        toast.error(t('toast.error.resetLinkFailed'));
      }
    } catch (error: unknown) {
      if (error instanceof ApolloError) {
        const serverError = error.graphQLErrors?.[0]?.message;
        if (serverError) {
          if (serverError.toLowerCase().includes("email not found")) {
            toast.error(t('toast.error.emailNotFound'));
          } else if (serverError.toLowerCase().includes("invalid email")) {
            toast.error(t('toast.error.invalidEmailFormat'));
          } else if (serverError.toLowerCase().includes("rate limit")) {
            toast.error(t('toast.error.rateLimitExceeded'));
          } else {
            toast.error(t('toast.error.resetLinkFailed'));
          }
        } else {
          toast.error(t('toast.error.resetLinkFailed'));
        }
      } else {
        toast.error(t('toast.error.resetLinkFailed'));
      }
      console.error(error);
    }
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
