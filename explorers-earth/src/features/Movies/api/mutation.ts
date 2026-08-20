import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create Movie List
// ─────────────────────────────────────────────────────────────
export const CREATE_MOVIE_LIST = gql`
  mutation CreateMovieList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $Visibility: Boolean!
    $display_order: Int!
    $top_picks_heading: String
    $account: ID!
  ) {
    createMovieList(
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_picks_heading: $top_picks_heading
        account: $account
      }
    ) {
      documentId
      List_Name
      slug
      Visibility
      display_order
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.2 — Update Movie List
// ─────────────────────────────────────────────────────────────
export const UPDATE_MOVIE_LIST = gql`
  mutation UpdateMovieList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $Visibility: Boolean
    $display_order: Int
    $top_picks_heading: String
  ) {
    updateMovieList(
      documentId: $documentId
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_picks_heading: $top_picks_heading
      }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      display_order
      top_picks_heading
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.3 — Delete Movie List
// ─────────────────────────────────────────────────────────────
export const DELETE_MOVIE_LIST = gql`
  mutation DeleteMovieList($documentId: ID!) {
    deleteMovieList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended Movie
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_MOVIE = gql`
  mutation CreateRecommendedMovie(
    $tmdb_id: String!
    $media_type: ENUM_RECOMMENDEDMOVIE_MEDIA_TYPE!
    $title: String!
    $original_title: String
    $year: String
    $poster_path: String
    $backdrop_path: String
    $genres: JSON!
    $director: String
    $runtime: Int
    $tmdb_rating: Float
    $overview: String
    $season_count: Int
    $user_recommendation_note: JSON
    $user_rating: Int
    $watch_providers: JSON!
    $is_pinned: Boolean!
    $pin_order: Int
    $display_order: Int!
    $media_details: JSON
    $movie_list: ID!
    $movie_categories: [ID]
    $cast_details: JSON
  ) {
    createRecommendedMovie(
      status: PUBLISHED
      data: {
        tmdb_id: $tmdb_id
        media_type: $media_type
        title: $title
        original_title: $original_title
        year: $year
        poster_path: $poster_path
        backdrop_path: $backdrop_path
        genres: $genres
        director: $director
        runtime: $runtime
        tmdb_rating: $tmdb_rating
        overview: $overview
        season_count: $season_count
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        watch_providers: $watch_providers
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        movie_list: $movie_list
        movie_categories: $movie_categories
        cast_details: $cast_details
      }
    ) {
      documentId
      tmdb_id
      media_type
      title
      display_order
      is_pinned
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.5 — Update Recommended Movie
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_MOVIE = gql`
  mutation UpdateRecommendedMovie(
    $documentId: ID!
    $user_recommendation_note: JSON
    $user_rating: Int
    $watch_providers: JSON
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $media_details: JSON
    $movie_categories: [ID]
    $cast_details: JSON
  ) {
    updateRecommendedMovie(
      documentId: $documentId
      status: PUBLISHED
      data: {
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        watch_providers: $watch_providers
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        movie_categories: $movie_categories
        cast_details: $cast_details
      }
    ) {
      documentId
      is_pinned
      pin_order
      display_order
      user_recommendation_note
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.6 — Delete Recommended Movie
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_MOVIE = gql`
  mutation DeleteRecommendedMovie($documentId: ID!) {
    deleteRecommendedMovie(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin (quick pin update)
// ─────────────────────────────────────────────────────────────
export const TOGGLE_MOVIE_PIN = gql`
  mutation ToggleMoviePin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedMovie(
      documentId: $documentId
      status: PUBLISHED
      data: { is_pinned: $is_pinned, pin_order: $pin_order }
    ) {
      documentId
      is_pinned
      pin_order
    }
  }
`;
