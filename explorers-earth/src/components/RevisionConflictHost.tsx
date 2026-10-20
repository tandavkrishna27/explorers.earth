import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { REVISION_CONFLICT_EVENT } from "../lib/revisionConflict";
import { installConflictToastGuard, showRevisionConflictToast } from "../lib/conflictToast";

/**
 * Says so when a save lost to a newer version, whichever screen made it: this was changed
 * in another tab or device, and Reload fetches the latest. Mounted once, next to the
 * Toaster, because the API client announces conflicts rather than every screen mapping them.
 */
export default function RevisionConflictHost({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    installConflictToastGuard();
    const announce = () => showRevisionConflictToast(t("conflict.changedElsewhere"), t("conflict.reload"), reload);
    window.addEventListener(REVISION_CONFLICT_EVENT, announce);
    return () => window.removeEventListener(REVISION_CONFLICT_EVENT, announce);
  }, [t, reload]);
  return null;
}
