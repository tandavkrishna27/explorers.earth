import AuthForm from "../features/Authentication/components/AuthForm";
import {
  FormValues,
  onboardingInitialValues,
} from "../features/Authentication/data";
import useAuthStore from "../store/store";
import { toast } from "sonner";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import Button from "../components/ui/Button";
import * as Yup from "yup";
import ImageCropper from "../components/ImageCropper";
import axios from "axios";
import { IMAGE_CONFIG } from "../config";
import AddressInput from "../features/Profile/components/AddressInput";
import { useReverseGeocoding } from "../features/Profile/hooks/useReverseGeocoding";
import { Places } from "../features/Profile/types/types";
import { mapAddressComponents } from "../utils/mapAddress";
import CurrLocation from "../assets/icons/CurrLocation";
import { AuthFormField } from "../features/Authentication/components/AuthForm";
import { GOOGLE_GEOCODING_BASE_URL } from "../config";
import { createUsernameValidation } from "../features/Authentication/data";
import Modal from "../components/ui/Modal";

//import { usernameValidation } from "../features/Authentication/data";

import { useUserForOnboarding } from "../features/Authentication/hooks/useCurrentUser";
import { EarthLoader } from "../components/EarthLoader";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { LogOut, ArrowLeft } from "lucide-react";
import GlobeCanvas from "../components/auth/GlobeCanvas";
import OnboardingProgress from "../components/onboarding/OnboardingProgress";
import {
  createFinalizeLock,
  beginFinalize,
  endFinalize,
} from "./onboardingFinalizeLock";
import { useLogout } from "../hooks/useLogout";
import { useCanonicalAccount } from "../features/Profile/api/useCanonicalAccount";
import { explorersApiClient } from "../lib/explorersApiClient";

// Get account fields with i18n translations
const getAccountFields = (t: any) => [
  {
    name: "accountName",
    label: t("auth.onboarding.accountDetails.displayName"),
    type: "text",
    placeholder: t("auth.onboarding.accountDetails.displayNamePlaceholder"),
  },
  {
    name: "username",
    label: t("auth.onboarding.accountDetails.username"),
    type: "text",
    placeholder: t("auth.onboarding.accountDetails.usernamePlaceholder"),
    helperText: t("auth.onboarding.accountDetails.usernameDescription"),
  },
  {
    name: "bio",
    label: t("auth.onboarding.accountDetails.bio"),
    type: "textarea",
    as: "textarea",
    placeholder: t("auth.onboarding.accountDetails.bioPlaceholder"),
  },
  {
    name: "accountType",
    label: t("auth.onboarding.accountDetails.accountType"),
    type: "customRadio",
    options: [
      {
        value: t("auth.validations.accountType.personal"),
        label: t("auth.onboarding.accountDetails.personal"),
      },
      {
        value: t("auth.validations.accountType.creator"),
        label: t("auth.onboarding.accountDetails.creator"),
      },
      {
        value: t("auth.validations.accountType.business"),
        label: t("auth.onboarding.accountDetails.business"),
      },
    ],
  },
];

// Get contact fields with i18n translations
const getContactFields = (t: any) => [
  {
    name: "mobile_number",
    label: t("auth.onboarding.contactDetails.mobileNumber"),
    type: "text",
    placeholder: t("auth.onboarding.contactDetails.mobileNumberPlaceholder"),
  },
];

// Extended address fields to match profile - will be updated with i18n in component
const getAddressFields = (t: any) => [
  {
    name: "address",
    label: t("auth.onboarding.addressDetails.address"),
    type: "address",
    placeholder: t("auth.onboarding.addressDetails.addressPlaceholder"),
    isRequired: true,
  },
  {
    name: "streetName",
    label: t("auth.onboarding.addressDetails.streetName"),
    type: "text",
    placeholder: t("auth.onboarding.addressDetails.streetNamePlaceholder"),
  },
  {
    name: "city",
    label: t("auth.onboarding.addressDetails.city"),
    type: "text",
    placeholder: t("auth.onboarding.addressDetails.cityPlaceholder"),
    isRequired: true,
  },
  {
    name: "state",
    label: t("auth.onboarding.addressDetails.state"),
    type: "text",
    placeholder: t("auth.onboarding.addressDetails.statePlaceholder"),
    isRequired: true,
  },
  {
    name: "country",
    label: t("auth.onboarding.addressDetails.country"),
    type: "text",
    placeholder: t("auth.onboarding.addressDetails.countryPlaceholder"),
    isRequired: true,
  },
  {
    name: "postalCode",
    label: t("auth.onboarding.addressDetails.postalCode"),
    type: "text",
    placeholder: t("auth.onboarding.addressDetails.postalCodePlaceholder"),
    isRequired: true,
  },
  // Separator item
  {
    name: "separator",
    type: "separator",
  },
  // Primary address fields
  {
    name: "primaryAddress",
    label: t("auth.onboarding.addressDetails.primaryAddressDescription"),
    type: "primaryAddressCombined",
    placeholder: t("auth.onboarding.addressDetails.primaryAddressPlaceholder"),
    isRequired: true,
  },
];

// Step-specific validation schemas
const createAccountValidationSchema = (t: any) =>
  Yup.object({
    accountName: Yup.string()
      .required(t("auth.validations.onboarding.displayNameRequired"))
      .min(2, t("auth.validations.onboarding.displayNameMinLength"))
      .max(50, t("auth.validations.onboarding.displayNameMaxLength")),
    username: createUsernameValidation(t),
    bio: Yup.string()
      .required(t("auth.validations.onboarding.bioRequired"))
      .max(250, t("auth.validations.onboarding.bioMaxLength")),
    accountType: Yup.string()
      .oneOf(
        [
          t("auth.validations.accountType.personal"),
          t("auth.validations.accountType.creator"),
          t("auth.validations.accountType.business"),
        ],
        t("auth.validations.accountType.invalid")
      )
      .required(t("auth.validations.accountType.required")),
  });

const contactValidationSchema = (t: any) =>
  Yup.object({
    mobile_number: Yup.string()
      .required(t("auth.validations.onboarding.mobileNumberRequired"))
      .test(
        "phone-validation",
        t("auth.validations.onboarding.mobileNumberInvalid"),
        function (value) {
          if (!value) return false;

          console.log("Validating phone number:", value);

          try {
            // Use libphonenumber-js to validate the phone number
            const phoneNumber = parsePhoneNumberFromString(value);
            console.log("Parsed phone number:", phoneNumber);

            if (phoneNumber && phoneNumber.isValid()) {
              console.log("Phone number is valid");
              return true;
            }

            // If the phone number is not valid, try to provide a more specific error
            if (phoneNumber) {
              const error = phoneNumber.getPossibleCountries();
              console.log("Possible countries:", error);
              if (error.length === 0) {
                return this.createError({
                  message: t("auth.validations.onboarding.mobileNumberInvalid"),
                });
              }
            }

            console.log("Phone number validation failed");
            return false;
          } catch (error) {
            console.warn("Phone number validation error:", error);

            // Fallback: basic validation for international format
            const internationalFormat = /^\+[1-9]\d{1,14}$/;
            if (internationalFormat.test(value)) {
              console.log("Phone number passed fallback validation");
              return true;
            }

            return false;
          }
        }
      ),
  });

const addressValidationSchema = (t: any) =>
  Yup.object({
    address: Yup.string().required(
      t("auth.validations.onboarding.addressRequired")
    ),
    primaryAddress: Yup.string().required(
      t("auth.validations.onboarding.primaryAddressRequired")
    ),
    city: Yup.string().required(t("auth.validations.onboarding.cityRequired")),
    country: Yup.string().required(
      t("auth.validations.onboarding.countryRequired")
    ),
    streetName: Yup.string().default(""),
    state: Yup.string().required(
      t("auth.validations.onboarding.stateRequired")
    ),
    postalCode: Yup.string().required(
      t("auth.validations.onboarding.postalCodeRequired")
    ),
  });

/**
 * ONBOARDING COMPONENT - REFACTORED FOR USERNAME SYNCHRONIZATION
 *
 * This component has been refactored to implement proper username handling:
 *
 * 1. USERNAME PRE-POPULATION:
 *    - Fetches user's registered username from Strapi using useUserForOnboarding hook
 *    - Automatically pre-fills username field in the first onboarding step
 *    - Provides visual indicator to user that field was pre-filled from registration
 *
 * 2. USERNAME VALIDATION & EDITING:
 *    - Uses OnboardingUsernameInput component with real-time validation
 *    - Allows users to edit username if needed during onboarding
 *    - Validates username availability and format in real-time
 *    - Provides suggestions for invalid usernames
 *
 * 3. USERNAME SYNCHRONIZATION:
 *    - If username is edited during onboarding, updates both:
 *      a) User collection (users-permissions-users) via GraphQL mutation
 *      b) Account document via the account creation mutation
 *    - Updates auth store with new username for consistent state
 *    - Maintains data integrity between user collection and account documents
 *
 * 4. ERROR HANDLING:
 *    - Graceful fallback if user data can't be fetched
 *    - Proper error messages if username update fails
 *    - Maintains original username if update operations fail
 *
 * 5. UX IMPROVEMENTS:
 *    - Loading state while fetching user data
 *    - Visual indicators for pre-filled fields
 *    - Helper text explaining username pre-population
 *    - Comprehensive validation feedback
 *
 * DEPENDENCIES:
 * - useUserForOnboarding: Centralized hook for fetching user data
 * - OnboardingUsernameInput: Specialized component for username input with validation
 * - updateUserMutation: GraphQL mutation for updating user collection
 * - Auth store: Global state management for user authentication
 */

const OnBoarding = () => {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  // Synchronous re-entrancy lock for step submission. The floating footer button
  // submits AuthForm via the form= attribute, but its disabled state reads the
  // PARENT isSubmitting, which handleStepSubmit never sets (Formik's submitting
  // state is internal). So a rapid double-click could fire two submits that both
  // pass async validation and call handleNext() twice — skipping the required
  // phone step (incomplete account) or overrunning the steps array (crash). This
  // ref flips synchronously before the first await; released in the finally.
  const stepSubmitLock = useRef(false);
  const [hasShownAccountExistsToast] =
    useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);

  const storedUsername = useAuthStore((state) => state.user?.username);
  const documentId = useAuthStore((state) => state.user?.documentId);
  const endSession = useLogout();
  // const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
 
  const [showLogoutModal, setShowLogoutModal] = useState(false);
 
  const handleLogout = async () => {
    setShowLogoutModal(false);
    await endSession();
  };


  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  // Synchronous re-entrancy lock for the free-plan finalize/create path (guards
  // against a double-click creating duplicate accounts; see onboardingFinalizeLock).
  const finalizeLockRef = useRef(createFinalizeLock());

  // Only fetch user data if we don't already have a username and haven't submitted
  const shouldFetchUser =
    !storedUsername && !hasShownAccountExistsToast && !hasSubmitted;

  /**
   * Fetch current user data from Strapi for pre-populating the username field.
   * This ensures the username displayed in onboarding matches the registered username.
   * Only fetch if we don't already have a username and we're authenticated.
   */
  const {
    username: fetchedUsername,
    loading: userLoading,
    error: userError,
  } = useUserForOnboarding(!shouldFetchUser);

  const [formData, setFormData] = useState({
    ...onboardingInitialValues,
    address: "",
    primaryAddress: "",
    streetName: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
  });

  // Initialize form data with user data when available
  useEffect(() => {
    if (fetchedUsername && !formData.username) {
      setFormData((prev) => ({
        ...prev,
        username: fetchedUsername,
      }));
    }
  }, [fetchedUsername]);

  // Initialize form data with stored user data as fallback
  useEffect(() => {
    if (storedUsername && !formData.username && !fetchedUsername) {
      setFormData((prev) => ({
        ...prev,
        username: storedUsername,
      }));
    }
  }, [storedUsername, fetchedUsername]);

  // Handle returning from subscription page
  useEffect(() => {
    const state = location.state as any;
    if (state?.selectedPlan && !hasSubmitted && !isSubmitting) {
      // User selected a plan, restore form data and continue with submission
      const updatedFormData = {
        ...formData,
        ...(state.formData || {}),
      };
      setFormData(updatedFormData);
      // Automatically submit the form
      setTimeout(() => {
        handleSubmit(updatedFormData);
      }, 100);
    } else if (state?.skipSubscription && !hasSubmitted && !isSubmitting) {
      // The subscription choice is optional; onboarding completion remains authoritative.
      const updatedFormData = {
        ...formData,
        ...(state.formData || {}),
      };
      setFormData(updatedFormData);
      // Automatically submit the form
      setTimeout(() => {
        handleSubmit(updatedFormData);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Cleanup effect to prevent queries from running after component unmounts
  useEffect(() => {
    return () => {
      // This cleanup runs when component unmounts
      // Apollo Client will automatically cancel pending queries
    };
  }, []);

  // Loading timeout effect for user data fetching
  useEffect(() => {
    if (userLoading) {
      const timer = setTimeout(() => {
        setLoadingTimeout(true);
      }, 3000); // 3 second timeout

      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [userLoading]);

  /**
   * Handle errors when fetching user data
   * Only show toast for critical errors, not authentication issues
   */
  useEffect(() => {
    if (userError) {
      // Only show toast for network errors, not 401 authentication errors
      if (!userError.message?.includes("401")) {
        toast.error(t("toast.error.onboardingFailed"));
      }
    }
  }, [userError]);

  // Image states
  const [tempProfileImage, setTempProfileImage] = useState<File | null>(null);
  const [tempBackgroundImage, setTempBackgroundImage] = useState<File | null>(
    null
  );
  const [previewProfileImage, setPreviewProfileImage] = useState<string>("");
  const [previewBackgroundImage, setPreviewBackgroundImage] =
    useState<string>("");

  // Address states
  const [places, setPlaces] = useState<Places | null>(null);
  const { currentLocation, handleGetCurrentLocation } = useReverseGeocoding();

  // Check for existing accounts to prevent duplicates - only run on onboarding page
  const canonicalAccount = useCanonicalAccount();
  const accountCheckLoading = canonicalAccount.isLoading;
  const refetch = canonicalAccount.refetch;
  // Check if the canonical account has completed onboarding.
  const hasCompleteAccount = canonicalAccount.data?.onboardingStatus === "complete";

  // Redirect if account already exists and is complete
  useEffect(() => {
    if (!accountCheckLoading && hasCompleteAccount) {
      toast.info(t('toast.error.accountAlreadyExists'));
      navigate("/home");
    }
  }, [accountCheckLoading, hasCompleteAccount, navigate]);

  // Map address components for auto-fill
  const mappedAddressData = useMemo(() => {
    if (currentLocation?.address_components?.length) {
      return mapAddressComponents(currentLocation.address_components);
    }
    if (places?.address_components?.length) {
      return mapAddressComponents(places.address_components);
    }
    return {};
  }, [currentLocation, places]);

  const handleImageUpload = async (file: File) => {
    setTempProfileImage(file);
    const previewUrl = URL.createObjectURL(file);
    setPreviewProfileImage(previewUrl);
  };

  const handleBackgroundUpload = async (file: File) => {
    setTempBackgroundImage(file);
    const previewUrl = URL.createObjectURL(file);
    setPreviewBackgroundImage(previewUrl);
  };

  const handleAddressChange = (newAddress: string) => {
    setFormData((prev) => ({
      ...prev,
      address: newAddress,
      // Don't auto-fill primaryAddress with full address
      // Let it be filled from the useEffect when location data is processed
    }));
  };

  const handleDetectLocation = () => {
    handleGetCurrentLocation();
  };

  // Function to get postal code via reverse geocoding when missing
  const getPostalCodeFromCoordinates = async (lat: number, lng: number) => {
    try {
      const response = await axios.get(
        `${GOOGLE_GEOCODING_BASE_URL}?latlng=${lat},${lng}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY
        }`
      );

      if (response.data.results && response.data.results.length > 0) {
        const geocodedResult = response.data.results[0];
        const mappedData = mapAddressComponents(
          geocodedResult.address_components
        );
        return mappedData.postal_code;
      }
    } catch (error) {
      // Handle postal code fetch error silently
    }
    return null;
  };

  const [sameAsAddress, setSameAsAddress] = useState(false);

  const handleSameAsAddressChange = (checked: boolean) => {
    setSameAsAddress(checked);
    if (checked) {
      // Extract city and country from address fields
      const city = formData.city || "";
      const country = formData.country || "";
      setFormData((prev) => ({
        ...prev,
        primaryAddress:
          city && country ? `${city}, ${country}` : city || country,
      }));
    }
  };

  useEffect(() => {
    if (sameAsAddress) {
      const city = formData.city || "";
      const country = formData.country || "";
      setFormData((prev) => ({
        ...prev,
        primaryAddress:
          city && country ? `${city}, ${country}` : city || country,
      }));
    }
  }, [formData.city, formData.country, sameAsAddress]);

  // Auto-fill address fields when location is detected
  useEffect(() => {
    if (currentLocation || places) {
      const updateFormData = async () => {
        let postalCode = mappedAddressData.postal_code;

        // If postal code is missing and we have coordinates from places, try reverse geocoding
        if (!postalCode && places?.geometry?.location) {
          const lat = places.geometry.location.lat();
          const lng = places.geometry.location.lng();
          const reversedPostalCode = await getPostalCodeFromCoordinates(
            lat,
            lng
          );
          postalCode = reversedPostalCode || undefined;
        }

        setFormData((prev) => {
          const newFormData = {
            ...prev,
            address: currentLocation?.formatted_address || prev.address,
            streetName: mappedAddressData.street_name || prev.streetName,
            city: mappedAddressData.city || prev.city,
            state: mappedAddressData.state || prev.state,
            country: mappedAddressData.country || prev.country,
            postalCode: postalCode || prev.postalCode,
            // Don't auto-populate primaryAddress - let user control it explicitly
          };

          // Only update if there are actual changes
          if (JSON.stringify(newFormData) !== JSON.stringify(prev)) {
            return newFormData;
          }
          return prev;
        });
      };

      updateFormData();
    }
  }, [currentLocation, places, mappedAddressData]);

  const handleSubmit = async (values: FormValues) => {
    console.log("handleSubmit called with values:", values);
    console.log("hasCompleteAccount:", hasCompleteAccount);

    // Prevent duplicate submissions
    if (isSubmitting || hasSubmitted) {
      console.log("Submission already in progress or completed");
      toast.error(t('toast.error.submissionInProgress'));
      return;
    }

    // Check if account already exists to prevent duplicates
    if (hasCompleteAccount) {
      console.log("Account already exists, showing error");
      toast.error(t('toast.error.accountExistsRefresh'));
      return;
    }

    // Prevent submission if we've already shown the account exists toast
    if (hasShownAccountExistsToast) {
      console.log("Account exists toast already shown, preventing submission");
      return;
    }

    setIsSubmitting(true);

    try {
      // Always advance to Step 5 (Subscription Plans) - subscription is now mandatory for all registrations
      // Account creation will happen after subscription plan selection in handleSubscriptionSubmit
      console.log('Advancing to Step 5 (Subscription Plans)...');
      console.log('Account creation will happen after subscription plan selection');

      // Just advance to Step 5 (subscription plans)
      setActiveStep(4);
      setIsSubmitting(false); // Reset submitting state since we're not creating account yet
      return;
    } catch (err) {
      console.error("Onboarding error:", err);
      toast.error(t("toast.error.onboardingFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepSubmit = async (values: FormValues, formikHelpers: any) => {
    console.log("handleStepSubmit called with:", {
      values,
      formikHelpers,
      activeStep,
      stepsLength: steps.length,
    });

    // Prevent submission if already submitted or in progress
    if (hasSubmitted || isSubmitting) {
      console.log("Submission already completed or in progress");
      return;
    }

    // Synchronous guard: the footer button's disabled state can't see this step's
    // in-flight submission (parent isSubmitting is never set here; Formik's is
    // internal), so flip a ref before the first await to stop a double-click
    // advancing the step twice. Released in the finally below.
    if (stepSubmitLock.current) return;
    stepSubmitLock.current = true;

    // Validate the current step using the appropriate validation schema
    try {
      const currentStepSchema = steps[activeStep].validationSchema;
      await currentStepSchema.validate(values, { abortEarly: false });

      const updatedFormData = {
        ...formData,
        ...values,
      } as typeof formData;
      setFormData(updatedFormData);

      if (activeStep === 3) {
        // TEMPORARILY SKIPPING subscription plan step — auto-register with free plan.
        // To re-enable the plan selection UI, restore handleNext() here and
        // uncomment the 'Subscription Plans' step in the steps array below.
        console.log("Finalizing the selected plan...");
        await handleSubscriptionSubmitWithFreePlan(updatedFormData);
      } else if (activeStep === 4) {
        // Step 5 (Subscription Plans) - don't call handleSubmit, handled by handleSubscriptionSubmit
        console.log("Step 5 (Subscription Plans) - handled separately");
        // Do nothing here, the button in Step 5 UI calls handleSubscriptionSubmit directly
      } else if (activeStep === steps.length - 1) {
        // Fallback for other final steps
        console.log("Final step, calling handleSubmit with:", updatedFormData);
        await handleSubmit(updatedFormData as any);
      } else {
        console.log("Not final step, calling handleNext");
        handleNext();
      }
    } catch (error) {
      console.log("Validation failed:", error);
      if (error instanceof Yup.ValidationError) {
        // Set field errors in Formik
        const errors: { [key: string]: string } = {};
        error.inner.forEach((err) => {
          if (err.path) {
            errors[err.path] = err.message;
          }
        });
        formikHelpers.setErrors(errors);

        // Show toast for validation errors
        toast.error(t("toast.error.validationError"));
      }
    } finally {
      stepSubmitLock.current = false;
    }
  };

  const handleNext = () => {
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };


  // Handle Step 5 submission (subscription plan selection)
  // Accepts optional explicit plan/formData for programmatic calls (e.g. auto-free-plan).
  // When called from the plan selection UI, these params are undefined and state values are used.
  const handleSubscriptionSubmit = async (currentFormData: typeof formData) => {

    if (canonicalAccount.data) {
      if (!beginFinalize(finalizeLockRef.current)) return;
      setIsCreatingSubscription(true);
      const uploaded: string[] = [];
      try {
        const current = await explorersApiClient.getMyProfile();
        const profile = tempProfileImage ? await explorersApiClient.createMedia(tempProfileImage, "profile") : null;
        if (profile) uploaded.push(profile.id);
        const background = tempBackgroundImage ? await explorersApiClient.createMedia(tempBackgroundImage, "background") : null;
        if (background) uploaded.push(background.id);
        const type = String(currentFormData.accountType).toLowerCase();
        await explorersApiClient.updateAccount({ expectedRevision: current.revision,
          handle: currentFormData.username.trim().toLowerCase(), displayName: currentFormData.accountName.trim(),
          accountType: type.includes("business") ? "Business" : type.includes("creator") ? "Creator" : "Personal",
          bioPlain: currentFormData.bio?.trim() || null,
          mobileNumber: currentFormData.mobile_number?.trim() || null,
          primaryAddress: currentFormData.primaryAddress ? { address: currentFormData.primaryAddress } : null,
          additionalAddresses: [{ address: currentFormData.address || "", city: currentFormData.city || "",
            country: currentFormData.country || "", state: currentFormData.state || "", streetName: currentFormData.streetName || "" }],
          ...(profile ? { profileImageId: profile.id } : {}),
          ...(background ? { backgroundImageId: background.id } : {}),
          onboardingStatus: "complete",
        });
        await refetch();
        const onboardingKey = `onboarding_${current.id}`;
        localStorage.setItem(onboardingKey, JSON.stringify({ status: "completed", timestamp: Date.now() }));
        setHasSubmitted(true);
        navigate("/home");
      } catch (error: any) {
        await Promise.all(uploaded.map((id) => explorersApiClient.deleteMedia(id).catch(() => undefined)));
        toast.error(error?.message || "Couldn't save your account. Please try again.");
      } finally {
        setIsCreatingSubscription(false);
        endFinalize(finalizeLockRef.current);
      }
      return;
    }
    toast.error("Couldn't verify your account. Please check your connection and try again.");
    return;

  };

  /**
   * AUTO-FREE-PLAN: Programmatically registers the user with the free plan.
   * Called from the final onboarding action instead of advancing to
   * the plan selection UI (Step 5), which is temporarily hidden.
   *
   * To re-enable the plan selection step:
   *   1. In handleStepSubmit (activeStep === 3), replace this call with handleNext()
   *   2. Uncomment the 'Subscription Plans' entry in the steps array below
   */
  const handleSubscriptionSubmitWithFreePlan = async (currentFormData: typeof formData) => {
    await handleSubscriptionSubmit(currentFormData);
  };

  // Final step (Address). Validates the address fields, then creates the account
  // on the free plan. Music setup begins automatically only after this Account exists.
  const handleFinalizeAddress = async () => {
    if (isSubmitting || hasSubmitted || isCreatingSubscription) return;
    try {
      await addressValidationSchema(t).validate(formData, { abortEarly: false });
      await handleSubscriptionSubmitWithFreePlan(formData);
    } catch (error) {
      if (error instanceof Yup.ValidationError) {
        error.errors.forEach((errorMessage) => toast.error(errorMessage));
      } else {
        console.error("Onboarding finalize failed:", error);
        toast.error(t("toast.error.validationError"));
      }
    }
  };

  const steps = useMemo(() => {
    const baseSteps = [
      {
        title: t('auth.onboarding.accountDetails.title'),
        fields: getAccountFields(t),
        description: t('auth.onboarding.accountDetails.description'),
        validationSchema: createAccountValidationSchema(t),
      },
      {
        title: t('auth.onboarding.contactDetails.title'),
        fields: getContactFields(t),
        description: t('auth.onboarding.contactDetails.description'),
        validationSchema: contactValidationSchema(t),
      },
      {
        title: t('auth.onboarding.addressDetails.title'),
        fields: getAddressFields(t),
        description: t('auth.onboarding.addressDetails.description'),
        validationSchema: addressValidationSchema(t),
      },
    ];

    return baseSteps;
  }, [t]);

  const renderAddressField = (field: any) => {
    // Handle separator
    if (field.type === "separator") {
      return (
        <div key={field.name} className="my-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-600 font-medium">
                {t("auth.onboarding.addressDetails.primaryAddress")}
              </span>
            </div>
          </div>
        </div>
      );
    }

    if (field.type === "address") {
      return (
        <div key={field.name} className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-between">
            <div className="flex flex-row gap-1 items-center">
              <label className="block text-xs text-white">{field.label}</label>
              {field.isRequired && (
                <span className="font-poppins text-red-500">*</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleDetectLocation}
              className="flex items-center gap-2 bg-dashboard-accent text-dashboard hover:bg-dashboard-accent/90 shadow-dashboard-elevated border border-dashboard-accent rounded-full px-3 py-1.5 transition-colors duration-200 text-xs font-medium"
            >
              <CurrLocation size="14px" fill="currentColor" />
              <span>{t("auth.onboarding.addressDetails.detectLocation")}</span>
            </button>
          </div>
          <AddressInput
            setPlaces={setPlaces}
            label=""
            initalValue={formData.address}
            value={formData.address}
            onChange={handleAddressChange}
            placeHolder={field.placeholder}
          />
        </div>
      );
    }

    if (field.type === "primaryAddressCombined") {
      return (
        <div key={field.name} className="flex flex-col gap-2">
          <div className="flex flex-row justify-between gap-2 items-center">
            {/* Label with asterisk grouped together */}
            <div className="flex flex-row gap-1 items-center">
              <label className="block text-xs text-white ">{field.label}</label>
              {field.isRequired && (
                <span className="font-poppins text-red-500">*</span>
              )}
            </div>

            {/* "Same as Address" checkbox stays on the right */}
            <div className="flex items-center gap-1">
              <label htmlFor="same-as-address" className="text-xs text-white ">
                {t("auth.onboarding.addressDetails.sameAsAddress")}
              </label>
              <input
                type="checkbox"
                checked={sameAsAddress}
                onChange={(e) => handleSameAsAddressChange(e.target.checked)}
                id="same-as-address"
                className="accent-dashboard-accent w-4 h-4 mt-0.5"
              />
            </div>
          </div>
          <AddressInput
            key={`${sameAsAddress}-${formData.primaryAddress}`}
            type="primaryAddressCombined"
            label=""
            value={formData.primaryAddress}
            initalValue={formData.primaryAddress}
            onChange={(val) => {
              if (!sameAsAddress) {
                // Only allow manual changes when checkbox is unchecked
                setFormData((prev) => ({ ...prev, primaryAddress: val }));
              }
            }}
            placeHolder={field.placeholder}
            setPlaces={(places) => {
              if (!sameAsAddress && places && places.address_components) {
                const cityObj = places.address_components.find(
                  (comp: any) =>
                    comp.types.includes("locality") ||
                    comp.types.includes("administrative_area_level_2")
                );
                const countryObj = places.address_components.find((comp: any) =>
                  comp.types.includes("country")
                );
                const city = cityObj ? cityObj.long_name : "";
                const country = countryObj ? countryObj.long_name : "";
                setFormData((prev) => ({
                  ...prev,
                  primaryAddress:
                    city && country ? `${city}, ${country}` : city || country,
                }));
              }
            }}
            disabled={sameAsAddress}
          />
        </div>
      );
    }

    return (
      <div key={field.name} className="flex flex-col gap-1 sm:gap-2">
        <div className="flex flex-row gap-1 items-center">
          <label className="block text-xs sm:text-sm text-white font-medium">
            {field.label}
          </label>
          {field.isRequired && (
            <span className="font-poppins text-red-500 text-xs sm:text-sm">
              *
            </span>
          )}
        </div>
        <input
          name={field.name}
          type={field.type}
          placeholder={field.placeholder}
          value={String(formData[field.name as keyof typeof formData] || "")}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              [field.name]: e.target.value
            }))
          }
          className="w-full placeholder:text-gray-400 outline-none p-2 sm:p-3 border border-dashboard bg-dashboard-muted font-poppins rounded-md text-sm text-dashboard focus:outline-none focus:ring-2 focus:ring-dashboard-accent hover:border-dashboard-accent"
        />
      </div>
    );
  };

  /**
   * Show loading state while checking for existing accounts
   */
  if (accountCheckLoading) {
    console.log("OnBoarding: Showing account check loading");
    return (
      <div className="bg-black">
        <EarthLoader context="onboarding" />
      </div>
    );
  }

  if (canonicalAccount.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <p>Couldn't verify your account. Please check your connection and try again.</p>
          <button type="button" className="mt-4 rounded-lg bg-purple-600 px-5 py-2"
            onClick={() => canonicalAccount.refetch()}>Retry</button>
        </div>
      </div>
    );
  }

  /**
   * Don't render onboarding form if account already exists and is complete
   * But show a loading state instead of null to prevent blank page
   */
  if (hasCompleteAccount) {
    console.log("OnBoarding: Account already exists, showing redirect message");
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white">{t('toast.error.accountAlreadyExists')}</p>
        </div>
      </div>
    );
  }

  // Only show loading if we're actually loading and haven't timed out
  // AND we don't already have a username (which means we don't need to fetch)
  if (userLoading && !loadingTimeout && !storedUsername) {
    console.log("OnBoarding: Showing user loading");
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white">{t("toast.info.loading")}</p>
        </div>
      </div>
    );
  }

  console.log("OnBoarding: Rendering main component", {
    accountCheckLoading,
    hasCompleteAccount,
    userLoading,
    loadingTimeout,
    storedUsername,
    fetchedUsername,
    hasShownAccountExistsToast,
    hasSubmitted,
  });

  // Fallback: If we somehow get here without any of the above conditions,
  // show a basic loading state to prevent blank page
  if (!accountCheckLoading && !hasCompleteAccount && !userLoading) {
    console.log("OnBoarding: Rendering onboarding form");
  }

  // Ensure we always render something
  if (!documentId) {
    console.log("OnBoarding: Missing required data, showing error");
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <p className="text-white">
            Missing authentication data. Please log in again.
          </p>
        </div>
      </div>
    );
  }

  // Final fallback - if we somehow get here, show the onboarding form
  console.log("OnBoarding: Rendering onboarding form - all conditions passed");

  return (
    <div className="ob-scene dashboard-theme dashboard-theme-dark">
      {/* Earthrise scene — shared with the auth screens for a continuous journey */}
      <GlobeCanvas />
      <div className="ob-vignette" />
      <div className="ob-card ob-frame relative w-full max-w-md sm:max-w-md md:max-w-lg lg:max-w-2xl flex flex-col">
        {/* Header (fixed) — controls row (back / log out) + slim progress.
            The logo was dropped; the changing step heading carries the top. */}
        <div className="ob-topbar border-b border-dashboard">
          <div className="flex items-center justify-between px-4 sm:px-6 pt-3.5 pb-1.5">
            {activeStep > 0 ? (
              <button
                onClick={handleBack}
                type="button"
                aria-label="Back"
                className="text-[11px] sm:text-xs text-dashboard-light hover:text-white transition-colors font-medium flex items-center gap-1 cursor-pointer outline-none focus:outline-none"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={() => setShowLogoutModal(true)}
              type="button"
              className="text-[11px] sm:text-xs text-dashboard hover:text-white transition-all duration-200 font-medium flex items-center gap-1.5 bg-dashboard-muted hover:bg-dashboard-card border border-dashboard rounded-full px-2.5 py-1.5 cursor-pointer outline-none focus:outline-none"
            >
              <span>Log out</span>
              <LogOut size={12} />
            </button>
          </div>

          {/* Slim progress — replaces the space-hungry four-column stepper */}
          <div className="px-4 sm:px-6 pt-1 pb-3 sm:pb-4">
            <OnboardingProgress
              stepIndex={activeStep}
              total={steps.length}
              title={steps[activeStep].title}
              subtitle={steps[activeStep].description}
            />
          </div>
        </div>

        {/* Body (only region that scrolls) */}
        <div className="ob-body flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 md:pb-4 scrollbar-hide">
          <div className="flex justify-center w-full">
            <div className="w-full md:max-w-md">
              {activeStep === 0 && (
                <div className="mb-4">
                  <div
                    className={`relative flex flex-col sm:flex-row justify-center items-center sm:justify-between h-32 sm:h-36 md:h-36 w-full rounded-xl p-3 sm:p-4 ${previewBackgroundImage ? "" : "bg-dashboard-bg"
                      }`}
                    style={{
                      backgroundImage: previewBackgroundImage
                        ? `url('${previewBackgroundImage}')`
                        : `url('${IMAGE_CONFIG.defaultImages.background}')`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <div className="absolute inset-0 bg-black bg-opacity-50 z-0 rounded-xl"></div>
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 mx-auto z-10">
                      <img
                        src={
                          previewProfileImage ||
                          IMAGE_CONFIG.defaultImages.profile
                        }
                        alt={t("auth.validations.onboarding.profileImageAlt")}
                        className="w-full h-full object-cover rounded-full shadow-md"
                      />
                      <div className="absolute bottom-0 right-0">
                        <ImageCropper
                          onFileUpload={handleImageUpload}
                          cropType="profileCrop"
                          buttonTitle="Edit Profile Picture"
                        />
                      </div>
                    </div>
                    <div className="absolute -bottom-2 -right-2 sm:-bottom-3 sm:-right-3 z-10">
                      <ImageCropper
                        onFileUpload={handleBackgroundUpload}
                        cropType="backgroundCrop"
                        buttonTitle="Edit Background"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeStep === 2 ? (
                // Custom address form (final step). The submit action lives in
                // the pinned footer (handleFinalizeAddress).
                <div className="space-y-6">
                  <div className="space-y-4">
                    {getAddressFields(t).map((field: any) =>
                      renderAddressField(field)
                    )}
                  </div>
                </div>
              ) : (
                <AuthForm
                  initialValues={formData as unknown as FormValues}
                  validationSchema={steps[activeStep].validationSchema}
                  onSubmit={handleStepSubmit}
                  heading={steps[activeStep].title}
                  description={steps[activeStep].description}
                  formFields={
                    steps[activeStep].fields.filter(
                      (field: any) => typeof field.label === "string"
                    ) as AuthFormField[]
                  }
                  submitButtonLabel={
                    activeStep === steps.length - 1
                      ? t("auth.onboarding.addressDetails.confirmDetails")
                      : t("auth.onboarding.accountDetails.next")
                  }
                  isLoading={isSubmitting}
                  isOnboarding={true}
                  formId="onboarding-form"
                />
              )}
            </div>
          </div>
        </div>

        {/* Footer (pinned) — the single "floating" primary action. AuthForm steps
            submit the form via its formId; the final Address step finalizes. */}
        <div className="ob-footer">
          {activeStep === 2 ? (
            <button
              type="button"
              onClick={handleFinalizeAddress}
              disabled={isSubmitting || hasSubmitted || isCreatingSubscription}
              className="ob-primary"
            >
              {isSubmitting || isCreatingSubscription
                ? t("auth.validations.general.processing")
                : t("auth.onboarding.addressDetails.confirmDetails")}
            </button>
          ) : (
            <button
              type="submit"
              form="onboarding-form"
              disabled={isSubmitting}
              className="ob-primary"
            >
              {t("auth.onboarding.accountDetails.next")}
            </button>
          )}
        </div>
      </div>


      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <Modal
          isOpen={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
        >
          <div className="dashboard-theme flex flex-col gap-6 w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
            <h2 className="dt-heading mb-2">
              {t("auth.onboarding.logoutModal.title", "Logout from explorers")}
            </h2>

            <p className="dt-label text-white-muted">
              {t("auth.onboarding.logoutModal.description", "Are you sure you want to log out? You can resume your onboarding later, but any unsaved changes on this page will be lost.")}
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                onClick={() => setShowLogoutModal(false)}
                variant="secondary"
                btnText={t("auth.onboarding.logoutModal.cancel", "Cancel")}
              />
              <Button
                onClick={handleLogout}
                variant="danger"
                btnText={t("auth.onboarding.logoutModal.logout", "Log out")}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default OnBoarding;
