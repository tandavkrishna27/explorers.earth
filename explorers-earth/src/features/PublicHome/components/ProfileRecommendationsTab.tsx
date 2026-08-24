import { gql, useQuery } from "@apollo/client";
import { useQuery as useReactQuery } from "@tanstack/react-query";
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
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../../../lib/queryClient";
import type { PlaylistResponse } from "../../../types/music";
import { toUrlSlug } from "../../../utils/formatAddress";
import { extractGuestUrlFromLocalTunesLink } from "../../../utils/localTunesUtils";
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
  localtunes_public?: string;
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

const GET_PLACES_LISTS = gql`
  query GetPlacesLists($accountDocumentId: ID!) {
    recommendationLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      List_Name_Details
      recommended_places(pagination: { limit: 4 }) {
        documentId
        media_details
        Media { url }
        Place_Details
      }
    }
  }
`;

const GET_MOVIES_LISTS = gql`
  query GetMoviesLists($accountDocumentId: ID!) {
    movieLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      cover_image { url }
      recommended_movies(pagination: { limit: 4 }) {
        documentId
        poster_path
      }
    }
  }
`;

const GET_BOOKS_LISTS = gql`
  query GetBooksLists($accountDocumentId: ID!) {
    bookLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      visibility
      cover_image { url }
      recommended_books(pagination: { limit: 4 }) {
        documentId
        cover_url
      }
    }
  }
`;

const GET_GAMES_LISTS = gql`
  query GetGamesLists($accountDocumentId: ID!) {
    gameLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      cover_image { url }
      recommended_games(pagination: { limit: 4 }) {
        documentId
        cover_url
        media_details
      }
    }
  }
`;

const GET_APPS_LISTS = gql`
  query GetAppsLists($accountDocumentId: ID!) {
    appLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      cover_image { url }
      recommended_apps(pagination: { limit: 4 }) {
        documentId
        logo_url
      }
    }
  }
`;

const GET_PRODUCTS_LISTS = gql`
  query GetProductsLists($accountDocumentId: ID!) {
    productLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      cover_image { url }
      recommended_products(pagination: { limit: 4 }) {
        documentId
        logo_url
        images
      }
    }
  }
`;

const GET_PEOPLE_LISTS = gql`
  query GetPeopleLists($accountDocumentId: ID!) {
    personLists(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      slug
      Visibility
      recommended_people(pagination: { limit: 4 }) {
        documentId
        avatar_path
        media_details
      }
    }
  }
`;

const GET_GUIDES_LISTS = gql`
  query GetGuidesLists($accountDocumentId: ID!) {
    guides(
      filters: {
        account: { documentId: { eq: $accountDocumentId } }
        Visibility: { eq: true }
      }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      Title
      slug
      Visibility
      Guide_Media { url }
    }
  }
`;

const resolveCoverUrl = (
  path: string | null | undefined,
  type?: "movie" | "book" | "game" | "place" | "guide" | "music" | "app" | "product" | "person",
) => {
  if (!path || path === "null" || path === "undefined") return undefined;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  if (type === "movie" && !path.startsWith("/uploads/")) {
    return `https://image.tmdb.org/t/p/w185${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (path.startsWith("/")) {
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

const makeApolloState = ({
  id,
  enabled,
  documentId,
  query,
  lists,
  itemCount,
}: {
  id: RecommendationCategoryId;
  enabled: boolean;
  documentId?: string;
  query: any;
  lists: RecommendationListCardViewModel[];
  itemCount?: RecommendationCategoryQueryState["itemCount"];
}): RecommendationCategoryQueryState | null => {
  if (!enabled) return null;
  const missingAccountError = documentId
    ? null
    : new Error("The public profile account is unavailable");
  const error = missingAccountError || query.error || null;
  const dataStatus = missingAccountError
    ? "empty"
    : query.loading && query.data == null
      ? "loading"
      : lists.length > 0
        ? "ready"
        : "empty";
  return {
    id,
    dataStatus,
    lists,
    listCount: lists.length,
    itemCount,
    error,
    retry: async () => {
      if (!documentId) return Promise.reject(missingAccountError);
      return query.refetch?.();
    },
  };
};

const ProfileRecommendationsTab = ({
  accountData,
  username,
  presentation,
  preferredCategory,
}: ProfileRecommendationsTabProps) => {
  const { t } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);
  const retryLock = useRef(false);
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
  const documentId = accountData.documentId;
  const apolloOptions = (categoryEnabled: boolean) => ({
    variables: { accountDocumentId: documentId },
    skip: !documentId || !categoryEnabled,
    errorPolicy: "all" as const,
    notifyOnNetworkStatusChange: true,
  });

  const placesQuery = useQuery(GET_PLACES_LISTS, apolloOptions(enabled.places));
  const moviesQuery = useQuery(GET_MOVIES_LISTS, apolloOptions(enabled.movies));
  const booksQuery = useQuery(GET_BOOKS_LISTS, apolloOptions(enabled.books));
  const gamesQuery = useQuery(GET_GAMES_LISTS, apolloOptions(enabled.games));
  const appsQuery = useQuery(GET_APPS_LISTS, apolloOptions(enabled.apps));
  const productsQuery = useQuery(GET_PRODUCTS_LISTS, apolloOptions(enabled.products));
  const peopleQuery = useQuery(GET_PEOPLE_LISTS, apolloOptions(enabled.people));
  const guidesQuery = useQuery(GET_GUIDES_LISTS, apolloOptions(enabled.guides));

  const guestUrl = useMemo(
    () =>
      accountData.localtunes_public
        ? extractGuestUrlFromLocalTunesLink(accountData.localtunes_public)
        : null,
    [accountData.localtunes_public],
  );
  const musicQuery = useReactQuery<PlaylistResponse>({
    queryKey: ["public-profile-playlists", guestUrl],
    queryFn: () => apiRequest("GET", `/api/playlist/${guestUrl}`),
    enabled: Boolean(guestUrl && enabled.music),
    staleTime: 5 * 60 * 1000,
  });

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
      return {
        id: list.documentId,
        title: list.List_Name || "",
        image: resolveCoverUrl(cover, "place"),
        previewImages: previewUrls(
          (list.recommended_places || []).map((place: any) =>
            resolveCoverUrl(
              place.media_details?.thumbnail?.url ||
                place.Media?.[0]?.url ||
                place.Place_Details?.Photos?.[0],
              "place",
            ),
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
      href: `/${username}/guides/${guide.slug || toUrlSlug(guide.Title || "") || guide.documentId}`,
    }));

  const musicRaw = musicQuery.data?.playlists || [];
  const musicLists = musicRaw
    .filter((playlist: any) => playlist.isVisibleToGuests)
    .map((playlist: any) => ({
      id: String(playlist.id),
      title: playlist.name || "",
      image: null,
      previewImages: previewUrls(
        (playlist.songs || []).map((song: any) =>
          resolveCoverUrl(song.thumbnailUrl, "music"),
        ),
      ),
      subtitle: formatCount(
        { value: playlist.songs?.length || 0, isLowerBound: false },
        "Song",
        "Songs",
      ),
      href: `/${username}/music`,
    }));

  const states = [
    makeApolloState({
      id: "places",
      enabled: enabled.places,
      documentId,
      query: placesQuery,
      lists: placesLists,
      itemCount: aggregateCount(placesRaw, "place", "places"),
    }),
    enabled.music
      ? {
          id: "music" as const,
          dataStatus:
            (musicQuery.isLoading || musicQuery.isFetching) && !musicQuery.data
              ? ("loading" as const)
              : musicLists.length
                ? ("ready" as const)
                : ("empty" as const),
          lists: musicLists,
          listCount: musicLists.length,
          itemCount: {
            value: musicRaw.reduce(
              (total: number, playlist: any) =>
                total + (playlist.songs?.length || 0),
              0,
            ),
            isLowerBound: false,
            singular: "song",
            plural: "songs",
          },
          error: musicQuery.error || null,
          retry: async () => musicQuery.refetch(),
        }
      : null,
    makeApolloState({
      id: "movies",
      enabled: enabled.movies,
      documentId,
      query: moviesQuery,
      lists: moviesLists,
      itemCount: aggregateCount(moviesRaw, "movie", "movies"),
    }),
    makeApolloState({
      id: "books",
      enabled: enabled.books,
      documentId,
      query: booksQuery,
      lists: booksLists,
      itemCount: aggregateCount(booksRaw, "book", "books"),
    }),
    makeApolloState({
      id: "games",
      enabled: enabled.games,
      documentId,
      query: gamesQuery,
      lists: gamesLists,
      itemCount: aggregateCount(gamesRaw, "game", "games"),
    }),
    makeApolloState({
      id: "guides",
      enabled: enabled.guides,
      documentId,
      query: guidesQuery,
      lists: guidesLists,
    }),
    makeApolloState({
      id: "apps",
      enabled: enabled.apps,
      documentId,
      query: appsQuery,
      lists: appsLists,
      itemCount: aggregateCount(appsRaw, "app", "apps"),
    }),
    makeApolloState({
      id: "products",
      enabled: enabled.products,
      documentId,
      query: productsQuery,
      lists: productsLists,
      itemCount: aggregateCount(productsRaw, "product", "products"),
    }),
    makeApolloState({
      id: "people",
      enabled: enabled.people,
      documentId,
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
      if (!state || state.dataStatus === "empty") return slots;
      const config = CATEGORY_CONFIG[id];
      const label = t(config.labelKey, config.label);
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
        itemCountLabel,
        href: `/${username}/${id}`,
      };
      slots.push(ready);
      return slots;
    }, []);
  const hasError = states.some((state) => state.error != null);
  const isLoading = states.some((state) => state.dataStatus === "loading");
  const hasRenderableContent = orderedSlots.length > 0;

  const retryFailed = async () => {
    if (retryLock.current) return;
    const retrySnapshot = states
      .filter((state) => state.error != null)
      .map((state) => state.retry);
    if (!retrySnapshot.length) return;
    retryLock.current = true;
    setIsRetrying(true);
    try {
      await Promise.allSettled(retrySnapshot.map((retry) => retry()));
    } finally {
      retryLock.current = false;
      setIsRetrying(false);
    }
  };

  const retryButton = (
    <button
      type="button"
      onClick={retryFailed}
      disabled={isRetrying}
      className="profile-presentation-focus mt-3 min-h-12 rounded-lg border border-[var(--accent-color)] px-4 font-poppins text-sm font-semibold text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isRetrying
        ? t("publicProfile.recommendations.retrying", "Retrying…")
        : t("publicProfile.recommendations.retry", "Try again")}
    </button>
  );

  return (
    <section
      role="region"
      aria-label={t("publicProfile.recommendations.regionLabel", "Recommendations")}
      aria-busy={isLoading}
      className="space-y-4 pb-12 pt-2 text-[var(--text-primary)]"
    >
      {hasError && hasRenderableContent && (
        <aside
          role="status"
          className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card)] p-4"
        >
          <p className="font-poppins text-sm font-semibold text-[var(--text-primary)]">
            {t(
              "publicProfile.recommendations.partialError",
              "Some categories are unavailable",
            )}
          </p>
          {retryButton}
        </aside>
      )}

      {hasRenderableContent && (
        <ProfileRecommendationsLayouts
          layout={normalizedPresentation.layout}
          slots={orderedSlots}
        />
      )}

      {!isLoading && !hasRenderableContent && hasError && (
        <div className="rounded-2xl border border-[var(--border-card)] bg-[var(--bg-card)] p-6 text-center">
          <h2 className="font-poppins text-lg font-black text-[var(--text-primary)]">
            {t(
              "publicProfile.recommendations.loadError",
              "Couldn’t load recommendations",
            )}
          </h2>
          <p className="mt-2 font-poppins text-sm text-[var(--text-secondary)]">
            {t(
              "publicProfile.recommendations.loadErrorHelp",
              "Try again to load the unavailable categories.",
            )}
          </p>
          {retryButton}
        </div>
      )}

      {!isLoading && !hasRenderableContent && !hasError && (
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
