// ============================================================
// Movies & Shows Feature — TypeScript Types
// ============================================================

// --- Strapi Entity Types ---

export interface MovieList {
  documentId: string;
  List_Name: string;
  list_description: string | null;
  slug: string;
  Visibility: boolean;
  cover_image: StrapiMedia | null;
  display_order: number;
  top_picks_heading: string | null;
  recommended_movies: RecommendedMovie[];
  account: {
    documentId: string;
    username: string;
  };
  movieCount?: number; // computed from recommended_movies.length
}

export interface RecommendedMovie {
  entity_id?: string;
  documentId: string;
  tmdb_id: string;
  media_type: "Movie" | "TV";
  title: string;
  original_title: string | null;
  year: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: TMDBGenreObject[];
  director: string | null;
  runtime: number | null;
  tmdb_rating: number | null;
  overview: string | null;
  season_count: number | null;
  user_recommendation_note: any; // Blocks JSON
  user_rating?: number | null;
  watch_providers: WatchProvider[];
  is_pinned: boolean;
  pin_order: number | null;
  display_order: number;
  Media: StrapiMedia[];
  media_details: MediaDetails | null;
  movie_list: {
    documentId: string;
    List_Name: string;
    slug: string;
  } | null;
  movie_categories: {
    documentId: string;
    genre_name: string;
  }[] | null;
  cast_details?: CastDetail[] | null;
}

export interface CastDetail {
  original_name: string;
  character: string;
  profile_url: string | null;
}

export interface MovieCategory {
  documentId: string;
  genre_name: string;
  recommended_movie?: RecommendedMovie[];
}

export interface StrapiMedia {
  documentId?: string;
  url: string;
  caption?: string | null;
  alternativeText?: string | null;
}

export interface WatchProvider {
  provider_id?: number;
  provider_name: string;
  logo_path?: string | null;
  link?: string;
}

export interface MediaDetails {
  imageDetails?: { id: string; url: string }[];
  thumbnail?: { url: string };
}

// --- TMDB API Types ---

export interface TMDBSearchResult {
  id: number;
  title?: string;       // movies
  name?: string;        // TV shows
  media_type: "movie" | "tv" | "person";
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  overview?: string;
  genre_ids?: number[];
}

export interface TMDBMovieDetail {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  runtime: number | null;
  genres: TMDBGenreObject[];
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  credits?: {
    cast?: TMDBCastMember[];
    crew?: TMDBCrewMember[];
  };
}

export interface TMDBTVDetail {
  id: number;
  name: string;
  original_name: string;
  first_air_date: string;
  episode_run_time: number[];
  number_of_seasons: number;
  genres: TMDBGenreObject[];
  vote_average: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  created_by?: { name: string }[];
  credits?: {
    cast?: TMDBCastMember[];
    crew?: TMDBCrewMember[];
  };
}

export interface TMDBGenreObject {
  id: number;
  name: string;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface TMDBCrewMember {
  job: string;
  name: string;
}

export interface TMDBWatchProvidersResult {
  id: number;
  results?: {
    [countryCode: string]: {
      flatrate?: TMDBWatchProvider[];
      rent?: TMDBWatchProvider[];
      buy?: TMDBWatchProvider[];
      link?: string;
    };
  };
}

export interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}

// --- Form Types ---

export interface CreateMovieListFormValues {
  List_Name: string;
  list_description: string;
  slug: string;
}

export interface AddMovieFormValues {
  user_recommendation_note: string;
  is_pinned: boolean;
  watch_providers: WatchProvider[];
  movie_categories_id?: string;
}

// --- UI State Types ---

export type MovieDetailModalState = {
  open: boolean;
  movie: RecommendedMovie | null;
};

export type SortOrder = "custom" | "rating" | "year" | "recent";

// --- TMDB image size constants ---

export const TMDB_POSTER_SIZES = {
  small: "w185",
  medium: "w342",
  large: "w500",
  xlarge: "w780",
} as const;

export const TMDB_BACKDROP_SIZES = {
  small: "w300",
  medium: "w780",
  large: "w1280",
} as const;
