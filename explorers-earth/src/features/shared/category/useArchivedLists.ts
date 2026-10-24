import { useCallback, useEffect, useState } from "react";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import useAuthStore from "../../../store/store";
import type { CategoryKey } from "./categoryConfig";
import type { ListCardModel } from "./models";

/**
 * Archived lists of one category, for the Archived filter (ruling R8).
 * The legacy owner reads return active lists only, so this is a separate
 * archived-status read. A failed read shows no filter rather than an error.
 */
export function useArchivedLists(category: CategoryKey): { lists: ListCardModel[]; reload: () => void } {
  const accountId = useAuthStore((s) => s.accountId);
  const [lists, setLists] = useState<ListCardModel[]>([]);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!accountId) { setLists([]); return; }
    const controller = new AbortController();
    explorersApiClient.getAllMyCollections({ category, status: "archived", limit: 100 }, controller.signal)
      .then((content) => {
        if (controller.signal.aborted) return;
        setLists(content.items.map((list) => ({
          id: list.id, title: list.title, status: list.visibility === "public" ? "public" : "draft",
          itemCount: 0, pinnedCount: 0, covers: [],
        })));
      })
      .catch(() => { if (!controller.signal.aborted) setLists([]); });
    return () => controller.abort();
  }, [accountId, category, version]);

  return { lists, reload };
}
