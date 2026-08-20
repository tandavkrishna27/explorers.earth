import { useMutation } from "@apollo/client";
import {
  FormValues,
  registerInitialValues,
  getRegisterFormFields,
  createRegisterValidationSchema,
} from "../features/Authentication/data";
import { useNavigate, useLocation } from "react-router-dom";
import AuthForm from "../features/Authentication/components/AuthForm";
import AuthLayout from "../components/auth/AuthLayout";
import AuthShell from "../components/auth/AuthShell";
import { registerQuery } from "../features/Authentication/api/mutation";
import { EarthLoader } from "../components/EarthLoader";
import useEmailStore from "../store/useEmailStore";
import { ApolloError } from "@apollo/client";
import { FormikHelpers } from "formik";
import { useState, useEffect, useMemo } from "react";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { createWebPageGEOData } from "../utils/geoHelpers";
import { useTranslation } from "react-i18next";
import useToast from "../hooks/useToast";
import { isManualAuthEnabled } from "../config/featureFlags";
import { storeUserCredentials } from "../utils/sessionCredentials";

const Auth = () => {
  const { t, i18n } = useTranslation();
  const [register, { loading }] = useMutation(registerQuery);
  const navigate = useNavigate();
  const location = useLocation();
  const { setEmail } = useEmailStore();
  const { toastSuccess, toastError } = useToast();

  // Create validation schema that updates when language changes
  const validationSchema = useMemo(() => {
    return createRegisterValidationSchema(t);
  }, [t, i18n.language]);

  // Initialize form state with potential pre-filled username from URL
  const [formState, setFormState] = useState<FormValues>(() => {
    const urlParams = new URLSearchParams(location.search);
    const prefilledUsername = urlParams.get("username");

    return {
      ...registerInitialValues,
      // Pre-fill username if provided in URL params
      username: prefilledUsername || registerInitialValues.username,
    };
  });

  // Update form state if URL params change (edge case handling)
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const prefilledUsername = urlParams.get("username");

    if (prefilledUsername && prefilledUsername !== formState.username) {
      setFormState((prev) => ({
        ...prev,
        username: prefilledUsername,
      }));
    }
  }, [location.search, formState.username]);

  const handleSubmit = async (
    values: FormValues,
    formikHelpers: FormikHelpers<FormValues>
  ) => {
    setFormState(values);
    try {
      // Create user in explorers/Strapi only
      const response = await register({
        variables: {
          input: {
            email: values.email,
            password: values.password,
            username: values.username,
          },
        },
      });

      if (response.data) {
        // Store user credentials in session storage for Local Tunes integration
        storeUserCredentials({
          username: values.username as string,
          email: values.email as string,
          password: values.password as string
        });

        setEmail({ email: values.email as string });
        toastSuccess(t("toast.success.registrationSuccessful"));
        // navigate to the email verification page
        navigate("/email-verification");
      }
    } catch (err: unknown) {
      let errorMessage = t("toast.error.registrationFailed");
      let shouldNavigateToVerification = false;

      if (err instanceof ApolloError) {
        const serverError = err.graphQLErrors?.[0]?.message;

        if (serverError) {
          // Map server errors to localized messages
          if (
            serverError.toLowerCase().includes("username") &&
            serverError.toLowerCase().includes("already exists")
          ) {
            errorMessage = t("toast.error.usernameAlreadyExists");
            formikHelpers.setErrors({
              username: t("auth.validations.username.alreadyExists"),
            });
          } else if (
            serverError.toLowerCase().includes("email") &&
            serverError.toLowerCase().includes("already exists")
          ) {
            errorMessage = t("toast.error.emailAlreadyExists");
            formikHelpers.setErrors({
              email: t("auth.validations.email.alreadyExists"),
            });
          } else if (serverError.toLowerCase().includes("invalid email")) {
            errorMessage = t("toast.error.invalidEmailFormat");
            formikHelpers.setErrors({
              email: t("auth.validations.email.invalidFormat"),
            });
          } else if (
            serverError.toLowerCase().includes("password") &&
            serverError.toLowerCase().includes("weak")
          ) {
            errorMessage = t("toast.error.passwordTooWeak");
            formikHelpers.setErrors({
              password: t("auth.validations.password.required"),
            });
          } else if (
            serverError.toLowerCase().includes("email") &&
            serverError.toLowerCase().includes("confirmation") &&
            serverError.toLowerCase().includes("send")
          ) {
            // User created successfully but email confirmation failed to send
            errorMessage = t("toast.error.emailConfirmationSendingFailed");
            shouldNavigateToVerification = true;
            setEmail({ email: values.email as string });
          } else if (serverError.toLowerCase().includes("validation")) {
            errorMessage = t("toast.error.validationError");
          } else if (serverError.toLowerCase().includes("network")) {
            errorMessage = t("toast.error.networkError");
          } else if (serverError.toLowerCase().includes("server")) {
            errorMessage = t("toast.error.serverError");
          } else {
            errorMessage = t("toast.error.registrationFailed");
          }
        }

        toastError(errorMessage);

        // If user was created but email confirmation failed, navigate to verification page
        if (shouldNavigateToVerification) {
          navigate("/email-verification");
        }

        formikHelpers.setSubmitting(false);
      } else {
        toastError(errorMessage, { id: "register-error" });
      }

      console.error(err);
    }
  };

  const handleGoogleSignUp = () => {
    // Use the same hardcoded absolute backend URL as Login.tsx.
    // VITE_REST_API_URL can be a relative path (/api) in some build configs,
    // which would produce an invalid OAuth initiation URL.
    // prompt=select_account forces Google to show the account chooser even when
    // the user already has an active Google session in the same browser window.
    const backendBase = "https://api.localqr.earth/api";
    window.location.href = `${backendBase}/connect/google?prompt=select_account`;
  };

  // Generate GEO data for register page
  const geoData = createWebPageGEOData({
    pageType: "register",
    title: "Sign Up for explorers",
    description:
      "Create your explorers account to share favorite places, discover hidden gems, and join the location-based community",
    keywords: ["sign up", "register", "create account", "join community"],
    purpose:
      "create an account to share local recommendations and discover places",
  });

  if (loading)
    return (
      <div className="bg-black">
        <EarthLoader context="login" />
      </div>
    );

  return (
    <>
      <SEO
        title={t("seo.registerTitle")}
        description="Create your explorers account and unlock a world of personalized recommendations. Sign up to share your favorite places, discover hidden gems, and be part of a location-based community. Get started today – it's free and easy."
        keywords={[
          "sign up explorers",
          "join location recommendation app",
          "create account for travel tips",
          "local guide platform registration",
          "become an explorers member",
          "explore places near me",
          "personalized travel recommendations signup",
          "discover local spots",
          "travel and city guide sign up",
          "register to share favorite places",
          "community of local explorers",
          "user generated places platform",
          "find and share places account",
          "register travel app",
          "free local recommendations membership",
          "register explorers",
          "sign up",
          "create QR code account",
          "join explorers",
          "local recommendations signup",
          "QR code registration",
          "new account",
          "explorers membership",
          "place sharing account",
          "travel recommendations signup",
        ]}
        canonical={createCanonicalUrl("/register")}
        type="website"
        noIndex={true}
        enableGEO={true}
        geoData={geoData}
      />

      {isManualAuthEnabled() ? (
        // Manual registration form (active) on the Earthrise scene
        <AuthShell>
          <div className="ea-formhost dashboard-theme-dark">
            <AuthForm
              initialValues={formState}
              validationSchema={validationSchema as any}
              onSubmit={handleSubmit}
              heading={t("auth.signup")}
              description={t("auth.signupSubtitle")}
              formFields={getRegisterFormFields(t)}
              submitButtonLabel={t("auth.register")}
              GoogleAuthHandler={handleGoogleSignUp}
              googleButtonLabel={t("auth.signUpWithGoogle")}
              isRegistration={true}
              enablePasswordValidation={true}
              turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
              children={
                <div className="flex flex-col items-center gap-2">
                  <div className="flex justify-center items-center gap-1">
                    <p className="text-xs">{t("auth.alreadyHaveAccount")}</p>
                    <a href="/login" className="text-dashboard-accent underline text-xs">
                      {t("auth.login")}
                    </a>
                  </div>
                  <a href="/claimaccount" className="text-dashboard-accent underline text-xs">
                    Claim Existing Account?
                  </a>
                </div>
              }
            />
          </div>
        </AuthShell>
      ) : (
        // OAuth-only registration — "Earthrise" brand screen
        <AuthLayout
          eyebrow={t("auth.brand.tagline", "Every place connects us")}
          title={t("auth.register.title2", "Map your world.")}
          subtitle={t("auth.register.sub2", "Curate the places, films and sounds you love — and share your world in one link.")}
          googleLabel={t("auth.signUpWithGoogle")}
          onGoogle={handleGoogleSignUp}
          termsPrefix={t("auth.terms.prefix", "By continuing you agree to our")}
          termsLabel={t("auth.terms.terms", "Terms")}
          privacyLabel={t("auth.terms.privacy", "Privacy Policy")}
          andWord={t("common.and", "and")}
          switchPrompt={t("auth.alreadyHaveAccount")}
          switchCta={t("auth.login")}
          switchTo="/login"
          secureLabel={t("auth.secureSignIn", "Secure sign-in")}
          helpers={[{ label: t("auth.claimAccount", "Claim account"), to: "/claimaccount" }]}
        />
      )}
    </>
  );
};

export default Auth;
