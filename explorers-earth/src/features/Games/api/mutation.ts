import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create Game List
// ─────────────────────────────────────────────────────────────
export const CREATE_GAME_LIST = gql`
  mutation CreateGameList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $Visibility: Boolean!
    $display_order: Int!
    $top_picks_heading: String
    $account: ID!
  ) {
    createGameList(
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
// Mutation 2.2 — Update Game List
// ─────────────────────────────────────────────────────────────
export const UPDATE_GAME_LIST = gql`
  mutation UpdateGameList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $Visibility: Boolean
    $display_order: Int
    $top_picks_heading: String
  ) {
    updateGameList(
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
// Mutation 2.3 — Delete Game List
// ─────────────────────────────────────────────────────────────
export const DELETE_GAME_LIST = gql`
  mutation DeleteGameList($documentId: ID!) {
    deleteGameList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended Game
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_GAME = gql`
  mutation CreateRecommendedGame(
    $igdb_id: Int!
    $igdb_slug: String
    $title: String!
    $igdb_image_id: String
    $cover_url: String
    $cover_url_large: String
    $summary: String
    $release_date: String
    $release_year: String
    $igdb_rating: Float
    $igdb_rating_count: Int
    $genres: JSON
    $platforms: JSON
    $developer: String
    $publisher: String
    $game_modes: JSON
    $screenshot_ids: JSON
    $igdb_url: String
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int!
    $media_details: JSON
    $game_list: ID!
    $game_categories: [ID]
  ) {
    createRecommendedGame(
      status: PUBLISHED
      data: {
        igdb_id: $igdb_id
        igdb_slug: $igdb_slug
        title: $title
        igdb_image_id: $igdb_image_id
        cover_url: $cover_url
        cover_url_large: $cover_url_large
        summary: $summary
        release_date: $release_date
        release_year: $release_year
        igdb_rating: $igdb_rating
        igdb_rating_count: $igdb_rating_count
        genres: $genres
        platforms: $platforms
        developer: $developer
        publisher: $publisher
        game_modes: $game_modes
        screenshot_ids: $screenshot_ids
        igdb_url: $igdb_url
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        game_list: $game_list
        game_categories: $game_categories
      }
    ) {
      documentId
      igdb_id
      title
      display_order
      is_pinned
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.5 — Update Recommended Game (for edit form)
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_GAME = gql`
  mutation UpdateRecommendedGame(
    $documentId: ID!
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $media_details: JSON
    $game_categories: [ID]
  ) {
    updateRecommendedGame(
      documentId: $documentId
      status: PUBLISHED
      data: {
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        game_categories: $game_categories
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
// Mutation 2.6 — Delete Recommended Game
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_GAME = gql`
  mutation DeleteRecommendedGame($documentId: ID!) {
    deleteRecommendedGame(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin (quick pin update)
// ─────────────────────────────────────────────────────────────
export const TOGGLE_GAME_PIN = gql`
  mutation ToggleGamePin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedGame(
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
