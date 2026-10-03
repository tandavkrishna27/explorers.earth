import { useState, useCallback, useEffect } from "react";
import { useParams, useOutletContext, useLocation } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { deduplicateBooks } from "../../utils/bookHelpers";
import type { BookList, RecommendedBook } from "../../types";
import BookCoverCard from "./BookCoverCard";
import BookDetailModal from "./BookDetailModal";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, isPublicProfileNotFound, PublicRouteErrorState, PublicRoutePartialNotice } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileDetail } from "../../../PublicHome/api/usePublicProfileDetail";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const PublicBookList = () => {
  const { username, listSlug } = useParams<{ username: string; listSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const [modalState, setModalState] = useState<{ open: boolean; book: RecommendedBook | null }>({
    open: false,
    book: null,
  });

  const page = usePublicProfileDetail(username, "books", listSlug, { pageSize:24 });
  const { data, loading, error, refetch } = page;

  const rawList = (Array.isArray(data?.bookLists) ? data.bookLists : []).find(
    (value: unknown): value is BookList =>
      isNonNullObject(value) && Array.isArray(value.recommended_books),
  );
  const hasUsableData = Boolean(rawList);

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  usePublicHeaderDescriptor(rawList ? {
    navigationKey: location.key,
    title: rawList.List_Name || "Book List",
    url: window.location.href,
    analyticsContext: "books-list-header",
    analyticsMetadata: {
      listId: rawList.documentId,
      listName: rawList.List_Name,
    },
  } : undefined);
  const books: RecommendedBook[] = deduplicateBooks(rawList?.recommended_books);

  const analytics = useTrackAnalytics({ ...createAnalyticsOptions.books(rawList?.account?.documentId || '', username, rawList?.documentId), ready: hasUsableData });
  const handleBookClick = useCallback((book: RecommendedBook) => {
    setModalState({ open: true, book });
    analytics.trackClick('book-card', { id: book.documentId, listId: book.book_list?.documentId || rawList?.documentId, title: book.title });
  }, [analytics, rawList?.documentId]);

  const pinnedBooks = books.filter((b) => b.is_pinned);
  const restBooks = books.filter((b) => !b.is_pinned);

  const pageTitle = rawList ? `${rawList.List_Name} | ${username}'s Book List | explorers` : `Book List | explorers`;
  const metaDescription = rawList?.list_description
    ? rawList.list_description
    : rawList
      ? `Explore the curated book list "${rawList.List_Name}" containing ${books.length}${page.hasMore ? "+" : ""} books recommended by ${username} on explorers.`
      : "Explore book recommendations on explorers.";

  const seoKeywords = rawList
    ? [`${rawList.List_Name}`, `${username} books`, "book list", "explorers"]
    : ["book list", "explorers"];

  const listImage = rawList?.cover_image?.url || (books[0]?.cover_url ? books[0].cover_url : undefined);

  return (
    <>
      {!loading && rawList && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/books/${listSlug}`)}
          image={listImage}
          type="website"
          author={username}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#000)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
      <div className="pb-20 px-4 md:px-8 max-w-6xl mx-auto">
        {/* Back link */}
        <div className="py-4">
          <Link to={`/${username}/books`} className="flex items-center gap-2 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,#fff)] transition-colors">
            <ArrowLeft size={14} /> All Books
          </Link>
        </div>

        {Boolean(error) && hasUsableData && <PublicRoutePartialNotice message="Some book data is unavailable." />}

        {loading && !hasUsableData ? (
          <div className="space-y-6">
            <div className="h-8 w-64 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] rounded-lg animate-pulse" />
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : error && !hasUsableData && !isPublicProfileNotFound(error) ? (
          <PublicRouteErrorState title="Book list unavailable" error={error} onRetry={refetch} />
        ) : !rawList ? (
          <div className="text-center py-24">
            <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))]">This list doesn't exist or isn't publicly visible.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl md:text-3xl font-bold text-[color:var(--category-text,#fff)]">{rawList.List_Name}</h1>
              {rawList.list_description && (
                <p className="text-[color:var(--category-muted,rgba(255,255,255,0.5))] text-sm mt-1">{rawList.list_description}</p>
              )}
              <p className="text-[color:var(--category-muted,rgba(255,255,255,0.3))] text-xs mt-2">{books.length}{page.hasMore ? "+" : ""} book{books.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Pinned / Top Reads section */}
            {pinnedBooks.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-5 bg-amber-400 rounded-sm" />
                  <h2 className="text-lg font-bold text-[color:var(--category-text,#fff)] flex items-center gap-1.5">
                    <Star size={16} className="text-[color:var(--category-text,#fbbf24)]" fill="currentColor" /> Top Reads
                  </h2>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {pinnedBooks.map((book) => (
                    <BookCoverCard key={book.documentId} book={book} onClick={handleBookClick} />
                  ))}
                </div>
              </div>
            )}

            {/* All books grid */}
            {restBooks.length > 0 && (
              <div className="mb-8">
                {pinnedBooks.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-5 bg-[var(--category-skeleton,rgba(255,255,255,0.3))] rounded-sm" />
                    <h2 className="text-lg font-bold text-[color:var(--category-text,#fff)]">All Books</h2>
                  </div>
                )}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                  {restBooks.map((book) => (
                    <BookCoverCard key={book.documentId} book={book} onClick={handleBookClick} />
                  ))}
                </div>
              </div>
            )}

            {books.length === 0 && (
              <p className="text-center text-[color:var(--category-muted,rgba(255,255,255,0.3))] py-16">No books in this list yet.</p>
            )}
          </>
        )}
        <PublicScrollContinuation {...page} label="books" className="mt-6" />
      </div>

      <BookDetailModal onTrackClick={analytics.trackClick}
        book={modalState.book}
        open={modalState.open}
        onClose={() => setModalState({ open: false, book: null })}
      />
      </div>
    </>
  );
};

export default PublicBookList;
