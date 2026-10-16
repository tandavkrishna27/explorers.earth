import { gql } from "@apollo/client";

export const deleteExplorerAccountMutation = gql`
  mutation DeleteExplorerAccount($accountDocumentId: ID!) {
    deleteAccount(documentId: $accountDocumentId) {
      documentId
    }
  }
`;

export const deleteExplorerUserMutation = gql`
  mutation DeleteExplorerUser($userId: ID!, $filters: AccountFiltersInput, $recommendationDocumentId: ID!) {
    deleteRecommendationList(documentId: $recommendationDocumentId) {
      documentId
    }
    deleteUsersPermissionsUser(id: $userId) {
      data {
        documentId
        accounts(filters: $filters) {
          Account_Name
          Account_Type
          documentId
          Bio
          Addresss
        }
      }
    }
  }
`;

export const accountQuery = gql`
  query Account($filters: AccountFiltersInput) {
    accounts(filters: $filters) {
      documentId
      public_profile
      public_recommendations
      public_music
      public_movie
      public_guides
      public_books
      public_games
      public_apps
      public_products
      public_people
      pinned_nav_tabs
      auto_pinning
    }
  }
`;

export const updateAccountMutation = gql`
  mutation UpdateAccount($documentId: ID!, $data: AccountInput!) {
    updateAccount(documentId: $documentId, data: $data) {
      documentId
      public_profile
      public_recommendations
      public_music
      public_movie
      public_guides
      public_books
      public_games
      public_apps
      public_products
      public_people
      pinned_nav_tabs
      auto_pinning
    }
  }
`;

export const getUserAccountQuery = gql`
  query UsersPermissionsUser($documentId: ID!) {
    usersPermissionsUser(documentId: $documentId) {
      username
      accounts {
        username
        documentId
      }
    }
  }
`;

