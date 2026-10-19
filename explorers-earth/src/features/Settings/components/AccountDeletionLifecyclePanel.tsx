import { useTranslation } from "react-i18next";
import type { CanonicalAccountLifecycleDto } from "../../../services/accountLifecycleService";

/** Pending deletion remains cancellable only through fresh Google recovery. */
export default function AccountDeletionLifecyclePanel({ status, onCancel, onRetry }: {
  status: CanonicalAccountLifecycleDto;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (status.status === "deleted") return <div role="status" aria-live="polite" className="dt-subtext text-white-muted mt-4">
    {t("settings.ui.deletionComplete", "Account deletion is complete. Continue to sign in if you want to use a different account.")}
  </div>;
  if (status.status !== "pending_deletion") return null;
  return <div role="status" aria-live="polite" className="mt-4">
    <p className="dt-subtext text-white-muted">{t("settings.ui.deletionPending", "Account deletion is pending. Access is paused.")}</p>
    <button type="button" className="dt-button mt-3" onClick={onCancel}>{t("settings.ui.cancelDeletionGoogle", "Cancel deletion with Google")}</button>
    <button type="button" className="dt-button mt-3 ml-3" onClick={onRetry}>{t("settings.ui.checkDeletionStatus", "Check deletion status")}</button>
  </div>;
}
