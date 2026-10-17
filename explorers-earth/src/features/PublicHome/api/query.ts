import { gql } from "@apollo/client";

// Fetches the count of published lists per content category for a given account.
// Used by PublicNav to rank auto-fill footer nav tabs by number of published lists.
export const getPublicCategoryListCountsQuery = gql`
  query PublicCategoryListCounts($accountDocumentId: ID!) {
    recommendationLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    bookLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    movieLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    gameLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    appLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    productLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    personLists(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
    guides(
      filters: { account: { documentId: { eq: $accountDocumentId } }, Visibility: { eq: true } }
      pagination: { limit: 100 }
    ) { documentId }
  }
`;

export const recommendationListQuery = gql`
  query RecommendationLists {
    recommendationLists {
      documentId
      List_Name
      Visibility
      is_pinned
      pin_order
      display_order
      account {
        documentId
      }
      List_Name_Details
      Instagram_Media_URL
    }
  }
`;

export const accountsDetailQuery = gql`
  query user($filters: AccountFiltersInput) {
    accounts(filters: $filters) {
      Account_Name
      Bio
      users_permissions_users {
        role {
          name
        }
      }
      bg_picture {
        url
        alternativeText
      }
      Primary_Address
      profile_picture {
        url
        alternativeText
      }
      documentId
      Account_Type
      social_media
      Feed_Data
      public_profile
      public_recommendations
      public_music
      public_movie
      public_books
      public_guides
      public_games
      public_apps
      public_products
      public_people
      pinned_nav_tabs
      auto_pinning
      recommendation_lists(pagination: { limit: 100 })  {
        documentId
        List_Name
        Visibility
        is_pinned
        pin_order
        display_order
        List_Name_Details
        recommended_places {
          recommendation_category {
            Category_Name
          }
          documentId
          Media {
            url
          }
          Place_Details
          Recommendation_Type
          Contact_Name
          media_details
        }
      }
    }
  }
`;

// Lean query for non-profile public pages (nav, guides, music)
// Only fetches minimal data needed for tab visibility and basic display
export const getPublicAccountBasicQuery = gql`
  query PublicAccountBasic($filters: AccountFiltersInput) {
    accounts(filters: $filters) {
      username
      Account_Name
      Account_Type
      Primary_Address
      documentId
      bg_picture {
        url
      }
      profile_picture {
        url
      }
      social_media
      public_profile
      public_recommendations
      public_music
      public_movie
      public_books
      public_guides
      public_games
      public_apps
      public_products
      public_people
      pinned_nav_tabs
      auto_pinning
    }
  }
`;

// Full profile data query — used ONLY on the PublicProfile page
// Includes social media, feed, bio, etc. but NOT mobile_number
// Mobile number is fetched separately only when visibility is confirmed
export const getPublicProfileDataQuery = gql`
  query PublicProfileData($filters: AccountFiltersInput) {
    accounts(filters: $filters) {
      Account_Name
      Account_Type
      Primary_Address
      Bio
      bg_picture {
        url
      }
      createdAt
      documentId
      profile_picture {
        url
      }
      social_media
      Public_Profile_Address
      Feed_Data
      mobile_number_visibility
      public_profile
      public_recommendations
      public_music
      public_movie
      public_books
      public_guides
      public_games
      public_apps
      public_products
      public_people
      pinned_nav_tabs
      auto_pinning
    }
  }
`;

