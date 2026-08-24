import { useState, useCallback, useEffect } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { useQuery, gql } from "@apollo/client";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PUBLIC_BOOK_DATA } from "../../api/query";
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

const ACCOUNT_BY_USERNAME = gql`
  query AccountByUsername($username: String!) {
    usersPermissionsUsers(filters: { username: { eq: $username } }) {
      documentId
      username
      accounts {
        documentId
        Account_Name
      }
    }
  }
`;

const PublicBooks = () => {
  const { username } = useParams<{ username: string }>();
  const { isDesktop } = useDeviceDetection();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;

  const [modalState, setModalState] = useState<{ open: boolean; book: RecommendedBook | null }>({
    open: false,
    book: null,
  });

  const { data, loading: booksLoading } = useQuery(PUBLIC_BOOK_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "cache-and-network",
  });

  const loading = userLoading || booksLoading;

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  // Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.books(accountDocumentId || '', username)
  );

  const lists: BookList[] = (data?.bookLists ?? []).map((l: BookList) => ({
    ...l,
    recommended_books: deduplicateBooks(l.recommended_books),
  }));

  // Collect all pinned books across all lists (Top Reads)
  const allBooks = lists.flatMap((l) => l.recommended_books);
  const topReads = allBooks
    .filter((b) => b.is_pinned)
    .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));

  const handleBookClick = useCallback((book: RecommendedBook) => {
    setModalState({ open: true, book });
    // Track which book was clicked — sends Recommendation_Id to Strapi
    analytics.trackClick('book-card', {
      id: book.documentId,
      listId: book.book_list?.documentId,
      title: book.title,
      authors: book.authors?.join(', '),
      listName: book.book_list?.List_Name,
    });
  }, [analytics]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${username}'s Books`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
    analytics.trackClick('share-button', { context: 'books-header' });
  };

  // Subjects for browse (aggregate across all books)
  const allSubjects = Array.from(
    new Set(allBooks.flatMap((b) => b.subjects ?? []).filter(Boolean))
  ).sort() as string[];

  const hasContent = lists.length > 0;

  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username || "User";
  const profileName = creatorName;
  const bookCount = allBooks.length;
  const listCount = lists.length;
  
  const pageTitle = `${profileName} | Favorite Books | explorers`;
  const metaDescription = bookCount > 0
    ? `Explore curated book recommendations and reading lists shared by ${profileName} on explorers. Browse ${listCount} reading list${listCount !== 1 ? 's' : ''} containing ${bookCount} book${bookCount !== 1 ? 's' : ''}.`
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
      {!loading && userLookup && (
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
      <div className="h-full bg-black min-h-screen overflow-auto preview-scroll pb-20">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#2a2a2a]/90 backdrop-blur-sm border-b border-gray-700 h-14">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-full px-6 text-white">
          <span
            className="text-white font-bold text-2xl cursor-pointer"
            onClick={() => window.location.href = "/"}
          >
            explorers.earth
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
              aria-label="Share"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>

          </div>
        </div>
      </div>

      {/* ── LOADING SKELETON — shown while books resolve ── */}
      {loading && topReads.length === 0 && (
        (window as any).__publicProfileLoaded ? (
          <div className="mt-14 pb-4">
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
                    <div className="h-5 w-36 bg-white/8 rounded skeleton-shimmer relative overflow-hidden" />
                  </div>
                  {/* Book cover strip */}
                  <div className="flex gap-3 overflow-hidden">
                    {[0, 1, 2, 3, 4].map((j) => (
                      <div key={j} className="flex-shrink-0 w-[120px]">
                        <div className="w-full aspect-[2/3] bg-white/6 rounded-xl skeleton-shimmer relative overflow-hidden mb-2" />
                        <div className="h-3 bg-white/8 rounded w-3/4 skeleton-shimmer relative overflow-hidden mb-1" />
                        <div className="h-3 bg-white/5 rounded w-1/2 skeleton-shimmer relative overflow-hidden" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null
      )}

      <div className="mt-14 pt-6 pb-20">
        {/* Top Reads Hero Section */}
        {(loading || topReads.length > 0) && (
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
          {!loading && !hasContent && (
            <div className="text-center py-32">
              <BookOpen size={56} className="text-white/15 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white/40 mb-2">No books yet</h2>
              <p className="text-white/25 text-sm">
                Check back soon for book recommendations.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Book detail modal */}
      <BookDetailModal
        book={modalState.book}
        open={modalState.open}
        onClose={() => setModalState({ open: false, book: null })}
      />
    </div>
    </>
  );
};

export default PublicBooks;
