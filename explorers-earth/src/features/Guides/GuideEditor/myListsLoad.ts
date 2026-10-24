import {explorersApiClient} from '../../../lib/explorersApiClient';
import type {PanelItem, PanelList} from './MyListsPanel';

const CATEGORIES = ['places', 'movies', 'books', 'games', 'apps', 'products', 'people'] as const;

/** The owner's active lists in every category but Guides, by the same per-category collection read the category pages use. A failed category is skipped. */
export async function loadMyListNames(signal?: AbortSignal): Promise<PanelList[]> {
 const pages = await Promise.allSettled(CATEGORIES.map((category) =>
  explorersApiClient.getAllMyCollections({category, status: 'active', limit: 100}, signal).then((page) => ({category, page}))));
 return pages.flatMap((r) => r.status === 'fulfilled'
  ? r.value.page.items.filter((c) => !c.archived).map((c) => ({id: c.id, title: c.title, category: r.value.category}))
  : []);
}

/** One list's items, loaded only when the list is selected: an owner search scoped to that collection. */
export async function loadMyListItems(list: PanelList, signal?: AbortSignal): Promise<PanelItem[]> {
 const page = await explorersApiClient.searchRecommendations({scope: 'owner', category: list.category as (typeof CATEGORIES)[number], collectionId: list.id, query: '', limit: 100}, signal);
 return page.items.map((item) => ({recommendationId: item.id, title: item.title ?? ('entity' in item ? item.entity.title : '')})).filter((it) => it.title);
}
