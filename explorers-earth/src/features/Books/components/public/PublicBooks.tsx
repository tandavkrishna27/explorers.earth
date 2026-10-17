import { useState, useCallback, useEffect } from "react";
import { useParams, useOutletContext, useLocation } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { deduplicateBooks } from "../../utils/bookHelpers";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import type { RecommendedBook, BookList } from "../../types";
import BookCarouselRow from "./BookCarouselRow";
import BookDetailModal from "./BookDetailModal";
import SubjectBrowse from "./SubjectBrowse";
import TopReadsHero from "./TopReadsHero";
import TopReadsMobileHero from "./TopReadsMobileHero";
import useDeviceDetection from "../../../../hooks/useDeviceDetection";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableBookList = (value: unknown): value is BookList =>
  isNonNullObject(value) && Array.isArray(value.recommended_books);

const PublicBooks = () => {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const { isDesktop } = useDeviceDetection();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;

  const [modalState, setModalState] = useState<{ open: boolean; book: RecommendedBook | null }>({
    open: false,
    book: null,
  });

  const query = usePublicRecommendationCategory(username, "books", accountData?.public_books === "Yes");
  const { data, loading: booksLoading, error: booksError, refetch: refetchBooks } = query;

  const loading = userLoading || booksLoading;
  const queryError = userError || booksError;
  const rawLists = data?.bookLists;
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableBookList);
  const lists: BookList[] = (Array.isArray(rawLists) ? rawLists : []).filter(isRenderableBookList).map((l: BookList) => ({
    ...l,
    recommended_books: deduplicateBooks(l.recommended_books.filter(isNonNullObject) as BookList["recommended_books"]),
  }));
  const hasUsableData = queryError ? lists.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchBooks : undefined);
  }, [accountDocumentId, refetchBooks, refetchUser]);

  // Track only a usable public Books surface.
  const analytics = useTrackAnalytics(
    { ...createAnalyticsOptions.books(accountDocumentId || '', username), ready: hasUsableData && accountData?.public_books === 'Yes' }
  );

  // Collect all pinned books across all lists (Top Reads)
  const allBooks = lists.flatMap((l) => l.recommended_books);
  const topReads = (Array.isArray(data?.topReads) ? data.topReads.filter(isNonNullObject) as unknown as RecommendedBook[] : allBooks)
    .filter((b) => b.is_pinned)
    .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));

  const handleBookClick = useCallback((book: RecommendedBook) => {
    setModalState({ open: true, book });
    // Bind the displayed book and its canonical collection.
    analytics.trackClick('book-card', {
      id: book.documentId,
      listId: book.book_list?.documentId,
      title: book.title,
      authors: book.authors?.join(', '),
      listName: book.book_list?.List_Name,
    });
  }, [analytics]);

  // Subjects for browse (aggregate across all books)
  const allSubjects = Array.from(
    new Set(allBooks.flatMap((b) => b.subjects ?? []).filter(Boolean))
  ).sort() as string[];

  const hasContent = allBooks.length > 0;

  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username || "User";
  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${username}'s Books`,
    url: window.location.href,
    analyticsContext: "books-header",
    analyticsReady: hasUsableData && accountData?.public_books === 'Yes',
  });
  const profileName = creatorName;
  const bookCount = allBooks.length;
  const listCount = lists.length;

  const pageTitle = `${profileName} | Favorite Books | explorers`;
  const metaDescription = bookCount > 0
    ? `Explore curated book recommendations and reading lists shared by ${profileName} on explorers. Browse ${listCount}${query.hasMore || query.error ? '+' : ''} reading list${listCount !== 1 ? 's' : ''} containing ${bookCount} loaded book${bookCount !== 1 ? 's' : ''}.`
    : `Explore book recommendations shared by ${profileName} on explorers.`;

  const seoKeywords = [
    `${profileName} books`,
    `${username} books`,
    "explorers books",
    "reading list",
    "book recommendations",
    "favorite books",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/books`)}
          type="website"
          author={profileName}
          siteName="explorers"
        />
      )}
      <div data-category-page className="h-full bg-[var(--category-page,#000)] min-h-screen overflow-auto preview-scroll pb-20" aria-busy={loading || undefined}>
      {/* ── LOADING SKELETON — shown while books resolve ── */}
      {loading && !hasUsableData && (
        outletContext?.isShellRevealed ? (
          <div className="pb-4">
            {/* Hero skeleton — Desktop */}
            <div className="hidden md:block px-4 max-w-6xl mx-auto mb-12">
              <HeroSkeleton accentColor="amber" showThumbnails />
            </div>
            {/* Hero skeleton — Mobile */}
            <div className="md:hidden px-4 mb-4">
              <HeroSkeleton accentColor="amber" mobile />
            </div>
            {/* Carousel row skeletons */}
            <div className="px-4 md:px-8 max-w-6xl mx-auto">
              {[0, 1, 2].map((i) => (
                <section key={i} className="mb-8">
                  {/* Row header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-[22px] bg-amber-400/20 rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                    <div className="h-5 w-36 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded skeleton-shimmer relative overflow-hidden" />
                  </div>
                  {/* Book cover strip */}
                  <div className="flex gap-3 overflow-hidden">
                    {[0, 1, 2, 3, 4].map((j) => (
                      <div key={j} className="flex-shrink-0 w-[120px]">
                        <div className="w-full aspect-[2/3] bg-[var(--category-skeleton,rgba(255,255,255,0.06))] rounded-xl skeleton-shimmer relative overflow-hidden mb-2" />
                        <div className="h-3 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded w-3/4 skeleton-shimmer relative overflow-hidden mb-1" />
                        <div className="h-3 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] rounded w-1/2 skeleton-shimmer relative overflow-hidden" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null
      )}

      {queryError && !hasUsableData ? (
        <PublicRouteErrorState title="Books unavailable" error={queryError} onRetry={handleRetry} />
      ) : (
        <>
          {queryError && <PublicRoutePartialNotice message="Some book data is unavailable." />}

      <div className="pt-6 pb-20">
        {/* Top Reads Hero Section */}
        {topReads.length > 0 && (
          <div className="mb-0">
             {isDesktop ? (
                <TopReadsHero
                  books={topReads}
                  onBookClick={handleBookClick}
                  showManageButton={false}
                />
             ) : (
                <TopReadsMobileHero
                  books={topReads}
                  onBookClick={handleBookClick}
                  showManageButton={false}
                />
             )}
          </div>
        )}

        {/* List Content */}
        <div className="px-4 md:px-8 max-w-6xl mx-auto -mt-6">
          {/* Per-list carousel rows */}
          {lists.map((list) => (
            <BookCarouselRow
              key={list.documentId}
              title={list.List_Name}
              description={list.list_description}
              books={list.recommended_books}
              seeAllLink={`/${username}/books/${list.slug}`}
              onBookClick={handleBookClick}
            />
          ))}

          {/* Subject browse */}
          {allSubjects.length > 0 && (
            <SubjectBrowse
              subjects={allSubjects}
              username={username!}
            />
          )}

          {/* Empty state */}
          {hasUsableData && !hasContent && (
            <div className="text-center py-32">
              <BookOpen size={56} className="text-[color:var(--category-muted,rgba(255,255,255,0.15))] mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-[color:var(--category-muted,rgba(255,255,255,0.4))] mb-2">No books yet</h2>
              <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm">
                Check back soon for book recommendations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Book detail modal */}
      <BookDetailModal onTrackClick={analytics.trackClick}
        book={modalState.book}
        open={modalState.open}
        onClose={() => setModalState({ open: false, book: null })}
      />
        </>
      )}
      <PublicScrollContinuation {...query} label="book lists" />
    </div>
    </>
  );
};

export default PublicBooks;
