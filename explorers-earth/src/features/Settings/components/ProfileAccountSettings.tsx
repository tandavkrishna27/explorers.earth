import { handleCooldownMessage, handleCooldownFor, nextAllowedAtFrom } from "../../Profile/handleCooldown";
import { HANDLE_CHANGE_COOLDOWN_DAYS } from "../../../../../tunes/shared/explorersContract";
import { isRevisionConflict } from "../../../lib/revisionConflict";
import { showRevisionConflictToast } from "../../../lib/conflictToast";
import { useCallback, useMemo, useRef, useState } from "react";
import { useCanonicalAccount } from "../../Profile/api/useCanonicalAccount";
import { toProfileViewModel } from "../../Profile/api/profileClient";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import ProfileForm from "../../Profile/components/ProfileForm";
import { useUpdateProfile } from "../../Profile/hooks/useUpdateProfile";
import { useReverseGeocoding } from "../../Profile/hooks/useReverseGeocoding";
import {
  createDeferredProfileSave,
  type DeferredProfileSave,
  type KeyValuePair,
  type ProfileSaveResult,
  type SaveTerminalStatus,
} from "../../Profile/types/profileSave";
import type { AddressResult, Places } from "../../Profile/types/types";
import {
  getAccountSettingsFields,
  getBillingAddressFields,
} from "../../Profile/config/profileFormSections";
import { buildProfileInitialValues } from "../../Profile/config/profileInitialValues";
import UsernameChangeConfirmationModal from "../../../components/ui/UsernameChangeConfirmationModal";
import { EarthLoader } from "../../../components/EarthLoader";
import useAuthStore from "../../../store/store";
import { mapAddressComponents } from "../../../utils/mapAddress";
import { validateUsername } from "../../../utils/usernameValidation";
import { selectCompletedAccount } from "../../../lib/explorerAccountSelection";

interface ProfileAccountSettingsProps {
  section: "account" | "billing";
  onFormDirtyChange?: (isDirty: boolean) => void;
  onRegisterSubmit?: (
    submit: (() => Promise<SaveTerminalStatus>) | null,
  ) => void;
}


const ProfileAccountSettings = ({
  section,
  onFormDirtyChange,
  onRegisterSubmit,
}: ProfileAccountSettingsProps) => {
  const { t } = useTranslation();
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) =>
      options ? String(t(key, options as never)) : String(t(key)),
    [t],
  );
  const { user } = useAuthStore();
  const [placesState, setPlacesState] = useState<Places | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [pendingUsername, setPendingUsername] = useState("");
  const pendingUsernameSaveRef = useRef<{
    values: KeyValuePair;
    deferred: DeferredProfileSave;
  } | null>(null);

  const accountQuery = useCanonicalAccount();
  const data: any = accountQuery.data ? { usersPermissionsUser: { username: accountQuery.data.handle,
    accounts: [toProfileViewModel(accountQuery.data)] } } : undefined;
  const { error, refetch } = accountQuery;
  const loading = accountQuery.isLoading;

  const accountCandidates = data?.usersPermissionsUser?.accounts;
  const selectedAccount = selectCompletedAccount(accountCandidates);
  const account = accountCandidates?.find(
    (candidate: { documentId?: string }) =>
      candidate.documentId === selectedAccount?.documentId,
  );
  const resolvedUsername = accountQuery.data?.handle ?? "";
  const hasCompleteAccountSnapshot = Boolean(
    account &&
      resolvedUsername &&
      Object.prototype.hasOwnProperty.call(account, "Addresss") &&
      Object.prototype.hasOwnProperty.call(account, "Feed_Data") &&
      Object.prototype.hasOwnProperty.call(account, "Public_Profile_Address") &&
      Object.prototype.hasOwnProperty.call(account, "social_media"),
  );
  const { handleSubmit: updateProfile } = useUpdateProfile(
    account?.documentId,
    refetch,
  );
  const { currentLocation, mappedAddress, handleGetCurrentLocation } =
    useReverseGeocoding();

  const updatedPlaces: AddressResult = placesState?.address_components?.length
    ? mapAddressComponents(placesState.address_components)
    : currentLocation?.address_components?.length
      ? mapAddressComponents(currentLocation.address_components)
      : mappedAddress || {};

  const initialValues = useMemo(
    () =>
      buildProfileInitialValues({
        account,
        username: resolvedUsername,
        currentLocation,
        updatedPlaces,
        t: translate,
      }),
    [
      account,
      currentLocation,
      data?.usersPermissionsUser?.username,
      resolvedUsername,
      translate,
      updatedPlaces,
      user?.username,
    ],
  );

  const setPlaces = (
    places: Places,
    setFieldValue?: (field: string, value: any) => void,
  ) => {
    setPlacesState(places);
    if (!setFieldValue || !places.address_components) return;

    const mapped = mapAddressComponents(places.address_components);
    if (places.formatted_address) {
      setFieldValue("address", places.formatted_address);
    }
    if (mapped.street_name) setFieldValue("streetName", mapped.street_name);
    if (mapped.city) setFieldValue("city", mapped.city);
    if (mapped.state) setFieldValue("state", mapped.state);
    if (mapped.country) setFieldValue("country", mapped.country);
    if (mapped.postal_code) setFieldValue("postalCode", mapped.postal_code);
  };

  const detectLocation = async (
    setFieldValue?: (field: string, value: any) => void,
  ) => {
    try {
      const locationData = await handleGetCurrentLocation();
      if (locationData && setFieldValue) {
        setPlaces(locationData as Places, setFieldValue);
        toast.success("Location detected and fields updated!");
      }
    } catch {
      // useReverseGeocoding owns the user-facing error state.
    }
  };

  // One change per HANDLE_CHANGE_COOLDOWN_DAYS, enforced by the server, which also says when the next is allowed.
  const handleCooldown = handleCooldownFor(accountQuery.data?.handleChangeAllowedAt);
  const usernameDisabled = handleCooldown.locked;
  const usernameCooldownMessage = handleCooldownMessage(translate, handleCooldown.allowedAt);

  const performSave = async (
    values: KeyValuePair,
  ): Promise<ProfileSaveResult> => {
    try {
      const saved = await updateProfile(values);
      toast.success(
        translate("dashboard.profile.common.savedAndPublishedSuccessfully"),
      );
      return { status: "saved", committedRevision: saved.revision };
    } catch (saveError) {
      if (isRevisionConflict(saveError)) {
        showRevisionConflictToast(translate("conflict.changedElsewhere"), translate("conflict.reload"), () => window.location.reload());
        return { status: "failed" };
      }
      const nextAllowedAt = nextAllowedAtFrom(saveError);
      if (nextAllowedAt) {
        // The server's date wins over what this page thought: another device may have changed it.
        toast.error(handleCooldownMessage(translate, nextAllowedAt));
        return { status: "failed" };
      }
      const message =
        saveError instanceof Error ? saveError.message : "Unexpected error";
      toast.error(
        translate("toast.error.updateFailedWithError", { error: message }),
      );
      return { status: "failed" };
    }
  };

  const handleSubmit = async (
    values: KeyValuePair,
  ): Promise<ProfileSaveResult> => {
    if (section === "billing") {
      return performSave(values);
    }

    const currentUsername = data?.usersPermissionsUser?.username || "";
    const nextUsername =
      typeof values.username === "string" ? values.username.trim() : "";
    const usernameChanged =
      Boolean(nextUsername) && nextUsername !== currentUsername;

    if (usernameChanged && usernameDisabled) {
      toast.error(usernameCooldownMessage);
      return { status: "failed" };
    }

    if (usernameChanged) {
      const validation = validateUsername(nextUsername);
      if (!validation.isValid) {
        toast.error(
          translate("toast.error.invalidUsernameWithError", {
            error: validation.errors[0],
          }),
        );
        return { status: "failed" };
      }

      const deferred = createDeferredProfileSave();
      pendingUsernameSaveRef.current = { values, deferred };
      setPendingUsername(nextUsername);
      setShowUsernameModal(true);
      return deferred.result;
    }

    return performSave(values);
  };

  const confirmUsernameChange = async () => {
    const pending = pendingUsernameSaveRef.current;
    setShowUsernameModal(false);
    if (!pending) return;

    const terminal = await performSave(pending.values);
    pending.deferred.settle(terminal.status === "saved" ? "saved" : "failed",
      terminal.status === "saved" ? terminal.committedRevision : undefined);
    pendingUsernameSaveRef.current = null;
    setPendingUsername("");
  };

  const cancelUsernameChange = () => {
    pendingUsernameSaveRef.current?.deferred.settle("cancelled");
    pendingUsernameSaveRef.current = null;
    setShowUsernameModal(false);
    setPendingUsername("");
  };

  // Apollo can return partial cache data while the network request is pending.
  // Use it only when every preservation-critical field and a trusted username
  // source are present; otherwise mounting Formik could freeze missing values.
  if (loading && !hasCompleteAccountSnapshot) {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <EarthLoader context="profile" size="small" />
      </div>
    );
  }

  if (!hasCompleteAccountSnapshot || (!data?.usersPermissionsUser && error)) {
    return (
      <div className="rounded-xl border border-dashboard p-4 text-sm text-dashboard-danger">
        {translate("dashboard.profile.common.error")}
      </div>
    );
  }

  return (
    <div data-profile-account-settings={section}>
      <ProfileForm
        key={`${section}-${account?.documentId}-${resolvedUsername}`}
        initialValues={initialValues}
        onSubmit={handleSubmit}
        formFields={
          section === "account"
            ? getAccountSettingsFields(translate)
            : getBillingAddressFields(translate)
        }
        setPlaces={setPlaces}
        DetectLocation={detectLocation}
        usernameDisabled={usernameDisabled}
        usernameCooldownMessage={usernameCooldownMessage}
        onFormDirtyChange={onFormDirtyChange}
        onRegisterSubmit={onRegisterSubmit}
        actionsPlacement="inline"
      />

      <UsernameChangeConfirmationModal
        isOpen={showUsernameModal}
        onClose={cancelUsernameChange}
        onConfirm={confirmUsernameChange}
        newUsername={pendingUsername}
        cooldownDays={HANDLE_CHANGE_COOLDOWN_DAYS}
      />
    </div>
  );
};

export default ProfileAccountSettings;
