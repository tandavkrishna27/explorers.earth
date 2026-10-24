import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LinkedListCard } from "../../../../../tunes/shared/explorersListLinkContract";
import type { useListLinks } from "./useListLinks";
import { roleSuggestions, roleMax } from "./linkRoles";

export type LinkToast = { message: string; actionLabel?: string; onAction?: () => void; error?: boolean };
type Links = Pick<ReturnType<typeof useListLinks>, "detach" | "setRole" | "busy">;
type Props = { linkedLists: readonly LinkedListCard[]; links: Links; onToast: (toast: LinkToast) => void; onAttach: () => void; rolesEnabled?: boolean };

const messageOf = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** WP10 (LNK-04, OWN-13). Linked lists in Manage: Attach, Detach with Undo, and roles (guides). */
export function LinkedListsPanel({ linkedLists, links, onToast, onAttach, rolesEnabled }: Props) {
  const { t } = useTranslation();
  const headingId = useId();
  const ordered = [...linkedLists].sort((a, b) => a.displayOrder - b.displayOrder);
  return (
    <section aria-labelledby={headingId} className="grid gap-3 rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-4 text-dashboard">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="font-semibold text-dashboard">{t("dashboard.wp10.linkedLists", "Linked lists")}</h3>
        <button type="button" onClick={onAttach} disabled={links.busy} className="min-h-11 rounded-xl border border-dashboard-border px-4 text-dashboard hover:bg-white/5 disabled:opacity-50">{t("dashboard.wp10.attach", "Attach")}</button>
      </div>
      {ordered.length === 0 && <p className="text-sm text-dashboard-muted">{t("dashboard.wp10.emptyManage", "Link another of your lists to show it under this one.")}</p>}
      {ordered.length > 0 && (
        <ul className="grid gap-2">
          {ordered.map((card) => <Row key={card.linkId} card={card} links={links} onToast={onToast} rolesEnabled={rolesEnabled} />)}
        </ul>
      )}
    </section>
  );
}

function Row({ card, links, onToast, rolesEnabled }: { card: LinkedListCard; links: Links; onToast: Props["onToast"]; rolesEnabled?: boolean }) {
  const { t } = useTranslation();
  const title = card.collection.title;
  const preset = card.role === null ? "" : (roleSuggestions as readonly string[]).includes(card.role) ? card.role : "__custom";
  const [mode, setMode] = useState(preset);
  const [custom, setCustom] = useState(preset === "__custom" ? card.role ?? "" : "");
  const fail = (error: unknown, fallback: string) => onToast({ message: messageOf(error, fallback), error: true });
  const detach = async () => {
    try {
      const undo = await links.detach(card);
      onToast({ message: t("dashboard.wp10.detached", "Detached {{title}}", { title }), actionLabel: t("dashboard.wp10.undo", "Undo"),
        onAction: () => { undo().catch((error) => fail(error, t("dashboard.wp10.undoFailed", "Couldn't undo"))); } });
    } catch (error) { fail(error, t("dashboard.wp10.detachFailed", "Couldn't detach the list")); }
  };
  const saveRole = (role: string | null) => { links.setRole(card, role).catch((error) => fail(error, t("dashboard.wp10.roleFailed", "Couldn't save the role"))); };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-dashboard-border bg-dashboard-muted p-2 text-dashboard">
      {/* basis-40: at 375 the role select and Detach wrap below the title instead of crushing it. */}
      <span className="min-w-0 flex-1 basis-40 break-words text-sm">
        <span className="block text-xs uppercase tracking-wide text-dashboard-muted">{t(`dashboard.wp1.back.categories.${card.collection.category}`, card.collection.category)}</span>
        {title}
      </span>
      {card.collection.archived && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t("dashboard.wp10.archived", "Archived")}</span>}
      {rolesEnabled && (
        <>
          <select aria-label={t("dashboard.wp10.roleFor", "Role for {{title}}", { title })} value={mode} disabled={links.busy}
            onChange={(e) => { const v = e.target.value; setMode(v); if (v !== "__custom") saveRole(v === "" ? null : v); }}
            className="min-h-11 rounded-lg border border-dashboard-border bg-dashboard-sidebar px-2 text-sm text-dashboard">
            <option value="">{t("dashboard.wp10.noRole", "No role")}</option>
            {roleSuggestions.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__custom">{t("dashboard.wp10.customRole", "Custom…")}</option>
          </select>
          {mode === "__custom" && (
            <input aria-label={t("dashboard.wp10.customRoleFor", "Custom role for {{title}}", { title })} maxLength={roleMax} value={custom}
              onChange={(e) => setCustom(e.target.value)} onBlur={() => { if ((custom.trim() || null) !== card.role) saveRole(custom.trim() || null); }}
              className="min-h-11 rounded-lg border border-dashboard-border bg-dashboard-sidebar px-2 text-sm text-dashboard" />
          )}
        </>
      )}
      <button type="button" aria-label={t("dashboard.wp10.detachNamed", "Detach {{title}}", { title })} onClick={() => void detach()} disabled={links.busy}
        className="min-h-11 rounded-lg px-3 text-sm text-red-300 hover:bg-white/5 disabled:opacity-50">
        {t("dashboard.wp10.detach", "Detach")}
      </button>
    </li>
  );
}
