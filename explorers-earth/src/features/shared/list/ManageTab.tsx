import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { slugProblem } from "./slugRules";
import type { ListPageAdapter } from "./listPageAdapter";
import { ManageLinkedLists } from "./OwnerListLinks";

export default function ManageTab({ adapter }: { adapter: ListPageAdapter }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const list = adapter.list;
  const [title, setTitle] = useState(list?.title ?? "");
  const [description, setDescription] = useState(list?.description ?? "");
  const [slug, setSlug] = useState(list?.slug ?? "");
  const [confirming, setConfirming] = useState<null | "archive" | "delete">(null);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!list) return null;
  const slugError = slug === list.slug ? null : slugProblem(slug);
  const run = async (work: () => Promise<void>, done: string, after?: () => void) => {
    setProblem(null);
    setBusy(true);
    try { await work(); toast.success(done); after?.(); }
    catch (error) { setProblem(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const field = "w-full rounded-lg border border-white/10 bg-[#0b0f15] px-3 py-2 text-sm";
  const backToCategory = () => navigate(`/recommendations/${adapter.category}`);
  return (
    <div className="grid gap-4 pt-3">
      {problem && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-300">{problem}</p>}
      <section className="grid gap-3 rounded-2xl border border-white/10 bg-[#151a25] p-4">
        <label className="grid gap-1 text-xs">{t("dashboard.wp3b.listName", "List name")}
          <input className={field} maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="grid gap-1 text-xs">{t("dashboard.wp3b.description", "Description")}
          <textarea className={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <button type="button" disabled={busy || !title.trim()} onClick={() => run(() => adapter.rename({ title: title.trim(), description: description.trim() || null }), t("dashboard.wp3b.saved", "Saved"))}
          className="justify-self-start min-h-11 rounded-xl bg-blue-400 px-4 text-white disabled:opacity-50">{t("dashboard.wp3b.saveDetails", "Save details")}</button>
      </section>
      {adapter.renderManageExtras?.()}
      {/* WP11: a sample has no public URL to rename until it is made yours. */}
      {!list.isSample && <section className="grid gap-2 rounded-2xl border border-white/10 bg-[#151a25] p-4">
        <label className="grid gap-1 text-xs">{t("dashboard.wp3b.listUrl", "List URL")}
          <input className={field} value={slug} onChange={(e) => setSlug(e.target.value.trim())} aria-invalid={!!slugError} /></label>
        {slugError ? <p className="text-xs text-red-300">{slugError}</p>
          : slug !== list.slug && <p className="text-xs text-gray-400">{t("dashboard.wp3b.slugKeepsWorking", "Old links and printed QR codes keep working.")}</p>}
        <button type="button" disabled={busy || slug === list.slug || !!slugError} onClick={() => run(() => adapter.rename({ slug }), t("dashboard.wp3b.urlSaved", "URL updated"))}
          className="justify-self-start min-h-11 rounded-xl border border-white/10 px-4 disabled:opacity-50">{t("dashboard.wp3b.saveUrl", "Save URL")}</button>
      </section>}
      {/* LNK-08: link roles are a guide feature; the guide editor's Manage tab is this tab. */}
      <ManageLinkedLists collectionId={list.id} rolesEnabled={(adapter.category as string) === "guides"} />
      <section className="grid gap-3 rounded-2xl border border-red-400/30 p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setConfirming("archive")} className="min-h-11 rounded-xl border border-white/10 px-4">{t("dashboard.wp3b.archiveList", "Archive list")}</button>
          <button type="button" onClick={() => { setConfirming("delete"); setTyped(""); }} className="min-h-11 rounded-xl border border-red-400/40 px-4 text-red-300">{t("dashboard.wp3b.deleteList", "Delete permanently")}</button>
        </div>
        {confirming === "archive" && (
          <div className="grid gap-2 text-sm">
            <p>{t("dashboard.wp3b.archiveExplain", "Archived lists are hidden and free their URL. Restore them from Archived on the category page.")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-xl border border-white/10 px-4">{t("dashboard.wp3b.cancel", "Cancel")}</button>
              <button type="button" disabled={busy} onClick={() => run(adapter.archive, t("dashboard.wp3b.archived", "List archived"), backToCategory)} className="min-h-11 rounded-xl bg-blue-400 px-4 text-white disabled:opacity-50">{t("dashboard.wp3b.archive", "Archive")}</button>
            </div>
          </div>
        )}
        {confirming === "delete" && (
          <div className="grid gap-2 text-sm">
            <p>{t("dashboard.wp3b.deleteExplain", "This deletes the list and its link for good. It can't be undone.")}</p>
            <label className="grid gap-1 text-xs">{t("dashboard.wp3b.typeToConfirm", 'Type "{{name}}" to confirm', { name: list.title })}
              <input className={field} value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="min-h-11 rounded-xl border border-white/10 px-4">{t("dashboard.wp3b.cancel", "Cancel")}</button>
              <button type="button" disabled={busy || typed !== list.title} onClick={() => run(adapter.purge, t("dashboard.wp3b.deleted", "List deleted"), backToCategory)}
                className="min-h-11 rounded-xl bg-red-500 px-4 text-white disabled:opacity-50">{t("dashboard.wp3b.deleteForever", "Delete forever")}</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
