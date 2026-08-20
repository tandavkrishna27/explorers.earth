import { useMutation } from "@apollo/client";
import {
  getLoginFormFields,
  loginInitialValues,
  FormValues,
  createLoginValidationSchema,
} from "../features/Authentication/data";
import { useNavigate } from "react-router-dom";
import AuthForm from "../features/Authentication/components/AuthForm";
import useAuthStore from "../store/store";
import { loginQuery } from "../features/Authentication/api/mutation";
import { EarthLoader } from "../components/EarthLoader";
import { ApolloError } from "@apollo/client";
import { FormikHelpers } from "formik";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { createWebPageGEOData } from "../utils/geoHelpers";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import useToast from "../hooks/useToast";
import { isManualAuthEnabled } from "../config/featureFlags";
import { storeUserCredentials } from "../utils/sessionCredentials";
import { consumeSsoReturn } from "../utils/tunesSso";
import AuthLayout from "../components/auth/AuthLayout";
import AuthShell from "../components/auth/AuthShell";

const Login = () => {
  const { t, i18n } = useTranslation();
  const [login, { loading }] = useMutation(loginQuery);
  const navigate = useNavigate();
  const loginState = useAuthStore((state) => state.login);
  const { toast, toastError } = useToast();

  // Track complete login flow including SSO
  const [isCompletingLogin, setIsCompletingLogin] = useState(false);
  const [loginStatus, setLoginStatus] = useState<string>('');
  const [blockedAccount, setBlockedAccount] = useState(false);

  // Create validation schema that updates when language changes
  const validationSchema = useMemo(() => {
    return createLoginValidationSchema(t);
  }, [t, i18n.language]);

  // Enhanced submit with field-level error handling
  const handleSubmit = async (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>
  ) => {
    try {
      setIsCompletingLogin(true);
      setLoginStatus(t('auth.status.authenticating') || 'Authenticating...');

      const response = await login({
        variables: {
          input: {
            identifier: values.username,
            password: values.password,
          },
        },
      });

      if (response.data) {
        const userData = {
          token: response.data.login.jwt,
          documentId: response.data.login.user.documentId,
          blocked: response.data.login.user.blocked,
          id: response.data.login.user.id,
          email: response.data.login.user.email,
          username: response.data.login.user.username,
        };

        // Store user credentials in session storage for Local Tunes integration
        storeUserCredentials({
          username: String(values.username),
          email: String(userData.email),
          password: String(values.password)
        });

        loginState(userData);
        localStorage.setItem("qrtoken", response.data.login.jwt);



        // Show success toast only after all operations complete
        toast(t("toast.success.loginSuccessful"));

        // Small delay to ensure user sees the success message
        await new Promise(resolve => setTimeout(resolve, 500));

        const dest = consumeSsoReturn(Date.now());
        navigate(dest ?? "/home");
      }
    } catch (err) {
      setIsCompletingLogin(false);
      setLoginStatus('');
      let errorMessage = t("toast.error.loginFailed");

      if (err instanceof ApolloError) {
        const serverError = err?.graphQLErrors?.[0]?.message;

        if (serverError) {
          // Map server errors to localized messages
          if (
            serverError.toLowerCase().includes("invalid identifier") ||
            serverError.toLowerCase().includes("invalid credentials")
          ) {
            errorMessage = t("toast.error.invalidCredentials");
            formikHelpers.setErrors({
              username: t("auth.validations.login.invalidCredentials"),
            });
          } else if (
            serverError.toLowerCase().includes("invalid password") ||
            serverError.toLowerCase().includes("incorrect password")
          ) {
            errorMessage = t("toast.error.invalidCredentials");
            formikHelpers.setErrors({
              password: t("auth.validations.login.incorrectPassword"),
            });
          } else if (serverError.toLowerCase().includes("account not found")) {
            errorMessage = t("toast.error.invalidCredentials");
            formikHelpers.setErrors({
              username: t("auth.validations.login.invalidCredentials"),
            });
          } else if (serverError.toLowerCase().includes("too many attempts")) {
            errorMessage = t("toast.error.tooManyAttempts");
          } else if (serverError.toLowerCase().includes("account locked")) {
            errorMessage = t("toast.error.accountLocked");
          } else if (
            serverError.toLowerCase().includes("blocked") ||
            serverError.toLowerCase().includes("banned")
          ) {
            // Account is deactivated — show reactivation banner instead of a toast
            setBlockedAccount(true);
            return; // skip the generic toast below
          } else if (serverError.toLowerCase().includes("account suspended")) {
            errorMessage = t("toast.error.accountSuspended");
          } else if (serverError.toLowerCase().includes("session expired")) {
            errorMessage = t("toast.error.sessionExpired");
          } else {
            errorMessage = t("toast.error.loginFailed");
          }
        }
      }

      toastError(errorMessage, { id: "login-error" });
      console.error(err);
    } finally {
      formikHelpers.setSubmitting(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Initiation must happen on the backend domain (api.localqr.earth)
    // so the session cookie is correctly bound for the Google callback.
    // prompt=select_account forces Google to always show the account chooser,
    // even when the user has an active Google session in the same browser window.
    // Without this, logging out of the app and clicking "Sign in" again would
    // silently re-authenticate with the previous Google account.
    const backendBase = "https://api.localqr.earth/api";
    window.location.href = `${backendBase}/connect/google?prompt=select_account`;
  };

  // Generate GEO data for login page
  const geoData = createWebPageGEOData({
    pageType: "login",
    title: "Login to explorers",
    description:
      "Sign in to your explorers account to access your personalized QR codes and local recommendations",
    keywords: ["login", "sign in", "user account", "authentication"],
    purpose:
      "sign in to access personalized local recommendations and QR codes",
  });

  if (loading || isCompletingLogin)
    return (
      <div className="dashboard-theme dashboard-theme-dark bg-dashboard-bg min-h-screen">
        <EarthLoader context="login" statusMessage={loginStatus || undefined} />
      </div>
    );

  return (
    <>
      <SEO
        title={t("seo.loginTitle")}
        description="Sign in to your explorers account to view and manage your personalized QR codes and local recommendations. Access your favorite location list places anytime and share them with the world."
        keywords={[
          "login explorers",
          "sign in to recommendations app",
          "access personalized travel guides",
          "view favorite places account",
          "location based login",
          "user account explorers",
          "my travel recommendations login",
          "manage local spots",
          "curated places login",
          "discover and share places",
          "local guide app sign in",
          "travel app user login",
          "access my recommendations",
          "city guide account access",
          "explorers account login",
          "sign in",
          "QR code account",
          "local recommendations login",
          "access account",
          "user login",
          "explorers signin",
          "account access",
          "QR recommendations",
        ]}
        canonical={createCanonicalUrl("/login")}
        type="website"
        noIndex={true}
        enableGEO={true}
        geoData={geoData}
      />

      {isManualAuthEnabled() ? (
        // Manual username/password form (active) on the Earthrise scene
        <AuthShell>
          <div className="ea-formhost dashboard-theme-dark">
            <AuthForm
              initialValues={loginInitialValues}
              validationSchema={validationSchema}
              onSubmit={handleSubmit}
              formFields={getLoginFormFields(t)}
              submitButtonLabel={t("auth.loginTitle")}
              heading={t("auth.loginTitle")}
              description={t("auth.loginSubtitle")}
              GoogleAuthHandler={handleGoogleSignIn}
              googleButtonLabel={t("auth.signInWithGoogle")}
              isRegistration={false}
              children={
                <div className="flex flex-col items-center gap-2 mt-2">
                  {blockedAccount && (
                    <div className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center mb-1">
                      <p className="text-amber-400 text-sm font-medium">
                        {t("auth.blockedAccount.message")}
                      </p>
                      <a
                        href="/reactivate"
                        className="inline-block mt-2 text-sm font-semibold text-amber-300 underline hover:text-amber-200 transition-colors"
                      >
                        {t("auth.blockedAccount.reactivateLink")}
                      </a>
                    </div>
                  )}
                  <div className="flex justify-center items-center gap-1">
                    <p className="text-xs">{t("auth.newToExplorers")}</p>
                    <a href="/register" className="text-dashboard-accent underline text-xs">
                      {t("auth.register")}
                    </a>
                  </div>
                  <div className="flex justify-center items-center gap-4">
                    <a href="/forgot-password" className="text-dashboard-accent underline text-xs">
                      {t("auth.forgotPassword")}
                    </a>
                    <a href="/claimaccount" className="text-dashboard-accent underline text-xs">
                      {t("auth.claimAccount")}
                    </a>
                  </div>
                </div>
              }
            />
          </div>
        </AuthShell>
      ) : (
        // OAuth-only authentication — "Earthrise" brand screen
        <AuthLayout
          eyebrow={t("auth.brand.tagline", "Every place connects us")}
          title={t("auth.login.title2", "Welcome back, explorer.")}
          subtitle={t("auth.login.sub2", "Your map is right where you left it.")}
          googleLabel={t("auth.signInWithGoogle")}
          onGoogle={handleGoogleSignIn}
          termsPrefix={t("auth.terms.prefix", "By continuing you agree to our")}
          termsLabel={t("auth.terms.terms", "Terms")}
          privacyLabel={t("auth.terms.privacy", "Privacy Policy")}
          andWord={t("common.and", "and")}
          switchPrompt={t("auth.newToExplorers")}
          switchCta={t("auth.register")}
          switchTo="/register"
          secureLabel={t("auth.secureSignIn", "Secure sign-in")}
          helpers={[
            { label: t("auth.forgotPassword"), to: "/forgot-password" },
            { label: t("auth.claimAccount"), to: "/claimaccount" },
          ]}
        />
      )}
    </>
  );
};

export default Login;
