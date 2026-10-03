import { runtimeOrigin } from "../../../../lib/publicRuntimeConfig";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { useBooksOwnerContent } from "../../api/useBooksOwnerContent";
import { useBookListCommands } from "../../api/useBookListCommands";
import { booksCommandKey } from "../../api/booksClient";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Star, MoreVertical, Trash2,
  Loader2, BookOpen, Pencil, Copy, Check, BookMarked, Share2, Download
} from "lucide-react";
import { AddIcon } from "../../../../assets/icons/AddIcon";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import Accordion from "../../../../components/ui/Accordian";
import useAuthStore from "../../../../store/store";

import { deduplicateBooks, buildCoverUrl, formatAuthors, extractNoteText } from "../../utils/bookHelpers";
import type { RecommendedBook, BookList } from "../../types";
import BookDetailModal from "../public/BookDetailModal";
import TopReadsManager from "./TopReadsManager";
import Switch from "../../../../components/ui/Switch";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";

const VITE_BASE_URL = runtimeOrigin(import.meta.env.VITE_BASE_URL || window.location.origin);

// ─────────────────────────────────────────────────────────────
// Book Row in Recommendations Tab
// ─────────────────────────────────────────────────────────────
interface BookRowProps {
  book: RecommendedBook;
  onPinToggle: (book: RecommendedBook) => void;
  onEdit: (book: RecommendedBook) => void;
  onDelete: (book: RecommendedBook) => void;
  onClick: (book: RecommendedBook) => void;
}

const BookRow = ({
  book,
  onPinToggle,
  onEdit,
  onDelete,
  onClick,
  isPinning
}: BookRowProps & { isPinning: boolean }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const authors = formatAuthors(book.authors);
  const notePreview = extractNoteText(book.user_recommendation_note);
  const coverUrl = buildCoverUrl(book.cover_url_large || book.cover_url);

  return (
    <div
      className="group flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.05] hover:border-white/[0.08] hover:bg-white/[0.06] cursor-pointer rounded-xl transition-all mb-2"
      onClick={() => onClick(book)}
    >
      {/* Cover */}
      <div className="w-10 h-14 flex-shrink-0 rounded overflow-hidden bg-white/5 shadow-sm">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen size={14} className="text-white/20" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{book.title}</p>
        <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5 flex-wrap">
          {authors !== "Unknown Author" && <span className="truncate max-w-[150px]">{authors}</span>}
          {book.year && (
            <>
              <span className="text-white/20">·</span>
              <span>{book.year}</span>
            </>
          )}
          {book.user_rating && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-0.5 text-amber-400/80">
                <Star size={10} fill="currentColor" /> {book.user_rating}
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

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Pin toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onPinToggle(book); }}
          disabled={isPinning}
          title={book.is_pinned ? "Unpin from Top Reads" : "Pin to Top Reads"}
          className={`p-1.5 rounded-lg transition-all ${
            book.is_pinned
              ? "text-amber-400 bg-amber-400/10"
              : "text-white/30 hover:text-amber-400 hover:bg-amber-400/10"
          } disabled:opacity-50`}
        >
          <Star size={14} fill={book.is_pinned ? "currentColor" : "none"} />
        </button>

        {/* Menu */}
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            aria-label={`Book actions for ${book.title}`}
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
                <button
                  onClick={() => { setMenuOpen(false); onEdit(book); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-white/80 hover:bg-white/8 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(book); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
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

// ─────────────────────────────────────────────────────────────
// Manage Tab — Accordion-based (matches Movies pattern)
// ─────────────────────────────────────────────────────────────
interface ManageTabProps {
  list: BookList;
  onRefetch: () => void;
}

const ManageTab = ({ list, onRefetch }: ManageTabProps) => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const {update:updateBookList,archive:deleteBookList,loading:isUpdating}=useBookListCommands();

  const shareUrl = `${VITE_BASE_URL}/${list.account?.username ?? "user"}/books/${list.slug}`;

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleVisibility = async () => {
    if (!list) return;
    if (!list.visibility && list.recommended_books?.length === 0) {
      toast.error("Add at least one book before publishing.");
      return;
    }
    try {
      await updateBookList({
        variables: { documentId: list.documentId, visibility: !list.visibility },
        optimisticResponse: {
          updateBookList: {
            __typename: "BookList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            visibility: !list.visibility,
            display_order: list.display_order,
            top_reads_heading: list.top_reads_heading || null,
          }
        }
      });
      toast.success(list.visibility ? "List set to Draft." : "List published!");
      onRefetch();
    } catch {
      toast.error("Failed to update visibility.");
    }
  };

  const handleDeleteList = async () => {
    if (!window.confirm(`Delete "${list.List_Name}"? This cannot be undone.`)) return;
    try {
      await deleteBookList({ variables: { documentId: list.documentId } });
      toast.success("List deleted.");
      navigate("/recommendations/books");
    } catch {
      toast.error("Failed to delete list.");
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
              <span>Delete</span>
            </button>

            {isEditing ? (
              <div className="bg-dashboard-sidebar border border-white/10 rounded-lg p-5 space-y-4 mt-2 mb-2 text-left">
                <div>
                  <label className="text-xs text-white/50 mb-1.5 block uppercase tracking-wider font-semibold">List Name</label>
                  <input
                    defaultValue={list.List_Name}
                    onBlur={async (e) => {
                      if (e.target.value && e.target.value !== list.List_Name) {
                        await updateBookList({ variables: { documentId: list.documentId, List_Name: e.target.value } });
                        toast.success("List name updated.");
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
                      if (e.target.value !== (list.list_description || "")) {
                        await updateBookList({ variables: { documentId: list.documentId, list_description: e.target.value } });
                        toast.success("Description updated.");
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

            <div className={`p-4 rounded-xl border transition-all mt-2 ${list.visibility ? "border-green-500/30 bg-green-500/5" : "border-white/10"} flex justify-center items-center`}>
              <Switch
                checked={list.visibility}
                onChange={handleToggleVisibility}
                loading={isUpdating}
                label={list.visibility ? "Published (Visible to public)" : "Draft (Private)"}
              />
            </div>
          </div>
        </Accordion>

        <Accordion heading="My QR" defaultOpen={true}>
          <div className={`relative pb-2 ${!list.visibility ? "blur-sm pointer-events-none" : ""}`}>
            {!list.visibility && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
                <span className="bg-[#1a2332] px-4 py-2 rounded-lg text-sm text-white/90 shadow-2xl border border-white/10 backdrop-blur-md">
                  Publish list to share QR
                </span>
              </div>
            )}

            <div className="flex justify-center items-center my-6">
              <div className="flex relative flex-col justify-between items-center h-[16rem] w-[14rem] p-6 bg-black border border-white/20 text-white rounded-2xl shadow-2xl">
                <div className="absolute bottom-0 left-0 w-full h-1/2 rounded-b-2xl bg-gradient-to-t from-amber-600/20 to-transparent pointer-events-none" />
                <p className="text-sm tracking-wide font-medium z-10 text-center leading-snug">My Books</p>
                <div className="z-10 items-center flex flex-col pt-1">
                  <div className="p-2 bg-white rounded-xl shadow-md mb-3">
                    <QRCodeSVG id="book-qr" value={shareUrl} size={90} />
                  </div>
                  <p className="bg-amber-100 text-amber-900 px-4 py-1.5 font-poppins rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                    Travel like a local
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 mt-5 mb-1 pt-4 border-t border-white/5">
              <div
                className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: list.List_Name, url: shareUrl });
                  } else {
                    handleCopyUrl();
                  }
                }}
              >
                <div className="p-2 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  <Share2 size={18} className="text-white" />
                </div>
                <span className="text-[11px] text-white/60 font-medium">Share</span>
              </div>
              <div className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={handleCopyUrl}>
                <div className="p-2 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-white" />}
                </div>
                <span className="text-[11px] text-white/60 font-medium">{copied ? "Copied" : "Link"}</span>
              </div>
              <div
                className="flex flex-col items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                   const svg = document.getElementById('book-qr');
                   if (svg) {
                     const svgData = new XMLSerializer().serializeToString(svg);
                     const canvas = document.createElement("canvas");
                     const ctx = canvas.getContext("2d");
                     const img = new Image();
                     img.onload = () => {
                       canvas.width = img.width + 40;
                       canvas.height = img.height + 40;
                       if (ctx) {
                         ctx.fillStyle = "white";
                         ctx.fillRect(0, 0, canvas.width, canvas.height);
                         ctx.drawImage(img, 20, 20);
                         const pngFile = canvas.toDataURL("image/png");
                         const a = document.createElement("a");
                         a.download = `QR_${list.slug}.png`;
                         a.href = pngFile;
                         a.click();
                       }
                     };
                     img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                   }
                }}
              >
                <div className="p-2 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                  <Download size={18} className="text-white" />
                </div>
                <span className="text-[11px] text-white/60 font-medium tracking-tight">Image</span>
              </div>
            </div>
          </div>
        </Accordion>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main BookListView
// ─────────────────────────────────────────────────────────────
const BookListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"recommendations" | "manage">("recommendations");
  const [deleteTarget, setDeleteTarget] = useState<RecommendedBook | null>(null);

  const [listVisibilityPrompt, setListVisibilityPrompt] = useState<{
    isOpen: boolean;
    listName: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; book: RecommendedBook | null }>({ open: false, book: null });
  const [showTopReadsManager, setShowTopReadsManager] = useState(false);
  const { user, generation } = useAuthStore();
  useEffect(()=>{setDeleteTarget(null);setListVisibilityPrompt(null);setModalState({open:false,book:null});setShowTopReadsManager(false);setDeleting(false);setPinningId(null);},[generation,listId]);

  const { data, content, loading, error, refetch } = useBooksOwnerContent(listId);

  const {update:updateBookList,loading:isUpdating}=useBookListCommands();

  const rawList = data?.bookLists?.[0];
  const books: RecommendedBook[] = deduplicateBooks(rawList?.recommended_books);
  const pinnedBooks = books.filter((b) => b.is_pinned);
  const pinnedCount = content?.observation.topPicks?.length ?? 0;

  const list: BookList | null = rawList
    ? {
      ...rawList,
      recommended_books: books,
      account: rawList.account ?? { documentId: (user as any)?.accountDocumentId ?? "", username: (user as any)?.username ?? "" },
    }
    : null;

  // One-shot guard against the BUG-3 re-render loop (see MovieListView for detail):
  // window.history.replaceState never updated React Router's location.state, so
  // justCreatedList stayed true and the prompt setter re-fired every render.
  const promptShownRef = useRef(false);

  useEffect(() => {
    if (promptShownRef.current) return;
    const wants =
      location.state?.justAddedRecommendation || location.state?.justCreatedList;
    if (!wants || !list) return;
    // Never prompt to publish an empty list; wait until the first item is added.
    // Do NOT set promptShownRef here, so a later render can still open the prompt.
    if (books.length < 1) return;
    promptShownRef.current = true;
    if (!list.visibility) {
      setListVisibilityPrompt({ isOpen: true, listName: list.List_Name });
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, list?.documentId, books.length, navigate]);

  const handlePinToggle = async (book: RecommendedBook) => {
    const willPin = !book.is_pinned;
    if (willPin && pinnedCount >= 15) {
      toast.error("Max 15 top reads allowed.");
      return;
    }
    setPinningId(book.documentId);
    try {
      if(!content || !listId) throw new Error("Refresh Books before saving pins");
      const pins=(content.observation.topPicks??[]).filter(pin=>pin.recommendationId!==book.documentId).map(pin=>({recommendationId:pin.recommendationId,collectionId:pin.collectionId}));
      if(willPin) pins.push({recommendationId:book.documentId,collectionId:listId});
      await explorersApiClient.setMyCategoryTopPicks(content.observation,pins,booksCommandKey());
      refetch();
    } catch {
      toast.error("Failed to update pin.");
    } finally {
      setPinningId(null);
    }
  };

  const handleToggleVisibility = async () => {
    if (!list) return;
    if (!list.visibility && books.length === 0) {
      toast.error("Add at least one book before publishing.");
      return;
    }
    try {
      await updateBookList({
        variables: { documentId: list.documentId, visibility: !list.visibility },
        optimisticResponse: {
          updateBookList: {
            __typename: "BookList",
            documentId: list.documentId,
            List_Name: list.List_Name,
            list_description: list.list_description,
            slug: list.slug,
            visibility: !list.visibility,
            display_order: list.display_order,
            top_reads_heading: list.top_reads_heading || null,
          }
        }
      });
      toast.success(list.visibility ? "List set to Draft." : "List published!");
      refetch();
    } catch {
      toast.error("Failed to update visibility.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const observation=content?.details.get(deleteTarget.documentId);
      if(!observation) throw new Error("Refresh Books before deleting");
      await explorersApiClient.archiveMyRecommendation(observation,booksCommandKey());
      toast.success("Book removed.");
      setDeleteTarget(null);
      refetch();
    } catch {
      toast.error("Failed to delete book.");
    } finally {
      setDeleting(false);
    }
  };

  if(error && !list) return <div role="alert">{error.message} <button onClick={() => void refetch()}>Retry</button></div>;
  if (loading && !list) {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
        <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-14 bg-white/5 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-4 pt-8 pb-24 md:p-6 md:pb-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        {/* Left: Back and Title info */}
        <div className="flex flex-col items-start">
          <button
            onClick={() => navigate("/recommendations/books")}
            className="text-[10px] text-white/50 hover:text-white mb-1 transition-colors flex items-center gap-1 font-semibold uppercase tracking-wider"
          >
            <ArrowLeft size={10} />
            <span>Back</span>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-tight">{list?.List_Name}</h1>
        </div>
        {/* Publish toggle switch */}
        <Switch
          checked={list?.visibility ?? false}
          onChange={handleToggleVisibility}
          loading={isUpdating}
          label={list?.visibility ? "Published" : "Draft"}
        />
      </div>

      {/* Tabs */}
      <div className="flex mb-6 bg-white rounded-full p-[2px] w-fit mx-auto shadow-sm">
        {(["recommendations", "manage"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-[11px] md:text-xs font-semibold rounded-full capitalize transition-all duration-200 ${
              activeTab === tab
                ? "bg-dashboard-accent text-white shadow"
                : "text-[#0f172a] bg-transparent hover:opacity-80"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "recommendations" ? (
        <div>


          {/* Add Book button - highlighted CTA */}
          <button
            onClick={() => navigate(`/recommendations/books/${listId}/add`)}
            className="w-full mb-6 flex items-center justify-center gap-3 py-4 bg-dashboard-accent hover:opacity-90 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-900/40 border border-white/10"
          >
            <AddIcon size="5" /> Add Book
          </button>

          {books.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <BookMarked size={40} className="text-white/15 mb-3" />
              <p className="text-white/40 text-sm">No books in this list yet.</p>
              <p className="text-xs text-white/25 mt-1">Search Google Books to add your first recommendation.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {books.map((book) => (
                <BookRow
                  key={book.documentId}
                  book={book}
                  onPinToggle={handlePinToggle}
                  onEdit={(b) => navigate(`/recommendations/books/${listId}/edit/${b.documentId}`)}
                  onDelete={(b) => setDeleteTarget(b)}
                  onClick={(b) => setModalState({ open: true, book: b })}
                  isPinning={pinningId === book.documentId}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        list && <ManageTab list={list} onRefetch={refetch} />
      )}

      {/* Book detail modal */}
      <BookDetailModal
        book={modalState.book}
        open={modalState.open}
        onClose={() => setModalState({ open: false, book: null })}
      />

      {/* Top Reads Manager */}
      <AnimatePresence>
        {showTopReadsManager && (
          <TopReadsManager
            books={pinnedBooks}
            allBooks={books}
            onClose={() => setShowTopReadsManager(false)}
            onRefetch={refetch}
          />
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
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
              <p className="text-sm text-white/50 mb-5">This recommendation will be removed from every list in your account.</p>
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
          categoryName="Books"
          onConfirm={async () => {
            try {
              await updateBookList({
                variables: { documentId: list.documentId, visibility: true },
              });
              refetch();
              toast.success(`"${list.List_Name}" published!`);
            } catch {
              toast.error("Failed to update visibility.");
            }
          }}
          loading={isUpdating}
        />
      )}
    </div>
  );
};

export default BookListView;
