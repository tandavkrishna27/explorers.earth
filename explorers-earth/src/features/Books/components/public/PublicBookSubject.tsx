import { useState, useCallback, useEffect } from "react";
import { useParams, useOutletContext, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { deduplicateBooks, slugToSubjectName } from "../../utils/bookHelpers";
import type { RecommendedBook } from "../../types";
import BookCoverCard from "./BookCoverCard";
import BookDetailModal from "./BookDetailModal";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";

const isRenderableBook = (value: unknown): value is RecommendedBook =>
  isNonNullObject(value) &&
  typeof value.documentId === "string" &&
  Array.isArray(value.subjects) &&
  Array.isArray(value.authors);

const PublicBookSubject = () => {
  const { username, subjectSlug } = useParams<{ username: string; subjectSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const subjectName = slugToSubjectName(subjectSlug ?? "");

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);

  const [modalState, setModalState] = useState<{ open: boolean; book: RecommendedBook | null }>({
    open: false,
    book: null,
  });

  const page = usePublicRecommendationCategory(
    username,
    "books",
    accountData?.public_books === "Yes",
  );

  const {data,loading:booksLoading,error:booksError,refetch:refetchBooks}=page;
  const loading = userLoading || booksLoading;
  const queryError = userError || booksError;
  const rawLists = data?.bookLists;
  const rawBooks = Array.isArray(rawLists)
    ? rawLists.flatMap((list) =>
      isNonNullObject(list) && Array.isArray(list.recommended_books) ? list.recommended_books : [],
    )
    : undefined;
  const renderableBooks = (Array.isArray(rawBooks) ? rawBooks : []).filter(isRenderableBook);
  const completeCollection = Array.isArray(rawBooks) && rawBooks.every(isRenderableBook);
  const hasUsableData = queryError ? renderableBooks.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountData?.public_books === "Yes" ? refetchBooks : undefined);
  }, [accountData?.public_books, refetchBooks, refetchUser]);

  usePublicHeaderDescriptor(subjectSlug && hasUsableData && accountData?.public_books === "Yes" ? {
    navigationKey: location.key,
    title: `${subjectName} Books`,
    url: window.location.href,
    analyticsContext: "books-subject-header",
    analyticsMetadata: { subject: subjectSlug },
  } : undefined);

  // Filter locally by subject slug
  const allBooks: RecommendedBook[] = deduplicateBooks(renderableBooks);
  const subjectBooks = allBooks.filter((b) =>
    (b.subjects ?? []).some(
      (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === subjectSlug
    )
  );

  const analytics = useTrackAnalytics({ ...createAnalyticsOptions.books(typeof accountData?.documentId === 'string' ? accountData.documentId : '', username), ready: hasUsableData && accountData?.public_books === 'Yes' });
  const handleBookClick = useCallback((book: RecommendedBook) => {
    setModalState({ open: true, book });
    analytics.trackClick('book-card', { id: book.documentId, listId: book.book_list?.documentId, title: book.title });
  }, [analytics]);

  const pageTitle = `${subjectName} Books | ${username}'s Book List | explorers`;
  const metaDescription = `Explore ${subjectBooks.length} book${subjectBooks.length !== 1 ? "s" : ""} on ${subjectName} recommended by ${username} on explorers.`;
  const seoKeywords = [subjectName, "books", `${username} books`, "explorers"];

  return (
    <>
      {!loading && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/books/subject/${subjectSlug}`)}
          type="website"
          author={username}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#000)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
      <div className="pb-20 px-4 md:px-8 max-w-6xl mx-auto">
        <div className="py-4">
          <a href={`/${username}/books`} className="flex items-center gap-2 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,#fff)] transition-colors">
            <ArrowLeft size={14} /> All Books
          </a>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-[color:var(--category-text,#fff)]">{subjectName}</h1>
          <p className="text-[color:var(--category-muted,rgba(255,255,255,0.3))] text-sm mt-1">
            {subjectBooks.length} book{subjectBooks.length !== 1 ? "s" : ""}
          </p>
        </div>

        {Boolean(queryError) && hasUsableData && <PublicRoutePartialNotice message="Some book data is unavailable." />}

        {loading && !hasUsableData ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : queryError && !hasUsableData ? (
          <PublicRouteErrorState title="Book subject unavailable" error={queryError} onRetry={handleRetry} />
        ) : subjectBooks.length === 0 && !page.hasMore ? (
          <p className="text-center text-[color:var(--category-muted,rgba(255,255,255,0.3))] py-16">No books found for this subject.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
            {subjectBooks.map((book) => (
              <BookCoverCard key={book.documentId} book={book} onClick={handleBookClick} />
            ))}
          </div>
        )}
      </div>

      <PublicScrollContinuation {...page} label="book lists" />
      <BookDetailModal onTrackClick={analytics.trackClick}
        book={modalState.book}
        open={modalState.open}
        onClose={() => setModalState({ open: false, book: null })}
      />
      </div>
    </>
  );
};

export default PublicBookSubject;
