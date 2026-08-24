import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { useQuery, gql } from "@apollo/client";
import { Gamepad2, Share2 } from "lucide-react";
import { PUBLIC_GAME_DATA } from "../../api/query";
import { deduplicateGames } from "../../utils/gameHelpers";
import type { RecommendedGame, GameList } from "../../types";
import GameCarouselRow from "./GameCarouselRow";
import TopGamesHero from "./TopGamesHero";
import TopGamesMobileHero from "./TopGamesMobileHero";
import GameDetailModal from "./GameDetailModal";
import GenreBrowse from "./GenreBrowse";
import { useTrackAnalytics, createAnalyticsOptions } from "../../../../services/analyticsService";
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

const PublicGames = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  
  const [modalState, setModalState] = useState<{ open: boolean; game: RecommendedGame | null }>({
    open: false,
    game: null,
  });

  const { data: userLookup, loading: userLoading } = useQuery(ACCOUNT_BY_USERNAME, {
    variables: { username },
    skip: !username,
  });

  const accountDocumentId = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.documentId;
  const creatorName = userLookup?.usersPermissionsUsers?.[0]?.accounts?.[0]?.Account_Name || username;

  const { data, loading: gamesLoading } = useQuery(PUBLIC_GAME_DATA, {
    variables: { accountDocumentId },
    skip: !accountDocumentId,
    fetchPolicy: "cache-and-network",
  });

  const loading = userLoading || gamesLoading;

  useEffect(() => {
    if (!loading) {
      (window as any).__publicProfileLoaded = true;
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [loading, outletContext]);

  const lists: GameList[] = data?.gameLists ?? [];

  // Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.games(accountDocumentId || '', username)
  );

  const allGames = useMemo(() => {
    return deduplicateGames(lists.flatMap((l) => l.recommended_games ?? []));
  }, [lists]);

  const topPicks = useMemo(() => {
    return allGames
      .filter((g) => g.is_pinned)
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [allGames]);

  const handleGameClick = useCallback((game: RecommendedGame) => {
    setModalState({ open: true, game });
    // Track which game was clicked — sends Recommendation_Id to Strapi
    analytics.trackClick('game-card', {
      id: game.documentId,
      listId: game.game_list?.documentId,
      title: game.title,
      genres: game.genres?.join(', '),
      listName: game.game_list?.List_Name,
    });
  }, [analytics]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: `${creatorName}'s Games`, url }); } catch { /* ignore */ }
    } else {
      await navigator.clipboard.writeText(url);
    }
    analytics.trackClick('share-button', { context: 'games-header' });
  };

  // Dynamic SEO details
  const profileName = creatorName || username || "User";
  const gameCount = allGames.length;
  const listCount = lists.length;
  
  const pageTitle = `${profileName} | Favorite Games | explorers`;
  const metaDescription = gameCount > 0
    ? `Explore curated video game recommendations and lists shared by ${profileName} on explorers. Browse ${listCount} gaming list${listCount !== 1 ? 's' : ''} containing ${gameCount} game${gameCount !== 1 ? 's' : ''}.`
    : `Explore game recommendations shared by ${profileName} on explorers.`;

  const seoKeywords = [
    `${profileName} games`,
    `${username} games`,
    "explorers games",
    "game recommendations",
    "favorite games",
    ...lists.map(l => l.List_Name)
  ];

  return (
    <>
      {!loading && userLookup && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/games`)}
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
              {[1, 2, 3].map(i => (
                <section key={i}>
                  <div className="h-5 w-40 bg-white/5 animate-pulse rounded mb-4" />
                  <div className="flex gap-3 overflow-hidden">
                    {[1, 2, 3, 4, 5].map(j => (
                      <div key={j} className="w-36 flex-shrink-0">
                        <div className="aspect-[3/4] rounded-xl bg-white/5 animate-pulse" />
                        <div className="h-3 mt-2 bg-white/5 animate-pulse rounded w-4/5" />
                      </div>
                    ))}
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
                <Gamepad2 size={48} className="text-white/20 mb-4" />
                <p className="text-white/40 text-lg font-medium">No games shared yet</p>
                <p className="text-white/25 text-sm mt-1">Check back later for recommendations</p>
              </div>
            ) : (
              <>
                {/* Top Picks Hero (Large Screens) & Carousel (Mobile) */}
                {topPicks.length > 0 && (
                  <div className="mt-4">
                    <div className="hidden lg:block">
                      <TopGamesHero 
                        games={topPicks} 
                        onGameClick={handleGameClick} 
                      />
                    </div>
                    <div className="block lg:hidden">
                      <TopGamesMobileHero
                        games={topPicks}
                        onGameClick={handleGameClick}
                      />
                    </div>
                  </div>
                )}

                {/* Per-list carousels */}
                <div className="mt-4">
                  {lists.map(list => (
                    list.recommended_games && list.recommended_games.length > 0 && (
                      <GameCarouselRow
                        key={list.documentId}
                        title={list.List_Name}
                        description={list.list_description ?? undefined}
                        games={deduplicateGames(list.recommended_games)}
                        onGameClick={handleGameClick}
                        seeAllLink={`/${username}/games/${list.slug}`}
                      />
                    )
                  ))}
                </div>

                {/* Genre browse */}
                {allGames.length > 0 && username && (
                  <GenreBrowse games={allGames} username={username} />
                )}
              </>
            )}
          </>
        )}
      </div>

      <GameDetailModal
        open={modalState.open}
        game={modalState.game}
        onClose={() => setModalState({ open: false, game: null })}
      />
      </div>
    </>
  );
};

export default PublicGames;
