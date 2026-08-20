import { gql } from "@apollo/client";

// ─────────────────────────────────────────────────────────────
// Mutation 2.1 — Create Book List
// ─────────────────────────────────────────────────────────────
export const CREATE_BOOK_LIST = gql`
  mutation CreateBookList(
    $List_Name: String!
    $list_description: String
    $slug: String!
    $visibility: Boolean!
    $display_order: Int!
    $top_reads_heading: String
    $account: ID!
  ) {
    createBookList(
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        visibility: $visibility
        display_order: $display_order
        top_reads_heading: $top_reads_heading
        account: $account
      }
    ) {
      documentId
      List_Name
      slug
      visibility
      display_order
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.2 — Update Book List
// ─────────────────────────────────────────────────────────────
export const UPDATE_BOOK_LIST = gql`
  mutation UpdateBookList(
    $documentId: ID!
    $List_Name: String
    $list_description: String
    $slug: String
    $visibility: Boolean
    $display_order: Int
    $top_reads_heading: String
  ) {
    updateBookList(
      documentId: $documentId
      status: PUBLISHED
      data: {
        List_Name: $List_Name
        list_description: $list_description
        slug: $slug
        visibility: $visibility
        display_order: $display_order
        top_reads_heading: $top_reads_heading
      }
    ) {
      documentId
      List_Name
      list_description
      slug
      visibility
      display_order
      top_reads_heading
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.3 — Delete Book List
// ─────────────────────────────────────────────────────────────
export const DELETE_BOOK_LIST = gql`
  mutation DeleteBookList($documentId: ID!) {
    deleteBookList(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.4 — Create Recommended Book
// ─────────────────────────────────────────────────────────────
export const CREATE_RECOMMENDED_BOOK = gql`
  mutation CreateRecommendedBook(
    $volume_id: String!
    $title: String!
    $subtitle: String
    $authors: JSON!
    $year: String
    $cover_url: String
    $cover_url_large: String
    $subjects: JSON
    $publisher: String
    $page_count: Int
    $google_rating: Float
    $description: String
    $isbn_13: String
    $preview_link: String
    $user_recommendation_note: JSON
    $user_rating: Int
    $buy_links: JSON
    $is_pinned: Boolean!
    $pin_order: Int
    $display_order: Int!
    $media_details: JSON
    $book_list: ID!
    $book_categories: [ID]
  ) {
    createRecommendedBook(
      status: PUBLISHED
      data: {
        volume_id: $volume_id
        title: $title
        subtitle: $subtitle
        authors: $authors
        year: $year
        cover_url: $cover_url
        cover_url_large: $cover_url_large
        subjects: $subjects
        publisher: $publisher
        page_count: $page_count
        google_rating: $google_rating
        description: $description
        isbn_13: $isbn_13
        preview_link: $preview_link
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        buy_links: $buy_links
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        book_list: $book_list
        book_categories: $book_categories
      }
    ) {
      documentId
      volume_id
      title
      display_order
      is_pinned
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.5 — Update Recommended Book (for edit form)
// ─────────────────────────────────────────────────────────────
export const UPDATE_RECOMMENDED_BOOK = gql`
  mutation UpdateRecommendedBook(
    $documentId: ID!
    $user_recommendation_note: JSON
    $user_rating: Int
    $buy_links: JSON
    $is_pinned: Boolean
    $pin_order: Int
    $display_order: Int
    $media_details: JSON
    $book_categories: [ID]
  ) {
    updateRecommendedBook(
      documentId: $documentId
      status: PUBLISHED
      data: {
        user_recommendation_note: $user_recommendation_note
        user_rating: $user_rating
        buy_links: $buy_links
        is_pinned: $is_pinned
        pin_order: $pin_order
        display_order: $display_order
        media_details: $media_details
        book_categories: $book_categories
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
// Mutation 2.6 — Delete Recommended Book
// ─────────────────────────────────────────────────────────────
export const DELETE_RECOMMENDED_BOOK = gql`
  mutation DeleteRecommendedBook($documentId: ID!) {
    deleteRecommendedBook(documentId: $documentId) {
      documentId
    }
  }
`;

// ─────────────────────────────────────────────────────────────
// Mutation 2.7 — Toggle Pin (quick pin update)
// ─────────────────────────────────────────────────────────────
export const TOGGLE_BOOK_PIN = gql`
  mutation ToggleBookPin(
    $documentId: ID!
    $is_pinned: Boolean!
    $pin_order: Int
  ) {
    updateRecommendedBook(
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
