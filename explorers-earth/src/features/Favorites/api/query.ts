import { gql } from "@apollo/client";

export const accountDataQuery = gql`
  query UsersPermissionsUser($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      accounts {
        documentId
        public_recommendations
      }
    }
  }
`;

export const recommendationListQuery = gql`
  query RecommendationLists($filters: RecommendationListFiltersInput) {
    recommendationLists(filters: $filters, pagination: { limit: 100 }, sort: ["createdAt:asc"]) {
      documentId
      slug
      List_Name
      Visibility
      createdAt
      is_pinned
      pin_order
      display_order
      account {
        documentId
      }
      List_Name_Details
      Instagram_Media_URL
      recommended_places {
        documentId
        media_details
      }
    }
  }
`;

export const recommendationCategoriesQuery = gql`
  query RecommendationCategories {
    recommendationCategories(pagination: { limit: 100 }) {
      Category_Name
      documentId
      recommendation_sub_categories {
        sub_category
        documentId
      }
    }
  }
`;

export const recommendedListByIdQuery = gql`
  query RecommendationLists($documentId: ID!, $pagination: PaginationArg) {
    recommendationList(documentId: $documentId) {
      recommended_places(pagination: $pagination, sort: ["createdAt:asc"]) {
        documentId
        Place_Details
        media_details
        user_rating
        google_rating
        Media {
          url
        }
        recommendation_category {
          Category_Name
        }
      }
      Visibility
      documentId
      # Linked People Lists
      person_lists(sort: ["display_order:asc"], pagination: { limit: 50 }) {
        documentId
        List_Name
        slug
        recommended_people(sort: ["display_order:asc"], pagination: { limit: 200 }) {
          documentId
          name
          username_handle
          headline
          location
          avatar_path
          media_details
          primary_platform
          social_urls
          skills_tags
          user_recommendation_note
          user_rating
          is_pinned
          display_order
          people_category {
            documentId
            Category_name
          }
        }
      }
      # Linked Product Lists
      product_lists(sort: ["display_order:asc"], pagination: { limit: 50 }) {
        documentId
        List_Name
        slug
        recommended_products(sort: ["display_order:asc"], pagination: { limit: 200 }) {
          documentId
          product_url
          title
          brand
          price
          currency
          buy_url
          logo_url
          description
          specifications
          user_recommendation_note
          user_rating
          is_pinned
          display_order
          images
          product_category {
            documentId
            name
            slug
          }
        }
      }
    }
  }
`;

export const recommendedPlaceQuery = gql`
  query recommendedplace($documentId: ID!) {
    recommendedPlace(documentId: $documentId) {
      documentId
      Place_Details
      Contact_Name
      Contact_Number
      Places_Social_Link
      Places_Website
      Users_Place_Note
      Users_Social_URL
      recommendation_sub_category {
        sub_category
        documentId
      }
      recommendation_category {
        Category_Name
        documentId
      }
      recommendation_list {
        documentId
      }
      Media {
        url
        documentId
      }
      user_recommendation_note
      media_details
      user_rating
      google_rating
    }
  }
`;

export const recommendedPlacesQuery = gql`
  query RecommendedPlaces($pagination: PaginationArg, $filters: RecommendedPlaceFiltersInput) {
    recommendedPlaces(pagination: $pagination, filters: $filters, sort: ["createdAt:asc"]) {
      documentId
      Place_Details
      media_details
      Recommendation_Type
      Contact_Name
      Media {
        url
      }
      recommendation_category {
        Category_Name
      }
      recommendation_list {
        documentId
      }
      user_rating
      google_rating
    }
  }
`;

export const allRecommendedPlacesQuery = gql`
  query AllRecommendedPlaces($documentId: ID!) {
    recommendationList(documentId: $documentId) {
      documentId
      recommended_places(pagination: { limit: 1000 }, sort: ["createdAt:asc"]) {
        documentId
        Place_Details
        Recommendation_Type
        recommendation_category {
          Category_Name
        }
      }
    }
  }
`;
