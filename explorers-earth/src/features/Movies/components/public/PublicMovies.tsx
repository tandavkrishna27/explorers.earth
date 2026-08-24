import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { deduplicateMovies } from "../../utils/movieHelpers";
import { Film, Share2 } from "lucide-react";
import { PUBLIC_MOVIE_DATA } from "../../api/query";
import type { RecommendedMovie, MovieList } from "../../types";
import MovieCarouselRow from "./MovieCarouselRow";
import TopPicksHero from "./TopPicksHero";
import TopPicksMobileHero from "./TopPicksMobileHero";
import MovieDetailModal from "./MovieDetailModal";
import GenreBrowse from "./GenreBrowse";
import HeroSkeleton from "../../../../components/ui/HeroSkeleton";
import MoviePosterSkeleton from "./MoviePosterSkeleton";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
import { gql } from "@apollo/client";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";

const ACCOUNT_BY_USERNAME = gql`
  query AccountByUsername($username: String!) {
    usersPermissionsUsers(filters: { username: { eq: $username } }) {
      documentId
      username
      accounts {
        documentId
        Account_Name
        profile_picture {
          url
        }
      }
    }
  }
`;

const PublicMovies = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const [selectedMovie, setSelectedMovie] = useState<RecommendedMovie | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();

  // Step 1: Resolve account documentId from username
  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;
  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username;

  // Step 2: Fetch movie data
  const { data: movieData, loading: moviesLoading } = useQuery(PUBLIC_MOVIE_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
  });

  const loading = userLoading || moviesLoading;

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  const lists: MovieList[] = movieData?.movieLists ?? [];

  // Step 3: Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.movies(accountDocumentId || '', username)
  );

  // Collect all movies across all published lists
  const allMovies = useMemo(() => {
    return deduplicateMovies(lists.flatMap(list => list.recommended_movies ?? []));
  }, [lists]);

  // Pinned movies (Top Picks)
  const topPicks = useMemo(() => {
    return allMovies
      .filter(m => m.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allMovies]);

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

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${creatorName}'s Movies`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
    analytics.trackClick('share-button', { context: 'movies-header' });
  };

  // Dynamic SEO details
  const profileName = creatorName || username || "User";
  const movieCount = allMovies.length;
  const listCount = lists.length;
  
  const pageTitle = `${profileName} | Favorite Movies & Shows | explorers`;
  const metaDescription = movieCount > 0
    ? `Browse curated movie lists and recommended shows shared by ${profileName} on explorers. Explore ${listCount} movie list${listCount !== 1 ? 's' : ''} containing ${movieCount} favorite film${movieCount !== 1 ? 's' : ''}.`
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
      {!loading && userLookup && (
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
      <div className="min-h-screen bg-[#0d1117] text-white">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#2a2a2a]/90 backdrop-blur-sm border-b border-gray-700 h-14">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-full px-6">
          <span
            className="text-white font-bold text-2xl cursor-pointer"
            onClick={() => navigate("/")}
          >
            explorers.earth
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-all duration-300 flex items-center justify-center"
              aria-label="Share"
            >
              <Share2 size={16} />
            </button>

          </div>
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 pb-16 pt-20">
        {loading ? (
          (window as any).__publicProfileLoaded ? (
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
                    <div className="w-1.5 h-[22px] bg-white/10 rounded-sm flex-shrink-0 skeleton-shimmer relative overflow-hidden" />
                    <div className="h-5 w-32 bg-white/8 rounded skeleton-shimmer relative overflow-hidden" />
                  </div>
                  {/* Poster strip */}
                  <div className="flex gap-3 overflow-hidden">
                    <MoviePosterSkeleton count={5} />
                  </div>
                </section>
              ))}
            </div>
          ) : null
        ) : (
          <>
            {/* Empty state */}
            {lists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Film size={48} className="text-white/20 mb-4" />
                <p className="text-white/40 text-lg font-medium">No movies shared yet</p>
                <p className="text-white/25 text-sm mt-1">Check back later for recommendations</p>
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
