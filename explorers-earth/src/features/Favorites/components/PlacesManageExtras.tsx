import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { PlaceCollectionDetails } from "../../../../../tunes/shared/explorersPlaceContract";

type Props = {
  /** The list's stored location details, from the owner read; null until it has loaded. */
  location: PlaceCollectionDetails | null;
  save: (details: PlaceCollectionDetails) => Promise<unknown>;
};

/** Places-only list setting on the shared Manage tab (NL-05): the list's social link. The note is the list description. */
export default function PlacesManageExtras({ location, save }: Props) {
  const { t } = useTranslation();
  const [link, setLink] = useState(location?.instagramMediaUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!location) return null;
  const changed = link.trim() !== (location.instagramMediaUrl ?? "");
  const submit = async () => {
    setBusy(true); setProblem(null);
    try { await save({ ...location, instagramMediaUrl: link.trim() || null }); toast.success(t("dashboard.wp6.linkSaved", "Link saved")); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return (
    <section className="grid gap-2 rounded-2xl border border-white/10 bg-[#151a25] p-4">
      <label className="grid gap-1 text-xs">{t("dashboard.wp6.listSocialLink", "Social link for this list")}
        <input className="w-full rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-sm" value={link} placeholder="https://www.instagram.com/…" onChange={(e) => setLink(e.target.value)} /></label>
      {problem && <p role="alert" className="text-xs text-red-300">{problem}</p>}
      <button type="button" disabled={busy || !changed} onClick={() => void submit()} className="justify-self-start min-h-11 rounded-xl border border-white/10 px-4 disabled:opacity-50">
        {t("dashboard.wp6.saveLink", "Save link")}</button>
    </section>
  );
}
