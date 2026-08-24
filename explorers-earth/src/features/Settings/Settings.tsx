import { memo, useState, useEffect, useMemo } from "react";
import BillingTab from "./components/BillingTab";
import EyeOffIcon from "../../assets/icons/EyeOffIcon";
import EyeOnIcon from "../../assets/icons/EyeOnIcon";
import Button from "../../components/ui/Button";
import { gql, useMutation, useQuery } from "@apollo/client";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { localTunesRequest } from "../../lib/apiClient";
import {
  updatePasswordMutation,
  deleteAccountMutation,
  accountQuery,
  addReasonForLeavingMutation,
  updateBlockedStatusMutation,
  updateTabVisibilityMutation,
  CHECK_PUBLISHED_LISTS,
} from "./api/mutation";
import useAuthStore from "../../store/store";
import { toast } from "sonner";
import Modal from "../../components/ui/Modal";
import { useNavigate } from "react-router-dom";
import { loginQuery } from "../Authentication/api/mutation";
import { EarthLoader } from "../../components/EarthLoader";
import PasswordInput from "../../components/ui/PasswordInput";
import { validatePassword } from "../../utils/passwordValidator";
import { useTranslation } from "react-i18next";
import LanguageSelector, { LANGUAGES } from "./components/LanguageSelector";
import ConnectedAccounts from "./components/ConnectedAccounts";
import ProfileAccountSettings from "./components/ProfileAccountSettings";
import { getPublicCategoryListCountsQuery } from "../PublicHome/api/query";

const SETTINGS_TABS = ["account", "billing"] as const;

const providerQuery = gql`
  query UsersPermissionsUser($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      provider
    }
  }
`;

const Settings = memo(() => {
  // Tab state
  const [activeTab, setActiveTab] = useState<'account' | 'billing'>('account');
  // navigate hook
  const navigate = useNavigate();
  // State for toggling password visibility
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  // state for handling password modal
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  // accessing the data form the global state
  const { user, logout, updateUserBlocked } = useAuthStore();
  // local state for handling the password
  const [newPassword, setNewPassword] = useState<string>("");
  // local state for handling the password
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  // local state for handling the password
  const [currentPassword, setCurrentPassword] = useState<string>("");
  // Password validation states
  const [isNewPasswordValid, setIsNewPasswordValid] = useState<boolean>(false);
  // update password mutation
  const [updatePassword] = useMutation(updatePasswordMutation);
  const [login] = useMutation(loginQuery);
  // accessing user status
  const userBlocked = user?.blocked;
  // status update mutation
  const [updateBlockedStatus] = useMutation(updateBlockedStatusMutation);
  // local state for modal
  const [showModal, setShowModal] = useState<boolean>(false);
  const [password, setPassword] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [showDeleteAccountModal, setShowDeleteAccountModal] =
    useState<boolean>(false);
  const [deleteStep, setDeleteStep] = useState<number>(1); // 1: confirm, 2: user details, 3: reason, 4: confirm delete
  const [deleteUsername, setDeleteUsername] = useState<string>("");
  const [deletePassword, setDeletePassword] = useState<string>("");
  const [deletePasswordConfirm, setDeletePasswordConfirm] =
    useState<string>("");
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>("");
  const [deleteAccountLoading, setDeleteAccountLoading] =
    useState<boolean>(false);
  // Password visibility states for delete account modal
  const [deletePasswordVisible, setDeletePasswordVisible] = useState<boolean>(false);
  const [deletePasswordConfirmVisible, setDeletePasswordConfirmVisible] = useState<boolean>(false);
  // State for tracking password change redirect loading
  const [
    isRedirectingAfterPasswordChange,
    setIsRedirectingAfterPasswordChange,
  ] = useState<boolean>(false);
  const [addReasonForLeaving] = useMutation(addReasonForLeavingMutation);
  const [updateTabVisibility] = useMutation(updateTabVisibilityMutation);
  // Optimistic UI state for tab visibility toggles
  const [tabVisibilityOverrides, setTabVisibilityOverrides] = useState<Record<string, any>>({});
  const [tabVisibilityLoading, setTabVisibilityLoading] = useState<Record<string, boolean>>({});
  const [publicVisibilitySectionOpen, setPublicVisibilitySectionOpen] = useState<boolean>(false);
  const [pinnedNavTabsSectionOpen, setPinnedNavTabsSectionOpen] = useState<boolean>(false);
  const [languageSectionOpen, setLanguageSectionOpen] = useState<boolean>(false);
  const [connectedAccountsSectionOpen, setConnectedAccountsSectionOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  const { data } = useQuery(providerQuery, {
    variables: {
      documentId: user?.documentId,
    },
    skip: !user?.documentId,
  });

  const { data: accountData } = useQuery(accountQuery, {
    variables: {
      filters: {
        username: {
          eq: deleteUsername,
        },
      },
    },
    skip: !deleteUsername,
  });

  // Query for current user's account data for tab visibility settings
  const { data: currentUserAccountData, refetch: refetchAccountData, loading: settingsLoading } = useQuery(accountQuery, {
    variables: {
      filters: {
        username: {
          eq: user?.username,
        },
      },
    },
    skip: !user?.username,
  });

  const currentAccount = currentUserAccountData?.accounts?.[0];
  const accountDocumentId = currentAccount?.documentId;

  const {
    data: publishedListsData,
    loading: publishedListsLoading,
    error: publishedListsError,
  } = useQuery(CHECK_PUBLISHED_LISTS, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "network-only",
  });

  const { data: listCountsData } = useQuery(getPublicCategoryListCountsQuery, {
    variables: {
      accountDocumentId,
    },
    skip: !accountDocumentId,
  });

  const { data: musicPlaylists } = useReactQuery<any[]>({
    queryKey: ['tunes-playlists', user?.username],
    queryFn: () => localTunesRequest('GET', `/api/playlists?username=${user?.username}`),
    enabled: !!user?.username && currentAccount?.localtunes_integrated === "Yes",
  });

  useEffect(() => {
    if (!settingsLoading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [settingsLoading]);

  const [deleteAccount] = useMutation(deleteAccountMutation);
  const { t, i18n } = useTranslation();

  // Helper to get the current language and handle settings search matching
  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const handleSettingsTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % SETTINGS_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = SETTINGS_TABS.length - 1;
    }

    const nextTab = SETTINGS_TABS[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`settings-tab-${nextTab}`)?.focus();
  };

  // Helper to get the effective toggle value (optimistic override > server data)
  const getTabVisibility = (tabType: string): boolean => {
    if (tabType === 'public_profile') return true;
    if (tabType in tabVisibilityOverrides) {
      return tabVisibilityOverrides[tabType] as boolean;
    }
    return currentUserAccountData?.accounts?.[0]?.[tabType] === "Yes";
  };

  const getAutoPinningEnabled = (): boolean => {
    if ('auto_pinning' in tabVisibilityOverrides) {
      return tabVisibilityOverrides['auto_pinning'] as boolean;
    }
    const val = currentUserAccountData?.accounts?.[0]?.auto_pinning;
    return val === null || val === undefined ? true : val;
  };

  const isAutoPinningEnabled = getAutoPinningEnabled();

  // Map each tab ID to its published list count
  const categoryListCountMap: Record<string, number> = useMemo(() => ({
    public_recommendations: listCountsData?.recommendationLists?.length ?? 0,
    public_movie:           listCountsData?.movieLists?.length ?? 0,
    public_books:           listCountsData?.bookLists?.length ?? 0,
    public_games:           listCountsData?.gameLists?.length ?? 0,
    public_apps:            listCountsData?.appLists?.length ?? 0,
    public_products:        listCountsData?.productLists?.length ?? 0,
    public_people:          listCountsData?.personLists?.length ?? 0,
    public_guides:          listCountsData?.guides?.length ?? 0,
    public_music:           0,
    public_profile:         0,
  }), [listCountsData]);

  // Get list of currently published categories (visibility is ON)
  const publishedTabs = useMemo(() => {
    const keys = [
      'public_profile',
      'public_recommendations',
      'public_music',
      'public_guides',
      'public_movie',
      'public_books',
      'public_games',
      'public_apps',
      'public_products',
      'public_people'
    ];
    return keys.filter(key => getTabVisibility(key));
  }, [currentUserAccountData, tabVisibilityOverrides]);

  // Compute which tabs are auto-pinned based on published categories and list counts
  const autoPinnedTabs = useMemo(() => {
    const profileTab = publishedTabs.includes('public_profile') ? ['public_profile'] : [];
    const otherTabs = publishedTabs
      .filter(key => key !== 'public_profile')
      .sort((a, b) => (categoryListCountMap[b] ?? 0) - (categoryListCountMap[a] ?? 0));
    return [...profileTab, ...otherTabs].slice(0, 5);
  }, [publishedTabs, categoryListCountMap]);

  const getPinnedNavTabs = (): string[] => {
    let pinned: string[] = [];
    if ('pinned_nav_tabs' in tabVisibilityOverrides) {
      pinned = tabVisibilityOverrides['pinned_nav_tabs'] || [];
    } else {
      pinned = currentUserAccountData?.accounts[0]?.pinned_nav_tabs || [];
    }
    if (!pinned.includes('public_profile')) {
      return ['public_profile', ...pinned];
    }
    return pinned;
  };

  const isTabPinned = (tabType: string): boolean => {
    if (tabType === 'public_profile') return true;
    if (isAutoPinningEnabled) {
      return autoPinnedTabs.includes(tabType);
    }
    return getPinnedNavTabs().includes(tabType);
  };

  const handleAutoPinningToggle = async (enabled: boolean) => {
    const currentAccount = currentUserAccountData?.accounts[0];
    if (!currentAccount?.documentId) {
      toast.error("Account not found");
      return;
    }

    setTabVisibilityOverrides(prev => ({ ...prev, auto_pinning: enabled }));
    setTabVisibilityLoading(prev => ({ ...prev, auto_pinning: true }));

    try {
      await updateTabVisibility({
        variables: {
          documentId: currentAccount.documentId,
          data: {
            auto_pinning: enabled
          }
        }
      });
      toast.success("Navigation pinning mode updated successfully");
      await refetchAccountData();
    } catch (error) {
      console.error("Error updating auto pinning:", error);
      toast.error("Failed to update navigation pinning mode");
    } finally {
      setTabVisibilityOverrides(prev => {
        const next = { ...prev };
        delete next['auto_pinning'];
        return next;
      });
      setTabVisibilityLoading(prev => ({ ...prev, auto_pinning: false }));
    }
  };

  const handleNavPinUpdate = async (tabType: string, isPinned: boolean) => {
    const currentAccount = currentUserAccountData?.accounts[0];
    if (!currentAccount?.documentId) {
      toast.error("Account not found");
      return;
    }

    let currentPinned = getPinnedNavTabs();

    if (isPinned) {
      if (currentPinned.length >= 5) {
        toast.error("You can only select up to 5 tabs for the navigation menu");
        return;
      }
      currentPinned = [...currentPinned, tabType];
    } else {
      currentPinned = currentPinned.filter(t => t !== tabType);
    }

    setTabVisibilityOverrides(prev => ({ ...prev, pinned_nav_tabs: currentPinned }));
    setTabVisibilityLoading(prev => ({ ...prev, [`pin_${tabType}`]: true }));

    try {
      await updateTabVisibility({
        variables: {
          documentId: currentAccount.documentId,
          data: {
            pinned_nav_tabs: currentPinned
          }
        }
      });
      toast.success("Navigation tabs updated successfully");
      await refetchAccountData();
    } catch (error) {
      console.error("Error updating pinned tabs:", error);
      toast.error("Failed to update navigation menu settings");
    } finally {
      setTabVisibilityOverrides(prev => {
        const next = { ...prev };
        delete next['pinned_nav_tabs'];
        return next;
      });
      setTabVisibilityLoading(prev => ({ ...prev, [`pin_${tabType}`]: false }));
    }
  };

  // Function to update tab visibility with optimistic UI
  const handleTabVisibilityUpdate = async (tabType: string, isVisible: boolean) => {
    const currentAccount = currentUserAccountData?.accounts[0];
    if (!currentAccount?.documentId) {
      toast.error("Account not found");
      return;
    }

    if (isVisible) {
      // Guard: do not validate while the query is still loading or has errored.
      // Without this, publishedListsData is undefined and every check evaluates
      // to 0 > 0 = false, incorrectly blocking users who do have published lists.
      if (publishedListsLoading) {
        toast.info("Checking your published lists, please wait…");
        return;
      }
      if (publishedListsError) {
        toast.error("Could not verify your published lists. Please try again.");
        return;
      }

      let hasPublished = false;
      let errorMsg = "";

      switch (tabType) {
        case "public_books":
          hasPublished = (publishedListsData?.bookLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published book list to make Books public.";
          break;
        case "public_games":
          hasPublished = (publishedListsData?.gameLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published game list to make Games public.";
          break;
        case "public_apps":
          hasPublished = (publishedListsData?.appLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published app list to make Apps & Tools public.";
          break;
        case "public_products":
          hasPublished = (publishedListsData?.productLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published product list to make Products public.";
          break;
        case "public_movie":
          hasPublished = (publishedListsData?.movieLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published movie list to make Movies public.";
          break;
        case "public_people":
          hasPublished = (publishedListsData?.personLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published people list to make People public.";
          break;
        case "public_guides":
          hasPublished = (publishedListsData?.guides?.length ?? 0) > 0;
          errorMsg = "You must have at least one published guide to make Guides public.";
          break;
        case "public_recommendations":
          hasPublished = (publishedListsData?.recommendationLists?.length ?? 0) > 0;
          errorMsg = "You must have at least one published place list to make Recommendations public.";
          break;
        case "public_music":
          hasPublished = currentAccount?.localtunes_integrated === "Yes" &&
            (musicPlaylists?.some((pl: any) => pl.isVisibleToGuests === true) ?? false);
          errorMsg = "You must have at least one published playlist to make Music public.";
          break;
        default:
          hasPublished = true;
          break;
      }

      if (!hasPublished) {
        toast.error(errorMsg);
        return;
      }
    }

    // Automatically unpin the tab if it is being hidden
    let newPinnedTabs = getPinnedNavTabs();
    let unpinned = false;
    if (!isVisible && newPinnedTabs.includes(tabType)) {
      newPinnedTabs = newPinnedTabs.filter(t => t !== tabType);
      unpinned = true;
    }

    // Optimistic: toggle immediately + show loading
    setTabVisibilityOverrides(prev => ({ 
      ...prev, 
      [tabType]: isVisible,
      ...(unpinned ? { pinned_nav_tabs: newPinnedTabs } : {}) 
    }));
    setTabVisibilityLoading(prev => ({ ...prev, [tabType]: true }));

    try {
      const updateData: any = { [tabType]: isVisible ? "Yes" : "No" };
      if (unpinned) {
        updateData.pinned_nav_tabs = newPinnedTabs;
      }

      await updateTabVisibility({
        variables: {
          documentId: currentAccount.documentId,
          data: updateData
        }
      });

      toast.success(`Tab visibility updated successfully`);
      await refetchAccountData(); // Refresh the data
      // Clear override since server data is now up-to-date
      setTabVisibilityOverrides(prev => {
        const next = { ...prev };
        delete next[tabType];
        if (unpinned) delete next['pinned_nav_tabs'];
        return next;
      });
    } catch (error) {
      console.error("Error updating tab visibility:", error);
      toast.error("Failed to update tab visibility");
      // Revert optimistic update on failure
      setTabVisibilityOverrides(prev => {
        const next = { ...prev };
        delete next[tabType];
        if (unpinned) delete next['pinned_nav_tabs'];
        return next;
      });
    } finally {
      setTabVisibilityLoading(prev => ({ ...prev, [tabType]: false }));
    }
  };

  // function to update password
  const handleUpdatePassword = async () => {
    // Validate current password is provided
    if (!currentPassword.trim()) {
      toast.error(t("settings.account.changePassword.currentPasswordRequired"));
      return;
    }

    // Validate new password using centralized validator
    const newPasswordValidation = validatePassword(newPassword, {
      currentPassword: currentPassword,
    });

    if (!newPasswordValidation.isValid) {
      toast.error(t("auth.validations.general.fillRequiredFields"));
      return;
    }

    // Validate password confirmation
    if (newPassword !== confirmPassword) {
      toast.error(t("auth.validations.confirmPassword.mustMatch"));
      return;
    }

    try {
      // mutation
      await updatePassword({
        variables: {
          currentPassword: currentPassword,
          password: newPassword,
          passwordConfirmation: confirmPassword,
        },
      });

      // success handling
      toast.success(t("settings.account.changePassword.successMessage"));



      // reseting the local state
      setNewPassword("");
      setCurrentPassword("");
      setConfirmPassword("");
      setShowPasswordModal(false);

      // Show loading state during redirect delay
      setIsRedirectingAfterPasswordChange(true);

      // Security: Log out user and redirect to login after password change
      // This ensures the old session is invalidated and user must re-authenticate
      setTimeout(() => {
        // Clear any stored tokens
        localStorage.removeItem("qrtoken");
        // Log out from global state
        logout();
        // Redirect to login page
        navigate("/login");
        // Reset loading state (though component will unmount)
        setIsRedirectingAfterPasswordChange(false);
      }, 2000); // Give user time to see the success message
    } catch (err) {
      // error handling
      const errorMessage =
        (err as any)?.graphQLErrors?.[0]?.message ||
        t("toast.error.failedToUpdatePassword");
      toast.error(errorMessage);
      setShowPasswordModal(false);
    }
  };

  // deactive user account
  const handleConfirmDeactivateAccount = async () => {


    const isGoogleUser = data?.usersPermissionsUser?.provider === "google";

    if (!username) {
      toast.error(t("settings.account.changePassword.accountDetailsRequired"));
      return;
    }

    // Only validate password for manual auth users
    if (!isGoogleUser && !password) {
      toast.error(t("settings.account.changePassword.accountDetailsRequired"));
      return;
    }

    try {
      // Only validate password by login for manual auth users
      if (!isGoogleUser) {
        // login
        const response = await login({
          // passing variables
          variables: {
            input: {
              identifier: username,
              password: password,
            },
          },
        });

        if (!response.data) {
          return;
        }
      }

      // Proceed with account deactivation/activation
      try {
        const response = await updateBlockedStatus({
          variables: {
            updateUsersPermissionsUserId: user?.id,
            data: { blocked: !userBlocked },
          },
        });
        if (response.data) {
          toast.success(
            userBlocked
              ? t("settings.account.deactivateAccount.activatedMessage")
              : t("settings.account.deactivateAccount.successMessage")
          );
          updateUserBlocked(!userBlocked);
          setShowModal(false);
          navigate("/");
          logout();
        }
      } catch (error) {
        console.error(error);
        toast.error(t("settings.account.changePassword.updateAccountStatusFailed"));
      }
    } catch (error) {
      const errorMessage =
        (error as any)?.graphQLErrors?.[0]?.message || t("toast.error.somethingWentWrong");
      toast.error(errorMessage);
      // logging the error as well
    }
  };

  // Multi-step modal handlers
  const handleDeleteAccountStep2 = () => {
    const isGoogleUser = data?.usersPermissionsUser?.provider === "google";

    if (!deleteUsername) {
      toast.error(t("auth.validations.general.fillRequiredFields"));
      return;
    }

    // Only validate password for manual auth users
    if (!isGoogleUser) {
      if (!deletePassword || !deletePasswordConfirm) {
        toast.error(t("auth.validations.general.fillRequiredFields"));
        return;
      }
      if (deletePassword !== deletePasswordConfirm) {
        toast.error(t("auth.validations.confirmPassword.mustMatch"));
        return;
      }
    }

    setDeleteStep(3);
  };

  const handleDeleteAccountStep3 = async () => {
    if (!deleteReason.trim()) {
      toast.error(t("settings.account.deleteAccount.step4.reasonRequired"));
      return;
    }
    try {
      await addReasonForLeaving({
        variables: {
          Reasons: { reason: deleteReason },
          User_Details: {
            username: deleteUsername,
            userID: user?.id,
            email: user?.email,
            address: accountData?.accounts?.[0]?.Addresss,
          },
        },
      });
      setDeleteStep(4);
    } catch (error) {
      toast.error(t("settings.account.changePassword.saveReasonFailed"));
    }
  };

  const handleDeleteAccountFinal = async () => {
    if (deleteConfirmation.trim() !== t("settings.account.deleteAccount.step4.confirmTextValue")) {
      toast.error(
        t("settings.account.deleteAccount.step4.confirmationRequired")
      );
      return;
    }

    const isGoogleUser = data?.usersPermissionsUser?.provider === "google";

    setDeleteAccountLoading(true);
    try {
      // Only validate password for manual auth users
      if (!isGoogleUser) {
        // Validate password before proceeding with deletion
        if (!deletePassword.trim()) {
          toast.error(t("settings.account.changePassword.passwordRequiredForDeletion"));
          setDeleteAccountLoading(false);
          return;
        }

        // First, validate the password by attempting to login
        const loginResponse = await login({
          variables: {
            input: {
              identifier: deleteUsername,
              password: deletePassword,
            },
          },
        });

        if (!loginResponse.data?.login?.jwt) {
          toast.error(t("settings.account.changePassword.invalidPassword"));
          setDeleteAccountLoading(false);
          return;
        }
      }

      // Proceed with account deletion
      if (
        !accountData ||
        !accountData.accounts ||
        !accountData.accounts[0]?.documentId
      ) {
        toast.error(
          t("settings.account.changePassword.accountDocumentIdNotFound")
        );
        setDeleteAccountLoading(false);
        return;
      }

      await deleteAccount({
        variables: {
          deleteUsersPermissionsUserId: user?.id,
          filters: {
            documentId: {
              eq: user?.documentId,
            },
          },
          deleteAccountDocumentId2: accountData.accounts[0].documentId,
          documentId: user?.documentId,
        },
      });
      toast.success(t("settings.account.deleteAccount.step4.successMessage"));
      setShowDeleteAccountModal(false);
      setDeleteStep(1);

      // Clear all storage on account deletion
      logout();

      localStorage.removeItem("auth-storage");
      localStorage.removeItem("qrtoken");
      localStorage.removeItem("localTunes_session");
      sessionStorage.removeItem("explorers_user_credentials");
      localStorage.clear();
      sessionStorage.clear();

      // Clear all cookies
      document.cookie.split(";").forEach(function (c) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      navigate("/login");
    } catch (error) {
      console.error(error);
      // Check if it's a login error (invalid password) - only for manual auth users
      if (!isGoogleUser && error instanceof Error && error.message.includes('Invalid identifier or password')) {
        toast.error(t("settings.account.changePassword.invalidPassword"));
      } else {
        toast.error(t("settings.account.changePassword.deleteAccountFailed"));
      }
    } finally {
      setDeleteAccountLoading(false);
    }
  };

  // Show loading screen during password change redirect
  if (isRedirectingAfterPasswordChange) {
    return (
      <div className="bg-dashboard-bg">
        <EarthLoader context="login" statusMessage={t("settings.account.changePassword.redirectMessage")} />
      </div>
    );
  }

  return (
    <div className="dashboard-theme min-h-screen bg-dashboard-bg">
      <div className="bg-dashboard-bg w-full h-full mx-auto max-w-3xl min-h-screen px-4 md:px-6 pt-8 md:pt-5 pb-24 md:pb-6">

        {/* Tab Switcher - Command Palette Pill Style */}
        <div className="w-full mb-6 flex justify-center">
          <div
            className="flex items-center bg-dashboard-muted border border-dashboard font-poppins rounded-[24px] p-1"
            role="tablist"
            aria-label="Settings sections"
          >
            <button
              id="settings-tab-account"
              type="button"
              role="tab"
              aria-selected={activeTab === 'account'}
              aria-controls="settings-panel-account"
              tabIndex={activeTab === 'account' ? 0 : -1}
              onClick={() => setActiveTab('account')}
              onKeyDown={(event) => handleSettingsTabKeyDown(event, 0)}
              className={`min-h-11 px-4 py-2 text-xs font-semibold transition-all duration-200 whitespace-nowrap rounded-[20px] ${
                activeTab === 'account'
                  ? 'bg-dashboard-accent text-[var(--dash-accent-text)] shadow-sm'
                  : 'bg-transparent text-dashboard-muted hover:text-dashboard'
              }`}
            >
              Account
            </button>
            <button
              id="settings-tab-billing"
              type="button"
              role="tab"
              aria-selected={activeTab === 'billing'}
              aria-controls="settings-panel-billing"
              tabIndex={activeTab === 'billing' ? 0 : -1}
              onClick={() => setActiveTab('billing')}
              onKeyDown={(event) => handleSettingsTabKeyDown(event, 1)}
              className={`min-h-11 px-4 py-2 text-xs font-semibold transition-all duration-200 whitespace-nowrap rounded-[20px] ${
                activeTab === 'billing'
                  ? 'bg-dashboard-accent text-[var(--dash-accent-text)] shadow-sm'
                  : 'bg-transparent text-dashboard-muted hover:text-dashboard'
              }`}
            >
              Billing
            </button>
          </div>
        </div>

        {activeTab === 'account' && (
          <div
            id="settings-panel-account"
            role="tabpanel"
            aria-labelledby="settings-tab-account"
            className="flex flex-col gap-1.5"
          >
            <ProfileAccountSettings section="account" />

            {/* Search bar */}
            <div
              className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl border"
              style={{
                background: 'var(--dash-search-bg, hsl(var(--dashboard-sidebar)))',
                borderColor: 'var(--dash-border)',
              }}
            >
              <svg width="14" height="14" fill="none" stroke="hsl(var(--blue-cta))" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search settings..."
                className="w-full bg-transparent text-xs text-dashboard font-poppins outline-none border-none"
              />
            </div>

            {/* ── QUICK ACCESS section ── */}
            {((data?.usersPermissionsUser?.provider !== 'google' && matchesSearch("change password security last changed")) ||
              matchesSearch("language preference display english locale translation") ||
              matchesSearch("public visibility tab visibility profile control display") ||
              matchesSearch("pinned navigation tabs profile control navigation pin menu")) && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dashboard-muted mb-1 font-poppins">Quick Access</p>
                <div
                  className="rounded-xl mb-3"
                  style={{
                    background: 'var(--dash-sidebar-bg, hsl(var(--dashboard-sidebar)))',
                    border: '1px solid var(--dash-border)',
                    overflow: languageSectionOpen ? 'visible' : 'hidden'
                  }}
                >
                  {/* Change Password row — only for non-google users */}
                  {data?.usersPermissionsUser?.provider !== 'google' && matchesSearch("change password security last changed") && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(true)}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-dashboard hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left"
                    >
                      <span className="text-base leading-none">🔒</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-dashboard font-poppins">{t('settings.account.changePassword.text')}</div>
                        <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">{t('settings.account.changePassword.description')}</div>
                      </div>
                      <svg width="14" height="14" fill="none" stroke="var(--dash-border)" viewBox="0 0 24 24" className="flex-shrink-0 group-hover:stroke-[var(--dash-text)] transition-colors">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}

                  {/* Language row */}
                  {matchesSearch("language preference display english locale translation") && (
                    <>
                      <button
                        type="button"
                        onClick={() => setLanguageSectionOpen(prev => !prev)}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left ${
                          data?.usersPermissionsUser?.provider !== 'google' && matchesSearch("change password security last changed")
                            ? 'border-t border-dashboard'
                            : ''
                        }`}
                      >
                        <span className="text-base leading-none">🌐</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-dashboard font-poppins">{t('settings.languagePreference.heading')}</div>
                          <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">Display · {currentLanguage.flag} {currentLanguage.name} ({currentLanguage.nativeName})</div>
                        </div>
                        <svg
                          width="14" height="14" fill="none" stroke="var(--dash-border)" viewBox="0 0 24 24"
                          className={`flex-shrink-0 transition-transform duration-200 ${languageSectionOpen ? 'rotate-90' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {languageSectionOpen && (
                        <div
                          ref={(el) => {
                            if (el && !el.dataset.scrolled) {
                              el.dataset.scrolled = 'true';
                              setTimeout(() => {
                                const rect = el.getBoundingClientRect();
                                const isMobile = window.innerWidth < 768;
                                const bottomOffset = isMobile ? 80 : 20;
                                const cutoff = window.innerHeight - bottomOffset;
                                if (rect.bottom > cutoff) {
                                  const scrollOffset = rect.bottom - cutoff + 20;
                                  window.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                                }
                              }, 100);
                            }
                          }}
                          className="border-t border-dashboard px-4 pb-4 bg-dashboard-bg/20"
                        >
                          <LanguageSelector />
                        </div>
                      )}
                    </>
                  )}

                  {/* Public Visibility row */}
                  {matchesSearch("public visibility tab visibility profile control display") && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPublicVisibilitySectionOpen(prev => !prev)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-t border-dashboard hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left"
                      >
                        <span className="text-base leading-none">👁️</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-dashboard font-poppins">Public Visibility</div>
                          <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">Profile · Control which tabs appear on your public profile</div>
                        </div>
                        <svg
                          width="14" height="14" fill="none" stroke="var(--dash-border)" viewBox="0 0 24 24"
                          className={`flex-shrink-0 transition-transform duration-200 ${publicVisibilitySectionOpen ? 'rotate-90' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Public Visibility expanded panel */}
                      {publicVisibilitySectionOpen && (
                        <div
                          ref={(el) => {
                            if (el && !el.dataset.scrolled) {
                              el.dataset.scrolled = 'true';
                              setTimeout(() => {
                                const rect = el.getBoundingClientRect();
                                const isMobile = window.innerWidth < 768;
                                const bottomOffset = isMobile ? 80 : 20;
                                const cutoff = window.innerHeight - bottomOffset;
                                if (rect.bottom > cutoff) {
                                  const scrollOffset = rect.bottom - cutoff + 20;
                                  window.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                                }
                              }, 100);
                            }
                          }}
                          className="border-t border-dashboard px-4 py-4 space-y-2 bg-dashboard-bg/20"
                        >
                          {[
                            { key: 'public_profile', label: 'Profile Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                            )},
                            { key: 'public_recommendations', label: 'Places Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                            )},
                            { key: 'public_music', label: 'Music Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 12a7.971 7.971 0 00-1.343-4.243 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            )},
                            { key: 'public_guides', label: 'Guides Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>
                            )},
                            { key: 'public_movie', label: 'Movies & Shows Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                            )},
                            { key: 'public_books', label: 'Books Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                            )},
                            { key: 'public_games', label: 'Games Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            )},
                            { key: 'public_apps', label: 'Apps & Tools Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5.2-3H6.8V6h10.4v11z" />
                              </svg>
                            )},
                            { key: 'public_products', label: 'Products Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h14v12zm-7-8c-1.66 0-3-1.34-3-3H7c0 2.76 2.24 5 5 5s5-2.24 5-5h-2c0 1.66-1.34 3-3 3z" />
                              </svg>
                            )},
                            { key: 'public_people', label: 'People Tab', icon: (
                              <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            )},
                          ].map(({ key, label, icon }) => {
                            const isProfile = key === 'public_profile';
                            return (
                              <div key={key} className={`flex items-center justify-between py-1.5 transition-opacity duration-150 ${isProfile ? 'opacity-50 cursor-not-allowed select-none' : ''}`}>
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                                    {icon}
                                  </div>
                                  <span className="text-xs text-white font-poppins">{label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {tabVisibilityLoading[key] && (
                                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  )}
                                  <label className={`relative inline-flex items-center ${
                                    tabVisibilityLoading[key] || isProfile ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'
                                  }`}>
                                    <input
                                      type="checkbox"
                                      className="sr-only peer"
                                      checked={getTabVisibility(key)}
                                      disabled={isProfile}
                                      onChange={(e) => handleTabVisibilityUpdate(key, e.target.checked)}
                                    />
                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                                  </label>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* Pinned Navigation Tabs row */}
                  {matchesSearch("pinned navigation tabs profile control navigation pin menu") && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPinnedNavTabsSectionOpen(prev => !prev)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-t border-dashboard hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left"
                      >
                        <span className="text-base leading-none">📌</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-dashboard font-poppins">Pinned Navigation Tabs</div>
                          <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">Navigation · Select up to 5 enabled tabs to pin to your public profile's navigation</div>
                        </div>
                        <svg
                          width="14" height="14" fill="none" stroke="var(--dash-border)" viewBox="0 0 24 24"
                          className={`flex-shrink-0 transition-transform duration-200 ${pinnedNavTabsSectionOpen ? 'rotate-90' : ''}`}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Pinned Navigation Tabs expanded panel */}
                      {pinnedNavTabsSectionOpen && (
                        <div
                          ref={(el) => {
                            if (el && !el.dataset.scrolled) {
                              el.dataset.scrolled = 'true';
                              setTimeout(() => {
                                const rect = el.getBoundingClientRect();
                                const isMobile = window.innerWidth < 768;
                                const bottomOffset = isMobile ? 80 : 20;
                                const cutoff = window.innerHeight - bottomOffset;
                                if (rect.bottom > cutoff) {
                                  const scrollOffset = rect.bottom - cutoff + 20;
                                  window.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                                }
                              }, 100);
                            }
                          }}
                          className="border-t border-white/5 px-4 py-4 space-y-4 bg-white/[0.01]"
                        >
                          {/* Auto Pinning Toggle Switch */}
                          <div className="flex items-center justify-between pb-3 border-b border-white/5">
                            <div className="flex-1 min-w-0 pr-4">
                              <span className="text-xs font-semibold text-white font-poppins">Auto-pin navigation tabs</span>
                              <p className="text-[10px] text-white/40 font-poppins mt-0.5">
                                Automatically display your most active categories (with the most lists) in your public navigation menu.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {tabVisibilityLoading['auto_pinning'] && (
                                <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              )}
                              <label className={`relative inline-flex items-center ${
                                tabVisibilityLoading['auto_pinning'] ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'cursor-pointer'
                              }`}>
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={isAutoPinningEnabled}
                                  disabled={tabVisibilityLoading['auto_pinning']}
                                  onChange={(e) => handleAutoPinningToggle(e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                              </label>
                            </div>
                          </div>

                          <p className="text-[10px] text-white/50 font-poppins mb-1">
                            {isAutoPinningEnabled 
                              ? "Auto-pinning is active. The system automatically selects and pins your categories." 
                              : "Select up to 5 enabled tabs to pin to your public profile's navigation."}
                          </p>
                          <div className="space-y-2">
                            {[
                              { key: 'public_profile', label: 'Profile Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                              )},
                              { key: 'public_recommendations', label: 'Places Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                              )},
                              { key: 'public_music', label: 'Music Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 12a7.971 7.971 0 00-1.343-4.243 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                              )},
                              { key: 'public_guides', label: 'Guides Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385a7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10a7.968 7.968 0 00-14.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" /></svg>
                              )},
                              { key: 'public_movie', label: 'Movies & Shows Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                              )},
                              { key: 'public_books', label: 'Books Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                              )},
                              { key: 'public_games', label: 'Games Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                              )},
                              { key: 'public_apps', label: 'Apps & Tools Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-5 18c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5.2-3H6.8V6h10.4v11z" />
                                </svg>
                              )},
                              { key: 'public_products', label: 'Products Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h14v12zm-7-8c-1.66 0-3-1.34-3-3H7c0 2.76 2.24 5 5 5s5-2.24 5-5h-2c0 1.66-1.34 3-3 3z" />
                                </svg>
                              )},
                              { key: 'public_people', label: 'People Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                              )},
                            ].map(({ key, label, icon }) => {
                              const isProfile = key === 'public_profile';
                              const isEnabled = getTabVisibility(key);
                              const isPinned = isTabPinned(key);
                              return (
                                <div key={key} className={`flex items-center justify-between py-1.5 transition-opacity duration-150 ${(isProfile || (!isEnabled && !isPinned)) ? 'opacity-50 cursor-not-allowed select-none' : ''}`}>
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-dashboard-muted' : 'bg-dashboard-muted/40 opacity-40'}`}>
                                      {icon}
                                    </div>
                                    <span className={`text-xs font-poppins ${isEnabled ? 'text-dashboard' : 'text-dashboard-muted'}`}>
                                      {label}
                                      {!isEnabled && <span className="text-[9px] text-white/35 ml-1.5 font-normal font-poppins">(Visibility off)</span>}
                                      {isAutoPinningEnabled && isPinned && (
                                        <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full ml-1.5 font-medium font-poppins">
                                          Auto-pinned
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {tabVisibilityLoading[`pin_${key}`] && (
                                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                    )}
                                    <label className={`relative inline-flex items-center ${
                                      tabVisibilityLoading[`pin_${key}`] || !isEnabled || isProfile || isAutoPinningEnabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    }`}>
                                      <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={isPinned}
                                        disabled={!isEnabled || tabVisibilityLoading[`pin_${key}`] || isProfile || isAutoPinningEnabled}
                                        onChange={(e) => handleNavPinUpdate(key, e.target.checked)}
                                      />
                                      <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                                    </label>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* ── CONNECTED ACCOUNTS section ── */}
            {matchesSearch("connected accounts local tunes external platform integration google") && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dashboard-muted mb-1 font-poppins">Connected Accounts</p>
                <div
                  className="rounded-xl overflow-hidden mb-3"
                  style={{ background: 'var(--dash-sidebar-bg, hsl(var(--dashboard-sidebar)))', border: '1px solid var(--dash-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setConnectedAccountsSectionOpen(prev => !prev)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left"
                  >
                    <span className="text-base leading-none">🔗</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-dashboard font-poppins">Connected Accounts</div>
                      <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">Integrations · Manage external music platforms and accounts</div>
                    </div>
                    <svg
                      width="14" height="14" fill="none" stroke="var(--dash-border)" viewBox="0 0 24 24"
                      className={`flex-shrink-0 transition-transform duration-200 ${connectedAccountsSectionOpen ? 'rotate-90' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {connectedAccountsSectionOpen && (
                    <div
                      ref={(el) => {
                        if (el && !el.dataset.scrolled) {
                          el.dataset.scrolled = 'true';
                          setTimeout(() => {
                            const rect = el.getBoundingClientRect();
                            const isMobile = window.innerWidth < 768;
                            const bottomOffset = isMobile ? 80 : 20;
                            const cutoff = window.innerHeight - bottomOffset;
                            if (rect.bottom > cutoff) {
                              const scrollOffset = rect.bottom - cutoff + 20;
                              window.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                            }
                          }, 100);
                        }
                      }}
                      className="border-t border-dashboard px-2 py-2 bg-dashboard-bg/20"
                    >
                      <ConnectedAccounts />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── DANGER ZONE section ── */}
            {((matchesSearch("deactivate account block remove danger") || matchesSearch("delete account permanently remove danger"))) && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-dashboard-muted mb-1 font-poppins">Danger Zone</p>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.15)' }}
                >
                  {/* Deactivate Account row */}
                  {matchesSearch("deactivate account block remove danger") && (
                    <button
                      type="button"
                      onClick={() => { setUsername(user?.username || ''); setShowModal(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b hover:bg-red-500/5 transition-colors duration-150 group text-left"
                      style={{ borderColor: 'rgba(248,113,113,0.1)' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-dashboard-danger font-poppins">{t('settings.account.deactivateAccount.text')}</div>
                        <div className="text-[10px] text-dashboard-danger opacity-70 font-poppins mt-0.5">{t('settings.account.deactivateAccount.description')}</div>
                      </div>
                      <svg width="14" height="14" fill="none" stroke="var(--dash-danger)" viewBox="0 0 24 24" className="flex-shrink-0 group-hover:stroke-[var(--dash-danger)] transition-colors">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}

                  {/* Delete Account row */}
                  {matchesSearch("delete account permanently remove danger") && (
                    <button
                      type="button"
                      onClick={() => { setDeleteUsername(user?.username || ''); setShowDeleteAccountModal(true); setDeleteStep(1); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/5 transition-colors duration-150 group text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-dashboard-danger font-poppins">{t('settings.account.deleteAccount.text')}</div>
                        <div className="text-[10px] text-dashboard-danger opacity-70 font-poppins mt-0.5">{t('settings.account.deleteAccount.description')}</div>
                      </div>
                      <svg width="14" height="14" fill="none" stroke="var(--dash-danger)" viewBox="0 0 24 24" className="flex-shrink-0 group-hover:stroke-[var(--dash-danger)] transition-colors">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── BILLING TAB ── */}
        {activeTab === 'billing' && (
          <div
            id="settings-panel-billing"
            role="tabpanel"
            aria-labelledby="settings-tab-billing"
            className="rounded-2xl px-4 py-4 sm:px-6 sm:py-6 border shadow-xl"
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <ProfileAccountSettings section="billing" />
            <BillingTab />
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <Modal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
        >
          <div className="dashboard-theme flex flex-col gap-6 w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
            <h2 className="dt-heading mb-2">
              {t("settings.account.changePassword.modalTitle")}
            </h2>

            {/* Current Password */}
            <div className="flex flex-col gap-2">
              <label className="dt-label text-sm font-medium">
                {t("settings.account.changePassword.currentPassword")}
              </label>
              <div className="relative w-full">
                <input
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  type={currentPasswordVisible ? "text" : "password"}
                  placeholder={t(
                    "settings.account.changePassword.currentPasswordPlaceholder"
                  )}
                  className="w-full dt-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPasswordVisible(!currentPasswordVisible)
                  }
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white transition-colors"
                >
                  {currentPasswordVisible ? <EyeOnIcon /> : <EyeOffIcon />}
                </button>
              </div>
            </div>

            {/* New Password with Validation */}
            <div className="w-full">
              <PasswordInput
                value={newPassword}
                onChange={setNewPassword}
                label={t("settings.account.changePassword.newPassword")}
                labelColor="white"
                placeholder={t(
                  "settings.account.changePassword.newPasswordPlaceholder"
                )}
                currentPassword={currentPassword}
                showStrengthMeter={true}
                onValidationChange={(isValid) => setIsNewPasswordValid(isValid)}
                data-testid="new-password-input"
              />
            </div>

            {/* Confirm Password */}
            <div className="w-full">
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                label={t("settings.account.changePassword.confirmPassword")}
                labelColor="white"
                placeholder={t(
                  "settings.account.changePassword.confirmPasswordPlaceholder"
                )}
                showStrengthMeter={false}
                showValidationStatus={false}
                data-testid="confirm-password-input"
              />

              {/* Password match indicator */}
              {confirmPassword && (
                <div className="mt-2">
                  {newPassword === confirmPassword ? (
                    <div className="flex items-center text-green-500 dt-subtext">
                      <svg
                        className="w-3 h-3 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{t("auth.validations.confirmPassword.match")}</span>
                    </div>
                  ) : (
                    <div className="flex items-center text-white-danger dt-subtext">
                      <svg
                        className="w-3 h-3 mr-1"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{t("auth.validations.confirmPassword.mustMatch")}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Update Button */}
            <div className="flex justify-end mt-6">
              <Button
                btnText={t("settings.account.changePassword.updateButton")}
                size="small"
                variant="primary"
                onClickHandler={handleUpdatePassword}
                disabled={
                  !isNewPasswordValid ||
                  newPassword !== confirmPassword ||
                  !currentPassword.trim()
                }
              />
            </div>
          </div>
        </Modal>
      )
      }

      {/* Deactivate Account Modal */}
      {
        showModal && (
          <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
            <div className="dashboard-theme flex flex-col gap-6 w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
              <h1 className="dt-heading">{t("settings.account.deactivateAccount.modalTitle")}</h1>
              <p className="dt-label text-white-muted">
                {t("settings.account.deactivateAccount.modalDescription")}
              </p>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <label className="dt-label text-sm font-medium">
                    {t("settings.account.deactivateAccount.enterUsername")}
                  </label>
                  <div className="relative w-full">
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      type={"text"}
                      placeholder={t(
                        "settings.account.deactivateAccount.usernamePlaceholder"
                      )}
                      className="dt-input w-full"
                      readOnly
                    />
                  </div>
                </div>
                {/* Only show password field for manual auth users */}
                {data?.usersPermissionsUser?.provider !== "google" && (
                  <div className="flex flex-col gap-2">
                    <label className="dt-label text-sm font-medium">
                      {t("settings.account.deactivateAccount.enterPassword")}
                    </label>
                    <div className="relative w-full">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type={loginPassword ? "text" : "password"}
                        placeholder={t(
                          "settings.account.deactivateAccount.passwordPlaceholder"
                        )}
                        className="dt-input w-full"
                      />
                      <button
                        type="button"
                        onClick={() => setLoginPassword(!loginPassword)}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white transition-colors"
                      >
                        {loginPassword ? <EyeOnIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-6">
                <Button
                  btnText={`${userBlocked
                    ? t(
                      "settings.account.deactivateAccount.deactivatedButton"
                    )
                    : t("settings.account.deactivateAccount.confirmButton")
                    }`}
                  type="button"
                  size="small"
                  variant="danger"
                  onClickHandler={handleConfirmDeactivateAccount}
                />
              </div>
            </div>
          </Modal>
        )
      }

      {/* Multi-step Delete Account Modals */}
      {
        showDeleteAccountModal && deleteStep === 1 && (
          <Modal
            isOpen={showDeleteAccountModal}
            onClose={() => setShowDeleteAccountModal(false)}
          >
            <div className="dashboard-theme w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
              <h1 className="dt-heading">{t("settings.account.deleteAccount.step1.modalTitle")}</h1>
              <p className="dt-label w-3/4 text-white-muted mt-6">
                {t("settings.account.deleteAccount.step1.modalDescription")}
              </p>
              <p className="dt-label w-3/4 text-white-muted mt-2">
                {t("settings.account.deleteAccount.step1.modalDescription2")}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-6">
                <Button
                  btnText={t("common.cancel")}
                  type="button"
                  size="xsmall"
                  variant="green"
                  onClickHandler={() => {
                    setShowDeleteAccountModal(false);
                    setUsername(user?.username || "");
                    setShowModal(true);
                  }}
                />
                <Button
                  btnText={t(
                    "settings.account.deleteAccount.step1.continueButton"
                  )}
                  type="button"
                  size="xsmall"
                  variant="dashAccent"
                  onClickHandler={() => setDeleteStep(2)}
                />
              </div>
            </div>
          </Modal>
        )
      }

      {
        showDeleteAccountModal && deleteStep === 2 && (
          <Modal
            isOpen={showDeleteAccountModal}
            onClose={() => setShowDeleteAccountModal(false)}
          >
            <div className="dashboard-theme w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
              <h1 className="dt-heading">{t("settings.account.deleteAccount.step2.modalTitle")}</h1>
              <div className="flex flex-col mt-6 gap-2 md:justify-center mx-auto">
                <div className="flex flex-col gap-1 dt-subtext">
                  <h1> {t("settings.account.deleteAccount.step2.enterUsername")}</h1>
                  <div className="relative w-full">
                    <input
                      value={deleteUsername}
                      onChange={(e) => setDeleteUsername(e.target.value)}
                      type="text"
                      placeholder={t(
                        "settings.account.deleteAccount.step2.usernamePlaceholder"
                      )}
                      className="dt-input w-full"
                      readOnly
                    />
                  </div>
                </div>

                {/* Only show password fields for manual auth users */}
                {data?.usersPermissionsUser?.provider !== "google" && (
                  <>
                    <div className="flex flex-col gap-1 dt-subtext">
                      <h1> {t("settings.account.deleteAccount.step2.enterPassword")}</h1>
                      <div className="relative w-full">
                        <input
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          type={deletePasswordVisible ? "text" : "password"}
                          placeholder={t(
                            "settings.account.deleteAccount.step2.passwordPlaceholder"
                          )}
                          className="dt-input w-full"
                        />
                        <button
                          type="button"
                          onClick={() => setDeletePasswordVisible(!deletePasswordVisible)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white transition-colors"
                          aria-label={deletePasswordVisible ? t('common.hidePassword') : t('common.showPassword')}
                        >
                          {deletePasswordVisible ? <EyeOnIcon /> : <EyeOffIcon />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1 dt-subtext">
                      <h1>
                        {t("settings.account.deleteAccount.step2.confirmPassword")}
                      </h1>
                      <div className="relative w-full">
                        <input
                          value={deletePasswordConfirm}
                          onChange={(e) => setDeletePasswordConfirm(e.target.value)}
                          type={deletePasswordConfirmVisible ? "text" : "password"}
                          placeholder={t(
                            "settings.account.deleteAccount.step2.confirmPasswordPlaceholder"
                          )}
                          className="dt-input w-full"
                        />
                        <button
                          type="button"
                          onClick={() => setDeletePasswordConfirmVisible(!deletePasswordConfirmVisible)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 cursor-pointer text-gray-400 hover:text-white transition-colors"
                          aria-label={deletePasswordConfirmVisible ? t('common.hidePassword') : t('common.showPassword')}
                        >
                          {deletePasswordConfirmVisible ? <EyeOnIcon /> : <EyeOffIcon />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end mt-8">
                <Button
                  btnText={t(
                    "settings.account.deleteAccount.step2.continueButton"
                  )}
                  type="button"
                  size="xsmall"
                  variant="primary"
                  onClickHandler={handleDeleteAccountStep2}
                />
              </div>
            </div>
          </Modal>
        )
      }

      {
        showDeleteAccountModal && deleteStep === 3 && (
          <Modal
            isOpen={showDeleteAccountModal}
            onClose={() => setShowDeleteAccountModal(false)}
          >
            <div className="dashboard-theme w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
              <h1 className="dt-heading">{t("settings.account.deleteAccount.step3.modalTitle")}</h1>
              <div className="flex flex-col mt-6 gap-2 md:justify-center mx-auto">
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder={t(
                    "settings.account.deleteAccount.step3.reasonPlaceholder"
                  )}
                  className="dt-input w-full min-h-[100px]"
                />
              </div>
              <div className="flex justify-end mt-8">
                <Button
                  btnText={t(
                    "settings.account.deleteAccount.step3.continueButton"
                  )}
                  type="button"
                  size="xsmall"
                  variant="primary"
                  onClickHandler={handleDeleteAccountStep3}
                />
              </div>
            </div>
          </Modal>
        )
      }

      {
        showDeleteAccountModal && deleteStep === 4 && (
          <Modal
            isOpen={showDeleteAccountModal}
            onClose={() => setShowDeleteAccountModal(false)}
          >
            <div className="dashboard-theme w-full mx-auto min-w-[300px] sm:min-w-[500px] md:min-w-[600px] max-w-2xl py-4 sm:py-6 md:py-8 px-6 sm:px-8 md:px-12">
              <h1 className="dt-heading"> {t("settings.account.deleteAccount.step4.modalTitle")}</h1>
              <div className="flex flex-col mt-8 gap-4 md:justify-center mx-auto">
                <h1 className="dt-subtext">{t("settings.account.deleteAccount.step4.confirmText")}</h1>
                <div className="relative w-full">
                  <input
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    type="text"
                    placeholder={t(
                      "settings.account.deleteAccount.step4.confirmPlaceholder"
                    )}
                    className="dt-input w-full"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-8">
                <Button
                  btnText={t(
                    "settings.account.deleteAccount.step4.deleteButton"
                  )}
                  type="button"
                  size="xsmall"
                  variant="danger"
                  onClickHandler={handleDeleteAccountFinal}
                  isLoading={deleteAccountLoading}
                  disabled={deleteAccountLoading}
                />
              </div>
            </div>
          </Modal>
        )
      }
    </div >
  );
});

export default Settings;
