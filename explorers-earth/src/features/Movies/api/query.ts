import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Query 1.1 — Movie Lists by Account (Dashboard + Public)
// ─────────────────────────────────────────────────────────────
export const MOVIE_LISTS_BY_ACCOUNT = gql`
  query MovieListsByAccount($accountDocumentId: ID!) {
    movieLists(
      filters: { account: { documentId: { eq: $accountDocumentId } } }
      sort: ["display_order:asc"]
      pagination: { limit: 100 }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      cover_image {
        url
        alternativeText
      }
      display_order
      top_picks_heading
      recommended_movies(sort: ["display_order:asc"], pagination: { limit: 200 }) {
        documentId
        tmdb_id
        media_type
        title
        poster_path
        backdrop_path
        year
        runtime
        genres
        overview
        tmdb_rating
        watch_providers
        cast_details
        is_pinned
        pin_order
        user_rating
        director
        user_recommendation_note
        season_count
        media_details
        movie_categories {
          documentId
          genre_name
        }
        Media {
          documentId
          url
          caption
        }
      }
      account {
        documentId
        username
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Query 1.2 — Movies by List (paginated, for list view)
// ─────────────────────────────────────────────────────────────
export const MOVIES_BY_LIST = gql`
  query MoviesByList(
    $movieListDocumentId: ID!
    $page: Int!
    $pageSize: Int!
  ) {
    movieLists(filters: { documentId: { eq: $movieListDocumentId } }) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      top_picks_heading
      display_order
      recommended_movies(
        sort: ["display_order:asc"]
        pagination: { start: $page, limit: $pageSize }
      ) {
        documentId
        tmdb_id
        media_type
        title
        original_title
        poster_path
        backdrop_path
        year
        genres
        director
        runtime
        tmdb_rating
        overview
        season_count
        user_recommendation_note
        user_rating
        watch_providers
        is_pinned
        pin_order
        display_order
        cast_details
        media_details
        movie_categories {
          documentId
          genre_name
        }
        Media {
          documentId
          url
          caption
        }
      }
    }
  }
`;

// Page-0 window shared by the list view's query AND the Add-page refetch, so the
// two can never drift. A drift would make the refetch target a different cache
// key — a silent no-op that leaves the list stale after an add.
export const MOVIES_BY_LIST_PAGE_SIZE = 100;
export const moviesByListVars = (listId: string) => ({
  movieListDocumentId: listId,
  page: 0,
  pageSize: MOVIES_BY_LIST_PAGE_SIZE,
});
export const refetchMoviesByList = (listId: string) => [
  { query: MOVIES_BY_LIST, variables: moviesByListVars(listId) },
];

