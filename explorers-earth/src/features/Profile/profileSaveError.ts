import type { TFunction } from "i18next";
import { toast } from "sonner";
import { isRevisionConflict } from "../../lib/revisionConflict";
import { showRevisionConflictToast } from "../../lib/conflictToast";
import { handleCooldownMessage, nextAllowedAtFrom } from "./handleCooldown";

/**
 * Tells the owner why a profile save failed. A save that lost to another tab or device
 * (409 "Account changed") gets the conflict message with a Reload action; it used to fall
 * through to "An unexpected error occurred", which offered no way forward.
 */
export function reportProfileSaveError(error: unknown, t: TFunction, reload: () => void = () => window.location.reload()): void {
  if (isRevisionConflict(error)) {
    showRevisionConflictToast(t("conflict.changedElsewhere"), t("conflict.reload"), reload);
    return;
  }
  const nextAllowedAt = nextAllowedAtFrom(error);
  if (nextAllowedAt) {
    toast.error(handleCooldownMessage((key, options) => String(t(key, options as never)), nextAllowedAt));
    return;
  }
  if (typeof error === "object" && error !== null) {
    const saveError = error as {
      graphQLErrors?: { message?: string }[];
      networkError?: unknown;
      message?: string;
    };
    if (saveError.graphQLErrors?.length) {
      toast.error(
        t("toast.error.updateFailedWithError", {
          error: saveError.graphQLErrors[0]?.message || t("toast.error.graphQLErrorOccurred"),
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
}
