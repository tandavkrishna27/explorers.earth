import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, useOutletContext, useLocation } from "react-router-dom";
import { Gamepad2 } from "lucide-react";
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
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";
import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

const isRenderableGameList = (value: unknown): value is GameList =>
  isNonNullObject(value) && Array.isArray(value.recommended_games);

const PublicGames = () => {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ isShellRevealed?: boolean; setIsPageLoaded?: (val: boolean) => void } | null>();
  
  const [modalState, setModalState] = useState<{ open: boolean; game: RecommendedGame | null }>({
    open: false,
    game: null,
  });

  useEffect(() => setModalState({ open: false, game: null }), [username]);

  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const creatorName = typeof accountData?.Account_Name === "string" ? accountData.Account_Name : username;
  const query = usePublicRecommendationCategory(username, "games", accountData?.public_games === "Yes");
  const { data, loading: gamesLoading, error: gamesError, refetch: refetchGames } = query;

  const loading = userLoading || gamesLoading;
  const queryError = userError || gamesError;
  const rawLists = data?.gameLists;
  const lists: GameList[] = (Array.isArray(rawLists) ? rawLists : [])
    .filter(isRenderableGameList)
    .map((list) => ({
      ...list,
      recommended_games: list.recommended_games.filter(isNonNullObject) as GameList["recommended_games"],
    }));
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableGameList);
  const hasUsableData = queryError ? lists.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = useCallback(async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchGames : undefined);
  }, [accountDocumentId, refetchGames, refetchUser]);


  // Initialize analytics — auto-tracks the page view once accountId resolves
  const analytics = useTrackAnalytics(
    createAnalyticsOptions.games(accountDocumentId || '', username)
  );

  const allGames = useMemo(() => {
    return deduplicateGames(lists.flatMap((l) => l.recommended_games ?? []));
  }, [lists]);

  const topPicks = useMemo(() => {
    return (Array.isArray(data?.topPicks) ? data.topPicks : []).filter((value): value is RecommendedGame => isNonNullObject(value) && typeof value.documentId === 'string' && typeof value.title === 'string' && isNonNullObject(value.game_list))
      .sort((a, b) => (a.pin_order ?? 999) - (b.pin_order ?? 999));
  }, [data?.topPicks]);

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

  usePublicHeaderDescriptor({
    navigationKey: location.key,
    title: `${creatorName}'s Games`,
    url: window.location.href,
    analyticsContext: "games-header",
  });

  // Dynamic SEO details
  const profileName = creatorName || username || "User";
  const gameCount = allGames.length;
  const listCount = lists.length;
  
  const pageTitle = `${profileName} | Favorite Games | explorers`;
  const metaDescription = gameCount > 0
    ? `Explore curated video game recommendations and lists shared by ${profileName} on explorers. Browse ${listCount}${query.hasMore || query.error ? '+' : ''} gaming list${listCount !== 1 ? 's' : ''} containing ${gameCount} loaded game${gameCount !== 1 ? 's' : ''}.`
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
      {!loading && accountData && (
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
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]">
      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 pb-16" aria-busy={loading || undefined}>
        {loading && !hasUsableData ? (
          outletContext?.isShellRevealed ? (
            <div className="space-y-10 mt-4">
              {[1, 2, 3].map(i => (
                <section key={i}>
                  <div className="h-5 w-40 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mb-4" />
                  <div className="flex gap-3 overflow-hidden">
                    {[1, 2, 3, 4, 5].map(j => (
                      <div key={j} className="w-36 flex-shrink-0">
                        <div className="aspect-[3/4] rounded-xl bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse" />
                        <div className="h-3 mt-2 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded w-4/5" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null
        ) : queryError && !hasUsableData ? (
          <PublicRouteErrorState title="Games unavailable" error={queryError} onRetry={handleRetry} />
        ) : (
          <>
            {queryError && <PublicRoutePartialNotice message="Some game data is unavailable." />}
            {/* Empty state */}
            {allGames.length === 0 && topPicks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Gamepad2 size={48} className="text-[color:var(--category-muted,rgba(255,255,255,0.2))] mb-4" />
                <p className="text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-lg font-medium">No games shared yet</p>
                <p className="text-[color:var(--category-muted,rgba(255,255,255,0.25))] text-sm mt-1">Check back later for recommendations</p>
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
      <PublicScrollContinuation {...query} label="game lists" />
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
