// Dashboard components
export { default as MoviesHome } from "./components/dashboard/MoviesHome";
export { default as MovieListView } from "./components/dashboard/MovieListView";
export { default as AddMoviePage } from "./components/dashboard/AddMoviePage";

// Public components
export { default as PublicMovies } from "./components/public/PublicMovies";
export { default as PublicMovieList } from "./components/public/PublicMovieList";
export { default as PublicMovieGenre } from "./components/public/PublicMovieGenre";
export { default as MovieCarouselRow } from "./components/public/MovieCarouselRow";
export { default as MoviePosterCard } from "./components/public/MoviePosterCard";
export { default as MovieDetailModal } from "./components/public/MovieDetailModal";
export { default as GenreBrowse } from "./components/public/GenreBrowse";

// Types
export type * from "./types";

// Utils
export * from "./utils/movieHelpers";

// API
export * from "./api/query";
export * from "./api/mutation";

// Hooks
export { useTMDBSearch } from "./hooks/useTMDBSearch";
