import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create Person List
// ─────────────────────────────────────────────────────────────
export const CREATE_PERSON_LIST = gql`
  mutation CreatePersonList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $Visibility: Boolean!
    $display_order: Int!
    $top_people_heading: String
    $account: ID!
    $recommendation_list: ID
  ) {
    createPersonList(
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_picks_heading: $top_people_heading
        account: $account
        recommendation_list: $recommendation_list
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
// Mutation 2.2 — Update Person List
// ─────────────────────────────────────────────────────────────
export const UPDATE_PERSON_LIST = gql`
  mutation UpdatePersonList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $Visibility: Boolean
    $display_order: Int
    $top_people_heading: String
  ) {
    updatePersonList(
      documentId: $documentId
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_picks_heading: $top_people_heading
      }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      display_order
      top_people_heading: top_picks_heading
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.3 — Delete Person List
// ─────────────────────────────────────────────────────────────
export const DELETE_PERSON_LIST = gql`
  mutation DeletePersonList($documentId: ID!) {
    deletePersonList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended Person
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_PERSON = gql`
  mutation CreateRecommendedPerson(
    $name: String!
    $username_handle: String
    $headline: String
    $location: String
    $avatar_path: String
    $primary_platform: ENUM_RECOMMENDEDPERSON_PRIMARY_PLATFORM
    $social_urls: JSON
    $skills_tags: JSON
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int!
    $person_list: ID!
    $people_category: ID
    $media_details: JSON
  ) {
    createRecommendedPerson(
      status: PUBLISHED
      data: {
        name: $name
        username_handle: $username_handle
        headline: $headline
        location: $location
        avatar_path: $avatar_path
        primary_platform: $primary_platform
        social_urls: $social_urls
        skills_tags: $skills_tags
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        person_list: $person_list
        people_category: $people_category
        media_details: $media_details
      }
    ) {
      documentId
      name
      display_order
      is_pinned
      people_category {
        documentId
        Category_name
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.5 — Update Recommended Person
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_PERSON = gql`
  mutation UpdateRecommendedPerson(
    $documentId: ID!
    $name: String
    $username_handle: String
    $headline: String
    $location: String
    $avatar_path: String
    $primary_platform: ENUM_RECOMMENDEDPERSON_PRIMARY_PLATFORM
    $social_urls: JSON
    $skills_tags: JSON
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $people_category: ID
    $media_details: JSON
  ) {
    updateRecommendedPerson(
      documentId: $documentId
      status: PUBLISHED
      data: {
        name: $name
        username_handle: $username_handle
        headline: $headline
        location: $location
        avatar_path: $avatar_path
        primary_platform: $primary_platform
        social_urls: $social_urls
        skills_tags: $skills_tags
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        people_category: $people_category
        media_details: $media_details
      }
    ) {
      documentId
      is_pinned
      pin_order
      display_order
      user_recommendation_note
      people_category {
        documentId
        Category_name
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.6 — Delete Recommended Person
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_PERSON = gql`
  mutation DeleteRecommendedPerson($documentId: ID!) {
    deleteRecommendedPerson(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin
// ─────────────────────────────────────────────────────────────
export const TOGGLE_PERSON_PIN = gql`
  mutation TogglePersonPin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedPerson(
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
