import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type Props = {
  onCancel: () => void;
  onSave: () => void;
  onSaveAndAddAnother?: () => void;
  saving: null | "save" | "another";
  canSave: boolean;
};

// Sticky bar so Save is always on screen (scope ADD-02, ADD-13, OWN-04). No overlay.
export default function StickyActionBar({ onCancel, onSave, onSaveAndAddAnother, saving, canSave }: Props) {
  const { t } = useTranslation();
  const busy = saving !== null;
  const spinner = <Loader2 aria-hidden className="mr-1 inline h-4 w-4 animate-spin" />;
  return (
    <div role="toolbar" aria-label={t("dashboard.wp4.actions", "Item actions")}
      className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-dashboard-border bg-dashboard-sidebar px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-dashboard backdrop-blur">
      <button type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-xl border border-dashboard-border px-4 text-dashboard">{t("dashboard.wp4.cancel", "Cancel")}</button>
      <span className="flex-1" />
      {onSaveAndAddAnother && (
        <button type="button" onClick={onSaveAndAddAnother} disabled={busy || !canSave} aria-busy={saving === "another"}
          className="min-h-11 rounded-xl border border-blue-400/50 px-4 text-blue-300 disabled:opacity-50">
          {saving === "another" && spinner}{t("dashboard.wp4.saveAndAnother", "Save and add another")}
        </button>
      )}
      <button type="button" onClick={onSave} disabled={busy || !canSave} aria-busy={saving === "save"}
        className="min-h-11 rounded-xl bg-blue-400 px-5 font-medium text-white disabled:opacity-50">
        {saving === "save" && spinner}{t("dashboard.wp4.save", "Save")}
      </button>
    </div>
  );
}
