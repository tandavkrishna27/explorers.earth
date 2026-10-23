import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SampleBadge } from "./SampleBadge";
import { SampleActions } from "./SampleActions";
import { readIsSample } from "./readIsSample";
import { useSampleCommands } from "./useSampleCommands";

/**
 * WP11. The publish-control state any list/detail page needs for a possibly-sample collection:
 * pass `disabled` + `reason` to its publish pill or switch, and hide sharing when `hideSharing`.
 */
export function useSampleState(collection: unknown) {
  const { t } = useTranslation();
  const isSample = readIsSample(collection);
  return {
    isSample,
    publishDisabled: isSample,
    publishReason: isSample ? t("samples.cannotPublish", "Samples can't be published. Make it mine to edit and publish it.") : undefined,
    hideSharing: isSample,
  };
}

type Props = {
  /** The page's collection (any shape carrying `isSample`) and its id. */
  collection: unknown;
  listId: string;
  /** Refetch the page's own read after Make it mine. */
  onChanged?: () => void;
  /**
   * Delete this sample. Defaults to the shared permanent purge; pass the page's own delete when it
   * already has one. Called before `onDeleted`.
   */
  remove?: () => Promise<void>;
  /** Navigate away after the sample is deleted. */
  onDeleted?: () => void;
};

/**
 * WP11. Badge + "Only you can see this · can't be published" + the sample bar (Make it mine,
 * Delete sample) for a list or guide page. Renders nothing for an ordinary collection, so a page
 * can mount it unconditionally under its title.
 */
export function SampleListBanner({ collection, listId, onChanged, remove, onDeleted }: Props) {
  const { t } = useTranslation();
  const commands = useSampleCommands(listId, onChanged);
  if (!readIsSample(collection)) return null;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <SampleBadge />
        <span>{t("samples.onlyYouCantPublish", "Only you can see this · can't be published")}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-yellow-400/30 bg-yellow-400/[.06] p-3">
        <p className="m-0 min-w-0 flex-[1_1_16rem] text-sm text-gray-200">{t("samples.bar", "A sample to show how a list works. Keep it, delete it, or make it yours to edit and publish.")}</p>
        <SampleActions
          onMakeMine={async () => {
            try { await commands.makeMine(); toast.success(t("samples.madeMineToast", "It's yours now. Edit it and publish when ready.")); }
            catch (error) { toast.error((error as Error).message); throw error; }
          }}
          onDelete={async () => {
            try { await (remove ?? commands.remove)(); toast.success(t("samples.deletedToast", "Sample deleted")); onDeleted?.(); }
            catch (error) { toast.error((error as Error).message); throw error; }
          }} />
      </div>
    </div>
  );
}
