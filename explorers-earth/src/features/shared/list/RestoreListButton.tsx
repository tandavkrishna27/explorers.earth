import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import type { contentCategorySchema } from "../../../../../tunes/shared/explorersContract";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import { slugProblem } from "./slugRules";

type ContentCategory = z.infer<typeof contentCategorySchema>;
type Props = { listId: string; category: ContentCategory; onRestored: () => void };

const newKey = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Named export (ruling): WP3A imports `{ RestoreListButton }`.
export function RestoreListButton({ listId, category, onRestored }: Props) {
  const { t } = useTranslation();
  const [needsSlug, setNeedsSlug] = useState(false);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const restore = async (next?: string) => {
    setBusy(true);
    setProblem(null);
    try {
      const observed = await explorersApiClient.getMyEditableCollection(listId, undefined, { archived: true });
      if (observed.detail.category !== category) {
        setProblem(t("dashboard.wp3b.restoreWrongCategory", "This list belongs to another category."));
        return;
      }
      await explorersApiClient.restoreMyCollection(observed, newKey(), next ? { slug: next } : {});
      onRestored();
    } catch (error) {
      if ((error as { status?: number } | null)?.status === 409) setNeedsSlug(true);
      else setProblem(error instanceof Error && error.message ? error.message : t("dashboard.wp3b.restoreFailed", "Couldn't restore this list. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const alert = problem && <p role="alert" className="text-xs text-red-300">{problem}</p>;
  if (!needsSlug) {
    return (
      <div className="grid gap-1">
        <button type="button" disabled={busy} onClick={() => void restore()} className="min-h-11 rounded-xl border border-dashboard-border px-3 text-dashboard disabled:opacity-50">{t("dashboard.wp3b.restore", "Restore")}</button>
        {alert}
      </div>
    );
  }
  const slugError = slug ? slugProblem(slug) : null;
  return (
    <div className="grid gap-1">
      <label className="grid gap-1 text-xs">{t("dashboard.wp3b.restoreNeedsUrl", "That URL is used by another list. Pick a new one:")}
        <input value={slug} onChange={(e) => setSlug(e.target.value.trim())} aria-invalid={!!slugError} className="w-full rounded-lg border border-white/10 bg-dashboard-muted px-2 py-1" /></label>
      {slugError && <p className="text-xs text-red-300">{slugError}</p>}
      <button type="button" disabled={busy || !!slugProblem(slug)} onClick={() => void restore(slug)} className="min-h-11 rounded-xl bg-blue-400 px-3 text-white disabled:opacity-50">{t("dashboard.wp3b.restore", "Restore")}</button>
      {alert}
    </div>
  );
}
