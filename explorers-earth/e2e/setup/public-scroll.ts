import { categories, type FixtureState } from './category-navigation';

export function seedScopedPlaces(state: FixtureState) {
  state.lists.recommendationLists = Array.from({ length: 13 }, (_, index) => {
    const n = index + 1;
    return {
      documentId: `city-list-${n}`, List_Name: `Destination ${n}`, slug: `city-${n}`,
      Visibility: true, visibility: true, is_pinned: n === 1, pin_order: n === 1 ? 0 : null,
      List_Name_Details: {}, recommended_places: Array.from({ length: n === 13 ? 25 : 1 }, (_, item) => ({
        documentId: `place-${n}-${item + 1}`, Recommendation_Type: 'place', Contact_Name: null,
        Place_Details: { Title: `City ${n} place ${item + 1}`, Place_Name: `City ${n} place ${item + 1}`, Place_Id: `fixture-${n}-${item + 1}`, Photos: [], Place_Address: `Destination ${n}`, Rating: 4.5, Rating_Count: 20 },
        Media: [], media_details: null, recommendation_category: { Category_Name: 'Cafe' },
        Places_Social_Link: 'https://example.test/place', Users_Social_URL: 'https://example.test/recommendation',
        user_recommendation_note: 'A memorable fixture recommendation.', user_rating: 4, google_rating: 4.5,
      })),
    };
  });
}

export type ScrollCategory = 'apps' | 'books' | 'movies' | 'games' | 'products' | 'people' | 'guides';

export function seedPublicRoots(state: FixtureState, count = 13) {
  seedScopedPlaces(state);
  state.lists.recommendationLists = state.lists.recommendationLists.slice(0, count);
  for (const route of ['apps', 'books', 'movies', 'games', 'products', 'people', 'guides'] as const) {
    seedLongPublicCollection(state, route, { lists: count, items: 1 });
    const category = categories.find(candidate => candidate.route === route)!;
    state.lists[category.root].forEach((list, index) => {
      for (const key of Object.keys(list)) {
        if ((key.startsWith('recommended_') || key === 'guide_sections') && key !== (route === 'guides' ? 'guide_sections' : `recommended_${route}`)) delete list[key];
      }
      list.List_Name = `${route} collection ${index + 1}`;
      list.Title = `${route} collection ${index + 1}`;
    });
  }
}

// Complete synthetic child records keep the real cards and modals in the test.
export function seedLongPublicCollection(state: FixtureState, route: ScrollCategory, options: { lists: number; items: number }) {
  const category = categories.find(candidate => candidate.route === route)!;
  const template = state.lists[category.root][0];
  const names = { apps: 'App', books: 'Book', movies: 'Movie', games: 'Game', products: 'Product', people: 'Person', guides: 'Day' };
  state.lists[category.root] = Array.from({ length: options.lists }, (_, listIndex) => {
    const list = { ...structuredClone(template), documentId: `${route}-list-${listIndex + 1}`, slug: listIndex === 0 ? `public-${route}` : `public-${route}-${listIndex + 1}`, cover_image: null, list_description: null, display_order: listIndex };
    const relation = route === 'guides' ? 'guide_sections' : `recommended_${route}`;
    const parent = { documentId: list.documentId, List_Name: list.List_Name, slug: list.slug };
    list[relation] = Array.from({ length: options.items }, (_, index) => {
      const n = index + 1;
      const common = { documentId: `${route}-${listIndex + 1}-${n}`, title: `${names[route]} ${n}`, user_recommendation_note: null, user_rating: null, is_pinned: false, pin_order: null, display_order: index };
      switch (route) {
        case 'apps': return { ...common, app_url: `https://example.test/apps/${n}`, description: null, logo_url: null, developer: 'Fixture Developer', platforms: ['Web'], price_tier: 'Free', download_url: null, screenshots: [], app_list: parent, app_category: null };
        case 'books': return { ...common, volume_id: `volume-${n}`, subtitle: null, authors: ['Fixture Author'], year: '2026', cover_url: null, cover_url_large: null, subjects: [], publisher: null, page_count: 100, google_rating: null, description: null, isbn_13: null, preview_link: null, buy_links: [], media_details: null, book_list: parent, book_categories: [], Media: [] };
        case 'movies': return { ...common, tmdb_id: String(n), media_type: 'Movie', original_title: common.title, year: '2026', poster_path: null, backdrop_path: null, genres: [], director: null, runtime: 90, tmdb_rating: null, overview: null, season_count: null, watch_providers: [], Media: [], media_details: null, movie_list: parent, movie_categories: [], cast_details: [] };
        case 'games': return { ...common, igdb_id: n, igdb_slug: `game-${n}`, cover_url: null, cover_url_large: null, igdb_image_id: null, summary: null, release_date: null, release_year: '2026', igdb_rating: null, igdb_rating_count: null, genres: [], platforms: [], developer: null, publisher: null, game_modes: [], screenshot_ids: [], igdb_url: null, media_details: null, game_list: parent, game_categories: [], Media: [] };
        case 'products': return { ...common, product_url: `https://example.test/products/${n}`, brand: 'Fixture Brand', price: 10, currency: 'USD', buy_url: null, logo_url: null, description: null, specifications: {}, images: [], product_list: parent, product_category: null };
        case 'people': return { ...common, name: common.title, full_name: common.title, username_handle: `person${n}`, handle: `person${n}`, headline: 'Fixture Creator', location: null, avatar_path: null, avatar_url: null, media_details: null, primary_platform: null, platform: null, social_urls: {}, skills_tags: [], tags: [], bio: null, follower_count: null, person_list: parent, person_categories: [], people_category: null };
        case 'guides': return { documentId: common.documentId, Title: `Day ${n}`, Sequence: n, Description: null, Timeline: { morning: n === 13 ? [{ id: 'station-from', place_id: 'station-from', name: 'Fixture Station', formatted_address: 'Fixture City', types: ['train_station'], photos: [] }, { id: 'station-to', place_id: 'station-to', name: 'Destination Station', formatted_address: 'Destination City', types: ['train_station'], photos: [] }] : [], afternoon: [], evening: [] }, Transport: { segments: n === 13 ? [{ fromPlaceId: 'station-from', toPlaceId: 'station-to', mode: 'public_transit', distanceKm: 30, estimatedMinutes: 60 }] : [] }, Stay: { accommodations: [] }, Budget: { morning: [], afternoon: [], evening: [] }, Media: [] };
      }
    });
    if (route === 'guides') Object.assign(list, { Number_Of_Days: options.items, Tips_Notes: null, Place_Details: null, Estimated_Budget: null });
    return list;
  });
}
