import {explorersApiClient} from '../../../lib/explorersApiClient';

export type MyListHit = {recommendationId: string; collectionId: string | null; title: string; subtitle: string};
const CATEGORIES = ['places', 'movies', 'books', 'games', 'apps', 'products', 'people'] as const;
const NAMES: Record<(typeof CATEGORIES)[number], string> = {places: 'Places', movies: 'Movies', books: 'Books', games: 'Games', apps: 'Apps', products: 'Products', people: 'People'};

/** GD-07: owner search is per category on the API, so ask all seven in parallel (5 each) and merge. A failed category is skipped, not fatal. */
export async function searchMyLists(query: string, signal?: AbortSignal): Promise<MyListHit[]> {
 const pages = await Promise.allSettled(CATEGORIES.map((category) =>
  explorersApiClient.searchRecommendations({scope: 'owner', category, query, limit: 5}, signal).then((page) => ({category, page}))));
 return pages.flatMap((r) => r.status === 'fulfilled' ? r.value.page.items.map((item) => ({
  recommendationId: item.id, collectionId: null, title: item.title ?? ('entity' in item ? item.entity.title : ''), subtitle: NAMES[r.value.category],
 })).filter((hit) => hit.title) : []);
}
