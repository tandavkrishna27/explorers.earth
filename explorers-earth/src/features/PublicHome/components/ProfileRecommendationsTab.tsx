import {
  BookOpen,
  Compass,
  Film,
  Gamepad2,
  MapPin,
  Music,
  ShoppingBag,
  Smartphone,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toUrlSlug } from "../../../utils/formatAddress";
import { isCanonicalMediaPath } from "../../../lib/canonicalMedia";
import { publicGuideSlug } from "../../../utils/publicGuideSlug";
import {
  isRecommendationCategoryVisible,
  normalizeRecommendationsPresentation,
  orderEligibleRecommendationCategoryIds,
} from "../../Profile/constants/recommendationsPresentation";
import type {
  NormalizedRecommendationsPresentationSettings,
  RecommendationCategoryId,
  RecommendationsPresentationWire,
} from "../../Profile/types/themeTypes";
import ProfileRecommendationsLayouts, {
  type RecommendationCategoryReadyViewModel,
  type RecommendationCategorySlotViewModel,
  type RecommendationListCardViewModel,
} from "./ProfileRecommendationsLayouts";
import { usePublicRecommendationCategory } from "../api/usePublicRecommendationCategory";
import type { PublicPageContinuation } from "../api/usePublicPagedResource";
import { resolvePublicPlaceImage } from "./publicPlaceMedia";

export interface PublicRecommendationAccountData {
  documentId?: string;
  public_recommendations?: string;
  public_music?: string;
  public_movie?: string;
  public_books?: string;
  public_games?: string;
  public_guides?: string;
  public_apps?: string;
  public_products?: string;
  public_people?: string;
  [key: string]: unknown;
}

interface ProfileRecommendationsTabProps {
  accountData: PublicRecommendationAccountData;
  username: string;
  presentation?:
    | RecommendationsPresentationWire
    | NormalizedRecommendationsPresentationSettings
    | null;
  preferredCategory?: RecommendationCategoryId;
}

interface RecommendationCategoryQueryState {
  id: RecommendationCategoryId;
  dataStatus: "loading" | "empty" | "ready";
  lists: RecommendationListCardViewModel[];
  listCount: number;
  listCountIsLowerBound?: boolean;
  continuation?: PublicPageContinuation;
  itemCount?: {
    value: number;
    isLowerBound: boolean;
    singular: string;
    plural: string;
  };
  error: unknown | null;
  retry: () => Promise<unknown>;
}

const CATEGORY_CONFIG = {
  places: { label: "Places", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.places", icon: MapPin, color: "#10b981" },
  music: { label: "Music", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.music", icon: Music, color: "#a855f7" },
  movies: { label: "Movies & Shows", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.movies", icon: Film, color: "#3b82f6" },
  books: { label: "Books", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.books", icon: BookOpen, color: "#f97316" },
  games: { label: "Games", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.games", icon: Gamepad2, color: "#ec4899" },
  guides: { label: "Guides", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.guides", icon: Compass, color: "#06b6d4" },
  apps: { label: "Apps & Tools", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.apps", icon: Smartphone, color: "#8b5cf6" },
  products: { label: "Products", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.products", icon: ShoppingBag, color: "#f43f5e" },
  people: { label: "People", labelKey: "dashboard.profile.themeAppearance.recommendations.categories.people", icon: Users, color: "#6366f1" },
} as const;

const resolveCoverUrl = (
  path: string | null | undefined,
  type?: "movie" | "book" | "game" | "place" | "guide" | "music" | "app" | "product" | "person",
) => {
  if (!path || path === "null" || path === "undefined") return undefined;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  /*
   * Before either rewrite below. Every canonical projection emits this shape for a cover
   * (`publicBooksProjection.ts:62`, `publicMoviesProjection.ts:89`,
   * `publicAppsProjection.ts:81`, `publicProductsProjection.ts:95,119`,
   * `publicPeopleProjection.ts:97,121`, `publicGuidesProjection.ts:94`) and it is
   * same-origin and already complete. It used to fall through: onto TMDB's host on the
   * movie shelf and onto the Strapi origin everywhere else, so on the canonical runtime
   * every cover on a public profile was fetched from the wrong host. That route is also
   * where media visibility is applied, so the gate went unreached as well.
   */
  if (isCanonicalMediaPath(path)) return path;
  if (type === "movie" && !path.startsWith("/uploads/")) {
    return `https://image.tmdb.org/t/p/w185${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (path.startsWith("/")) {
    /*
     * Legacy only, and deliberately kept. `routes/index.ts:181` still serves this tab
     * through `StrapiPublicProfileGateway`, whose media URLs are Strapi `/uploads/...`
     * paths, so this is live until that runtime retires with step 12 - unlike the Places
     * shelf, which resolves through `publicPlaceMedia.ts` and no longer admits this shape.
     */
    const backend =
      import.meta.env.VITE_REST_API_URL?.replace("/api", "") ||
      "http://localhost:1337";
    return `${backend}${path}`;
  }
  return path;
};

const relationCount = (value: unknown) =>
  Array.isArray(value)
    ? { value: value.length, isLowerBound: value.length >= 4 }
    : { value: 0, isLowerBound: false };

const formatCount = (
  count: { value: number; isLowerBound: boolean },
  singular: string,
  plural: string,
) => `${count.value.toLocaleString()}${count.isLowerBound ? "+" : ""} ${count.value === 1 ? singular : plural}`;

const aggregateCount = (
  lists: any[],
  singular: string,
  plural: string,
): RecommendationCategoryQueryState["itemCount"] => {
  const counts = lists.map((list) =>
    relationCount(
      list.recommended_places ||
        list.recommended_movies ||
        list.recommended_books ||
        list.recommended_games ||
        list.recommended_apps ||
        list.recommended_products ||
        list.recommended_people,
    ),
  );
  return {
    value: counts.reduce((total, count) => total + count.value, 0),
    isLowerBound: counts.some((count) => count.isLowerBound),
    singular,
    plural,
  };
};

const previewUrls = (values: unknown[]) =>
  values.filter((value): value is string => Boolean(value)).slice(0, 4);

const parseProductImage = (product: any) => {
  if (!product?.images) return product?.logo_url;
  try {
    const parsed =
      typeof product.images === "string"
        ? JSON.parse(product.images)
        : product.images;
    return (Array.isArray(parsed) ? parsed[0] : parsed) || product.logo_url;
  } catch {
    return product.logo_url;
  }
};

const makeGatewayState = ({
  id,
  enabled,
  query,
  lists,
  itemCount,
}: {
  id: RecommendationCategoryId;
  enabled: boolean;
  query: any;
  lists: RecommendationListCardViewModel[];
  itemCount?: RecommendationCategoryQueryState["itemCount"];
}): RecommendationCategoryQueryState | null => {
  if (!enabled) return null;
  const error = query.error || null;
  const dataStatus = query.loading && query.data == null
      ? "loading"
      : lists.length > 0
        ? "ready"
        : "empty";
  return {
    id,
    dataStatus,
    lists,
    listCount: lists.length,
    listCountIsLowerBound: Boolean(query.hasMore || error),
    continuation: typeof query.loadMore === "function" ? query : undefined,
    itemCount: itemCount ? { ...itemCount, isLowerBound: itemCount.isLowerBound || Boolean(query.hasMore || error) } : undefined,
    error,
    retry: async () => query.refetch?.(),
  };
};

const ProfileRecommendationsTab = ({
  accountData,
  username,
  presentation,
  preferredCategory,
}: ProfileRecommendationsTabProps) => {
  const { t } = useTranslation();
  const normalizedPresentation = useMemo(
    () => normalizeRecommendationsPresentation(presentation),
    [presentation],
  );
  const accountRecord = accountData as Record<string, unknown>;
  const enabled = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(CATEGORY_CONFIG).map((id) => [
          id,
          isRecommendationCategoryVisible(
            accountRecord,
            id as RecommendationCategoryId,
          ),
        ]),
      ) as Record<RecommendationCategoryId, boolean>,
    [accountRecord],
  );
  const placesQuery = usePublicRecommendationCategory(username, "places", enabled.places);
  const moviesQuery = usePublicRecommendationCategory(username, "movies", enabled.movies);
  const booksQuery = usePublicRecommendationCategory(username, "books", enabled.books);
  const gamesQuery = usePublicRecommendationCategory(username, "games", enabled.games);
  const appsQuery = usePublicRecommendationCategory(username, "apps", enabled.apps);
  const productsQuery = usePublicRecommendationCategory(username, "products", enabled.products);
  const peopleQuery = usePublicRecommendationCategory(username, "people", enabled.people);
  const guidesQuery = usePublicRecommendationCategory(username, "guides", enabled.guides);

  const placesRaw = placesQuery.data?.recommendationLists || [];
  const placesLists = placesRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      let cover: string | undefined;
      try {
        const details =
          typeof list.List_Name_Details === "string"
            ? JSON.parse(list.List_Name_Details)
            : list.List_Name_Details;
        cover = details?.thumbnail;
      } catch {
        cover = undefined;
      }
      const count = relationCount(list.recommended_places);
      const firstPlace = list.recommended_places?.[0];
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolvePublicPlaceImage({
          itemMedia: firstPlace?.Media,
          itemThumbnail: firstPlace?.media_details?.thumbnail,
          itemPhotos: firstPlace?.Place_Details?.Photos,
          parentListThumbnail: cover,
        }),
        previewImages: previewUrls(
          (list.recommended_places || []).map((place: any) =>
            resolvePublicPlaceImage({
              itemMedia: place.Media,
              itemThumbnail: place.media_details?.thumbnail,
              itemPhotos: place.Place_Details?.Photos,
              parentListThumbnail: cover,
            }),
          ),
        ),
        subtitle: formatCount(count, "Place", "Places"),
        href: `/${username}/places/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const moviesRaw = moviesQuery.data?.movieLists || [];
  const moviesLists = moviesRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_movies);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(list.cover_image?.url, "movie"),
        previewImages: previewUrls(
          (list.recommended_movies || []).map((movie: any) =>
            resolveCoverUrl(movie.poster_path, "movie"),
          ),
        ),
        subtitle: formatCount(count, "Movie", "Movies"),
        href: `/${username}/movies/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const booksRaw = booksQuery.data?.bookLists || [];
  const booksLists = booksRaw
    .filter((list: any) => list.visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_books);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(list.cover_image?.url, "book"),
        previewImages: previewUrls(
          (list.recommended_books || []).map((book: any) =>
            resolveCoverUrl(book.cover_url, "book"),
          ),
        ),
        subtitle: formatCount(count, "Book", "Books"),
        href: `/${username}/books/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const gamesRaw = gamesQuery.data?.gameLists || [];
  const gamesLists = gamesRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_games);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(list.cover_image?.url, "game"),
        previewImages: previewUrls(
          (list.recommended_games || []).map((game: any) =>
            resolveCoverUrl(
              game.cover_url || game.media_details?.thumbnail?.url,
              "game",
            ),
          ),
        ),
        subtitle: formatCount(count, "Game", "Games"),
        href: `/${username}/games/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const appsRaw = appsQuery.data?.appLists || [];
  const appsLists = appsRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_apps);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(list.cover_image?.url, "app"),
        previewImages: previewUrls(
          (list.recommended_apps || []).map((app: any) =>
            resolveCoverUrl(app.logo_url, "app"),
          ),
        ),
        subtitle: formatCount(count, "App", "Apps"),
        href: `/${username}/apps/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const productsRaw = productsQuery.data?.productLists || [];
  const productsLists = productsRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_products);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(list.cover_image?.url, "product"),
        previewImages: previewUrls(
          (list.recommended_products || []).map((product: any) =>
            resolveCoverUrl(parseProductImage(product), "product"),
          ),
        ),
        subtitle: formatCount(count, "Product", "Products"),
        href: `/${username}/products/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const peopleRaw = peopleQuery.data?.personLists || [];
  const peopleLists = peopleRaw
    .filter((list: any) => list.Visibility === true)
    .map((list: any) => {
      const count = relationCount(list.recommended_people);
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: null,
        previewImages: previewUrls(
          (list.recommended_people || []).map((person: any) =>
            resolveCoverUrl(
              person.avatar_path || person.media_details?.thumbnail?.url,
              "person",
            ),
          ),
        ),
        subtitle: formatCount(count, "Person", "People"),
        href: `/${username}/people/${list.slug || toUrlSlug(list.List_Name || "")}`,
      };
    });

  const guidesRaw = guidesQuery.data?.guides || [];
  const guidesLists = guidesRaw
    .filter((guide: any) => guide.Visibility === true)
    .map((guide: any) => ({
      id: guide.documentId,
      title: guide.Title || "",
      image: resolveCoverUrl(guide.Guide_Media?.[0]?.url, "guide"),
      previewImages: [],
      href: `/${username}/guides/${publicGuideSlug(guide)}`,
    }));

  const states = [
    makeGatewayState({
      id: "places",
      enabled: enabled.places,
      query: placesQuery,
      lists: placesLists,
      itemCount: aggregateCount(placesRaw, "place", "places"),
    }),
    makeGatewayState({
      id: "movies",
      enabled: enabled.movies,
      query: moviesQuery,
      lists: moviesLists,
      itemCount: aggregateCount(moviesRaw, "movie", "movies"),
    }),
    makeGatewayState({
      id: "books",
      enabled: enabled.books,
      query: booksQuery,
      lists: booksLists,
      itemCount: aggregateCount(booksRaw, "book", "books"),
    }),
    makeGatewayState({
      id: "games",
      enabled: enabled.games,
      query: gamesQuery,
      lists: gamesLists,
      itemCount: aggregateCount(gamesRaw, "game", "games"),
    }),
    makeGatewayState({
      id: "guides",
      enabled: enabled.guides,
      query: guidesQuery,
      lists: guidesLists,
    }),
    makeGatewayState({
      id: "apps",
      enabled: enabled.apps,
      query: appsQuery,
      lists: appsLists,
      itemCount: aggregateCount(appsRaw, "app", "apps"),
    }),
    makeGatewayState({
      id: "products",
      enabled: enabled.products,
      query: productsQuery,
      lists: productsLists,
      itemCount: aggregateCount(productsRaw, "product", "products"),
    }),
    makeGatewayState({
      id: "people",
      enabled: enabled.people,
      query: peopleQuery,
      lists: peopleLists,
      itemCount: aggregateCount(peopleRaw, "person", "people"),
    }),
  ].filter((state): state is RecommendationCategoryQueryState => state !== null);

  const stateById = new Map(states.map((state) => [state.id, state]));
  const orderedIds = orderEligibleRecommendationCategoryIds({
    savedOrder: normalizedPresentation.categoryOrder,
    eligible: states.map((state) => state.id),
    preferred: preferredCategory,
  });
  const orderedSlots = orderedIds.reduce<
    RecommendationCategorySlotViewModel[]
  >((slots, id) => {
      const state = stateById.get(id);
      if (!state) return slots;
      const config = CATEGORY_CONFIG[id];
      const label = t(config.labelKey, config.label);
      if (state.error && state.lists.length === 0) {
        slots.push({ status: "error", id, label, retry: state.retry, continuation: state.continuation });
        return slots;
      }
      if (state.dataStatus === "empty") return slots;
      if (state.dataStatus === "loading") {
        slots.push({ status: "loading", id, label });
        return slots;
      }
      const itemCountLabel = state.itemCount
        ? formatCount(
            {
              value: state.itemCount.value,
              isLowerBound: state.itemCount.isLowerBound,
            },
            state.itemCount.singular,
            state.itemCount.plural,
          )
        : undefined;
      const ready: RecommendationCategoryReadyViewModel = {
        status: "ready",
        id,
        label,
        color: config.color,
        icon: config.icon,
        lists: state.lists,
        listCount: state.listCount,
        listCountIsLowerBound: state.listCountIsLowerBound,
        continuation: state.continuation,
        itemCountLabel,
        href: `/${username}/${id}`,
      };
      slots.push(ready);
      return slots;
    }, []);
  const isLoading = states.some((state) => state.dataStatus === "loading");
  const hasRenderableContent = orderedSlots.length > 0;

  return (
    <section
      role="region"
      aria-label={t("publicProfile.recommendations.regionLabel", "Recommendations")}
      aria-busy={isLoading}
      className="space-y-4 pb-12 pt-2 text-[var(--text-primary)]"
    >
      {hasRenderableContent && (
        <ProfileRecommendationsLayouts
          layout={normalizedPresentation.layout}
          slots={orderedSlots}
        />
      )}

      {!isLoading && !hasRenderableContent && (
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
          <h2 className="font-poppins text-lg font-black text-[var(--text-primary)]">
            {t(
              "publicProfile.recommendations.empty",
              "No public recommendations yet",
            )}
          </h2>
          <p className="mt-2 font-poppins text-sm text-[var(--text-secondary)]">
            {t(
              "publicProfile.recommendations.emptyHelp",
              "Check back later for new recommendations.",
            )}
          </p>
        </div>
      )}
    </section>
  );
};

export default ProfileRecommendationsTab;
