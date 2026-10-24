import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { LinkedListCard } from "../../../../../tunes/shared/explorersListLinkContract";
import { withOrigin } from "../../../lib/navigation/originBack";
import { linkedListPath } from "./linkRoles";

type Props = { linkedLists: readonly LinkedListCard[]; readOnly?: boolean; originLabel?: string };

/**
 * WP10 (LNK-03, LNK-05). One level: each card is the other list itself; its own links are
 * never shown. Archived lists stay linked but are not shown here (Manage shows them).
 * `readOnly` states intent only: Detach lives in Manage, so this section never has controls.
 */
export function LinkedListsSection({ linkedLists, originLabel }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const headingId = useId();
  const live = [...linkedLists].filter((card) => !card.collection.archived).sort((a, b) => a.displayOrder - b.displayOrder);
  if (live.length === 0) return null;
  const label = originLabel ?? t("dashboard.wp10.linkedLists", "Linked lists");
  return (
    <section aria-labelledby={headingId} className="mt-6 grid gap-3">
      <h2 id={headingId} className="text-base font-semibold text-dashboard">{t("dashboard.wp10.linkedLists", "Linked lists")}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((card) => (
          <li key={card.linkId} className="min-w-0">
            <Link to={linkedListPath(card.collection.category, card.collection.id)} state={withOrigin(location, label)}
              className="block h-full rounded-xl border border-dashboard-border bg-dashboard-sidebar p-4 text-dashboard hover:border-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400">
              <span className="block text-xs uppercase tracking-wide text-dashboard-muted">{t(`dashboard.wp1.back.categories.${card.collection.category}`, card.collection.category)}</span>
              <span className="block break-words font-medium">{card.collection.title}</span>
              {card.role && <span className="mt-1 inline-block max-w-full break-words rounded-full bg-white/10 px-2 py-0.5 text-xs">{card.role}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
