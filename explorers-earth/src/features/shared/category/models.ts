/* eslint-disable @typescript-eslint/no-explicit-any -- legacy owner-read shapes differ per category */
export type ListStatus = "public" | "draft";

export interface ListCardModel {
  id: string;
  title: string;
  status: ListStatus;
  itemCount: number;
  pinnedCount: number;
  covers: string[];
}

export interface TopPickModel {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  listId: string;
  listTitle: string;
  pinned: boolean;
  /** Lists mode only: a draft list cannot be pinned. */
  pinnable: boolean;
}

type LegacyItem = Record<string, any> & { documentId: string; is_pinned?: boolean; pin_order?: number | null };
type LegacyList = Record<string, any> & { documentId: string; List_Name?: string };

const unique = (items: LegacyItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.documentId) ? false : (seen.add(item.documentId), true)));
};

export function toListCards(lists: LegacyList[], spec: { relation: string; visibility: "Visibility" | "visibility"; cover: (item: LegacyItem) => string | null }): ListCardModel[] {
  return lists.map((list) => {
    const items = unique((list[spec.relation] as LegacyItem[] | undefined) ?? []);
    return {
      id: list.documentId,
      title: list.List_Name ?? "",
      status: list[spec.visibility] ? "public" : "draft",
      itemCount: items.length,
      pinnedCount: items.filter((item) => item.is_pinned).length,
      covers: items.map(spec.cover).filter((url): url is string => Boolean(url)).slice(0, 4),
    };
  });
}

export function toItemTopPicks(
  lists: LegacyList[],
  spec: { relation: string; title: (item: LegacyItem) => string; image: (item: LegacyItem) => string | null; subtitle: (item: LegacyItem) => string | null },
  pinnedOnly = true,
): TopPickModel[] {
  const seen = new Map<string, TopPickModel & { order: number }>();
  for (const list of lists) {
    for (const item of (list[spec.relation] as LegacyItem[] | undefined) ?? []) {
      if (seen.has(item.documentId) || (pinnedOnly && !item.is_pinned)) continue;
      seen.set(item.documentId, {
        id: item.documentId, title: spec.title(item), subtitle: spec.subtitle(item), imageUrl: spec.image(item),
        listId: list.documentId, listTitle: list.List_Name ?? "", pinned: Boolean(item.is_pinned), pinnable: true,
        order: item.pin_order ?? 999,
      });
    }
  }
  const picks = [...seen.values()];
  if (pinnedOnly) picks.sort((a, b) => a.order - b.order);
  return picks.map(({ order: _order, ...pick }) => pick);
}

/** Places and Guides: the lists themselves are the picks. */
export function toListTopPicks(lists: (LegacyList & { is_pinned?: boolean; pin_order?: number | null })[], spec: { title: (list: LegacyList) => string; image: (list: LegacyList) => string | null; isPublic: (list: LegacyList) => boolean }, pinnedOnly = true): TopPickModel[] {
  return lists
    .filter((list) => !pinnedOnly || list.is_pinned)
    .sort((a, b) => (pinnedOnly ? (a.pin_order ?? 999) - (b.pin_order ?? 999) : 0))
    .map((list) => ({ id: list.documentId, title: spec.title(list), subtitle: null, imageUrl: spec.image(list), listId: list.documentId,
      listTitle: spec.title(list), pinned: Boolean(list.is_pinned), pinnable: spec.isPublic(list) }));
}
