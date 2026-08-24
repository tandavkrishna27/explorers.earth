import {
  memo,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ProfileForm, {
  type FormSection,
} from "../features/Profile/components/ProfileForm";
import { useQuery } from "@apollo/client";
import useAuthStore from "../store/store";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import SEO from "../components/SEO";
import { createCanonicalUrl } from "../utils/getCurrentDomain";
import { profileDataQuery } from "../features/Profile/api/query";
import { mapAddressComponents } from "../utils/mapAddress";
import { useUpdateProfile } from "../features/Profile/hooks/useUpdateProfile";
import { useReverseGeocoding } from "../features/Profile/hooks/useReverseGeocoding";
import { AddressResult, Places } from "../features/Profile/types/types";
import ImageCropper from "../components/ImageCropper";
import axios from "axios";
import { PreviewModal } from "../features/Profile/components/PreviewModal";
import { EarthLoader } from "../components/EarthLoader";
import Joyride from "react-joyride";
import { useProfileWalkthrough } from "../hooks/useProfileWalkthrough";
import InstagramIcon from "../assets/icons/InstagramIcon";
import WhatsappIcon from "../assets/icons/WhatsappIcon";
import MobileIcon from "../assets/icons/MobileIcon";
import YoutubeIcon from "../assets/icons/YoutubeIcon";
import TwitterIcon from "../assets/icons/TwitterIcon";
import Spotify from "../assets/icons/Spotify";
import LinkIcon from "../assets/icons/LinkIcon";
import FacebookIcon from "../assets/icons/FacebookIcon";
import YoutubeMusic from "../assets/icons/YoutubeMusic";
import Gmail from "../assets/icons/Gmail";
import LinkedinIcon from "../assets/icons/LinkedinIcon";
import AppleMusic from "../assets/icons/AppleMusic";
import TiktokIcon from "../assets/icons/TiktokIcon";
import SnapchatIcon from "../assets/icons/SnapchatIcon";
import LinkTo from "../assets/icons/LinkTo";
import { Tooltip } from "react-tooltip";
import { Images, Palette, UserRound } from "lucide-react";
import {
  generateProfileUploadPath,
  generateRandomFileName,
  sanitizeUsername,
} from "../utils/uploadPathGenerator";
import { IMAGE_CONFIG } from "../config";
import UsernameChangeConfirmationModal from "../components/ui/UsernameChangeConfirmationModal";
import UnsavedChangesModal from "../components/ui/UnsavedChangesModal";
import { validateUsername } from "../utils/usernameValidation";
import useSetupStore from "../store/useSetupStore";
import { calculateIsProfileComplete } from "../utils/setupStatusCalculations";
import ProfileSetupAccordion from "../components/ProfileSetupAccordion";
import {
  createDeferredProfileSave,
  type DeferredProfileSave,
  type ProfileSaveResult,
  type SaveTerminalStatus,
} from "../features/Profile/types/profileSave";
import {
  getAppearanceFields,
  getGalleryFields,
  getProfileFields,
} from "../features/Profile/config/profileFormSections";
import type {
  FeedAsyncState,
  ProfileWorkspace,
} from "../features/Profile/types/profileWorkspaces";
import { normalizePublicEmailHref } from "../features/PublicHome/utils/publicProfileContent";

// ✅ VISIBILITY FIX: Removed unused Account type - now using GraphQL data directly
// type Account = { ... }

// ✅ REFACTORED FIELD ORGANIZATION - Enhanced User Experience
// ============================================================
//
// BEFORE: All fields in single scrolling accordion list
// AFTER: Fields organized into logical tabs with nested accordions
//
// This reorganization improves user experience by:
// 1. Separating public-facing content from private account settings
// 2. Grouping related fields into logical accordions within each tab
// 3. Reducing cognitive load through better information architecture
// 4. Maintaining all existing validation and functionality

// Tab 1: PUBLIC TAB - Contains fields visible to public users
// Utility function to convert stored account type values to English keys
const getAccountTypeKey = (storedValue: string, t: any): string => {
  // If it's already a key, return it
  if (['personal', 'creator', 'business'].includes(storedValue)) {
    return storedValue;
  }

  // Map from any language's translated value to English key
  const accountTypes: { [key: string]: string } = {
    [t('dashboard.profile.publicProfile.accountTypes.personal')]: 'personal',
    [t('dashboard.profile.publicProfile.accountTypes.creator')]: 'creator',
    [t('dashboard.profile.publicProfile.accountTypes.business')]: 'business'
  };

  // Try to find the key for the stored value
  const foundKey = Object.keys(accountTypes).find(key => key === storedValue);
  if (foundKey) {
    return accountTypes[foundKey];
  }

  // If not found, try common translations across languages
  const commonTranslations: { [key: string]: string } = {
    'Personal': 'personal',
    'Creator': 'creator',
    'Business': 'business',
    'personnel': 'personal',
    'créateur': 'creator',
    'entreprise': 'business',
    '个人': 'personal',
    '创作者': 'creator',
    '企业': 'business',
    'אישי': 'personal',
    'יוצר': 'creator',
    'עסק': 'business'
  };

  return commonTranslations[storedValue] || 'personal';
};

const ProfileSkeleton = memo(() => {
  return (
    <div
      aria-hidden="true"
      className="profile-editor min-h-screen bg-dashboard-bg pb-24 md:px-6 md:pb-6"
    >
      <div className="flex w-full flex-col pb-4">
        <div className="relative mx-auto mt-4 h-[200px] w-full max-w-3xl overflow-hidden rounded-lg bg-dashboard-muted">
          <div className="absolute inset-0 skeleton-shimmer" />
          <div className="absolute bottom-4 left-6 flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-dashboard-sidebar skeleton-shimmer" />
            <div className="space-y-1.5">
              <div className="h-5 w-32 rounded bg-dashboard-sidebar skeleton-shimmer" />
              <div className="h-3 w-20 rounded bg-dashboard-sidebar skeleton-shimmer" />
            </div>
          </div>
        </div>

        <div className="profile-editor-tab-rail sticky-top-offset">
          <div className="profile-editor-tablist" role="presentation">
            {[1, 2, 3].map((tab) => (
              <span
                className="profile-editor-tab skeleton-shimmer"
                key={tab}
              />
            ))}
          </div>
        </div>

        <div className="profile-editor-workspace-shell mx-auto w-full max-w-3xl px-4 pt-6">
          <div className="mb-4 h-6 w-40 rounded bg-dashboard-muted skeleton-shimmer" />
          {[1, 2, 3].map((i) => (
            <div
              className="flex min-h-[60px] items-center justify-between border-b border-dashboard py-3"
              key={i}
            >
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded bg-dashboard-muted skeleton-shimmer" />
                <div className="h-4 w-36 rounded bg-dashboard-muted skeleton-shimmer" />
              </div>
              <div className="h-4 w-4 rounded bg-dashboard-muted skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
ProfileSkeleton.displayName = "ProfileSkeleton";

const PROFILE_TABS = [
  {
    key: "profile",
    icon: UserRound,
    labelKey: "dashboard.profile.editor.tabs.profile",
    labelFallback: "Profile",
    headingKey: "dashboard.profile.editor.headings.profile",
    headingFallback: "Profile details",
  },
  {
    key: "gallery",
    icon: Images,
    labelKey: "dashboard.profile.editor.tabs.gallery",
    labelFallback: "Gallery",
    headingKey: "dashboard.profile.editor.headings.gallery",
    headingFallback: "Gallery",
  },
  {
    key: "appearance",
    icon: Palette,
    labelKey: "dashboard.profile.editor.tabs.appearance",
    labelFallback: "Appearance",
    headingKey: "dashboard.profile.editor.headings.appearance",
    headingFallback: "Appearance",
  },
] as const;

type ProfileTabKey = (typeof PROFILE_TABS)[number]["key"];

const getEditorCopy = (
  t: TFunction,
  key: string,
  fallback: string,
  language?: string,
  hasTranslationResources = false,
) => {
  const translated = t(key, { defaultValue: fallback });
  if ((!language || language === "en") && !hasTranslationResources) {
    return fallback;
  }
  return translated === key ? fallback : translated;
};

interface ProfileAccountSession {
  accountScope: string;
  generation: number;
}

interface ProfileSaveOperation extends ProfileAccountSession {
  operationId: number;
}

const Profile = memo(() => {
  const { t, i18n } = useTranslation();
  const [showPreview, setShowPreview] = useState<boolean>(false);
  // local state for account details
  // ✅ VISIBILITY FIX: Remove redundant account state - use GraphQL data directly
  // const [account, setAccount] = useState<Account>();
  // local state for handling image uploading
  const [uploadedImage, setUploadedImage] = useState<string>("");
  // local state for handling background image uploading
  const [uploadedBackground, setUploadedBackground] = useState<string>("");
  // accessing auth data from the zustand store
  const { user, token } = useAuthStore();
  // local state for handling accurate address
  const [placesState, setPlacesState] = useState<Places | null>();
  // local state for upload progress
  const [isUploading, setIsUploading] = useState(false);
  // local state for form submission
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);

  // local state for "View Public Profile" tooltip auto-show
  const [isTooltipOpen, setIsTooltipOpen] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    // Check if user has already seen the tooltip
    const hasSeenTooltip = localStorage.getItem("hasSeenPublicProfileTooltip");
    if (!hasSeenTooltip) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(() => {
        setIsTooltipOpen(true);
        // Save to localStorage so it doesn't show again
        localStorage.setItem("hasSeenPublicProfileTooltip", "true");
        // Hide after 6 seconds and restore uncontrolled state
        setTimeout(() => setIsTooltipOpen(undefined), 6000);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Enhanced setPlaces that also updates form fields
  const setPlaces = (places: Places, setFieldValue?: (field: string, value: any) => void) => {
    setPlacesState(places);

    // If setFieldValue is provided, update form fields immediately
    if (setFieldValue && places?.address_components) {
      const mapped = mapAddressComponents(places.address_components);

      // Update address field with formatted address
      if (places.formatted_address) {
        setFieldValue('address', places.formatted_address);
      }

      // Update individual address component fields
      if (mapped.street_name) {
        setFieldValue('streetName', mapped.street_name);
      }
      if (mapped.city) {
        setFieldValue('city', mapped.city);
      }
      if (mapped.state) {
        setFieldValue('state', mapped.state);
      }
      if (mapped.country) {
        setFieldValue('country', mapped.country);
      }
      if (mapped.postal_code) {
        setFieldValue('postalCode', mapped.postal_code);
      }

      toast.success('Address fields updated!');
    }
  };

  // accessing user document Id
  const documentId = user?.documentId;

  const { data, loading, error, refetch } = useQuery(profileDataQuery, {
    variables: { documentId },
    fetchPolicy: "cache-and-network", // Always fetch fresh data but use cache while loading
    skip: !documentId, // Skip query if documentId is not available
  });

  useEffect(() => {
    if (!loading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [loading]);

  // ✅ VISIBILITY FIX: Get account data from GraphQL response, not separate axios call
  const account = data?.usersPermissionsUser?.accounts?.[0];
  const emailSocial =
    account?.social_media?.email ?? account?.social_media?.gmail;
  const emailHref = normalizePublicEmailHref(emailSocial?.link);
  const resolvedAccountScope = account?.documentId
    ? String(account.documentId)
    : null;
  const activeAccountScopeRef = useRef<string | null>(resolvedAccountScope);
  const accountSessionGenerationRef = useRef(0);
  const saveOperationSequenceRef = useRef(0);
  const submittingSaveOperationRef = useRef<ProfileSaveOperation | null>(null);
  // Cache the last concrete account scope so a transient query refresh does not
  // remount the editor or clear pending work for the same account.
  const stableAccountScope =
    resolvedAccountScope ?? activeAccountScopeRef.current;

  // Prepare profile data for walkthrough — memoized to prevent new object on every render
  const profileData = useMemo(() => ({
    profilePicture: uploadedImage || account?.profile_picture?.url || "",
    coverImage: uploadedBackground || account?.bg_picture?.url || "",
    accountName: account?.Account_Name || "",
    bio: account?.Bio || "",
    socialMedia: account?.social_media || {},
  }), [uploadedImage, uploadedBackground, account?.profile_picture?.url, account?.bg_picture?.url, account?.Account_Name, account?.Bio, account?.social_media]);

  // Initialize walkthrough hook
  const {
    run,
    steps,
    stepIndex,
    setRun,
    setStepIndex,
    handleJoyrideCallback,
    advanceToNextStep,
    markProcessingComplete,
  } = useProfileWalkthrough(profileData, false, isUploading, isFormSubmitting);

  // Debug logging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Profile Walkthrough Debug:', {
        run,
        stepsCount: steps.length,
        stepIndex,
        profileData,
        steps: steps.map(s => ({
          target: s.target,
          content: typeof s.content === 'string' ? s.content.substring(0, 50) : String(s.content || '').substring(0, 50)
        })),
      });
    }
  }, [run, steps, stepIndex, profileData]);

  // Initialize uploaded states with server data when available
  useEffect(() => {
    if (data?.usersPermissionsUser?.accounts?.[0]) {
      const serverBackgroundUrl =
        data.usersPermissionsUser.accounts[0].bg_picture?.url;
      const serverProfileUrl =
        data.usersPermissionsUser.accounts[0].profile_picture?.url;

      // Only set if we don't already have a local uploaded version
      if (serverBackgroundUrl && !uploadedBackground) {
        setUploadedBackground(serverBackgroundUrl);
      }
      if (serverProfileUrl && !uploadedImage) {
        setUploadedImage(serverProfileUrl);
      }
    }
  }, [data, uploadedBackground, uploadedImage]);

  const { isProfileComplete, isRecommendationsComplete, setSetupStatus } = useSetupStore();

  // Sync setup status with store
  const currentIsProfileComplete = useMemo(() => {
    return calculateIsProfileComplete(account);
  }, [account]);

  useEffect(() => {
    // Only update if we have data and it's different from store
    if (account && currentIsProfileComplete !== isProfileComplete) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Syncing profile completion status:', currentIsProfileComplete);
      }
      setSetupStatus(currentIsProfileComplete, isRecommendationsComplete);
    }
  }, [currentIsProfileComplete, isProfileComplete, isRecommendationsComplete, setSetupStatus, account]);

  // custom hook for handling adress submission
  const { handleSubmit: originalHandleSubmit } = useUpdateProfile(
    account?.documentId,
    refetch
  );

  // ✅ VISIBILITY FIX: Simplified primary address handling
  // const [primaryAddressCombined, setPrimaryAddressCombined] = useState<string>("");

  // ✅ VISIBILITY FIX: Remove redundant axios call that causes data sync issues
  // The GraphQL query already provides all needed account data including social_media visibility
  // useEffect(() => {
  //   const fetchAccountData = async () => {
  //     try {
  //       const response = await axios.get(
  //         `${
  //           import.meta.env.VITE_REST_API_URL
  //         }/accounts?filters%5Busername%5D=${user?.username}`,
  //         {
  //           headers: {
  //             Authorization: `Bearer ${token}`,
  //           },
  //         }
  //       );
  //       setAccount(response.data.data[0]);
  //     } catch (err) {
  //       console.error("Error fetching account data:", err);
  //     }
  //   };

  //   fetchAccountData();
  // }, [token, user?.username]);

  // This modal prevents accidental username changes by showing warnings about link/QR code impacts
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [pendingFormValues, setPendingFormValues] = useState<any>(null);
  const pendingUsernameSaveRef = useRef<{
    values: any;
    deferred: DeferredProfileSave;
    operation: ProfileSaveOperation;
  } | null>(null);

  // Unsaved changes modal state
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [hasUnsavedFeedChanges, setHasUnsavedFeedChanges] = useState(false);
  const [pendingFeedOperations, setPendingFeedOperations] = useState(
    () => new Map<string, FeedAsyncState["operation"]>(),
  );
  const hasPendingFeedOperations = pendingFeedOperations.size > 0;
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);
  const [resetDirtyStateFn, setResetDirtyStateFn] = useState<(() => void) | null>(null);
  const registeredSubmitRef = useRef<
    (() => Promise<SaveTerminalStatus>) | null
  >(null);
  const registeredSubmitScopeRef = useRef<string | null>(null);
  const [currentActiveTab, setCurrentActiveTab] =
    useState<ProfileTabKey>("profile");

  const captureCurrentAccountSession = useCallback(
    (): ProfileAccountSession | null => {
      if (
        !stableAccountScope ||
        activeAccountScopeRef.current !== stableAccountScope
      ) {
        return null;
      }
      return {
        accountScope: stableAccountScope,
        generation: accountSessionGenerationRef.current,
      };
    },
    [stableAccountScope],
  );

  const beginProfileSaveOperation = useCallback(() => {
    const session = captureCurrentAccountSession();
    if (!session) return null;
    saveOperationSequenceRef.current += 1;
    return {
      ...session,
      operationId: saveOperationSequenceRef.current,
    };
  }, [captureCurrentAccountSession]);

  const isAccountSessionActive = useCallback(
    (session: ProfileAccountSession | null) =>
      Boolean(
        session &&
          activeAccountScopeRef.current === session.accountScope &&
          accountSessionGenerationRef.current === session.generation,
      ),
    [],
  );

  const ownsSubmittingState = useCallback(
    (operation: ProfileSaveOperation) =>
      isAccountSessionActive(operation) &&
      submittingSaveOperationRef.current === operation,
    [isAccountSessionActive],
  );

  const isLatestSaveForActiveSession = useCallback(
    (operation: ProfileSaveOperation) =>
      isAccountSessionActive(operation) &&
      saveOperationSequenceRef.current === operation.operationId,
    [isAccountSessionActive],
  );

  const handleRegisterProfileSubmit = useCallback(
    (submit: (() => Promise<SaveTerminalStatus>) | null) => {
      if (submit) {
        registeredSubmitRef.current = submit;
        registeredSubmitScopeRef.current = stableAccountScope;
        return;
      }

      // An old keyed form can clean up after the new account has registered.
      // Only clear the registration that belongs to this callback's scope.
      if (registeredSubmitScopeRef.current === stableAccountScope) {
        registeredSubmitRef.current = null;
        registeredSubmitScopeRef.current = null;
      }
    },
    [stableAccountScope],
  );

  /**
   * Helper function to process business location images and submit form
   * This handles both user uploaded files and combines them with Google images
   */
  const processBusinessImagesAndSubmit = async (
    values: any,
    operation: ProfileSaveOperation,
  ) => {
    // Construct Public_Profile_Address from individual business fields
    const businessData = {
      title: values.title || values.businessTitle || "",
      address: values.businessAddress || "",
      contact: values.businessContact || "",
      website: values.businessWebsite || "",
      about: values.about || values.businessDescription || "",
      // Persist selected Google place_id so users can import later
      placeId: values.businessPlaceId || "",
      places: null,
    };

    // Only include Public_Profile_Address if any business field has data
    const hasBusinessData = Object.values(businessData).some(
      (value) => value && value.toString().trim() !== ""
    );
    if (hasBusinessData) {
      // Send as object since Strapi returns it as object
      values.Public_Profile_Address = businessData;
    }

    // FEED: No additional upload here. FeedFields already updates Feed_Data on change.
    // Just ensure it's an array and clean temp helpers.
    if (!Array.isArray(values.Feed_Data)) values.Feed_Data = [];

    // Cleanup temp fields
    delete values.feedUserFiles;
    delete values.feedImportedMedia;

    // Submit the updated form values (includes Public_Profile_Address + Feed_Data)
    const response = await originalHandleSubmit(values);

    // The request is allowed to settle for its initiating account, but an old
    // continuation must not mutate a newer account session.
    if (ownsSubmittingState(operation)) {
      setHasUnsavedFeedChanges(false);
    }
    return response;
  };

  const showProfileSaveError = (error: unknown) => {
    if (typeof error === "object" && error !== null) {
      const saveError = error as {
        graphQLErrors?: { message?: string }[];
        networkError?: unknown;
        message?: string;
      };
      if (saveError.graphQLErrors?.length) {
        toast.error(
          t("toast.error.updateFailedWithError", {
            error:
              saveError.graphQLErrors[0]?.message ||
              t("toast.error.graphQLErrorOccurred"),
          }),
        );
        return;
      }
      if (saveError.networkError) {
        toast.error(t("dashboard.profile.common.networkError"));
        return;
      }
      if (saveError.message?.includes("was not confirmed")) {
        toast.error(t("dashboard.profile.common.saveAndPublishFailed"));
        return;
      }
    }
    toast.error(t("dashboard.profile.common.unexpectedError"));
  };

  const performProfileSave = async (
    values: any,
    operation: ProfileSaveOperation,
  ): Promise<"saved" | "failed"> => {
    if (!isAccountSessionActive(operation)) return "failed";

    submittingSaveOperationRef.current = operation;
    setIsFormSubmitting(true);
    try {
      await processBusinessImagesAndSubmit(values, operation);
      if (!ownsSubmittingState(operation)) return "failed";

      markProcessingComplete();
      toast.success(
        t("dashboard.profile.common.savedAndPublishedSuccessfully"),
      );

      if (steps.length > 0 && stepIndex < steps.length) {
        const currentStep = steps[stepIndex];
        if (
          currentStep?.target === '[data-walkthrough="save-publish-button"]'
        ) {
          setTimeout(() => {
            if (!isLatestSaveForActiveSession(operation)) return;
            setRun(false);
            setStepIndex(0);
          }, 500);
        }
      }

      return "saved";
    } catch (error) {
      if (!ownsSubmittingState(operation)) return "failed";

      markProcessingComplete();
      showProfileSaveError(error);
      return "failed";
    } finally {
      if (ownsSubmittingState(operation)) {
        submittingSaveOperationRef.current = null;
        setIsFormSubmitting(false);
      }
    }
  };

  const handleFormSubmit = async (values: any): Promise<ProfileSaveResult> => {
    const currentUsername = data.usersPermissionsUser?.username || "";
    const newUsername = (values.username || "").trim();
    const usernameChanged = currentUsername !== newUsername;

    if (usernameChanged && usernameDisabled) {
      if (usernameCooldownMessage) toast.error(usernameCooldownMessage);
      return { status: "failed" };
    }

    if (usernameChanged && !usernameDisabled) {
      const validation = validateUsername(newUsername);
      if (!validation.isValid) {
        toast.error(t('toast.error.invalidUsernameWithError', { error: validation.errors[0] }));
        return { status: "failed" };
      }
      const operation = beginProfileSaveOperation();
      if (!operation) return { status: "failed" };

      const deferred = createDeferredProfileSave();
      pendingUsernameSaveRef.current = { values, deferred, operation };
      setPendingFormValues(values);
      setShowUsernameModal(true);
      return deferred.result;
    }

    const operation = beginProfileSaveOperation();
    if (!operation) return { status: "failed" };

    const status = await performProfileSave(values, operation);
    return { status };
  };

  const handleConfirmUsernameChange = async () => {
    const handlerSession = captureCurrentAccountSession();
    const pendingSave = pendingUsernameSaveRef.current;
    if (
      !handlerSession ||
      !pendingSave ||
      pendingSave.operation.accountScope !== handlerSession.accountScope ||
      pendingSave.operation.generation !== handlerSession.generation
    ) {
      return;
    }

    setShowUsernameModal(false);
    const terminal = await performProfileSave(
      pendingSave.values,
      pendingSave.operation,
    );
    if (!isAccountSessionActive(pendingSave.operation)) return;

    pendingSave.deferred.settle(terminal);
    if (pendingUsernameSaveRef.current === pendingSave) {
      pendingUsernameSaveRef.current = null;
      setPendingFormValues(null);
    }
  };

  const handleCancelUsernameChange = () => {
    const handlerSession = captureCurrentAccountSession();
    const pendingSave = pendingUsernameSaveRef.current;
    if (
      !handlerSession ||
      !pendingSave ||
      pendingSave.operation.accountScope !== handlerSession.accountScope ||
      pendingSave.operation.generation !== handlerSession.generation
    ) {
      return;
    }

    pendingSave.deferred.settle("cancelled");
    pendingUsernameSaveRef.current = null;
    setShowUsernameModal(false);
    setPendingFormValues(null);
  };

  // Unsaved changes handlers
  const handleFormDirtyChange = (isDirty: boolean) => {
    console.log("🟡 Profile: FORM DIRTY STATE CHANGED");
    console.log("🟡 Profile: New dirty state:", isDirty);
    console.log("🟡 Profile: Previous dirty state:", isFormDirty);
    console.log("🟡 Profile: Current path:", location.pathname);
    console.log(
      "🟡 Profile: Setting up navigation blocking, isFormDirty:",
      isDirty
    );
    setIsFormDirty(isDirty);
  };

  const handleFeedDataChange = useCallback(() => {
    if (activeAccountScopeRef.current !== stableAccountScope) return;
    console.log('🟢 Profile: Feed_Data changed - marking as unsaved');
    setHasUnsavedFeedChanges(true);
  }, [stableAccountScope]);

  const handleResetDirtyState = (resetFn: () => void) => {
    setResetDirtyStateFn(() => resetFn);
  };

  const handleTabChange = (tabName: ProfileTabKey) => {
    // ✅ FIXED: Allow tab changes within the same route - only block route navigation
    // Tab switching within profile page should not trigger the modal and keep the changes saved
    // keep the changes saved
    setPendingTabChange(tabName);
    setCurrentActiveTab(tabName);
  };

  const handleFeedAsyncStateChange = useCallback((state: FeedAsyncState) => {
    if (activeAccountScopeRef.current !== stableAccountScope) return;
    setPendingFeedOperations((current) => {
      const next = new Map(current);
      const scopedRequestId = `${stableAccountScope ?? "profile"}:${state.requestId}`;
      if (state.pending) next.set(scopedRequestId, state.operation);
      else next.delete(scopedRequestId);
      return next;
    });
  }, [stableAccountScope]);

  const handleProfileTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + PROFILE_TABS.length) % PROFILE_TABS.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % PROFILE_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PROFILE_TABS.length - 1;
    }

    const nextTab = PROFILE_TABS[nextIndex];
    setCurrentActiveTab(nextTab.key);
    document.getElementById(`profile-editor-tab-${nextTab.key}`)?.focus();
  };

  const handleSaveChanges = async () => {
    const navigationSession = captureCurrentAccountSession();
    if (!navigationSession) return;

    const submit = registeredSubmitRef.current;
    if (
      !submit ||
      registeredSubmitScopeRef.current !== navigationSession.accountScope
    ) {
      toast.error(t("dashboard.profile.common.failedToSaveChanges"));
      setShowUnsavedChangesModal(true);
      return;
    }

    setShowUnsavedChangesModal(false);
    const terminal = await submit();
    if (!isAccountSessionActive(navigationSession)) return;

    if (terminal !== "saved") {
      setShowUnsavedChangesModal(true);
      return;
    }

    setHasUnsavedFeedChanges(false);
    resetDirtyStateFn?.();
    setBlockedNavigation(null);
    setPendingTabChange(null);
  };

  const handleDiscardChanges = () => {
    console.log("Profile: Discard Changes - resetting form and navigating");
    setShowUnsavedChangesModal(false);

    // Reset the form dirty state
    if (resetDirtyStateFn) {
      console.log("Profile: Calling resetDirtyStateFn");
      resetDirtyStateFn();
    }

    // Reset unsaved feed changes tracking
    setHasUnsavedFeedChanges(false);

    // Reset form to initial values by reloading the page or resetting form
    // This ensures all changes are truly discarded
    const form = document.querySelector("form");
    if (form) {
      console.log("Profile: Resetting form to initial values");
      form.reset();
    }

    // Proceed with navigation
    handleNavigateAway();
  };

  // Custom navigation blocking for BrowserRouter
  const navigate = useNavigate();
  const location = useLocation();
  const [blockedNavigation, setBlockedNavigation] = useState<string | null>(
    null
  );

  useLayoutEffect(() => {
    if (!resolvedAccountScope) return;

    const previousAccountScope = activeAccountScopeRef.current;
    if (previousAccountScope === null) {
      activeAccountScopeRef.current = resolvedAccountScope;
      return;
    }
    if (previousAccountScope === resolvedAccountScope) return;

    activeAccountScopeRef.current = resolvedAccountScope;
    accountSessionGenerationRef.current += 1;
    submittingSaveOperationRef.current = null;
    setIsFormSubmitting(false);
    setIsFormDirty(false);
    setHasUnsavedFeedChanges(false);
    setPendingFeedOperations(new Map());
    setShowUnsavedChangesModal(false);
    setPendingTabChange(null);
    setBlockedNavigation(null);
    setResetDirtyStateFn(null);
    registeredSubmitRef.current = null;
    registeredSubmitScopeRef.current = null;

    pendingUsernameSaveRef.current?.deferred.settle("cancelled");
    pendingUsernameSaveRef.current = null;
    setPendingFormValues(null);
    setShowUsernameModal(false);
    setCurrentActiveTab("profile");
  }, [resolvedAccountScope]);

  // Intercept navigation attempts
  useEffect(() => {
    const handleNavigation = (e: Event) => {
      // Check both form dirty state and unsaved feed changes
      const hasUnsavedChanges =
        isFormDirty || hasUnsavedFeedChanges || hasPendingFeedOperations;
      if (hasUnsavedChanges) {
        console.log('Profile: Navigation intercepted, isFormDirty:', isFormDirty, 'hasUnsavedFeedChanges:', hasUnsavedFeedChanges);
        e.preventDefault();
        e.stopPropagation();
        setShowUnsavedChangesModal(true);
        setPendingTabChange(pendingTabChange || "navigate");
        return false;
      }
    };

    // Listen for clicks on navigation links
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // ✅ DEBUG: Always log clicks on small screens to see if detection is working
      const viewportWidth = window.innerWidth;
      if (viewportWidth < 768) {
        console.log("📱 SMALL SCREEN CLICK DETECTED:", {
          tagName: target.tagName,
          className: target.className,
          textContent: target.textContent?.trim(),
          isButton: target.tagName === "BUTTON",
          hasIcon: !!target.querySelector("svg"),
          rect: target.getBoundingClientRect(),
        });
      }

      // Check both form dirty state and unsaved feed changes
      const hasUnsavedChanges =
        isFormDirty || hasUnsavedFeedChanges || hasPendingFeedOperations;

      // Debug: Log all clicks when form is dirty
      if (hasUnsavedChanges) {
        console.log('🔴 Profile: CLICK DETECTED');
        console.log('🔴 Profile: Target:', target.tagName, target.className, target.textContent?.trim());
        console.log('🔴 Profile: Target element:', target);
        console.log('🔴 Profile: Parent elements:', target.closest('footer'), target.closest('nav'), target.closest('.navbar'));
        console.log('🔴 Profile: Viewport size:', { width: window.innerWidth, height: window.innerHeight });
        console.log('🔴 Profile: Form dirty state:', isFormDirty);
        console.log('🔴 Profile: Has unsaved feed changes:', hasUnsavedFeedChanges);
        console.log('🔴 Profile: Current path:', location.pathname);
      }

      if (hasUnsavedChanges) {
        // Check for various types of navigation elements
        const link = target.closest("a[href]") as HTMLAnchorElement;
        const button = target.closest("button") as HTMLButtonElement;
        const navButton = target.closest(
          ".nav-button, [data-nav], [data-route]"
        ) as HTMLElement;

        let navigationTarget: string | null = null;
        let shouldBlock = false;

        // Check for href attribute (sidebar links)
        if (link) {
          navigationTarget = link.getAttribute("href");
          shouldBlock = true;
          console.log("Profile: Found link with href:", navigationTarget);
        }
        // Check for buttons in navigation context (footer buttons)
        else if (button) {
          console.log("Profile: Found button:", button);

          // Skip Save & Publish buttons - they should work normally
          const buttonText = button.textContent?.toLowerCase() || "";
          if (buttonText.includes("save") && buttonText.includes("publish")) {
            console.log("Profile: Skipping Save & Publish button");
            return; // Don't block this button
          }

          // Workspace tabs only change which already-mounted panel is visible;
          // they are not route navigation and must preserve unsaved local state.
          if (
            button.getAttribute("role") === "tab" ||
            button.closest('[role="tablist"]')
          ) {
            return;
          }

          // Buttons inside the editor mutate the current Formik snapshot; the
          // route guard must only inspect actual navigation outside this root.
          if (button.closest('[data-testid="profile-editor-root"]')) {
            return;
          }

          // Skip modal buttons - they should work normally
          if (
            buttonText.includes("cancel") ||
            buttonText.includes("discard") ||
            buttonText.includes("save changes")
          ) {
            console.log("Profile: Skipping modal button:", buttonText);
            return; // Don't block modal buttons
          }

          // Skip accordion toggle buttons - they should work normally
          const hasAriaExpanded = button.hasAttribute('aria-expanded');
          const hasAriaControls = button.hasAttribute('aria-controls');
          const ariaControls = button.getAttribute('aria-controls');
          const isAccordionButton = (hasAriaExpanded && hasAriaControls && ariaControls?.includes('accordion-content')) ||
            button.closest('[class*="accordion"]') ||
            button.closest('[class*="rounded-xl"][class*="border"][class*="shadow-dashboard"]');

          if (isAccordionButton) {
            console.log('Profile: Skipping accordion button');
            return; // Don't block accordion buttons
          }

          // Check if this button is inside a modal - be more specific
          const isInModal = button.closest(
            '[role="dialog"], .modal, [class*="modal"], [class*="overlay"], [class*="fixed"][class*="inset-0"], [class*="z-[9999]"]'
          );
          console.log(
            "🔴 Profile: Modal check - isInModal:",
            !!isInModal,
            "modal element:",
            isInModal
          );

          // ✅ SIMPLIFIED: Only skip if it's actually inside a real modal (not the main page)
          if (
            isInModal &&
            (isInModal.querySelector('[data-testid="unsaved-changes-modal"]') ||
              isInModal.querySelector(".unsaved-changes-modal") ||
              isInModal.textContent?.includes("unsaved changes") ||
              isInModal.textContent?.includes("Save Changes") ||
              isInModal.textContent?.includes("Discard Changes"))
          ) {
            console.log(
              "🔴 Profile: Skipping button inside UnsavedChangesModal"
            );
            return; // Don't block buttons inside our modal
          }

          // ✅ TARGETED: Specific footer navigation detection for small devices
          const isInFooterNav =
            button.closest("div.fixed.bottom-0") ||
            button.closest('div[class*="fixed"][class*="bottom"]') ||
            button.closest('div[class*="bg-dashboard-sidebar"]') ||
            button.closest('div[class*="shadow-dashboard-elevated"]') ||
            button.closest('div[class*="z-50"]') ||
            button.closest('div[class*="md:bottom-2"]') ||
            button.closest('div[class*="md:rounded-lg"]') ||
            // ✅ SPECIFIC: Target the exact Navbar structure
            button.closest(
              'div[class*="fixed"][class*="bottom-0"][class*="z-50"][class*="w-full"][class*="bg-dashboard-sidebar"]'
            ) ||
            button.closest(
              'div[class*="flex"][class*="mx-[1.5rem]"][class*="flex-row"][class*="justify-around"]'
            );

          console.log(
            "🔴 Profile: Is in footer nav:",
            !!isInFooterNav,
            "footer element:",
            isInFooterNav
          );

          // Additional check: look for NavButton pattern (small buttons with icons at bottom)
          const buttonRect = button.getBoundingClientRect();
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          const isAtBottom = buttonRect.bottom > viewportHeight - 100; // Within 100px of bottom
          const hasIcon = button.querySelector("svg");
          const isSmallButton =
            buttonRect.width < 120 && buttonRect.height < 120;

          // ✅ SPECIFIC: Check if button has exact NavButton characteristics
          const hasNavButtonClasses =
            button.className.includes("w-12") &&
            button.className.includes("flex") &&
            button.className.includes("font-poppins") &&
            button.className.includes("text-xs") &&
            button.className.includes("flex-col") &&
            button.className.includes("gap-1") &&
            button.className.includes("items-center") &&
            button.className.includes("p-2") &&
            button.className.includes("rounded-md");

          // ✅ SPECIFIC: Check if button is in the exact Navbar container structure
          const parentContainer = button.parentElement;
          const grandParentContainer = parentContainer?.parentElement;
          const isInNavbarContainer =
            (parentContainer &&
              parentContainer.className.includes("flex") &&
              parentContainer.className.includes("mx-[1.5rem]") &&
              parentContainer.className.includes("flex-row") &&
              parentContainer.className.includes("justify-around")) ||
            (grandParentContainer &&
              grandParentContainer.className.includes("fixed") &&
              grandParentContainer.className.includes("bottom-0") &&
              grandParentContainer.className.includes("z-50") &&
              grandParentContainer.className.includes("bg-dashboard-sidebar"));

          console.log("🔴 Profile: Button analysis:", {
            isInFooterNav,
            isAtBottom,
            hasIcon,
            isSmallButton,
            hasNavButtonClasses,
            isInNavbarContainer,
            buttonRect,
            viewportHeight,
            viewportWidth,
            buttonClasses: button.className,
            parentClasses: button.parentElement?.className,
            grandParentClasses: button.parentElement?.parentElement?.className,
          });

          // ✅ COMPREHENSIVE: Multiple detection methods for small devices
          if (
            isInFooterNav ||
            (isAtBottom && hasIcon && isSmallButton) ||
            hasNavButtonClasses ||
            isInNavbarContainer ||
            (hasIcon && isAtBottom && viewportWidth < 768)
          ) {
            // Extra check for small screens
            console.log("🔴 Profile: Button is navigation - WILL BLOCK");
            shouldBlock = true;
          } else {
            // ✅ AGGRESSIVE FALLBACK: For small screens, catch any button with icon at bottom
            if (viewportWidth < 768 && hasIcon && isAtBottom) {
              console.log(
                "🔴 Profile: AGGRESSIVE FALLBACK - Small screen button with icon at bottom - WILL BLOCK"
              );
              shouldBlock = true;
            } else {
              console.log(
                "🔴 Profile: Button is not navigation - NOT BLOCKING"
              );
            }
          }

          if (shouldBlock) {
            // This is likely a navigation button, we need to determine the target
            // Check if it has data attributes first
            navigationTarget =
              button.getAttribute("data-nav") ||
              button.getAttribute("data-route") ||
              button.getAttribute("data-path");

            console.log("Profile: Button data attributes:", {
              "data-nav": button.getAttribute("data-nav"),
              "data-route": button.getAttribute("data-route"),
              "data-path": button.getAttribute("data-path"),
            });

            // ✅ SIMPLIFIED: If no data attribute, infer from button position in footer
            if (!navigationTarget) {
              // Get the button's index within its parent container
              const parentContainer =
                button.closest('div[class*="flex"][class*="justify-around"]') ||
                button.closest('div[class*="flex"][class*="justify-center"]') ||
                button.parentElement;

              if (parentContainer) {
                const buttonIndex = Array.from(parentContainer.children).indexOf(button);
                console.log('Profile: Button index in footer:', buttonIndex);

                // Based on the Navbar component structure: Home, Recommendations, Guides, Analytics, Profile, Settings
                switch (buttonIndex) {
                  case 0:
                    navigationTarget = "/home";
                    break;
                  case 1:
                    navigationTarget = "/recommendations";
                    break;
                  case 2:
                    navigationTarget = '/guides';
                    break;
                  case 3:
                    navigationTarget = '/analytics';
                    break;
                  case 4:
                    navigationTarget = '/profile';
                    break;
                  case 5:
                    navigationTarget = '/settings';
                    break;
                  default: {
                    // Fallback: try to infer from icon or text
                    const buttonText = button.textContent?.toLowerCase() || '';
                    const iconElement = button.querySelector('svg');
                    const iconClass = iconElement ? (iconElement.className || iconElement.getAttribute('class') || '') : '';
                    const iconClassString = typeof iconClass === 'string' ? iconClass : String(iconClass);

                    if (buttonText.includes('home') || iconClassString.includes('home')) {
                      navigationTarget = '/home';
                    } else if (buttonText.includes('profile') || iconClassString.includes('profile')) {
                      navigationTarget = '/profile';
                    } else if (buttonText.includes('recommendation') || buttonText.includes('recommendations') || iconClassString.includes('recommendation')) {
                      navigationTarget = '/recommendations';
                    } else if (buttonText.includes('analytics') || iconClassString.includes('analytics')) {
                      navigationTarget = '/analytics';
                    } else if (buttonText.includes('guide') || iconClassString.includes('guide')) {
                      navigationTarget = '/guides';
                    } else if (buttonText.includes('setting') || buttonText.includes('settings') || iconClassString.includes('setting')) {
                      navigationTarget = '/settings';
                    }
                  }
                }
              }

              console.log(
                "Profile: Inferred navigation target:",
                navigationTarget
              );
            }
          }
        }
        // Check for custom navigation elements
        else if (navButton) {
          navigationTarget =
            navButton.getAttribute("data-nav") ||
            navButton.getAttribute("data-route");
          shouldBlock = true;
          console.log("Profile: Found nav button:", navigationTarget);
        }

        // Block navigation if we found a valid target and it's different from current path
        if (shouldBlock && navigationTarget && navigationTarget !== location.pathname) {
          // Double-check that there are unsaved changes before showing modal
          if (hasUnsavedChanges) {
            console.log('🟢 Profile: NAVIGATION BLOCKED - SHOWING MODAL');
            console.log('🟢 Profile: Target:', navigationTarget);
            console.log('🟢 Profile: Current path:', location.pathname);
            console.log('🟢 Profile: Form dirty:', isFormDirty);
            console.log('🟢 Profile: Has unsaved feed changes:', hasUnsavedFeedChanges);
            console.log('🟢 Profile: Element:', target.tagName);
            e.preventDefault();
            e.stopPropagation();
            setBlockedNavigation(navigationTarget);
            setShowUnsavedChangesModal(true);
            setPendingTabChange("navigate");
            return false;
          } else {
            console.log('🟢 Profile: No unsaved changes, allowing navigation to:', navigationTarget);
            // No unsaved changes, allow navigation
            return true;
          }
        } else {
          console.log(
            "🔴 Profile: NOT BLOCKING - shouldBlock:",
            shouldBlock,
            "navigationTarget:",
            navigationTarget,
            "currentPath:",
            location.pathname
          );
        }
      }
    };

    // Add event listeners
    document.addEventListener("click", handleLinkClick, true);
    window.addEventListener("beforeunload", handleNavigation);

    return () => {
      document.removeEventListener("click", handleLinkClick, true);
      window.removeEventListener("beforeunload", handleNavigation);
    };
  }, [
    isFormDirty,
    hasUnsavedFeedChanges,
    hasPendingFeedOperations,
    location.pathname,
  ]);

  // Browser refresh/close warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsavedChanges =
        isFormDirty || hasUnsavedFeedChanges || hasPendingFeedOperations;
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = ""; // Required for Chrome
        return ""; // Required for other browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFormDirty, hasUnsavedFeedChanges, hasPendingFeedOperations]);

  // Handle navigation from unsaved changes modal
  const handleNavigateAway = () => {
    console.log("Profile: Navigate Away - proceeding with navigation");
    setShowUnsavedChangesModal(false);

    // Reset the form dirty state since we're navigating away
    if (resetDirtyStateFn) {
      console.log("Profile: Calling resetDirtyStateFn in handleNavigateAway");
      resetDirtyStateFn();
    }

    // Navigate to the blocked destination
    if (blockedNavigation) {
      console.log(
        "Profile: Navigating to blocked destination:",
        blockedNavigation
      );
      navigate(blockedNavigation);
      setBlockedNavigation(null);
    } else {
      console.log("Profile: No blocked navigation destination found");
    }
  };

  const handleCancelUnsavedChanges = () => {
    console.log("Profile: Cancel - staying on current page");
    setShowUnsavedChangesModal(false);

    // Clear all pending navigation states
    setPendingTabChange(null);
    setBlockedNavigation(null);

    // Don't reset the form dirty state - user wants to keep their changes
    // Don't navigate anywhere - user wants to stay on current page
    console.log(
      "Profile: Modal closed, staying on current page with unsaved changes"
    );
  };

  // custom hook for detecting userr location
  const { currentLocation, mappedAddress, handleGetCurrentLocation } = useReverseGeocoding();

  // Enhanced location detection that updates form fields directly
  const handleGetCurrentLocationWithFormUpdate = async (setFieldValue?: (field: string, value: any) => void) => {
    try {
      const locationData = await handleGetCurrentLocation();

      // If setFieldValue is provided (from ProfileForm), update fields directly
      if (setFieldValue && locationData) {
        // Update the places state to trigger form field updates
        setPlacesState(locationData as any);

        // Map the address components
        const mapped = locationData.address_components
          ? mapAddressComponents(locationData.address_components)
          : {};

        // Update all address fields including the main address input
        if (locationData.formatted_address) {
          setFieldValue('address', locationData.formatted_address);
        }
        if (mapped.street_name) {
          setFieldValue('streetName', mapped.street_name);
        }
        if (mapped.city) {
          setFieldValue('city', mapped.city);
        }
        if (mapped.state) {
          setFieldValue('state', mapped.state);
        }
        if (mapped.country) {
          setFieldValue('country', mapped.country);
        }
        if (mapped.postal_code) {
          setFieldValue('postalCode', mapped.postal_code);
        }

        toast.success('Location detected and fields updated!');
      }
    } catch (error) {
      // Error already handled in hook
    }
  };

  // conditional assigning of the address data based on the option selected by the user( automatic detection or mannual)
  const updatedPlaces: AddressResult = placesState?.address_components?.length
    ? mapAddressComponents(placesState.address_components)
    : currentLocation?.address_components?.length
      ? mapAddressComponents(currentLocation?.address_components)
      : mappedAddress || {};

  // ✅ VISIBILITY FIX: Removed unused handlePrimaryAddressLocation function
  // It was causing lint errors and not being used in ProfileForm

  // side effects willl be replaced by spinner and toast
  // side effects for query
  if (loading) {
    if ((window as any).__dashboardLoaded) {
      return <ProfileSkeleton />;
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-dashboard-bg">
        <EarthLoader context="profile" size="default" />
      </div>
    );
  }
  if (error) return (
    <div className="flex bg-dashboard-bg items-center justify-center min-h-screen">
      <div className="text-dashboard text-center">
        <p className="text-lg font-poppins font-semibold text-white">
          {t("dashboard.profile.common.error")}
        </p>
      </div>
    </div>
  );

  // inital values for the form

  // --- Username Cooldown Logic ---
  // IMPORTANT: Only UsersPermissionsUser timestamps should determine cooldown.
  // Updating Account fields (bio, address, etc.) changes account.updatedAt and must NOT influence username cooldown.
  function parseDate(dateStr: string | undefined): Date | null {
    return dateStr ? new Date(dateStr) : null;
  }
  const now = new Date();
  const userCreatedAt = parseDate(data.usersPermissionsUser?.createdAt);
  const userUpdatedAt = parseDate(data.usersPermissionsUser?.updatedAt);
  // Use the latest user timestamp as a proxy for last username change.
  const lastUsernameChange = userUpdatedAt || userCreatedAt;
  const cooldownMinutes = 1; // fixed 1 minute for testing; adjust manually for production
  let minutesSinceChange = cooldownMinutes;
  if (
    lastUsernameChange instanceof Date &&
    !isNaN(lastUsernameChange.getTime())
  ) {
    minutesSinceChange = Math.floor(
      (now.getTime() - lastUsernameChange.getTime()) / (1000 * 60)
    );
  }
  let usernameDisabled = minutesSinceChange < cooldownMinutes;
  let usernameCooldownMessage = "";
  if (!lastUsernameChange) {
    usernameDisabled = false;
    usernameCooldownMessage = t("toast.warning.usernameCooldownUnknown");
  } else if (usernameDisabled) {
    const nextChangeDate = new Date(
      (lastUsernameChange as Date).getTime() + cooldownMinutes * 60 * 1000
    );
    const remaining = Math.max(0, cooldownMinutes - minutesSinceChange);
    if (cooldownMinutes >= 1440) {
      const remainingDays = Math.ceil(remaining / 1440);
      usernameCooldownMessage = t("toast.warning.usernameCooldownDays", {
        date: nextChangeDate.toLocaleDateString(),
        days: remainingDays,
      });
    } else if (cooldownMinutes >= 60) {
      const remainingHours = Math.ceil(remaining / 60);
      usernameCooldownMessage = t("toast.warning.usernameCooldownHours", {
        time: nextChangeDate.toLocaleTimeString(),
        hours: remainingHours,
      });
    } else {
      usernameCooldownMessage = t("toast.warning.usernameCooldownMinutes", {
        time: nextChangeDate.toLocaleTimeString(),
        minutes: remaining,
      });
    }
  } else {
    usernameCooldownMessage = t("toast.warning.usernameCooldownReady");
  }

  const initialValues = {
    username: data.usersPermissionsUser?.username || "",
    accountName: account?.Account_Name || "",
    accountType: getAccountTypeKey(account?.Account_Type || "", t),
    bio: account?.Bio || "",
    address:
      currentLocation?.formatted_address || account?.Addresss.address || "",
    primaryAddressCombined:
      account?.Primary_Address?.address || // Use backend value
      (account?.Addresss?.city || "") +
      (account?.Addresss?.city && account?.Addresss?.country ? ", " : "") +
      (account?.Addresss?.country || ""),
    streetName: updatedPlaces.street_name || account?.Addresss.streetName || "",
    postalCode: updatedPlaces.postal_code || account?.Addresss.postalCode,
    state: updatedPlaces.state || account?.Addresss.state || "",
    city: updatedPlaces.city || account?.Addresss.city || "",
    country: updatedPlaces.country || account?.Addresss.country || "",
    instagramLink: account?.social_media?.instagram?.link || "",
    whatsappLink: account?.social_media?.whatsapp?.link || "",
    websiteLink: account?.social_media?.website?.link || "",
    spotifyLink: account?.social_media?.spotify?.link || "",
    XLink: account?.social_media?.X?.link || "",
    youtubeLink: account?.social_media?.youtube?.link || "",
    mobilenumberLink: account?.mobile_number || "",
    mobilenumberVisiblity: account?.mobile_number_visibility,
    youtubeMusicLink: account?.social_media?.youtubeMusic?.link || "",
    linkedinLink: account?.social_media?.linkedin?.link || "",
    gmailLink: emailSocial?.link || "",
    appleMusicLink: account?.social_media?.appleMusic?.link || "",
    tiktokLink: account?.social_media?.tiktok?.link || "",
    snapchatLink: account?.social_media?.snapchat?.link || "",
    facebookLink: account?.social_media?.facebook?.link || "",

    instagramvisiblity: account?.social_media?.instagram?.visibility || false,
    whatsappvisiblity: account?.social_media?.whatsapp?.visibility || false,
    websitevisiblity: account?.social_media?.website?.visibility || false,
    spotifyvisiblity: account?.social_media?.spotify?.visibility || false,
    Xvisiblity: account?.social_media?.X?.visibility || false,
    youtubevisiblity: account?.social_media?.youtube?.visibility || false,
    youtubeMusicvisiblity:
      account?.social_media?.youtubeMusic?.visibility || false,
    linkedinvisiblity: account?.social_media?.linkedin?.visibility || false,
    gmailvisiblity: emailSocial?.visibility || false,
    appleMusicvisiblity: account?.social_media?.appleMusic?.visibility || false,
    tiktokvisiblity: account?.social_media?.tiktok?.visibility || false,
    snapchatvisiblity: account?.social_media?.snapchat?.visibility || false,
    facebookvisiblity: account?.social_media?.facebook?.visibility || false,
    localTunesvisiblity: account?.social_media?.localTunes?.visibility || false,

    // Business Location fields
    title: (() => {
      try {
        let businessData;

        if (account?.Public_Profile_Address) {
          // Check if it's already an object or a string
          if (typeof account.Public_Profile_Address === "string") {
            businessData = JSON.parse(account.Public_Profile_Address);
          } else {
            // It's already an object
            businessData = account.Public_Profile_Address;
          }
        } else {
          businessData = {};
        }

        return businessData.title || businessData.businessTitle || "";
      } catch (error) {
        return "";
      }
    })(),
    businessAddress: (() => {
      try {
        let businessData;
        if (account?.Public_Profile_Address) {
          if (typeof account.Public_Profile_Address === "string") {
            businessData = JSON.parse(account.Public_Profile_Address);
          } else {
            businessData = account.Public_Profile_Address;
          }
        } else {
          businessData = {};
        }
        return businessData.address || businessData.businessAddress || "";
      } catch {
        return "";
      }
    })(),
    businessContact: (() => {
      try {
        let businessData;
        if (account?.Public_Profile_Address) {
          if (typeof account.Public_Profile_Address === "string") {
            businessData = JSON.parse(account.Public_Profile_Address);
          } else {
            businessData = account.Public_Profile_Address;
          }
        } else {
          businessData = {};
        }
        return businessData.contact || businessData.businessContact || "";
      } catch {
        return "";
      }
    })(),
    businessWebsite: (() => {
      try {
        let businessData;
        if (account?.Public_Profile_Address) {
          if (typeof account.Public_Profile_Address === "string") {
            businessData = JSON.parse(account.Public_Profile_Address);
          } else {
            businessData = account.Public_Profile_Address;
          }
        } else {
          businessData = {};
        }
        return businessData.website || businessData.businessWebsite || "";
      } catch {
        return "";
      }
    })(),
    about: (() => {
      try {
        let businessData;
        if (account?.Public_Profile_Address) {
          if (typeof account.Public_Profile_Address === "string") {
            businessData = JSON.parse(account.Public_Profile_Address);
          } else {
            businessData = account.Public_Profile_Address;
          }
        } else {
          businessData = {};
        }
        return businessData.about || businessData.businessDescription || "";
      } catch {
        return "";
      }
    })(),
    // FEED DATA from Account.Feed_Data (JSON)
    Feed_Data: (() => {
      try {
        return account?.Feed_Data || [];
      } catch {
        return [];
      }
    })(),
    social_media: account?.social_media || {},
    theme_settings: account?.social_media?.theme_settings || {},
    // Hidden helpers from Business Location selection
    businessPlaceId: (() => {
      try {
        let businessData;
        if (account?.Public_Profile_Address) {
          businessData =
            typeof account.Public_Profile_Address === "string"
              ? JSON.parse(account.Public_Profile_Address)
              : account.Public_Profile_Address;
        } else {
          businessData = {};
        }
        return businessData.placeId || businessData.businessPlaceId || "";
      } catch {
        return "";
      }
    })(),
  };

  const editorLanguage = i18n?.language?.split("-")[0];
  const hasEditorTranslationResources = typeof i18n?.exists === "function";
  const editorDirection = ["ar", "fa", "he", "ur"].includes(
    editorLanguage || "",
  )
    ? "rtl"
    : "ltr";
  const workspaceHeadings = Object.fromEntries(
    PROFILE_TABS.map((tab) => [
      tab.key,
      getEditorCopy(
        t,
        tab.headingKey,
        tab.headingFallback,
        editorLanguage,
        hasEditorTranslationResources,
      ),
    ]),
  ) as Record<ProfileTabKey, string>;
  const profileWorkspaceHeading = workspaceHeadings.profile;
  const galleryWorkspaceHeading = workspaceHeadings.gallery;
  const appearanceWorkspaceHeading = workspaceHeadings.appearance;
  const profileSections = getProfileFields(t);
  const gallerySections = getGalleryFields(t).map((section) => ({
    ...section,
    heading: galleryWorkspaceHeading,
  }));
  const appearanceSections = getAppearanceFields(t).map((section) => ({
    ...section,
    heading: appearanceWorkspaceHeading,
  }));
  const profileWorkspaces: ProfileWorkspace<FormSection>[] = [
    {
      id: "profile",
      headingId: "profile-editor-heading-profile",
      sections: profileSections,
      width: "readable",
    },
    {
      id: "gallery",
      headingId: "gallery-media-heading",
      sections: gallerySections,
      width: "readable",
    },
    {
      id: "appearance",
      headingId: "appearance-settings-heading",
      sections: appearanceSections,
      width: "wide",
    },
  ];
  const currentFormFields =
    profileWorkspaces.find(({ id }) => id === currentActiveTab)?.sections ||
    profileSections;
  const profileScopeKey = String(
    stableAccountScope ||
      data.usersPermissionsUser?.documentId ||
      data.usersPermissionsUser?.username ||
      "profile-editor",
  );
  const activeTab =
    PROFILE_TABS.find(({ key }) => key === currentActiveTab) || PROFILE_TABS[0];
  const activeWorkspaceHeading = {
    profile: profileWorkspaceHeading,
    gallery: galleryWorkspaceHeading,
    appearance: appearanceWorkspaceHeading,
  }[activeTab.key];
  const activeWorkspaceHeadingId =
    profileWorkspaces.find(({ id }) => id === activeTab.key)?.headingId ||
    profileWorkspaces[0].headingId;

  // ✅ FIXED: Simplified profile image upload flow
  // STRAPI UPLOAD INSIGHT: When using refId + field + ref parameters,
  // Strapi automatically associates the uploaded file with the specified model field.
  // No additional GraphQL mutation needed - just upload and refresh UI.
  const handleImageUpload = async (file: File | null) => {
    try {
      if (!file) {
        throw new Error(t('dashboard.profile.common.errors.noFileProvided'));
      }

      // Pause walkthrough during upload
      setIsUploading(true);

      // First, get the account ID from REST API (needed for Strapi upload refId)
      const accountResponse = await axios.get(
        `${import.meta.env.VITE_REST_API_URL}/accounts?filters%5Busername%5D=${user?.username
        }`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const accountId = accountResponse.data.data[0]?.id?.toString();
      if (!accountId) {
        throw new Error(t('dashboard.profile.common.errors.failedToGetAccountId'));
      }

      const formData = new FormData();

      // Generate structured path for organized storage
      const username = sanitizeUsername(user?.username || "user");
      const randomFileName = generateRandomFileName(file.name);
      const structuredPath = generateProfileUploadPath(
        username,
        "profile",
        randomFileName
      );

      formData.append("files", file);
      formData.append("refId", accountId); // Use REST API account ID
      formData.append("field", "profile_picture");
      formData.append("ref", "api::account.account");
      formData.append("path", structuredPath);

      // Step 1: Upload image to Strapi/S3
      const uploadResponse = await axios.post(
        `${import.meta.env.VITE_REST_API_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (uploadResponse.data && uploadResponse.data[0]?.id) {
        const uploadedFile = uploadResponse.data[0];

        // The upload already associated the file with the account via refId/field params
        // No need for additional GraphQL mutation - just update UI and refetch
        setUploadedImage(uploadedFile.url);

        await refetch();
        toast.success(t('toast.success.profileImageUpdated'));

        // Auto-advance walkthrough after successful upload if we're on profile picture step
        if (steps.length > 0 && stepIndex < steps.length) {
          const currentStep = steps[stepIndex];
          if (currentStep?.target === '[data-walkthrough="profile-picture"]') {
            // Mark processing complete and advance instantly
            markProcessingComplete();
            // Advance immediately for instant highlighting
            setTimeout(() => {
              advanceToNextStep();
            }, 50); // Minimal delay just to ensure state is cleared
          } else {
            markProcessingComplete();
          }
        } else {
          markProcessingComplete();
        }
      } else {
        throw new Error(t('dashboard.profile.common.errors.uploadResponseMissingFileData'));
      }
    } catch (error: any) {
      console.error("Profile image upload error:", error);
      const errorMessage = error?.response?.data?.error?.message ||
        error?.message ||
        t('toast.error.profileImageUpdateFailed');
      toast.error(errorMessage);
      // Mark processing as complete even on error
      markProcessingComplete();
    } finally {
      setIsUploading(false);
    }
  };

  const handleBackgroundUpload = async (file: File) => {
    // ✅ FIXED: Comprehensive background image upload flow
    // Same two-step process as profile image: upload file, then associate with account
    try {
      // Pause walkthrough during upload
      setIsUploading(true);

      // First, get the account ID from REST API (needed for Strapi upload refId)
      const accountResponse = await axios.get(
        `${import.meta.env.VITE_REST_API_URL}/accounts?filters%5Busername%5D=${user?.username
        }`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const accountId = accountResponse.data.data[0]?.id?.toString();
      if (!accountId) {
        throw new Error(t('dashboard.profile.common.errors.failedToGetAccountId'));
      }

      const formData = new FormData();

      // Generate structured path for organized storage
      const username = sanitizeUsername(user?.username || "user");
      const randomFileName = generateRandomFileName(file.name);
      const structuredPath = generateProfileUploadPath(
        username,
        "background",
        randomFileName
      );

      formData.append("files", file);
      formData.append("refId", accountId); // Use REST API account ID
      formData.append("field", "bg_picture");
      formData.append("ref", "api::account.account");
      formData.append("path", structuredPath);

      // Step 1: Upload image to Strapi/S3
      const uploadResponse = await axios.post(
        `${import.meta.env.VITE_REST_API_URL}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (uploadResponse.data && uploadResponse.data[0]?.id) {
        const uploadedFile = uploadResponse.data[0];

        // The upload already associated the file with the account via refId/field params
        // No need for additional GraphQL mutation - just update UI and refetch
        setUploadedBackground(uploadedFile.url);

        await refetch();
        toast.success(t('toast.success.backgroundImageUpdated'));

        // Auto-advance walkthrough after successful upload if we're on cover image step
        if (steps.length > 0 && stepIndex < steps.length) {
          const currentStep = steps[stepIndex];
          if (currentStep?.target === '[data-walkthrough="cover-image"]') {
            // Mark processing complete and advance instantly
            markProcessingComplete();
            // Advance immediately for instant highlighting
            setTimeout(() => {
              advanceToNextStep();
            }, 50); // Minimal delay just to ensure state is cleared
          } else {
            markProcessingComplete();
          }
        } else {
          markProcessingComplete();
        }
      } else {
        throw new Error(t('dashboard.profile.common.errors.uploadResponseMissingFileData'));
      }
    } catch (error) {
      toast.error(t('toast.error.backgroundImageUpdateFailed'));
      // Mark processing as complete even on error
      markProcessingComplete();
    } finally {
      setIsUploading(false);
    }
  };

  const accountName = account?.Account_Name || user?.username || "User";

  return (
    <>
      <SEO
        title={`Profile Settings - ${accountName} | explorers`}
        description={`Manage your explorers profile settings for ${accountName}. Customize your public profile, update personal information, manage social media links, and configure your account preferences. Edit your bio, location, profile pictures, and discoverability settings.`}
        keywords={[
          "profile settings",
          "account management",
          "profile customization",
          "explorers profile",
          "user settings",
          "profile edit",
          "account preferences",
          "public profile settings",
          "profile configuration",
          "user profile management",
          "explorers account settings",
          "profile personalization"
        ]}
        canonical={createCanonicalUrl("/profile")}
        type="website"
        noIndex={true}
        siteName="explorers"
        author={accountName}
      />
      <div className="bg-dashboard-bg md:px-6 md:py-2 md:pt-0">
        <div className="bg-dashboard-bg md:py-2 md:pt-0">
          {/* Mobile: Remove top padding to allow header to sit flush with top nav if needed, or adjust for cinematic look */}
          <div className="pb-4 md:mb-0 w-full min-h-screen flex flex-col gap-0 pt-0 md:pt-0">
            {/* Header Section - Width matched to accordions */}
            <div className="relative max-w-3xl mx-auto w-full mt-4 overflow-hidden rounded-xl bg-black transition-all duration-300">
              {/* Cover Photo Background with Cinematic Effects */}
              <div 
                className="absolute inset-0 h-full w-full overflow-hidden z-0"
                style={{
                  backgroundImage: uploadedBackground
                    ? `url('${uploadedBackground}')`
                    : data?.usersPermissionsUser?.accounts[0]?.bg_picture?.url
                      ? `url('${data?.usersPermissionsUser?.accounts[0]?.bg_picture?.url}')`
                      : `url('${IMAGE_CONFIG.defaultImages.background}')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {/* Cinematic top-to-bottom dimming - Base layer */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 z-0" />
                
                {/* Smooth blur-from-bottom effect */}
                <div 
                  className="absolute inset-x-0 bottom-0 h-[70%] backdrop-blur-md bg-black/10 z-0"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 100%)',
                    maskImage: 'linear-gradient(to top, black 30%, transparent 100%)'
                  }}
                />
                
                {/* Deep bottom shadow for final transition */}
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/60 to-transparent z-0" />
              </div>

              {/* Header Content - Centered Profile Picture & Edit Buttons */}
              <div className="relative z-10 pt-16 md:pt-20 pb-8 text-center px-4">
                <div className="relative w-28 h-28 md:w-36 md:h-36 mx-auto mb-4 group">
                  <div className="w-full h-full ring-4 ring-[hsl(var(--evergreen))] rounded-full overflow-hidden bg-black shadow-2xl">
                    <img
                      src={
                        uploadedImage ||
                        data?.usersPermissionsUser?.accounts?.[0]?.profile_picture?.url ||
                        IMAGE_CONFIG.defaultImages.profile
                      }
                      alt={t('dashboard.profile.common.profile')}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  
                  {/* Profile Picture Edit Button - Bottom Right */}
                  <div className="absolute bottom-1 right-1 z-20" data-walkthrough="profile-picture">
                    <ImageCropper
                      onFileUpload={handleImageUpload}
                      cropType="profileCrop"
                    />
                  </div>
                </div>

                {/* Background Edit Button - Bottom Right of the entire banner */}
                <div className="absolute bottom-4 right-4 z-20" data-walkthrough="cover-image">
                  <ImageCropper
                    onFileUpload={handleBackgroundUpload}
                    cropType="backgroundCrop"
                    buttonTitle={t('dashboard.profile.common.editBackground')}
                  />
                </div>

                {/* View Public Profile Navigation Button - Top Right */}
                <div className="absolute top-4 right-4 z-20">
                  <button
                    type="button"
                    onClick={() => window.open(createCanonicalUrl(`/${initialValues.username}`), "_blank")}
                    className="p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full border border-white/20 transition-all duration-300 group shadow-lg flex items-center justify-center hover:scale-110 active:scale-95"
                    data-tooltip-id="view-public-profile-tooltip"
                    data-tooltip-content={t('dashboard.profile.common.viewPublicProfile')}
                  >
                    <LinkTo size="20px" stroke="white" />
                  </button>
                </div>

                {/* Name & Location Preview */}
                <div className="text-center mt-2">
                   <h1 className="text-lg font-poppins font-bold text-white drop-shadow-lg">
                     {account?.Account_Name || user?.username}
                   </h1>
                   <p className="text-[10px] font-poppins text-white/80 mt-0.5 drop-shadow-md">
                     {account?.Primary_Address?.address}
                   </p>
                </div>

                {/* Social Links Preview */}
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 px-6 mt-4 mb-2 empty:hidden">
                  {account?.social_media?.instagram?.link && account?.social_media?.instagram?.visibility && (
                    <div className="scale-[0.85]"><InstagramIcon color="white" /></div>
                  )}
                  {account?.mobile_number_visibility && account?.mobile_number && (
                    <div className="scale-[0.85]"><MobileIcon fill="white" /></div>
                  )}
                  {account?.social_media?.whatsapp?.link && account?.social_media?.whatsapp?.visibility && (
                    <div className="scale-[0.85]"><WhatsappIcon fill="white" /></div>
                  )}
                  {account?.social_media?.youtube?.link && account?.social_media?.youtube?.visibility && (
                    <div className="scale-[0.85]"><YoutubeIcon color="white" /></div>
                  )}
                  {account?.social_media?.X?.link && account?.social_media?.X?.visibility && (
                    <div className="scale-[0.85]"><TwitterIcon color="white" /></div>
                  )}
                  {account?.social_media?.spotify?.link && account?.social_media?.spotify?.visibility && (
                    <div className="scale-[0.85]"><Spotify color="white" /></div>
                  )}
                  {account?.social_media?.website?.link && account?.social_media?.website?.visibility && (
                    <div className="scale-[0.85]"><LinkIcon color="white" /></div>
                  )}
                  {account?.social_media?.facebook?.link && account?.social_media?.facebook?.visibility && (
                    <div className="scale-[0.85]"><FacebookIcon color="white" /></div>
                  )}
                  {account?.social_media?.youtubeMusic?.link && account?.social_media?.youtubeMusic?.visibility && (
                    <div className="scale-[0.85]"><YoutubeMusic color="white" /></div>
                  )}
                  {emailHref && emailSocial?.visibility && (
                    <div className="scale-[0.85]"><Gmail color="white" /></div>
                  )}
                  {account?.social_media?.linkedin?.link && account?.social_media?.linkedin?.visibility && (
                    <div className="scale-[0.85]"><LinkedinIcon color="white" /></div>
                  )}
                  {account?.social_media?.appleMusic?.link && account?.social_media?.appleMusic?.visibility && (
                    <div className="scale-[0.85]"><AppleMusic color="white" /></div>
                  )}
                  {account?.social_media?.tiktok?.link && account?.social_media?.tiktok?.visibility && (
                    <div className="scale-[0.85]"><TiktokIcon color="white" /></div>
                  )}
                  {account?.social_media?.snapchat?.link && account?.social_media?.snapchat?.visibility && (
                    <div className="scale-[0.85]"><SnapchatIcon color="white" /></div>
                  )}
                </div>
              </div>
            </div>

            {/* Public Profile Setup Accordion - if profile setup is incomplete */}
            {!currentIsProfileComplete && (
              <div className="max-w-3xl mx-auto w-full mt-4 px-2 sm:px-0">
                <ProfileSetupAccordion account={account} />
              </div>
            )}

            <div
              className="profile-editor w-full"
              data-testid="profile-editor-root"
              dir={editorDirection}
            >
              <div className="profile-editor-tab-rail sticky-top-offset">
                <div
                  aria-label={getEditorCopy(
                    t,
                    "dashboard.profile.editor.tablist",
                    "Public profile editor",
                    editorLanguage,
                    hasEditorTranslationResources,
                  )}
                  aria-orientation="horizontal"
                  className="profile-editor-tablist"
                  data-walkthrough="public-profile-tab"
                  role="tablist"
                >
                  {PROFILE_TABS.map((tab, index) => {
                    const Icon = tab.icon;
                    const isActive = currentActiveTab === tab.key;
                    const label = getEditorCopy(
                      t,
                      tab.labelKey,
                      tab.labelFallback,
                      editorLanguage,
                      hasEditorTranslationResources,
                    );

                    return (
                      <button
                        aria-controls={`profile-editor-panel-${tab.key}`}
                        aria-label={label}
                        aria-selected={isActive}
                        className="profile-editor-tab"
                        data-profile-editor-tab-position={
                          index === 0
                            ? "first"
                            : index === PROFILE_TABS.length - 1
                              ? "last"
                              : "middle"
                        }
                        data-tooltip-content={label}
                        data-tooltip-id="profile-editor-tab-tooltip"
                        id={`profile-editor-tab-${tab.key}`}
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        onKeyDown={(event) =>
                          handleProfileTabKeyDown(event, index)
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                      >
                        <Icon aria-hidden="true" className="h-[22px] w-[22px]" />
                      </button>
                    );
                  })}
                </div>
                <Tooltip
                  className="profile-editor-tab-tooltip"
                  closeEvents={{ blur: true, mouseleave: true }}
                  globalCloseEvents={{ escape: true, resize: true, scroll: true }}
                  id="profile-editor-tab-tooltip"
                  noArrow
                  offset={8}
                  openEvents={{ focus: true, mouseenter: true }}
                  place="bottom"
                  positionStrategy="fixed"
                />
              </div>
              <section
                aria-labelledby={activeWorkspaceHeadingId}
                className="profile-editor-workspace-shell w-full px-4 pb-24 pt-6 md:px-6 md:pb-6"
              >
                {activeTab.key === "profile" && (
                  <h2
                    className="mx-auto mb-4 w-full max-w-3xl font-poppins text-xl font-semibold text-dashboard"
                    id={activeWorkspaceHeadingId}
                  >
                    {activeWorkspaceHeading}
                  </h2>
                )}
                <ProfileForm
                  mode="workspaces"
                  initialValues={initialValues}
                  onSubmit={handleFormSubmit}
                  setPlaces={setPlaces}
                  formFields={currentFormFields}
                  workspaces={profileWorkspaces}
                  activeWorkspace={currentActiveTab}
                  scopeKey={profileScopeKey}
                  surface="flat"
                  DetectLocation={handleGetCurrentLocationWithFormUpdate}
                  usernameDisabled={usernameDisabled}
                  usernameCooldownMessage={usernameCooldownMessage}
                  onFormDirtyChange={handleFormDirtyChange}
                  onResetDirtyState={handleResetDirtyState}
                  onFeedDataChange={handleFeedDataChange}
                  onFeedAsyncStateChange={handleFeedAsyncStateChange}
                  onRegisterSubmit={handleRegisterProfileSubmit}
                />
              </section>
            </div>

            <PreviewModal
              isOpen={showPreview}
              onClose={() => setShowPreview(false)}
              uploadedBackground={uploadedBackground}
              uploadedImage={uploadedImage}
              userData={{
                bgPicture: data.usersPermissionsUser.accounts[0]?.bg_picture?.url,
                profilePicture:
                  data.usersPermissionsUser.accounts[0]?.profile_picture?.url,
                username: initialValues.username,
                accountType: initialValues.accountType,
                bio: initialValues.bio,
                city: initialValues.city,
                country: initialValues.country,
                instagramLink: initialValues.instagramLink,
                mobilenumberLink: initialValues.mobilenumberLink,
                whatsappLink: initialValues.whatsappLink,
              }}
            />

            {/* Username Change Confirmation Modal */}
            <UsernameChangeConfirmationModal
              isOpen={showUsernameModal}
              onClose={handleCancelUsernameChange}
              onConfirm={handleConfirmUsernameChange}
              newUsername={pendingFormValues?.username || ""}
              cooldownDays={
                cooldownMinutes < 60
                  ? cooldownMinutes / 1440
                  : cooldownMinutes / (24 * 60)
              } // Convert minutes to days for display
            />

            {/* Unsaved Changes Modal */}
            <UnsavedChangesModal
              isOpen={showUnsavedChangesModal}
              onClose={handleCancelUnsavedChanges}
              onSave={handleSaveChanges}
              onDiscard={handleDiscardChanges}
            />

            {/* Profile Walkthrough */}
            {steps.length > 0 && run && !false && !isUploading && !isFormSubmitting && (
              <>
                <style>{`
              /* Ensure buttons and interactive elements are clickable during walkthrough */
              .react-joyride__tooltip {
                background-color: #121217 !important;
                backdrop-filter: blur(12px) !important;
                -webkit-backdrop-filter: blur(12px) !important;
                border: 1px solid #1e1e26 !important;
                color: white !important;
              }
              .react-joyride__tooltip > div {
                background-color: transparent !important;
                border: none !important;
                outline: none !important;
              }
              .react-joyride__overlay {
                pointer-events: none !important;
              }
              .react-joyride__spotlight {
                pointer-events: auto !important;
              }
              .react-joyride__spotlight * {
                pointer-events: auto !important;
              }
              /* CRITICAL: Ensure visibility toggles are always clickable, even with overlay */
              button[data-tooltip-id="visibility-tooltip"] {
                pointer-events: auto !important;
                z-index: 10004 !important;
              }
              /* Make sure buttons have proper z-index */
              [data-walkthrough] button,
              [data-walkthrough] a,
              [data-walkthrough] input,
              [data-walkthrough] select,
              [data-walkthrough] textarea {
                position: relative;
                z-index: 10001 !important;
                pointer-events: auto !important;
              }
              /* Prevent blinking - smooth transitions */
              .react-joyride__tooltip {
                transition: opacity 0.3s ease-in-out !important;
              }
              /* Prevent re-renders from causing blinking */
              .react-joyride__spotlight {
                will-change: auto !important;
              }
              /* CRITICAL: Restore original social media accordion functionality */
              /* Don't override any styles - let it work exactly as before */
              [data-walkthrough="social-media-accordion"] {
                /* No style overrides - restore original behavior */
              }
              /* CRITICAL: Ensure visibility toggle buttons work properly - restore original functionality */
              /* Make sure they're clickable and not interfered with by walkthrough */
              button[data-tooltip-id="visibility-tooltip"],
              [data-tooltip-id="visibility-tooltip"],
              button[data-tooltip-id="visibility-tooltip"] *,
              button[data-tooltip-id="visibility-tooltip"] svg,
              button[data-tooltip-id="visibility-tooltip"] path {
                pointer-events: auto !important;
                z-index: 10002 !important;
                position: relative;
                cursor: pointer !important;
                /* Ensure no walkthrough overlay interferes */
                isolation: isolate;
              }
              button[data-tooltip-id="visibility-tooltip"]:hover,
              [data-tooltip-id="visibility-tooltip"]:hover,
              button[data-tooltip-id="visibility-tooltip"]:active,
              button[data-tooltip-id="visibility-tooltip"]:focus {
                opacity: 1 !important;
                transform: scale(1) !important;
                outline: none !important;
              }
              /* Ensure visibility buttons are above walkthrough overlay */
              .react-joyride__spotlight button[data-tooltip-id="visibility-tooltip"],
              .react-joyride__overlay ~ * button[data-tooltip-id="visibility-tooltip"] {
                z-index: 10003 !important;
                pointer-events: auto !important;
              }
              /* CRITICAL: Prevent walkthrough from blocking visibility toggle clicks */
              /* Overlay is already set to pointer-events: none above */
              .react-joyride__spotlight button[data-tooltip-id="visibility-tooltip"],
              .react-joyride__overlay ~ * button[data-tooltip-id="visibility-tooltip"],
              [data-walkthrough="social-media-accordion"] button[data-tooltip-id="visibility-tooltip"] {
                pointer-events: auto !important;
                z-index: 10004 !important;
              }
              /* Next/Finish button styling - match Recommendations walkthrough */
              .react-joyride__tooltip button[data-action="next"],
              .react-joyride__tooltip button[data-action="primary"],
              .react-joyride__tooltip button[data-action="last"] {
                background-color: #3498DB !important;
                border-radius: 10px !important;
                border: none !important;
                color: white !important;
                font-size: 14px !important;
                font-weight: 600 !important;
                padding: 10px 20px !important;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(52, 152, 219, 0.5) !important;
                outline: none !important;
                transition: all 0.2s ease !important;
                cursor: pointer !important;
                display: inline-block !important;
              }
              .react-joyride__tooltip button[data-action="next"]:hover,
              .react-joyride__tooltip button[data-action="primary"]:hover,
              .react-joyride__tooltip button[data-action="last"]:hover {
                background-color: #2980B9 !important;
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4), 0 0 25px rgba(52, 152, 219, 0.6) !important;
                transform: translateY(-1px) !important;
              }
            `}</style>
                <Joyride
                  steps={steps}
                  run={run}
                  stepIndex={stepIndex}
                  continuous={true}
                  showProgress={true}
                  showSkipButton={true}
                  hideBackButton={false}
                  callback={handleJoyrideCallback}
                  disableOverlayClose={false}
                  disableScrolling={false}
                  spotlightPadding={0}
                  locale={{
                    last: "Finish",
                  }}
                  styles={{
                    options: {
                      primaryColor: '#3498DB',
                      zIndex: 10000,
                    },
                    tooltip: {
                      borderRadius: '12px',
                      padding: stepIndex === 2 ? '12px 16px' : '20px',
                      fontFamily: 'Poppins, sans-serif',
                      fontSize: '14px',
                      backgroundColor: '#121217',
                      color: 'white',
                      border: '1px solid #1e1e26',
                    },
                    tooltipContainer: {
                      textAlign: 'left',
                    },
                    tooltipContent: {
                      color: 'white',
                      fontSize: '14px',
                      fontFamily: 'Poppins, sans-serif',
                    },
                    buttonNext: {
                      backgroundColor: '#3498DB !important',
                      borderRadius: '10px !important',
                      border: 'none !important',
                      color: 'white !important',
                      fontSize: '14px !important',
                      fontWeight: '600 !important',
                      padding: '10px 20px !important',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3), 0 0 20px rgba(52, 152, 219, 0.5) !important',
                      outline: 'none !important',
                      transition: 'all 0.2s ease !important',
                      cursor: 'pointer !important',
                      display: 'inline-block !important',
                    },
                    buttonBack: {
                      color: 'white',
                      fontSize: '14px',
                      marginRight: '10px',
                    },
                    buttonSkip: {
                      color: 'rgba(255,255,255,0.7)',
                      fontSize: '14px',
                    },
                    overlay: {
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    },
                    spotlight: {
                      borderRadius: '12px',
                    },
                    spotlightLegacy: {
                      borderRadius: '12px',
                    },
                    buttonClose: {
                      display: 'none',
                    },
                  }}
                  floaterProps={{
                    disableAnimation: false,
                  }}
                />
              </>
            )}

          </div>
        </div>
      </div>

      {/* Tooltip for View Public Profile button */}
      <Tooltip
        id="view-public-profile-tooltip"
        place="bottom"
        content={t('dashboard.profile.common.viewPublicProfile')}
        isOpen={isTooltipOpen}
        className="!bg-gray-800 !text-white !border !border-gray-600 !rounded-lg !px-2 !py-1"
        style={{ fontSize: "12px", zIndex: 9999 }}
      />
    </>
  );
});

export default Profile;
