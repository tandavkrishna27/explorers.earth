import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import DialogPanel from "../ui/DialogPanel";
import type { PublishNudgeReason } from "../../hooks/usePublishNudge";

export interface PublishNudgeProps {
  open: boolean;
  reason: PublishNudgeReason | null;
  kind: "list" | "guide";
  listName: string;
  /** True while the consumer's publish command runs. */
  busy?: boolean;
  onPublish: () => void | Promise<void>;
  /** "Not now", Escape and the backdrop all land here. */
  onNotNow: () => void;
}

const NAME_TOKEN = "\u0000name\u0000";

/** GL-04 nudge dialog, driven by usePublishNudge. Built on DialogPanel (XC-02 overlay audit). */
export function PublishNudge({ open, reason, kind, listName, busy = false, onPublish, onNotNow }: PublishNudgeProps) {
  const { t } = useTranslation();
  if (!open || !reason) return null;

  const body = t(`dashboard.wp2.nudge.body.${reason}`, { name: NAME_TOKEN });
  const [before, after = ""] = body.split(NAME_TOKEN);

  return (
    <AnimatePresence>
      <DialogPanel
        onClose={busy ? () => {} : onNotNow}
        onClick={busy ? undefined : onNotNow}
        className="fixed inset-0 z-[160] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      >
        <motion.div
          className="relative w-full max-w-md rounded-xl border border-dashboard-border bg-dashboard-sidebar p-6 font-poppins shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(event) => event.stopPropagation()}
        >
          <h3 className="mb-2 text-lg font-bold text-dashboard">{t(`dashboard.wp2.nudge.title.${kind}`)}</h3>
          <p className="mb-6 text-sm leading-relaxed text-dashboard-muted">
            {before}
            <span title={listName} className="line-clamp-2 inline font-semibold text-dashboard [overflow-wrap:anywhere]">
              {listName}
            </span>
            {after}
          </p>
          <div className="flex flex-col-reverse gap-3 border-t border-dashboard-border pt-4 sm:flex-row">
            <button
              type="button"
              onClick={onNotNow}
              disabled={busy}
              className="min-h-[44px] flex-1 rounded-lg border border-white/[0.09] bg-transparent px-4 py-2.5 text-sm font-medium text-dashboard disabled:opacity-60"
            >
              {t("dashboard.wp2.nudge.notNow")}
            </button>
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={busy}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border-0 bg-[#60a5fa] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <span aria-hidden="true">🌐</span>}
              {t("dashboard.wp2.nudge.publish")}
            </button>
          </div>
        </motion.div>
      </DialogPanel>
    </AnimatePresence>
  );
}

export default PublishNudge;
