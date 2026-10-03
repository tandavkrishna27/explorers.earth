import { MusicPublishSwitch } from "../music/components/MusicPublishSwitch";
import { useMusicPublish } from "../music/MusicPublishProvider";
import { NavigationStatus } from "../navigation/NavigationStatus";
import { useCategoryNavigation } from "../navigation/CategoryNavigationProvider";
import { CATEGORY_IDS, type CategoryId } from "../navigation/categoryNavigationPolicy";
import { memo, useState, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import BillingTab from "./components/BillingTab";
import { UnpublishCategoryDialog } from "./components/UnpublishCategoryDialog";
import EyeOffIcon from "../../assets/icons/EyeOffIcon";
import EyeOnIcon from "../../assets/icons/EyeOnIcon";
import Button from "../../components/ui/Button";
import { gql, useMutation, useQuery } from "@apollo/client";
import {
  updatePasswordMutation,
} from "./api/mutation";
import useAuthStore from "../../store/store";
import { toast } from "sonner";
import Modal from "../../components/ui/Modal";
import { useNavigate } from "react-router-dom";
import { EarthLoader } from "../../components/EarthLoader";
import PasswordInput from "../../components/ui/PasswordInput";
import { validatePassword } from "../../utils/passwordValidator";
import { useTranslation } from "react-i18next";
import LanguageSelector, { LANGUAGES } from "./components/LanguageSelector";
import ProfileAccountSettings from "./components/ProfileAccountSettings";
import { getPublicCategoryListCountsQuery } from "../PublicHome/api/query";
import { createCanonicalAccountLifecycleService, type CanonicalAccountLifecycleDto } from "../../services/accountLifecycleService";
import AccountDeletionLifecyclePanel from "./components/AccountDeletionLifecyclePanel";
import { useAccountLifecycleIdentity } from "../../services/useAccountLifecycleIdentity";
import { computePinnedNavTabIds } from "../../utils/navPinning";
import { useOwnerMusicAvailability } from "../music/PublicMusicAvailabilityProvider";
import { useCanonicalAccount } from "../Profile/api/useCanonicalAccount";
import { useLogout } from "../../hooks/useLogout";
import { closeLocalMusicSession } from "../music/musicSessionBoundary";

// Retained category UI reads its legacy settings projection until category conversion.
// The transport in main.tsx strips all canonical/session credentials from this read.
const settingsAccountQuery = gql`
  query SettingsAccount($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      documentId
      accounts {
        documentId Account_Name Account_Type mobile_number Addresss public_profile
        public_recommendations public_music public_movie public_guides public_books
        public_games public_apps public_products public_people pinned_nav_tabs auto_pinning
      }
    }
  }
`;


const Settings = memo(() => {
  const identity = useAccountLifecycleIdentity();
  // Identity changes discard modal credentials and all old action authority in
  // the same render. A same-user profile refresh retains the current workflow.
  return <IdentitySettings key={identity.key} lifecycleIdentity={identity} />;
});

const IdentitySettings = ({ lifecycleIdentity }: { lifecycleIdentity: ReturnType<typeof useAccountLifecycleIdentity> }) => {
  const categoryNavigation = useCategoryNavigation();
  const musicPublishing = useMusicPublish(categoryNavigation.authority, { ready: true });
  // Tab state
  const [activeTab, setActiveTab] = useState<'account' | 'billing'>('account');
  const settingsTabs = ['account', 'billing'] as const;
  const handleSettingsTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + settingsTabs.length) % settingsTabs.length;
    else if (event.key === 'ArrowRight') nextIndex = (index + 1) % settingsTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = settingsTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = settingsTabs[nextIndex];
    setActiveTab(nextTab);
    document.getElementById(`settings-tab-${nextTab}`)?.focus();
  };
  // navigate hook
  const navigate = useNavigate();
  // State for toggling password visibility
  const [currentPasswordVisible, setCurrentPasswordVisible] = useState(false);
  // state for handling password modal
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  // accessing the data form the global state
  const { user, logout } = useAuthStore();
  const endSession = useLogout();
  const canonicalAccount = useCanonicalAccount();
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
  // accessing user status
  const userBlocked = user?.blocked;
  // status update mutation
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
  const [deletionFeedbackId, setDeletionFeedbackId] = useState<string | null>(null);
  const feedbackAttempt = useRef<{ reason: string; key: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string>("");
  const [deleteAccountLoading, setDeleteAccountLoading] =
    useState<boolean>(false);
  const [deletionLifecycle, setDeletionLifecycle] = useState<CanonicalAccountLifecycleDto | null>(null);
  const [deletionAuthorityResolved, setDeletionAuthorityResolved] = useState(false);
  const lifecycleActionRunning = useRef(false);
  const lifecycleStatusSequence = useRef(0);
  // Password visibility states for delete account modal
  const [deletePasswordVisible, setDeletePasswordVisible] = useState<boolean>(false);
  const [deletePasswordConfirmVisible, setDeletePasswordConfirmVisible] = useState<boolean>(false);
  // State for tracking password change redirect loading
  const [
    isRedirectingAfterPasswordChange,
    setIsRedirectingAfterPasswordChange,
  ] = useState<boolean>(false);
  const [publicVisibilitySectionOpen, setPublicVisibilitySectionOpen] = useState<boolean>(false);
  const [pinnedNavTabsSectionOpen, setPinnedNavTabsSectionOpen] = useState<boolean>(false);
  const [languageSectionOpen, setLanguageSectionOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [unpublishTarget, setUnpublishTarget] = useState<{ category: Exclude<CategoryId, "public_music">; label: string } | null>(null);
  const navigationSaving = categoryNavigation.busy || !categoryNavigation.authority;
  const isCategoryPending = (category: CategoryId) => (categoryNavigation.pending ?? []).some(
    (operation) => operation.kind === "category" && operation.category === category,
  );
  const navigationHeading = useRef<HTMLHeadingElement>(null);

  const data = { usersPermissionsUser: { provider: "google" } };

  const { loading: settingsLoading } = useQuery(settingsAccountQuery, {
    variables: { documentId: user?.documentId }, skip: !user?.documentId,
  });
  const navigationAccountDocumentId = categoryNavigation.snapshot?.scope.accountDocumentId;
  const { data: listCountsData } = useQuery(getPublicCategoryListCountsQuery, {
    variables: {
      accountDocumentId: navigationAccountDocumentId,
    },
    skip: !navigationAccountDocumentId,
  });

  useEffect(() => {
    if (!settingsLoading) {
      (window as any).__dashboardLoaded = true;
    }
  }, [settingsLoading]);

  const { t, i18n } = useTranslation();
  const navText = (key: string, fallback: string) => {
    const fullKey = `settings.publicNavigation.${key}`;
    const value = t(fullKey, { defaultValue: fallback });
    return value === fullKey ? fallback : value;
  };
  const musicPinHints: Record<typeof musicPublishing.state.kind, string | null> = {
    loading: t('music.publication.checking', { defaultValue: 'Checking Music publication…' }),
    published: null,
    draft: t('music.publication.private', { defaultValue: 'Music is private.' }),
    saving: t('music.publication.saving', { defaultValue: 'Saving and verifying Music publication…' }),
    'needs-attention': t('music.publication.attention', { defaultValue: 'Music sharing needs attention. Review or make it private.' }),
    unknown: musicPublishing.state.errorCode === 'scope-changed'
      ? t('music.publication.notReady', { defaultValue: 'Music is not ready for this account. Other settings remain available.' })
      : t('music.publication.unknown', { defaultValue: 'Music publication was not confirmed. Refresh or retry the previous action.' }),
    conflict: t('music.publication.conflict', { defaultValue: 'Music changed or the previous action expired. Confirm a new action after reviewing the current state.' }),
  };
  useEffect(() => {
    const openNavigation = () => {
      if (window.location.hash !== "#public-navigation" || settingsLoading) return;
      setActiveTab("account"); setSearchQuery(""); setPinnedNavTabsSectionOpen(true);
    };
    openNavigation(); window.addEventListener("hashchange", openNavigation);
    return () => window.removeEventListener("hashchange", openNavigation);
  }, [settingsLoading]);
  useEffect(() => {
    if (window.location.hash !== "#public-navigation" || settingsLoading || activeTab !== "account" || !pinnedNavTabsSectionOpen) return;
    navigationHeading.current?.scrollIntoView?.({ block: "start" });
    navigationHeading.current?.focus({ preventScroll: true });
  }, [settingsLoading, activeTab, pinnedNavTabsSectionOpen]);
  const accountLifecycle = useMemo(() => createCanonicalAccountLifecycleService({ isCurrent: lifecycleIdentity.isCurrent }), [lifecycleIdentity]);

  useEffect(() => {
    if (!lifecycleIdentity.isCurrent()) {
      setDeletionAuthorityResolved(false);
      return;
    }
    let active = true;
    const refresh = async () => {
      if (!lifecycleIdentity.isCurrent() || lifecycleActionRunning.current) return;
      const sequence = ++lifecycleStatusSequence.current;
      const isCurrent = () => active && lifecycleIdentity.isCurrent() && sequence === lifecycleStatusSequence.current;
      setDeletionAuthorityResolved(false);
      try {
        const result = await accountLifecycle.status();
        if (!isCurrent()) return;
        setDeletionLifecycle(result.status === "active" ? null : result);
        setDeletionAuthorityResolved(true);
        if (result.status === "pending_deletion" || result.status === "deleted") {
          setShowDeleteAccountModal(true);
          setDeleteStep(4);
        }
      } catch (error) {
        if (!isCurrent()) return;
        setDeletionLifecycle(null);
        setDeletionAuthorityResolved(false);
      }
    };
    void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, [accountLifecycle, lifecycleIdentity]);

  const deletionIsTerminal = deletionLifecycle?.status === "deleted";
  const deletionActionsBlocked = !deletionAuthorityResolved || deletionIsTerminal;

  const beginLifecycleAction = () => {
    if (!lifecycleIdentity.isCurrent() || lifecycleActionRunning.current) return false;
    lifecycleActionRunning.current = true;
    ++lifecycleStatusSequence.current;
    setDeleteAccountLoading(true);
    return true;
  };
  const finishLifecycleAction = () => {
    if (!lifecycleIdentity.isCurrent()) return;
    lifecycleActionRunning.current = false;
    setDeleteAccountLoading(false);
  };

  // Helper to get the current language and handle settings search matching
  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.language) || LANGUAGES[0];

  const matchesSearch = (text: string) => {
    if (!searchQuery.trim()) return true;
    return text.toLowerCase().includes(searchQuery.toLowerCase());
  };

  const getTabVisibility = (tabType: string): boolean => tabType === "public_profile" || categoryNavigation.snapshot?.visibility[tabType as CategoryId] === "Yes";

  const isAutoPinningEnabled = categoryNavigation.snapshot?.autoPinning ?? true;

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
    public_profile:         0,
  }), [listCountsData]);

  const effectiveAccount = {
    ...categoryNavigation.snapshot?.visibility,
    auto_pinning: categoryNavigation.snapshot?.autoPinning,
    pinned_nav_tabs: categoryNavigation.snapshot?.savedPins,
  };
  const musicAvailability = useOwnerMusicAvailability(navigationAccountDocumentId, effectiveAccount.public_music);
  const musicAvailable = musicAvailability.state === "available" || musicAvailability.state === "revalidating";
  const autoPinnedTabs = computePinnedNavTabIds({ ...effectiveAccount, auto_pinning: true }, categoryListCountMap,
    { musicAvailable });

  const getPinnedNavTabs = (): string[] => {
    const saved = categoryNavigation.snapshot?.savedPins;
    return Array.isArray(saved) && saved.length > 0 ? saved.filter((id): id is string => typeof id === "string") : ["public_profile"];
  };

  const isTabPinned = (tabType: string): boolean => {
    if (tabType === 'public_profile') return true;
    if (isAutoPinningEnabled) {
      return autoPinnedTabs.includes(tabType);
    }
    return getPinnedNavTabs().includes(tabType);
  };

  const handleAutoPinningToggle = (enabled: boolean) => {
    const origin = categoryNavigation.authority;
    if (origin && !navigationSaving) void categoryNavigation.setAutoPinning(enabled, origin);
  };

  const handleNavPinUpdate = (tabType: string, isPinned: boolean) => {
    const origin = categoryNavigation.authority;
    if (!origin || navigationSaving || isAutoPinningEnabled || !CATEGORY_IDS.includes(tabType as CategoryId)) return;
    void categoryNavigation.request({ category: tabType as CategoryId, action: isPinned ? "pin" : "unpin" }, origin);
  };

  const saveTabVisibility = async (tabType: Exclude<CategoryId, "public_music">, isVisible: boolean, wasPinned = false) => {
    const origin = categoryNavigation.authority;
    if (!origin || isCategoryPending(tabType)) return undefined;
    const outcome = await categoryNavigation.request({ category: tabType, action: isVisible ? "publish" : "unpublish" }, origin);
    if (outcome.kind === "confirmed") {
      if (!isVisible) {
        toast.success(wasPinned ? "Category unpublished and removed from navigation." : "Category unpublished.");
      } else if (!isAutoPinningEnabled && !isTabPinned(tabType) && getPinnedNavTabs().length < 5) {
        toast.success("Category is public.", {
          action: {
            label: "Add to navigation",
            onClick: () => {
              const currentAuthority = categoryNavigation.authority;
              if (currentAuthority) void categoryNavigation.request({ category: tabType, action: "pin" }, currentAuthority);
            },
          },
        });
      } else {
        toast.success("Category is public.");
      }
    } else if (outcome.kind === "uncertain" || outcome.kind === "conflict") {
      toast.error("Could not verify this change.", {
        duration: Infinity,
        action: { label: "Retry", onClick: () => { void saveTabVisibility(tabType, isVisible); } },
      });
    } else if (outcome.kind === "cleanup-pending") {
      toast.error("Visibility changed, but navigation needs repair.", {
        duration: Infinity,
        action: { label: "Refresh settings", onClick: () => { void categoryNavigation.refresh(); } },
      });
    }
    return outcome;
  };

  const handleTabVisibilityUpdate = (tabType: string, label: string, isVisible: boolean) => {
    if (tabType === "public_music" || !CATEGORY_IDS.includes(tabType as CategoryId)) return;
    const category = tabType as Exclude<CategoryId, "public_music">;
    if (!isVisible && isTabPinned(category)) {
      setUnpublishTarget({ category, label });
      return;
    }
    void saveTabVisibility(category, isVisible);
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
        closeLocalMusicSession();
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

  // The current Better Auth session is the only authority for these commands.
  const handleConfirmDeactivateAccount = async () => {
    if (!lifecycleIdentity.isCurrent() || lifecycleActionRunning.current) return;
    if (!username.trim() || username.trim() !== user?.username) {
      toast.error(t("settings.account.deactivateAccount.enterUsername")); return;
    }
    const revision = canonicalAccount.data?.revision;
    if (!revision) { toast.error("Account details are unavailable. Retry after refreshing."); return; }
    if (!beginLifecycleAction()) return;
    try {
      await accountLifecycle.deactivate(revision, crypto.randomUUID());
      lifecycleIdentity.assertCurrent();
      toast.success(t("settings.account.deactivateAccount.successMessage"));
      setShowModal(false);
      await endSession({ serverRevoked: true });
    } catch (error) {
      if (lifecycleIdentity.isCurrent()) toast.error(error instanceof Error ? error.message : "Deactivation failed.");
    } finally { finishLifecycleAction(); }
  };

  const handleDeleteAccountStep2 = () => {
    if (!lifecycleIdentity.isCurrent()) return;
    if (!canonicalAccount.data?.id || !deleteUsername.trim() || deleteUsername.trim() !== user?.username) {
      toast.error(t("auth.validations.general.fillRequiredFields"));
      return;
    }
    setDeleteStep(3);
  };

  const handleDeleteAccountStep3 = async () => {
    if (!lifecycleIdentity.isCurrent()) return;
    const reason = deleteReason.trim();
    if (!reason || reason.length > 2000) {
      toast.error(t("settings.account.deleteAccount.step4.reasonRequired"));
      return;
    }
    if (feedbackAttempt.current?.reason !== reason) feedbackAttempt.current = { reason, key: crypto.randomUUID() };
    try {
      const feedback = await accountLifecycle.recordDeletionFeedback(reason, feedbackAttempt.current.key);
      lifecycleIdentity.assertCurrent();
      setDeletionFeedbackId(feedback.id);
      setDeleteStep(4);
    } catch (error) {
      if (lifecycleIdentity.isCurrent()) toast.error(error instanceof Error ? error.message : t("settings.account.changePassword.saveReasonFailed"));
    }
  };

  const deletionAttemptKey = useRef<string | null>(null);
  const handleDeleteAccountFinal = async () => {
    if (!lifecycleIdentity.isCurrent() || deletionActionsBlocked || lifecycleActionRunning.current) return;
    if (deleteConfirmation.trim() !== t("settings.account.deleteAccount.step4.confirmTextValue")) {
      toast.error(t("settings.account.deleteAccount.step4.confirmationRequired"));
      return;
    }
    const revision = canonicalAccount.data?.revision;
    if (!revision || !deletionFeedbackId) { toast.error("Feedback or account details are unavailable."); return; }
    if (!beginLifecycleAction()) return;
    deletionAttemptKey.current ??= crypto.randomUUID();
    try {
      const result = await accountLifecycle.deleteAccount(revision, deletionFeedbackId, deletionAttemptKey.current);
      lifecycleIdentity.assertCurrent();
      setDeletionLifecycle(result);
      toast.success(t("settings.account.deleteAccount.step4.successMessage"));
      await endSession({ serverRevoked: true });
    } catch (error) {
      if (lifecycleIdentity.isCurrent()) toast.error(error instanceof Error ? error.message : t("settings.account.changePassword.deleteAccountFailed"));
    } finally { finishLifecycleAction(); }
  };

  const cancelDurableDeletion = async () => {
    // Pending deletion has no ordinary Actor; cancellation requires a fresh Google recovery proof.
    navigate("/reactivate");
  };

  const retryDurableDeletion = async () => {
    if (!lifecycleIdentity.isCurrent()) return;
    try {
      const result = await accountLifecycle.status();
      if (lifecycleIdentity.isCurrent()) setDeletionLifecycle(result);
    } catch (error) {
      if (lifecycleIdentity.isCurrent()) toast.error(error instanceof Error ? error.message : "Lifecycle status is unavailable.");
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
            role="tablist"
            aria-label="Settings sections"
            className="flex items-center bg-dashboard-muted border border-dashboard font-poppins rounded-[24px] p-1"
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
              matchesSearch("public visibility tab visibility profile control display music") ||
              matchesSearch("music visibility public navigation") ||
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
                  {matchesSearch("public visibility tab visibility profile control display music") && (
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
                        <div role="region" aria-label="Public visibility settings"
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
                            { key: 'public_music', label: 'Music Tab', icon: <span aria-hidden="true">♫</span> },
                          ].map(({ key, label, icon }) => {
                            const isProfile = key === 'public_profile';
                            const rowSaving = !isProfile && key !== 'public_music' && isCategoryPending(key as CategoryId);
                            const rowLabel = <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">{icon}</div>
                              <span className="text-xs text-white font-poppins">{label}</span>
                            </div>;
                            if (key === 'public_music') return <MusicPublishSwitch key={key} origin={categoryNavigation.authority} ready compactLabel={rowLabel} />;
                            return (
                              <div key={key} aria-busy={rowSaving || undefined} className={`flex items-center justify-between py-1.5 transition-opacity duration-150 ${isProfile ? 'opacity-50 cursor-not-allowed select-none' : ''}`}>
                                {rowLabel}
                                <div className="flex items-center gap-2">
                                  {rowSaving && <span className="text-[10px] text-dashboard-muted">Saving and verifying…</span>}
                                  <label className={`relative inline-flex items-center ${
                                    !categoryNavigation.authority || rowSaving || isProfile ? 'pointer-events-none cursor-not-allowed' : 'cursor-pointer'
                                  }`}>
                                    <input
                                      type="checkbox"
                                      aria-label={label}
                                      className="sr-only peer"
                                      checked={getTabVisibility(key)}
                                      disabled={!categoryNavigation.authority || rowSaving || isProfile}
                                      onChange={(e) => handleTabVisibilityUpdate(key, label, e.target.checked)}
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
                  <NavigationStatus navigation={categoryNavigation} />
                  {matchesSearch("pinned navigation tabs profile control navigation pin menu music") && (
                    <>
                      <button
                        type="button"
                        aria-expanded={pinnedNavTabsSectionOpen}
                        aria-controls="public-navigation-panel"
                        onClick={() => setPinnedNavTabsSectionOpen(prev => !prev)}
                        className="w-full flex items-center gap-3 px-4 py-3 border-t border-dashboard hover:bg-dashboard-muted/50 transition-colors duration-150 group text-left"
                      >
                        <span className="text-base leading-none">📌</span>
                        <div className="flex-1 min-w-0">
                          <h3 id="public-navigation" ref={navigationHeading} tabIndex={-1} className="text-xs font-semibold text-dashboard font-poppins scroll-mt-6">{navText("title", "Pinned Navigation Tabs")}</h3>
                          <div className="text-[10px] text-dashboard-muted font-poppins mt-0.5">{navText("summary", "Navigation · Manage your 5 public navigation slots, including Profile")}</div>
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
                          id="public-navigation-panel"
                          dir={i18n.dir?.()}
                          ref={(el) => {
                            if (el && !el.dataset.scrolled) {
                              el.dataset.scrolled = 'true';
                              setTimeout(() => {
                                // Hash navigation already positioned/focused the heading.
                                // Do not move the viewport to the panel bottom afterward.
                                if (!el.isConnected || window.location.hash === '#public-navigation') return;
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
                              <span className="text-xs font-semibold text-dashboard font-poppins">{navText("autoPin", "Auto-pin navigation tabs")}</span>
                              <p className="text-[10px] text-white/40 font-poppins mt-0.5">
                                {navText("autoDescription", "Available Music is prioritized, followed by public categories ranked by list count.")}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <label className={`relative inline-flex items-center ${
                                navigationSaving ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'cursor-pointer'
                              }`}>
                                <input
                                  type="checkbox"
                                  aria-label={navText("autoPin", "Auto-pin navigation tabs")}
                                  className="sr-only peer"
                                  checked={isAutoPinningEnabled}
                                  disabled={navigationSaving}
                                  onChange={(e) => handleAutoPinningToggle(e.target.checked)}
                                />
                                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                              </label>
                            </div>
                          </div>

                          <p className="text-[10px] text-white/50 font-poppins mb-1">
                            {isAutoPinningEnabled 
                              ? navText("autoHelp", "Auto-pinning is active. Available Music comes first, then categories with the most lists, within 5 tabs including Profile.")
                              : navText("manualHelp", "Select up to 5 saved tabs including Profile. Unavailable Music keeps its saved pin and returns when available.")}
                          </p>
                          <div className="space-y-2">
                            {[
                              { key: 'public_profile', label: 'Profile Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-dashboard" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                              )},
                              { key: 'public_music', label: navText('musicTab', 'Music Tab'), icon: <span aria-hidden="true">♫</span> },
                              { key: 'public_recommendations', label: 'Places Tab', icon: (
                                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
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
                              const isEnabled = key === "public_profile" || (key === "public_music" ? musicPublishing.state.kind === "published" : categoryNavigation.snapshot?.visibility[key as CategoryId] === "Yes");
                              const isPinned = isTabPinned(key);
                              const pinHint = key === 'public_music' ? musicPinHints[musicPublishing.state.kind] : !isEnabled ? 'Visibility off' : null;
                              return (
                                <div key={key} className={`flex min-h-11 min-w-0 items-center justify-between gap-3 py-1.5 transition-opacity duration-150 ${(isProfile || (!isEnabled && !isPinned)) ? 'opacity-50' : ''}`}>
                                  <div className="flex min-w-0 items-center gap-2 break-words">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isEnabled ? 'bg-dashboard-muted' : 'bg-dashboard-muted/40 opacity-40'}`}>
                                      {icon}
                                    </div>
                                    <span className={`text-xs font-poppins ${isEnabled ? 'text-dashboard' : 'text-dashboard-muted'}`}>
                                      {label}
                                      {pinHint && <span className="text-[9px] text-white/35 ml-1.5 font-normal font-poppins">({pinHint})</span>}
                                      {isAutoPinningEnabled && isPinned && (
                                        <span className="text-[9px] bg-green-500/10 text-green-400 border border-green-500/20 px-1.5 py-0.5 rounded-full ml-1.5 font-medium font-poppins">
                                          Auto-pinned
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <label className={`relative inline-flex items-center ${
                                      navigationSaving || (!isEnabled && !isPinned) || isProfile || isAutoPinningEnabled ? 'pointer-events-none opacity-50 cursor-not-allowed' : 'cursor-pointer'
                                    }`}>
                                      <input
                                        type="checkbox"
                                        aria-label={key === 'public_music' ? navText('pinMusic', 'Pin Music Tab') : `Pin ${label}`}
                                        className="sr-only peer"
                                        checked={isPinned}
                                        disabled={(!isEnabled && !isPinned) || navigationSaving || isProfile || isAutoPinningEnabled}
                                        onChange={(e) => handleNavPinUpdate(key, e.target.checked)}
                                      />
                                      <div className="w-9 h-5 bg-gray-600 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--dash-focus-ring)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--dash-sidebar-bg)] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
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
                  {!deletionActionsBlocked && matchesSearch("delete account permanently remove danger") && (
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

      <UnpublishCategoryDialog
        open={unpublishTarget !== null}
        categoryName={unpublishTarget?.label.replace(" Tab", "") ?? "Category"}
        pending={unpublishTarget ? isCategoryPending(unpublishTarget.category) : false}
        onCancel={() => setUnpublishTarget(null)}
        onConfirm={async () => {
          if (!unpublishTarget) return;
          const outcome = await saveTabVisibility(unpublishTarget.category, false, true);
          if (outcome?.kind === "confirmed") setUnpublishTarget(null);
        }}
      />

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
              {!deletionActionsBlocked && (<>
                <h1 className="dt-heading"> {t("settings.account.deleteAccount.step4.modalTitle")}</h1>
                <div className="flex flex-col mt-8 gap-4 md:justify-center mx-auto">
                  <h1 className="dt-subtext">{t("settings.account.deleteAccount.step4.confirmText")}</h1>
                  <div className="relative w-full">
                    <input
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      type="text"
                      placeholder={t("settings.account.deleteAccount.step4.confirmPlaceholder")}
                      className="dt-input w-full"
                    />
                  </div>
                </div>
                <div className="flex justify-end mt-8">
                  <Button
                    btnText={t("settings.account.deleteAccount.step4.deleteButton")}
                    type="button"
                    size="xsmall"
                    variant="danger"
                    onClickHandler={handleDeleteAccountFinal}
                    isLoading={deleteAccountLoading}
                    disabled={deleteAccountLoading}
                  />
                </div>
              </>)}
              {deletionLifecycle && (
                <AccountDeletionLifecyclePanel
                  status={deletionLifecycle}
                  onCancel={() => void cancelDurableDeletion()}
                  onRetry={() => void retryDurableDeletion()}
                />
              )}
            </div>
          </Modal>
        )
      }
    </div >
  );
};

export default Settings;
