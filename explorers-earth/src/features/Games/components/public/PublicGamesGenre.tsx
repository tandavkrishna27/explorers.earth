import { useState, useMemo, useEffect } from "react";
import { useParams, Link, useOutletContext, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { RecommendedGame } from "../../types";
import { slugToGenreName, deduplicateGames, genreToSlug } from "../../utils/gameHelpers";
import GameCoverCard from "./GameCoverCard";
import GameDetailModal from "./GameDetailModal";
import SEO from "../../../../components/SEO";
import { createCanonicalUrl } from "../../../../utils/getCurrentDomain";
import { usePublicHeaderDescriptor } from "../../../PublicHome/components/PublicHeaderDescriptorContext";
import { isNonNullObject, PublicRouteErrorState, PublicRoutePartialNotice, settlePublicRouteRetries } from "../../../PublicHome/components/PublicRouteContentState";
import { usePublicProfileShell } from "../../../PublicHome/api/usePublicProfileShell";
import { usePublicRecommendationCategory } from "../../../PublicHome/api/usePublicRecommendationCategory";

import { PublicScrollContinuation } from "../../../PublicHome/components/PublicScrollContinuation";

type RenderableGameList = { recommended_games: RecommendedGame[] };
const isRenderableGameList = (value: unknown): value is RenderableGameList =>
  isNonNullObject(value) && Array.isArray(value.recommended_games);

const PublicGamesGenre = () => {
  const { username, genreSlug } = useParams<{ username: string; genreSlug: string }>();
  const location = useLocation();
  const outletContext = useOutletContext<{ setIsPageLoaded?: (val: boolean) => void } | null>();
  const [selectedGame, setSelectedGame] = useState<RecommendedGame | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const genreName = slugToGenreName(genreSlug ?? "");

  useEffect(() => { setSelectedGame(null); setModalOpen(false); }, [username, genreSlug]);
  const { data: accountData, loading: userLoading, error: userError, refetch: refetchUser } = usePublicProfileShell(username);
  const accountDocumentId = typeof accountData?.documentId === "string" ? accountData.documentId : undefined;
  const query = usePublicRecommendationCategory(username, "games", accountData?.public_games === "Yes");
  const { data: gamesData, loading: gamesLoading, error: gamesError, refetch: refetchGames } = query;

  const loading = userLoading || gamesLoading;
  const queryError = userError || gamesError;
  const rawLists = gamesData?.gameLists;
  const lists = (Array.isArray(rawLists) ? rawLists : []).filter(isRenderableGameList);
  const completeCollection = Array.isArray(rawLists) && rawLists.every(isRenderableGameList);
  const hasUsableData = queryError ? lists.length > 0 : completeCollection;

  useEffect(() => {
    if (!loading || hasUsableData) {
      outletContext?.setIsPageLoaded?.(true);
    }
  }, [hasUsableData, loading, outletContext]);

  const handleRetry = async () => {
    await settlePublicRouteRetries(refetchUser, accountDocumentId ? refetchGames : undefined);
  };

  const allGames: RecommendedGame[] = useMemo(() => {
    return deduplicateGames(lists.flatMap((list) => list.recommended_games.filter(isNonNullObject) as RecommendedGame[]));
  }, [lists]);

  const filteredGames = useMemo(() => {
    return allGames.filter(game => {
      const slugs = (game.genres || []).map(g => genreToSlug(g));
      return slugs.includes(genreSlug ?? "");
    });
  }, [allGames, genreSlug]);

  const handleGameClick = (game: RecommendedGame) => {
    setSelectedGame(game);
    setModalOpen(true);
  };

  usePublicHeaderDescriptor(genreSlug ? {
    navigationKey: location.key,
    title: `${genreName} Games`,
    url: window.location.href,
    analyticsContext: "games-genre-header",
    analyticsMetadata: { genre: genreSlug },
  } : undefined);

  const pageTitle = `${genreName} Games | ${username}'s Game List | explorers`;
  const metaDescription = `Explore ${filteredGames.length} ${genreName} game${filteredGames.length !== 1 ? "s" : ""} recommended by ${username} on explorers.`;
  const seoKeywords = [genreName, "games", `${username} games`, "explorers"];

  return (
    <>
      {!loading && (
        <SEO
          title={pageTitle}
          description={metaDescription}
          keywords={seoKeywords}
          canonical={createCanonicalUrl(`/${username}/games/genre/${genreSlug}`)}
          type="website"
          author={username}
          siteName="explorers"
        />
      )}
      <div data-category-page className="min-h-screen bg-[var(--category-page,#0d1117)] text-[color:var(--category-text,#fff)]" aria-busy={loading || undefined}>
      {/* Hero Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--category-page,rgba(23,37,84,0.4))] to-[var(--category-page,#0d1117)] pointer-events-none h-48" />

        <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-4">
          <Link
            to={`/${username}/games`}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--category-muted,rgba(255,255,255,0.5))] hover:text-[color:var(--category-text,rgba(255,255,255,0.8))] transition-colors mb-6"
          >
            <ArrowLeft size={14} /> {username}'s Games
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 relative">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-poppins font-bold text-[color:var(--category-text,#fff)] mb-1">{genreName}</h1>
              {!loading || hasUsableData ? (
                <p className="text-[color:var(--category-muted,#9ca3af)] font-poppins text-xs md:text-sm mt-1 uppercase tracking-wider">
                  {filteredGames.length} game{filteredGames.length !== 1 ? "s" : ""}
                </p>
              ) : (
                <div className="h-3 w-32 bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded mt-2" />
              )}
            </div>
          </div>
        </div>
      </div>

      {Boolean(queryError) && hasUsableData && <PublicRoutePartialNotice message="Some game data is unavailable." />}

      {/* Main Grid */}
      <div className="max-w-5xl mx-auto px-4 pt-6 pb-24 md:pb-6">
        {queryError && !hasUsableData ? (
          <PublicRouteErrorState title="Game genre unavailable" error={queryError} onRetry={handleRetry} />
        ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 md:gap-6">
          {loading && !hasUsableData ? (
             [...Array(12)].map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-[var(--category-skeleton,rgba(255,255,255,0.05))] animate-pulse rounded-xl border border-[color:var(--category-border,rgba(255,255,255,0.05))]" />
            ))
          ) : filteredGames.length === 0 ? (
            <p className="col-span-full text-[color:var(--category-muted,rgba(255,255,255,0.4))] text-sm py-8 text-center font-poppins">
              No games found in this genre.
            </p>
          ) : (
            filteredGames.map(game => (
              <div key={game.documentId} className="flex flex-col gap-2">
                <GameCoverCard
                  coverUrl={game.cover_url}
                  title={game.title}
                  onClick={() => handleGameClick(game)}
                />
                <div className="px-1">
                  <h4 className="text-xs font-semibold text-[color:var(--category-text,rgba(255,255,255,0.9))] line-clamp-1 truncate">{game.title}</h4>
                  <p className="text-[10px] text-[color:var(--category-muted,rgba(255,255,255,0.4))] uppercase tracking-widest mt-0.5">
                    {game.release_year || ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        )}
      </div>

      <PublicScrollContinuation {...query} label="game lists" />
      <GameDetailModal
        game={selectedGame}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedGame(null); }}
      />
    </div>
    </>
  );
};

export default PublicGamesGenre;
