import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Star, MoreVertical, Trash2,
  Loader2, Gamepad2, Pencil, Copy, Check
} from "lucide-react";
import { AddIcon } from "../../../../assets/icons/AddIcon";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import Accordion from "../../../../components/ui/Accordian";
import useAuthStore from "../../../../store/store";
import { useGamesCommands, useGamesCallerCustody } from "../../api/query";
import { useGamesOwner } from "../../hooks/useGamesOwner";

import { deduplicateGames, buildCoverUrl, extractNoteText } from "../../utils/gameHelpers";
import type { RecommendedGame, GameList } from "../../types";
import TopGamesManager from "./TopGamesManager";
import Switch from "../../../../components/ui/Switch";
import GameDetailModal from "../public/GameDetailModal";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";

const VITE_BASE_URL = import.meta.env.VITE_BASE_URL || window.location.origin;

interface GameRowProps {
  game: RecommendedGame;
  onPinToggle: (game: RecommendedGame) => void;
  onEdit: (game: RecommendedGame) => void;
  onDelete: (game: RecommendedGame) => void;
  onClick: (game: RecommendedGame) => void;
  isPinning: boolean;
}

const GameRow = ({ game, onPinToggle, onEdit, onDelete, onClick, isPinning }: GameRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const notePreview = extractNoteText(game.user_recommendation_note);
  const coverUrl = buildCoverUrl(game.cover_url_large || game.cover_url);

  return (
    <div
      className="group flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.08] hover:bg-white/[0.06] cursor-pointer rounded-xl transition-all mb-2"
      onClick={() => onClick(game)}
    >
      <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-white/5 shadow-sm">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Gamepad2 size={14} className="text-white/20" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{game.title}</p>
        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 flex-wrap">
          {game.developer && <span className="truncate max-w-[150px]">{game.developer}</span>}
          {game.release_year && (
             <>
               <span className="text-white/20">·</span>
               <span>{game.release_year}</span>
             </>
          )}
          {game.user_rating && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-0.5 text-amber-400/80">
                <Star size={10} fill="currentColor" /> {game.user_rating}
              </span>
            </>
          )}
        </div>
        {notePreview && (
          <p className="text-[11px] text-white/30 truncate mt-1 italic line-clamp-1">
            {notePreview.replace(/<[^>]+>/g, '')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onPinToggle(game); }}
          disabled={isPinning}
          title={game.is_pinned ? "Unpin from Top Picks" : "Pin to Top Picks"}
          className={`p-1.5 rounded-lg transition-all ${
            game.is_pinned
              ? "text-amber-400 bg-amber-400/10"
              : "text-white/30 hover:text-amber-400 hover:bg-amber-400/10"
          } disabled:opacity-50`}
        >
          <Star size={14} fill={game.is_pinned ? "currentColor" : "none"} />
        </button>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-all"
          >
            <MoreVertical size={14} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="absolute right-0 top-full mt-1 bg-[#1a2332] border border-white/10 rounded-xl shadow-xl z-20 min-w-[120px] overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button onClick={() => { setMenuOpen(false); onEdit(game); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/8 transition-colors">
                  <Pencil size={13} /> Edit
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(game); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                  <Trash2 size={13} /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const ManageTab = ({ list, onRefetch }: { list: GameList; onRefetch: () => void }) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const commands = useGamesCommands(), isUpdating = commands.loading;
  const beginEffects = useGamesCallerCustody();
  const updateGameList = ({ variables }: { variables: { documentId: string; Visibility?: boolean; List_Name?: string; list_description?: string | null }; optimisticResponse?: unknown; refetchQueries?: unknown[] }) => commands.updateList(variables.documentId, { ...(variables.Visibility === undefined ? {} : { visibility: variables.Visibility ? 'public' : 'private', publicationState: variables.Visibility ? 'published' : 'draft' }), ...(variables.List_Name === undefined ? {} : { title: variables.List_Name }), ...(variables.list_description === undefined ? {} : { description: variables.list_description }) });
  const deleteGameList = ({ variables }: { variables: { documentId: string } }) => commands.archiveList(variables.documentId);

  const shareUrl = `${VITE_BASE_URL}/${list.account?.username ?? "user"}/games/${list.slug}`;

  const handleCopyUrl = async () => {
    const current = beginEffects();
    try { await navigator.clipboard.writeText(shareUrl); } catch { if (current()) toast.error("Failed to copy list URL."); return; }
    if (!current()) return;
    setCopied(true);
    setTimeout(() => { if (current()) setCopied(false); }, 2000);
  };

  const handleToggleVisibility = async () => {
    const current = beginEffects();
    try {
      if (!list.Visibility && list.recommended_games?.length === 0) {
        if (!current()) return;
        toast.error("Add at least one game before publishing.");
        return;
      }
      await updateGameList({
        variables: { documentId: list.documentId, Visibility: !list.Visibility },
        optimisticResponse: {
          updateGameList: {
            __typename: "GameList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            Visibility: !list.Visibility,
            display_order: list.display_order,
            top_picks_heading: list.top_picks_heading || null,
          }
        }
      });
      if (!current()) return;
      toast.success(list.Visibility ? "List set to Draft." : "List published!");
      if (!current()) return;
      onRefetch();
    } catch {
      if (!current()) return;
      toast.error("Failed to update visibility.");
    }
  };

  const handleDeleteList = async () => {
    const current = beginEffects();
    if (!window.confirm(`Archive "${list.List_Name}"? Recommendations in other lists are preserved.`)) return;
    try {
      await deleteGameList({ variables: { documentId: list.documentId } });
      if (!current()) return;
      toast.success("List archived.");
      if (!current()) return;
      navigate("/recommendations/games");
    } catch {
      if (!current()) return;
      toast.error("Failed to archive list.");
    }
  };

  return (
    <div className="mb-0 md:mt-2 md:w-[90%] md:mx-auto space-y-4">
      <div className="bg-transparent rounded-lg space-y-4 border border-white/10 p-6">
        <Accordion heading="Manage" defaultOpen={true}>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDeleteList}
              className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
            >
              <Trash2 size={16} />
              <span>Archive list</span>
            </button>

            {isEditing ? (
              <div className="bg-dashboard-sidebar border border-white/10 rounded-lg p-5 space-y-4 mt-2 mb-2 text-left">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider font-semibold">List Name</label>
                  <input
                    defaultValue={list.List_Name}
                    onBlur={async (e) => {
                      const current = beginEffects();
                      if (e.target.value && e.target.value !== list.List_Name) {
                        try { await updateGameList({ variables: { documentId: list.documentId, List_Name: e.target.value } }); } catch { if (current()) toast.error("Failed to update list name."); return; }
                        if (!current()) return;
                        toast.success("List name updated.");
                        if (!current()) return;
                        onRefetch();
                      }
                    }}
                    className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider font-semibold">Description</label>
                  <textarea
                    defaultValue={list.list_description || ""}
                    rows={3}
                    onBlur={async (e) => {
                      const current = beginEffects();
                      if (e.target.value !== (list.list_description || "")) {
                        try { await updateGameList({ variables: { documentId: list.documentId, list_description: e.target.value } }); } catch { if (current()) toast.error("Failed to update description."); return; }
                        if (!current()) return;
                        toast.success("Description updated.");
                        if (!current()) return;
                        onRefetch();
                      }
                    }}
                    className="w-full bg-dashboard-muted border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl flex justify-center text-sm mt-3 transition-all font-semibold"
                >
                  Done Editing
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex flex-row text-center gap-2 items-center rounded-md font-poppins w-full text-sm border border-white px-4 py-3 hover:border-gray-500 text-white hover:text-gray-500 justify-center font-medium transition-all duration-300"
              >
                <Pencil size={16} />
                <span>Edit</span>
              </button>
            )}

            <div className={`p-4 rounded-xl border transition-all mt-2 ${list.Visibility ? "border-green-500/30 bg-green-500/5" : "border-white/10"} flex justify-center items-center`}>
              <Switch
                checked={list.Visibility}
                onChange={handleToggleVisibility}
                loading={isUpdating}
                label={list.Visibility ? "Published (Visible to public)" : "Draft (Private)"}
              />
            </div>
          </div>
        </Accordion>

        <Accordion heading="My QR" defaultOpen={true}>
          <div className={`relative pb-2 ${!list.Visibility ? "blur-sm pointer-events-none" : ""}`}>
            {!list.Visibility && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
                <span className="bg-[#1a2332] px-4 py-2 rounded-lg text-sm text-white/90 shadow-2xl border border-white/10 backdrop-blur-md">
                  Publish list to share QR
                </span>
              </div>
            )}
            
            <div className="flex justify-center items-center my-6">
              <div className="flex relative flex-col justify-between items-center h-[16rem] w-[14rem] p-6 bg-black border border-white text-white rounded-lg">
                <div className="absolute bottom-0 left-0 w-full h-1/2 rounded-b-lg bg-gradient-to-t from-amber-600/20 to-transparent pointer-events-none" />
                <p className="text-sm tracking-wide font-medium z-10 text-center leading-snug">My Games</p>
                <div className="z-10 items-center flex flex-col pt-1">
                  <div className="p-2 bg-white rounded-lg shadow-md mb-3">
                    <QRCodeSVG id="game-qr" value={shareUrl} size={90} />
                  </div>
                  <p className="bg-amber-100 text-amber-900 px-4 py-1.5 font-poppins rounded-full text-[11px] font-semibold whitespace-nowrap">
                    Travel like a local
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mt-5 mb-1 pt-4 border-t border-white/5">
              <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleCopyUrl}>
                <div className="p-2 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-white" />}
                </div>
                <span className="text-[11px] text-white/60 font-medium">{copied ? "Copied" : "Link"}</span>
              </div>
            </div>
          </div>
        </Accordion>
      </div>
    </div>
  );
};

const GameListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"recommendations" | "manage">("recommendations");
  const [deleteTarget, setDeleteTarget] = useState<RecommendedGame | null>(null);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [showTopGamesManager, setShowTopGamesManager] = useState(false);
  const [modalState, setModalState] = useState<{ open: boolean; game: RecommendedGame | null }>({
    open: false,
    game: null,
  });
  const { user, accountId, generation } = useAuthStore();
  useEffect(() => { setShowTopGamesManager(false); setDeleteTarget(null); setListVisibilityPrompt(null); setModalState({ open: false, game: null }); }, [accountId, generation, location.pathname]);

  const handleOpenModal = (game: RecommendedGame) => {
    setModalState({ open: true, game });
  };

  const { data, content, loading, error, refetch } = useGamesOwner(listId, Boolean(listId));

  const toggleGamePin = ({ variables }: { variables: { documentId: string; is_pinned: boolean; pin_order: number | null } }) => commands.pin(variables.documentId, listId!, variables.is_pinned);
  const deleteRecommendedGame = ({ variables }: { variables: { documentId: string } }) => commands.membership(variables.documentId, listId!, false);
  const commands = useGamesCommands(), isUpdating = commands.loading;
  const beginEffects = useGamesCallerCustody();
  const updateGameList = ({ variables }: { variables: { documentId: string; Visibility?: boolean; List_Name?: string; list_description?: string | null }; optimisticResponse?: unknown; refetchQueries?: unknown[] }) => commands.updateList(variables.documentId, { ...(variables.Visibility === undefined ? {} : { visibility: variables.Visibility ? 'public' : 'private', publicationState: variables.Visibility ? 'published' : 'draft' }), ...(variables.List_Name === undefined ? {} : { title: variables.List_Name }), ...(variables.list_description === undefined ? {} : { description: variables.list_description }) });

  const rawList = data?.gameLists?.[0];
  const games: RecommendedGame[] = deduplicateGames(rawList?.recommended_games);
  const allCategoryGames = content?.view.lists.flatMap(candidate => candidate.recommended_games) ?? [];
  const pinnedGames = deduplicateGames(allCategoryGames.filter((b) => b.is_pinned));
  const pinnedCount = pinnedGames.length;

  const list: GameList | null = rawList
    ? {
      ...rawList,
      recommended_games: games,
      account: rawList.account ?? { documentId: (user as any)?.accountDocumentId ?? "", username: (user as any)?.username ?? "" },
    }
    : null;

  // One-shot guard against the BUG-3 re-render loop (see MovieListView for detail).
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (promptShownRef.current) return;
    const wants =
      location.state?.justAddedRecommendation || location.state?.justCreatedList;
    if (!wants || !list) return;
    // Never prompt to publish an empty list; wait until the first item is added.
    // Do NOT set promptShownRef here, so a later render can still open the prompt.
    if (games.length < 1) return;
    promptShownRef.current = true;
    if (!list.Visibility) {
      setListVisibilityPrompt({ isOpen: true, listName: list.List_Name });
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, list?.documentId, games.length, navigate]);

  const handlePinToggle = async (game: RecommendedGame) => {
    const current = beginEffects();
    const willPin = !game.is_pinned;
    if (willPin && pinnedCount >= 15 && !pinnedGames.some(pinned => pinned.documentId === game.documentId)) {
      if (!current()) return;
      toast.error("Max 15 top picks allowed.");
      return;
    }
    setPinningId(game.documentId);
    try {
      await toggleGamePin({
        variables: {
          documentId: game.documentId,
          is_pinned: willPin,
          pin_order: willPin ? pinnedCount : null,
        },
      });
      if (!current()) return;
      refetch();
    } catch {
      if (!current()) return;
      toast.error("Failed to update pin.");
    } finally {
      if (current()) setPinningId(null);
    }
  };

  const handleToggleVisibility = async () => {
    const current = beginEffects();
    if (!list) return;
    if (!list.Visibility && games.length === 0) {
      if (!current()) return;
      toast.error("Add at least one game before publishing.");
      return;
    }
    try {
      await updateGameList({
        variables: { documentId: list.documentId, Visibility: !list.Visibility },
        optimisticResponse: {
          updateGameList: {
            __typename: "GameList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            Visibility: !list.Visibility,
            display_order: list.display_order,
            top_picks_heading: list.top_picks_heading || null,
          }
        }
      });
      if (!current()) return;
      toast.success(list.Visibility ? "List set to Draft." : "List published!");
      if (!current()) return;
      refetch();
    } catch {
      if (!current()) return;
      toast.error("Failed to update visibility.");
    }
  };

  const handleRecommendationPublication = async (game: RecommendedGame, published: boolean) => {
    const current = beginEffects(); try { await commands.publishRecommendation(game.documentId, published); if (!current()) return; toast.success(published ? 'Game published.' : 'Game kept as draft.'); } catch { if (!current()) return; toast.error('Game publication could not be saved. Please retry.'); } };

  const handleDelete = async () => {
    const current = beginEffects();
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteRecommendedGame({ variables: { documentId: deleteTarget.documentId } });
      if (!current()) return;
      toast.success("Game removed.");
      if (!current()) return;
      setDeleteTarget(null);
      if (!current()) return;
      refetch();
    } catch {
      if (!current()) return;
      toast.error("Failed to delete game.");
    } finally {
      if (current()) setDeleting(false);
    }
  };

  if (error && !list) return <p role="alert">Games could not be loaded. <button onClick={refetch}>Retry</button></p>;
  if (loading && !list) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
        <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
        {[1,2,3,4].map(i => <div key={i} className="h-14 bg-white/5 animate-pulse rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 md:p-6 md:pb-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        {/* Left: Back and Title info */}
        <div className="flex flex-col items-start">
          <button
            onClick={() => navigate("/recommendations/games")}
            className="text-[10px] text-white/50 hover:text-white mb-1 transition-colors flex items-center gap-1 font-semibold uppercase tracking-wider"
          >
            <ArrowLeft size={10} />
            <span>Back</span>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">{list?.List_Name}</h1>
        </div>
        <Switch
          checked={list?.Visibility ?? false}
          onChange={handleToggleVisibility}
          loading={isUpdating}
          label={list?.Visibility ? "Published" : "Draft"}
        />
      </div>

      <div className="flex mb-6 bg-white rounded-full p-[2px] w-fit mx-auto shadow-sm">
        {(["recommendations", "manage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-[11px] md:text-xs font-semibold rounded-full capitalize transition-all duration-200 ${
              activeTab === tab ? "bg-dashboard-accent text-white shadow" : "text-[#0f172a] bg-transparent hover:opacity-80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "recommendations" ? (
        <div>


          {/* Add Game button - highlighted CTA */}
          <button
            onClick={() => navigate(`/recommendations/games/${listId}/add`)}
            className="w-full mb-6 flex items-center justify-center gap-3 py-4 bg-dashboard-accent hover:opacity-90 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-900/40 border border-white/10"
          >
            <AddIcon size="5" /> Add Game
          </button>

<p className="text-xs text-dashboard-muted mb-3">Draft games stay private. Game publication applies across your published lists.</p>
          {games.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Gamepad2 size={40} className="text-white/15 mb-3" />
              <p className="text-white/40 text-sm">No games in this list yet.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {games.map((game) => (
                <div key={game.documentId}><GameRow
                  game={game}
                  onPinToggle={handlePinToggle}
                  onEdit={(g) => navigate(`/recommendations/games/${listId}/edit/${g.documentId}`)}
                  onDelete={(g) => setDeleteTarget(g)}
                  onClick={() => handleOpenModal(game)}
                  isPinning={pinningId === game.documentId}
                /><div className="flex items-center justify-between gap-3 pb-3 text-xs text-dashboard-muted"><span>Recommendation is {content?.details.get(game.documentId)?.detail.publicationState === 'published' ? 'Published' : 'Draft'}</span><button disabled={commands.loading || !content?.details.has(game.documentId)} onClick={() => handleRecommendationPublication(game, content?.details.get(game.documentId)?.detail.publicationState !== 'published')} className="text-dashboard-accent">{content?.details.get(game.documentId)?.detail.publicationState === 'published' ? `Keep ${game.title} as draft` : `Publish ${game.title}`}</button></div></div>
              ))}
            </div>
          )}
        </div>
      ) : (
        list && <ManageTab list={list} onRefetch={refetch} />
      )}

        <GameDetailModal
          game={modalState.game}
          open={modalState.open}
          onClose={() => setModalState({ open: false, game: null })}
        />

      <AnimatePresence>
        {showTopGamesManager && (
          <TopGamesManager
            games={pinnedGames}
            allGames={allCategoryGames}
            onClose={() => setShowTopGamesManager(false)}
            onRefetch={refetch}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              className="bg-[#0d1117] rounded-2xl border border-white/10 p-6 max-w-sm w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-white mb-2">Remove "{deleteTarget.title}"?</h3>
              <p className="text-sm text-white/50 mb-5">This game will be removed from the list.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl bg-white/8 text-sm text-white/70">Cancel</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-sm text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Remove
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {list && listVisibilityPrompt && (
        <ListVisibilityModal
          isOpen={listVisibilityPrompt.isOpen}
          onClose={() => setListVisibilityPrompt(null)}
          listName={listVisibilityPrompt.listName}
          categoryName="Games"
          onConfirm={async () => {
              const current = beginEffects();
            try {
              await updateGameList({
                variables: { documentId: list.documentId, Visibility: true },
              });
              if (!current()) return;
              refetch();
              if (!current()) return;
              toast.success(`"${list.List_Name}" published!`);
            } catch {
              if (!current()) return;
              toast.error("Failed to update visibility.");
            }
          }}
          loading={isUpdating}
        />
      )}
    </div>
  );
};

export default GameListView;
