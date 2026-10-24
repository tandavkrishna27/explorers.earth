import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { explorersApiClient } from "../../../lib/explorersApiClient";
import type { LinkedListCard, ListLinkCategory, ListLinkCommandResult } from "../../../../../tunes/shared/explorersListLinkContract";
import { CATEGORY_KEYS } from "../category/categoryConfig";

type Args = { collectionId: string; category: ListLinkCategory; categoryRevision: number; linkedLists: readonly LinkedListCard[] };
const newKey = () => crypto.randomUUID();

/** Every WP10 query key starts with this, so one invalidation refreshes both sides of a link. */
export const LIST_LINKS_KEY = "wp10-list-links";

/** The owner's editable read of one list, reduced to what linking needs. */
export function useListLinkState(collectionId: string | null | undefined) {
  return useQuery({
    queryKey: [LIST_LINKS_KEY, "list", collectionId],
    enabled: Boolean(collectionId),
    queryFn: async ({ signal }) => {
      const observed = await explorersApiClient.getMyEditableCollection(collectionId as string, signal);
      const detail = observed.detail;
      // The parsed read always carries linkedLists; anything else (a partial stub of the
      // read) yields no linking UI rather than taking the host page down.
      if (!Array.isArray(detail.linkedLists) || !Number.isSafeInteger(Number(detail.categoryRevision))) return null;
      return { id: detail.id, category: detail.category as ListLinkCategory, title: detail.title, isSample: detail.isSample === true,
        categoryRevision: Number(detail.categoryRevision), linkedLists: detail.linkedLists as readonly LinkedListCard[] };
    },
  });
}

/**
 * WP10 (LNK-04). Attach, detach with Undo, and roles for one list's page. 0070 bumps the
 * content revision of both categories a link touches; every command result carries both, and
 * this hook keeps a per-category map so a Detach followed by Undo never sends a stale revision.
 * A link shows on both lists; for an incoming card the host is the other list, so detach and
 * role send the other list's category revision.
 */
export function useListLinks({ collectionId, category, categoryRevision, linkedLists }: Args) {
  const client = useQueryClient();
  const revisions = useRef<Record<string, number>>({});
  revisions.current[category] = Math.max(revisions.current[category] ?? 0, categoryRevision);
  const [busy, setBusy] = useState(false);
  const revisionOf = useCallback(async (cat: string, anyListId: string) => {
    const known = revisions.current[cat];
    if (known !== undefined) return known;
    const observed = await explorersApiClient.getMyEditableCollection(anyListId);
    return (revisions.current[cat] = Number(observed.detail.categoryRevision));
  }, []);
  const settle = useCallback(async (result: ListLinkCommandResult) => {
    for (const [cat, rev] of Object.entries(result.revisions)) if (rev !== undefined) revisions.current[cat] = Math.max(revisions.current[cat] ?? 0, rev);
    await client.invalidateQueries({ queryKey: [LIST_LINKS_KEY] });
  }, [client]);

  /** Attach from this page: this list is the host. Undo of an incoming link passes the other host. */
  const attach = useCallback(async (linked: { id: string; category: string }, role: string | null = null, position?: number,
    hostId: string = collectionId, hostCategory: string = category) => {
    setBusy(true);
    try {
      const result = await explorersApiClient.attachMyListLink(hostId, { expectedHostRevision: await revisionOf(hostCategory, hostId), linkedCollectionId: linked.id,
        expectedLinkedRevision: await revisionOf(linked.category, linked.id), role, ...(position === undefined ? {} : { position }) }, newKey());
      await settle(result);
      return result;
    } finally { setBusy(false); }
  }, [collectionId, category, revisionOf, settle]);

  const hostOf = useCallback((card: LinkedListCard) => card.direction === "outgoing"
    ? { id: collectionId, category: category as string } : { id: card.collection.id, category: card.collection.category as string }, [collectionId, category]);

  /** Returns the Undo action for the toast. */
  const detach = useCallback(async (card: LinkedListCard) => {
    setBusy(true);
    try {
      const host = hostOf(card);
      const result = await explorersApiClient.detachMyListLink(collectionId, card.linkId, await revisionOf(host.category, host.id), newKey());
      await settle(result);
      const removed = result.link;
      return async () => {
        await attach({ id: removed.linkedCollectionId, category: removed.linkedCategory }, removed.role, removed.displayOrder, removed.hostCollectionId, removed.hostCategory);
      };
    } finally { setBusy(false); }
  }, [collectionId, hostOf, revisionOf, settle, attach]);

  const setRole = useCallback(async (card: LinkedListCard, role: string | null) => {
    const host = hostOf(card);
    const result = await explorersApiClient.setMyListLinkRole(collectionId, card.linkId, await revisionOf(host.category, host.id), role, newKey());
    await settle(result);
    return result;
  }, [collectionId, hostOf, revisionOf, settle]);

  const linked = useMemo(() => new Set(linkedLists.map((l) => l.collection.id.toLowerCase())), [linkedLists]);
  const isAttachable = useCallback((list: { id: string }) => list.id.toLowerCase() !== collectionId.toLowerCase() && !linked.has(list.id.toLowerCase()), [collectionId, linked]);
  return { attach, detach, setRole, isAttachable, busy };
}

/** The owner's own active lists across all eight categories, for the attach picker. */
export function useAllMyLists(enabled = true) {
  return useQuery({
    queryKey: [LIST_LINKS_KEY, "own-lists"],
    enabled,
    queryFn: async ({ signal }) => {
      const pages = await Promise.all(CATEGORY_KEYS.map((key) => explorersApiClient.getAllMyCollections({ category: key, status: "active", limit: 100 }, signal)));
      return pages.flatMap((page) => page.items.map((c) => ({ id: c.id, category: c.category as string, title: c.title, isSample: c.isSample === true })));
    },
  }).data ?? [];
}
