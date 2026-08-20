import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create App List
// ─────────────────────────────────────────────────────────────
export const CREATE_APP_LIST = gql`
  mutation CreateAppList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $Visibility: Boolean!
    $display_order: Int!
    $top_apps_heading: String
    $account: ID!
  ) {
    createAppList(
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_apps_heading: $top_apps_heading
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
// Mutation 2.2 — Update App List
// ─────────────────────────────────────────────────────────────
export const UPDATE_APP_LIST = gql`
  mutation UpdateAppList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $Visibility: Boolean
    $display_order: Int
    $top_apps_heading: String
  ) {
    updateAppList(
      documentId: $documentId
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_apps_heading: $top_apps_heading
      }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      display_order
      top_apps_heading
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.3 — Delete App List
// ─────────────────────────────────────────────────────────────
export const DELETE_APP_LIST = gql`
  mutation DeleteAppList($documentId: ID!) {
    deleteAppList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended App
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_APP = gql`
  mutation CreateRecommendedApp(
    $app_url: String!
    $title: String!
    $description: String
    $logo_url: String
    $developer: String
    $platforms: JSON
    $price_tier: ENUM_RECOMMENDEDAPP_PRICE_TIER
    $download_url: String
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int!
    $screenshots: JSON
    $app_list: ID!
    $app_category: ID
  ) {
    createRecommendedApp(
      status: PUBLISHED
      data: {
        app_url: $app_url
        title: $title
        description: $description
        logo_url: $logo_url
        developer: $developer
        platforms: $platforms
        price_tier: $price_tier
        download_url: $download_url
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        screenshots: $screenshots
        app_list: $app_list
        app_category: $app_category
      }
    ) {
      documentId
      title
      display_order
      is_pinned
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.5 — Update Recommended App (for edit form)
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_APP = gql`
  mutation UpdateRecommendedApp(
    $documentId: ID!
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $app_category: ID
    $title: String
    $description: String
    $logo_url: String
    $developer: String
    $platforms: JSON
    $price_tier: ENUM_RECOMMENDEDAPP_PRICE_TIER
    $download_url: String
    $screenshots: JSON
  ) {
    updateRecommendedApp(
      documentId: $documentId
      status: PUBLISHED
      data: {
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        app_category: $app_category
        title: $title
        description: $description
        logo_url: $logo_url
        developer: $developer
        platforms: $platforms
        price_tier: $price_tier
        download_url: $download_url
        screenshots: $screenshots
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
// Mutation 2.6 — Delete Recommended App
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_APP = gql`
  mutation DeleteRecommendedApp($documentId: ID!) {
    deleteRecommendedApp(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin (quick pin update)
// ─────────────────────────────────────────────────────────────
export const TOGGLE_APP_PIN = gql`
  mutation ToggleAppPin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedApp(
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
