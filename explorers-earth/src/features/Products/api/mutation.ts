import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create Product List
// ─────────────────────────────────────────────────────────────
export const CREATE_PRODUCT_LIST = gql`
  mutation CreateProductList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $Visibility: Boolean!
    $display_order: Int!
    $top_products_heading: String
    $account: ID!
    $recommendation_list: ID
  ) {
    createProductList(
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_products_heading: $top_products_heading
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
// Mutation 2.2 — Update Product List
// ─────────────────────────────────────────────────────────────
export const UPDATE_PRODUCT_LIST = gql`
  mutation UpdateProductList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $Visibility: Boolean
    $display_order: Int
    $top_products_heading: String
  ) {
    updateProductList(
      documentId: $documentId
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        Visibility: $Visibility
        display_order: $display_order
        top_products_heading: $top_products_heading
      }
    ) {
      documentId
      List_Name
      list_description
      slug
      Visibility
      display_order
      top_products_heading
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.3 — Delete Product List
// ─────────────────────────────────────────────────────────────
export const DELETE_PRODUCT_LIST = gql`
  mutation DeleteProductList($documentId: ID!) {
    deleteProductList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended Product
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_PRODUCT = gql`
  mutation CreateRecommendedProduct(
    $product_url: String!
    $title: String!
    $brand: String
    $price: Float
    $currency: String
    $buy_url: String
    $logo_url: String
    $description: String
    $specifications: JSON
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int!
    $images: JSON
    $product_list: ID!
    $product_category: ID
  ) {
    createRecommendedProduct(
      status: PUBLISHED
      data: {
        product_url: $product_url
        title: $title
        brand: $brand
        price: $price
        currency: $currency
        buy_url: $buy_url
        logo_url: $logo_url
        description: $description
        specifications: $specifications
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        images: $images
        product_list: $product_list
        product_category: $product_category
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
// Mutation 2.5 — Update Recommended Product (for edit form)
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_PRODUCT = gql`
  mutation UpdateRecommendedProduct(
    $documentId: ID!
    $user_recommendation_note: JSON
    $user_rating: Int
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $product_category: ID
    $title: String
    $brand: String
    $price: Float
    $currency: String
    $buy_url: String
    $logo_url: String
    $description: String
    $specifications: JSON
    $images: JSON
  ) {
    updateRecommendedProduct(
      documentId: $documentId
      status: PUBLISHED
      data: {
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        product_category: $product_category
        title: $title
        brand: $brand
        price: $price
        currency: $currency
        buy_url: $buy_url
        logo_url: $logo_url
        description: $description
        specifications: $specifications
        images: $images
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
// Mutation 2.6 — Delete Recommended Product
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_PRODUCT = gql`
  mutation DeleteRecommendedProduct($documentId: ID!) {
    deleteRecommendedProduct(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin (quick pin update)
// ─────────────────────────────────────────────────────────────
export const TOGGLE_PRODUCT_PIN = gql`
  mutation ToggleProductPin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedProduct(
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
