import {
  FormValues,
  registerInitialValues,
  getRegisterFormFields,
  createRegisterValidationSchema,
} from "../features/Authentication/data";
import { useLocation } from "react-router-dom";
import AuthForm from "../features/Authentication/components/AuthForm";
import AuthLayout from "../components/auth/AuthLayout";
import AuthShell from "../components/auth/AuthShell";
import { EarthLoader } from "../components/EarthLoader";
import { FormikHelpers } from "formik";
import { useState, useEffect, useMemo } from "react";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { createWebPageGEOData } from "../utils/geoHelpers";
import { useTranslation } from "react-i18next";
import { isManualAuthEnabled } from "../config/featureFlags";
import { authClient } from "../lib/authClient";
import useAuthStore from "../store/store";

/**
 * Ticket 2.4. Password authentication does not exist canonically - betterAuth.ts sets
 * emailAndPassword: {enabled: false} and Login offers only Google - so there is no
 * canonical operation for this page to call, and the Strapi one it used to call created
 * credentials that no sign-in path would have accepted.
 *
 * The page already renders Google-only (ENABLE_MANUAL_AUTH is false), which is the visible
 * change ticket 2.4 line 45 records as agreed. This makes the submit path refuse by
 * construction rather than merely be unrendered.
 */
const manualAuthUnavailable = () => {
  throw new Error('Password sign-up is unavailable. Please continue with Google.');
};

const Auth = () => {
  const { t, i18n } = useTranslation();
  const loading = false;
  const location = useLocation();
  const [error, setError] = useState("");
  const logoutError = useAuthStore((state) => state.logoutError);

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
    _formikHelpers: FormikHelpers<FormValues>
  ) => {
    // The form state is still kept, so a redirect back from Google does not lose what was
    // typed; the credential creation is what is gone.
    setFormState(values);
    manualAuthUnavailable();
  };

  // Canonical sign-up is the same operation as canonical sign-in: Better Auth creates
  // the account on the first Google callback. startGoogleSignIn is async and throws on
  // every failure path, so the rejection has to be caught and shown - the previous
  // handler redirected to Strapi's /connect/google unconditionally, which a platform
  // build cannot reach at all.
  const handleGoogleSignUp = () => {
    if (logoutError) return;
    void authClient
      .startGoogleSignIn()
      .catch(() => setError("Google sign-in is unavailable. Please try again."));
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

      {(error || logoutError) && (
        <div role="alert" className="bg-black text-center text-amber-300 py-3">
          {error ||
            "Server sign-out is incomplete. Retry signing out before using this account."}
        </div>
      )}

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
        />
      )}
    </>
  );
};

export default Auth;
