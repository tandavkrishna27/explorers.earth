import { gql } from "@apollo/client";

export const createRecommendationLinkMutation = gql`
  mutation CreateRecommendationList($data: RecommendationListInput!) {
    createRecommendationList(status: PUBLISHED, data: $data) {
      Instagram_Media_URL
      List_Name
      List_Name_Details
      Visibility
      is_pinned
      pin_order
      display_order
      account {
        documentId
      }
      documentId
      recommended_places {
        documentId
      }
      slug
    }
  }
`;

export const createRecommendationCategoryMutation = gql`
  mutation CreateRecommendationCategory($data: RecommendationCategoryInput!) {
    createRecommendationCategory(status: PUBLISHED, data: $data) {
      Category_Name
      documentId
    }
  }
`;

export const CreateRecommendedPlaceMutation = gql`
  mutation CreateRecommendedPlace($data: RecommendedPlaceInput!) {
    createRecommendedPlace(status: PUBLISHED, data: $data) {
      documentId
    }
  }
`;

export const DeleteRecommendedListMutation = gql`
  mutation DeleteRecommendationList($documentId: ID!) {
    deleteRecommendationList(documentId: $documentId) {
      documentId
    }
  }
`;

export const updateRecommendationListVisiblity = gql`
  mutation UpdateRecommendationList(
    $documentId: ID!
    $data: RecommendationListInput!
  ) {
    updateRecommendationList(documentId: $documentId, status: PUBLISHED, data: $data) {
      Visibility
    }
  }
`;

export const updateRecommendedListMutation = gql`
  mutation updateRecommendedList(
    $documentId: ID!
    $data: RecommendationListInput!
  ) {
    updateRecommendationList(documentId: $documentId, status: PUBLISHED, data: $data) {
      List_Name
      Instagram_Media_URL
      List_Name_Details
      slug
      Visibility
      is_pinned
      pin_order
      display_order
      documentId
    }
  }
`;

export const deleteRecommendedPlaceMutation = gql`
  mutation delete($documentId: ID!) {
    deleteRecommendedPlace(documentId: $documentId) {
      documentId
    }
  }
`;

export const updateRecommendationPlaceMutation = gql`
  mutation update($documentId: ID!, $data: RecommendedPlaceInput!) {
    updateRecommendedPlace(documentId: $documentId, status: PUBLISHED, data: $data) {
      documentId
    }
  }
`;

// Person-specific mutations (uses Person_Details JSON field instead of Place_Details)
export const CreateRecommendedPersonMutation = gql`
  mutation CreateRecommendedPerson($data: RecommendedPlaceInput!) {
    createRecommendedPlace(status: PUBLISHED, data: $data) {
      documentId
    }
  }
`;

export const updateRecommendedPersonMutation = gql`
  mutation updatePerson($documentId: ID!, $data: RecommendedPlaceInput!) {
    updateRecommendedPlace(documentId: $documentId, status: PUBLISHED, data: $data) {
      documentId
    }
  }
`;

// Standard Strapi CRUD mutations for ClaimablePlaceProfile
export const createClaimablePlaceProfileMutation = gql`
  mutation CreateClaimablePlaceProfile($data: ClaimablePlaceProfileInput!) {
    createClaimablePlaceProfile(data: $data) {
      documentId
      Place_Id
      Name
      Address
      Lat
      Long
      Phone
      Website
      Meta_Data
      Recommendation_Count
      Added_By_User
      Is_Claimed
      Claiming_Account {
        documentId
      }
    }
  }
`;

export const updateClaimablePlaceProfileMutation = gql`
  mutation UpdateClaimablePlaceProfile($documentId: ID!, $data: ClaimablePlaceProfileInput!) {
    updateClaimablePlaceProfile(documentId: $documentId, data: $data) {
      documentId
      Place_Id
      Name
      Address
      Lat
      Long
      Phone
      Website
      Meta_Data
      Recommendation_Count
      Added_By_User
      Is_Claimed
      Claiming_Account {
        documentId
      }
    }
  }
`;

export const findClaimablePlaceProfileByPlaceIdQuery = gql`
  query FindClaimablePlaceProfileByPlaceId($filters: ClaimablePlaceProfileFiltersInput!) {
    claimablePlaceProfiles(filters: $filters) {
      documentId
      Place_Id
      Name
      Address
      Lat
      Long
      Phone
      Website
      Meta_Data
      Recommendation_Count
      Added_By_User
      Is_Claimed
      Claiming_Account {
        documentId
      }
    }
  }
`;
export const updateAccountVisibility = gql`
  mutation UpdateAccountVisibility($documentId: ID!, $data: AccountInput!) {
    updateAccount(documentId: $documentId, data: $data) {
      documentId
      public_recommendations
    }
  }
`;
