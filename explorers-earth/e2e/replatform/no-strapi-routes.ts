export type Viewport = 'desktop' | 'mobile';
export type RouteCase = {
  /** Occurrence keys this case claims: `<file>:<path>#<n>`, n counting that literal's occurrences in source order. */
  source: string[];
  url: (handle: string) => string;
  /** 'owner' = onboarded ownerA, 'fresh' = un-onboarded ownerB, 'anon' = signed out. */
  as: 'anon' | 'owner' | 'fresh';
  /** Only this viewport. Owner cases claim the tree the viewport renders. */
  viewport?: Viewport;
  /** Where the page must end up. Defaults to the visited path. */
  lands?: RegExp;
  /** A selector the intended page renders: a heading, landmark or test id. */
  marker?: string;
};
const ID = '00000000-0000-4000-8000-000000000000';

/** A visible heading with this text. Headings were read from a green run (P6-1 Step 11). */
const heading = (text: string) => `:is(h1,h2):has-text("${text}")`;
/**
 * Every public category component renders a [data-category-page] root; NotFound and the
 * UsernameRootRedirect do not. A throttled or failed read ends on "404 Page Not Found" at the
 * same URL, which only this marker catches.
 */
const CATEGORY_PAGE = '[data-category-page]';

/** One owner path visited at both viewports: desktop claims tree #1, mobile claims tree #2. */
function owner(path: string, literal: string, lands?: RegExp, marker?: string): RouteCase[] {
  return (['desktop', 'mobile'] as const).map((viewport, index) => ({
    source: [`ProtectedRoutes.tsx:${literal}#${index + 1}`], url: () => path, as: 'owner', viewport, lands, marker }));
}
const pub = (path: string, key: string, marker?: string): RouteCase => ({ source: [`PublicRoutes.tsx:${key}`], url: (h) => `/${h}${path}`, as: 'anon', marker });
const auth = (path: string): RouteCase => ({ source: [`AuthRoutes.tsx:${path}#1`], url: () => path, as: 'anon' });
const ITEM = { movies: 'movieId', books: 'bookId', games: 'gameId', apps: 'appId', products: 'productId', people: 'personId' } as const;
/** The add and edit editors' headings per category. */
const EDITOR = {
  movies: ['Add Movie or Show', 'Edit Movie'], books: ['Add a Book', 'Edit Book'], games: ['Add Game', 'Edit Game'],
  apps: ['Add App', 'Edit App'], products: ['Add Product', 'Edit Product'], people: ['Add Person', 'Edit Person'],
} as const;
const HUB = heading('All Your Recommendations in One Place');

export const ROUTES: RouteCase[] = [
  ...owner('/profile', 'profile', undefined, heading('Profile details')),
  ...owner('/recommendations', 'recommendations', undefined, HUB),
  ...owner('/recommendations/places', 'recommendations/places'),
  ...owner(`/recommendations/places/${ID}/add-people`, 'recommendations/places/:locationId/add-people', undefined, heading('Add People')),
  ...owner(`/recommendations/places/${ID}/add-products`, 'recommendations/places/:locationId/add-products', undefined, heading('Add Products')),
  ...owner(`/${ID}/new`, ':listId/new', undefined, heading('Your Recommendation Details')),
  ...owner(`/${ID}/edit`, ':placeId/edit', undefined, heading('Your Recommendation Details')),
  ...owner('/recommendations/guides', 'recommendations/guides'),
  ...owner('/recommendations/guides/new', 'recommendations/guides/new', undefined, heading('Create New Guide')),
  ...owner(`/recommendations/guides/${ID}`, 'recommendations/guides/:guideId'),
  ...owner(`/recommendations/guides/${ID}/edit`, 'recommendations/guides/:guideId/edit', undefined, heading('Edit Guide')),
  ...owner(`/recommendations/guides/${ID}/sections/new`, 'recommendations/guides/:guideId/sections/new'),
  ...owner(`/recommendations/guides/${ID}/sections/${ID}/edit`, 'recommendations/guides/:guideId/sections/:sectionId/edit'),
  ...owner('/guides/new', 'guides/new', undefined, heading('Create New Guide')),
  ...owner(`/guides/${ID}`, 'guides/:guideId'),
  ...owner(`/guides/${ID}/edit`, 'guides/:guideId/edit', undefined, heading('Edit Guide')),
  ...owner(`/guides/${ID}/sections/new`, 'guides/:guideId/sections/new'),
  ...owner(`/guides/${ID}/sections/${ID}/edit`, 'guides/:guideId/sections/:sectionId/edit'),
  ...owner('/recommendations/music', 'recommendations/music', /^\/recommendations$/, HUB),
  ...owner('/analytics', 'analytics'),
  ...owner('/settings', 'settings'),
  ...owner('/home', 'home', undefined, heading('Welcome back,')),
  ...(['movies', 'books', 'games', 'apps', 'products', 'people'] as const).flatMap((c) => [
    ...owner(`/recommendations/${c}`, `recommendations/${c}`),
    ...owner(`/recommendations/${c}/${ID}`, `recommendations/${c}/:listId`),
    ...owner(`/recommendations/${c}/${ID}/add`, `recommendations/${c}/:listId/add`, undefined, heading(EDITOR[c][0])),
    ...owner(`/recommendations/${c}/${ID}/edit/${ID}`, `recommendations/${c}/:listId/edit/:${ITEM[c]}`, undefined, heading(EDITOR[c][1])),
  ]),
  { source: ['ProtectedRoutes.tsx:/onboarding#1'], url: () => '/onboarding', as: 'fresh' },
  // The fixture owner's display name (profile-browser-fixture.ts onboarding).
  { source: ['PublicRoutes.tsx::username/*#1'], url: (h) => `/${h}`, as: 'anon', marker: heading('No-Strapi Fixture') },
  pub('/places', 'places#1', CATEGORY_PAGE), pub('/places/no-such-place', ':placeSlug#1'), pub('/places/map', 'map#1'),
  pub('/places/no-such-place/map', ':placeSlug/map#1'), pub('/places/no-such-place/placesmap', ':place/placesmap#1'),
  pub('/guides', 'guides#1', CATEGORY_PAGE), pub('/guides/no-such-guide', ':guideSlug#1'),
  pub('/movies', 'movies#1', CATEGORY_PAGE), pub('/movies/genre/drama', 'genre/:genreSlug#1', CATEGORY_PAGE), pub('/movies/no-such-list', ':listSlug#1'),
  pub('/books', 'books#1', CATEGORY_PAGE), pub('/books/subject/fiction', 'subject/:subjectSlug#1', CATEGORY_PAGE), pub('/books/no-such-list', ':listSlug#2'),
  pub('/games', 'games#1', CATEGORY_PAGE), pub('/games/genre/action', 'genre/:genreSlug#2', CATEGORY_PAGE), pub('/games/no-such-list', ':listSlug#3'),
  pub('/apps', 'apps#1', CATEGORY_PAGE), pub('/apps/no-such-list', ':listSlug#4'),
  pub('/products', 'products#1', CATEGORY_PAGE), pub('/products/no-such-list', ':listSlug#5'),
  pub('/people', 'people#1', CATEGORY_PAGE), pub('/people/sector/technology', 'sector/:sectorSlug#1', CATEGORY_PAGE), pub('/people/no-such-list', ':listSlug#6'),
  ...['/', '/login', '/contact', '/about', '/use-cases', '/privacy', '/cookies', '/terms', '/reactivate',
    '/reactivate-confirm'].map(auth),
  // GoogleAuthRedirect bootstraps the session, and a signed-out visitor is sent to /login?error=oauth_failed.
  { ...auth('/google-auth/callback'), lands: /^\/login$/ },
  // Three different elements, three cases: NotFound at /404 and at an unmatched top-level path
  // (AppRoutes.tsx), and UsernameRootRedirect for an unknown tab under a profile (PublicRoutes.tsx).
  { source: ['AppRoutes.tsx:/404#1'], url: () => '/404', as: 'anon' },
  { source: ['AppRoutes.tsx:*#1'], url: () => '/no/such/route/at/all', as: 'anon' },
  { source: ['PublicRoutes.tsx:*#1'], url: (h) => `/${h}/no-such-tab`, as: 'anon', lands: /^\/[^/]+\/?$/, marker: heading('No-Strapi Fixture') },
  // Top-level redirects (AppRoutes.tsx) visited directly, with the target asserted.
  { source: ['AppRoutes.tsx:/guides#1'], url: () => '/guides', as: 'owner', lands: /^\/recommendations\/guides$/ },
  { source: ['AppRoutes.tsx:/music/*#1'], url: () => '/music', as: 'owner', lands: /^\/recommendations$/, marker: HUB },
  { source: ['AppRoutes.tsx:/hub#1'], url: () => '/hub', as: 'owner', lands: /^\/recommendations$/, marker: HUB },
];

/** Occurrences deliberately not visited, each with the reason. A new occurrence must be claimed here or in ROUTES. */
export const EXCLUDED: Record<string, string> = {
  'ProtectedRoutes.tsx:/*#1': 'desktop layout route; every child is visited',
  'ProtectedRoutes.tsx:/*#2': 'mobile layout route; every child is visited',
  // The same URLs are registered at top level (AppRoutes.tsx) and inside both protected trees.
  // The top-level cases above visit each URL and assert its target; these occurrences are not separately reachable.
  'ProtectedRoutes.tsx:guides#1': 'shadowed by AppRoutes.tsx:/guides (visited); same target',
  'ProtectedRoutes.tsx:guides#2': 'shadowed by AppRoutes.tsx:/guides (visited); same target',
  'ProtectedRoutes.tsx:hub#1': 'shadowed by AppRoutes.tsx:/hub (visited); same target',
  'ProtectedRoutes.tsx:hub#2': 'shadowed by AppRoutes.tsx:/hub (visited); same target',
  'ProtectedRoutes.tsx:music#1': 'shadowed by AppRoutes.tsx:/music/* (visited); same target',
  'ProtectedRoutes.tsx:music#2': 'shadowed by AppRoutes.tsx:/music/* (visited); same target',
  'AuthRoutes.tsx:/email-verification#1': 'Navigate to /login (AuthRoutes.tsx), which is visited',
  'AuthRoutes.tsx:/register#1': 'Navigate to /login (AuthRoutes.tsx), which is visited',
  'AuthRoutes.tsx:/forgot-password#1': 'Navigate to /login',
  'AuthRoutes.tsx:/reset-password#1': 'Navigate to /login',
  'AuthRoutes.tsx:/reset-link-sent#1': 'Navigate to /login',
  'AuthRoutes.tsx:/email-confirmed#1': 'Navigate to /login',
};
