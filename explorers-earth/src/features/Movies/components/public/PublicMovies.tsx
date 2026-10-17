import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useOutletContext, useLocation } from "react-router-dom";
import { deduplicateMovies } from "../../utils/movieHelpers";
import { Film } from "lucide-react";
import type { RecommendedMovie, MovieList } from "../../types";
import MovieCarouselRow from "./MovieCarouselRow";
import TopPicksHero from "./TopPicksHero";
import TopPicksMobileHero from "./TopPicksMobileHero";
import MovieDetailModal from "./MovieDetailModal";
import GenreBrowse from "./GenreBrowse";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import MoviePosterSkeleton from "./MoviePosterSkeleton";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableMovieList = (value: unknown): value is MovieList =>
  isNonNullObject(value) && Array.isArray(value.recommended_movies);

const PublicMovies = () => {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const query = usePublicRecommendationCategory(username, "movies", accountData?.public_movie === "Yes");
  const { data: movieData, loading: moviesLoading, error: moviesError, refetch: refetchMovies } = query;

  const loading = userLoading || moviesLoading;
  const queryError = userError || moviesError;
  const rawLists = movieData?.movieLists;
  const lists: MovieList[] = (Array.isArray(rawLists) ? rawLists : [])
    .filter(isRenderableMovieList)
    .map((list) => ({
      ...list,
      recommended_movies: list.recommended_movies.filter(isNonNullObject) as MovieList["recommended_movies"],
    }));
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableMovieList);
  const hasUsableData = queryError ? lists.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchMovies : undefined);
  }, [accountDocumentId, refetchMovies, refetchUser]);


  // Step 3: Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.movies(accountDocumentId || '', username)
  );

  // Collect all movies across all published lists
  const allMovies = useMemo(() => {
    return deduplicateMovies(lists.flatMap(list => list.recommended_movies ?? []));
  }, [lists]);

  // The backend supplies the complete category-wide pins independently of list pages.
  const topPicks = useMemo(()=>deduplicateMovies((Array.isArray(movieData?.topPicks)?movieData.topPicks.filter(isNonNullObject):[]) as unknown as RecommendedMovie[]).sort((a,b)=>(a.pin_order??999)-(b.pin_order??999)),[movieData?.topPicks]);
  const handleMovieClick = useCallback((movie: RecommendedMovie) => {
    setSelectedMovie(movie);
    setModalOpen(true);
    // Track which movie was clicked — sends Recommendation_Id to Strapi
    analytics.trackClick('movie-card', {
      id: movie.documentId,
      listId: movie.movie_list?.documentId,
      title: movie.title,
      mediaType: movie.media_type || 'movie',
      listName: movie.movie_list?.List_Name,
    });
  }, [analytics]);

  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${creatorName}'s Movies`,
    url: window.location.href,
    analyticsContext: "movies-header",
  });

  // Dynamic SEO details
  const profileName = creatorName || username || "User";
  const movieCount = allMovies.length;
  const listCount = lists.length;
  
  const pageTitle = `${profileName} | Favorite Movies & Shows | explorers`;
  const metaDescription = movieCount > 0
    ? `Browse curated movie lists and recommended shows shared by ${profileName} on explorers. Explore ${listCount}${query.hasMore || query.error ? '+' : ''} movie list${listCount !== 1 ? 's' : ''} containing ${movieCount} loaded favorite film${movieCount !== 1 ? 's' : ''}.`
    : `Explore movie and show recommendations shared by ${profileName} on explorers.`;

  const seoKeywords = [
    `${profileName} movies`,
    `${username} movies`,
    "explorers movies",
    "favorite movies list",
    "movie recommendations",
    "tv show recommendations",
    "curated movie lists",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && accountData && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/movies`)}
          type="website"
          author={profileName}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]">
      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 pb-16" aria-busy={loading || undefined}>
        {loading && !hasUsableData ? (
          outletContext?.isShellRevealed ? (
            <div className="space-y-10 mt-4">
              {/* Hero skeleton — Desktop (lg screens) */}
              <div className="hidden lg:block">
                <HeroSkeleton accentColor="yellow" showThumbnails />
              </div>
              {/* Hero skeleton — Mobile / Tablet */}
              <div className="lg:hidden">
                <HeroSkeleton accentColor="yellow" mobile />
              </div>
              {/* Carousel row skeletons */}
              {[1, 2, 3].map((i) => (
                <section key={i} className="mb-8">
                  {/* Row header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-[22px] bg-[var(--category-skeleton,rgba(255,255,255,0.1))] rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                    <div className="h-5 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.08))] rounded skeleton-shimmer relative overflow-hidden" />
                  </div>
                  {/* Poster strip */}
                  <div className="flex gap-3 overflow-hidden">
                    <MoviePosterSkeleton count={5} />
                  </div>
                </section>
              ))}
            </div>
          ) : null
        ) : queryError && !hasUsableData ? (
          <PublicRouteErrorState title="Movies unavailable" error={queryError} onRetry={handleRetry} />
        ) : (
          <>
            {queryError && <PublicRoutePartialNotice message="Some movie data is unavailable." />}
            {/* Empty state */}
            {allMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Film size={48} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))] mb-4" />
                <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-lg font-medium">No movies shared yet</p>
                <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm mt-1">Check back later for recommendations</p>
              </div>
            ) : (
              <>
                {/* Top Picks Hero (Large Screens) & Carousel (Mobile) */}
                {topPicks.length > 0 && (
                  <div className="mt-4">
                    <div className="hidden lg:block">
                      <TopPicksHero 
                        movies={topPicks} 
                        onMovieClick={handleMovieClick} 
                      />
                    </div>
                    <div className="block lg:hidden">
                      <TopPicksMobileHero
                        movies={topPicks}
                        onMovieClick={handleMovieClick}
                      />
                    </div>
                  </div>
                )}

                {/* Per-list carousels */}
                <div className="mt-4">
                  {lists.map(list => (
                    list.recommended_movies && list.recommended_movies.length > 0 && (
                      <MovieCarouselRow
                        key={list.documentId}
                        title={list.List_Name}
                        description={list.list_description ?? undefined}
                        movies={deduplicateMovies(list.recommended_movies)}
                        onMovieClick={handleMovieClick}
                        seeAllLink={`/${username}/movies/${list.slug}`}
                      />
                    )
                  ))}
                </div>

                {/* Genre browse */}
                {allMovies.length > 0 && username && (
                  <GenreBrowse movies={allMovies} username={username} />
                )}
              </>
            )}
          </>
        )}
      <PublicScrollContinuation {...query} label="movie lists" />
      </div>

      {/* Movie detail modal */}
      <MovieDetailModal
        movie={selectedMovie}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedMovie(null); }}
      />
      </div>
    </>
  );
};

export default PublicMovies;
