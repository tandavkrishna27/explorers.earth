import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { explorersApiClient, type RecommendationObservation, type CollectionObservation } from "../../../../lib/explorersApiClient";
import { useBooksOwnerContent } from "../../api/useBooksOwnerContent";
import { booksCommandKey } from "../../api/booksClient";
import { bookContextFromLinks } from "../../api/booksViewModel";
import {createRecommendationSchema} from "../../../../../../tunes/shared/explorersContract";
import type { BookCandidate } from "../../../../../../tunes/shared/explorersBookContract";
import {
  ArrowLeft, Search, Star, Upload, X, Loader2, Check,
  BookOpen, Calendar, Hash, ExternalLink, Plus,
} from "lucide-react";
import { toast } from "sonner";
import useAuthStore from "../../../../store/store";

import { deduplicateBooks } from "../../utils/bookHelpers";
import type { RecommendedBook, BuyLink, BookFormSelection } from "../../types";
import TiptapEditor from "../../../Favorites/components/TiptapEditor";
import {formatAuthors} from "../../utils/bookHelpers";


// Inline Google Books Search Component
// ─────────────────────────────────────────────────────────────
interface InlineSearchProps {
  onSelect: (item: BookCandidate) => void;
}

export const InlineSearch = ({ onSelect }: InlineSearchProps) => {
  const generation=useAuthStore(state=>state.generation);
  const authority=useRef<{controller:AbortController;sequence:number;query:string;generation:number}>();
  const searchSequence=useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error,setError]=useState<string>();
  const [cursor,setCursor]=useState<string|null>(null);

  useEffect(() => {
    const controller=new AbortController();const current={controller,sequence:++searchSequence.current,query,generation};authority.current=current;setResults([]);setCursor(null);setError(undefined);
    const active=()=>authority.current===current&&!controller.signal.aborted&&useAuthStore.getState().generation===generation;
    if(!query.trim()){setLoading(false);return()=>controller.abort();}
    setLoading(true);timerRef.current=setTimeout(async()=>{try{const page=await explorersApiClient.searchBookCandidates({query,limit:12},controller.signal);if(active()){setResults(page.items);setCursor(page.nextCursor);}}catch(e){if(active())setError(e instanceof Error?e.message:'Book search failed');}finally{if(active())setLoading(false);}},350);
    return()=>{controller.abort();if(timerRef.current)clearTimeout(timerRef.current);};
  },[query,generation]);
  const loadMore=async()=>{
    const current=authority.current;if(!current||!cursor||loading||current.controller.signal.aborted)return;
    const active=()=>authority.current===current&&!current.controller.signal.aborted&&useAuthStore.getState().generation===current.generation;
    setLoading(true);setError(undefined);
    try{const page=await explorersApiClient.searchBookCandidates({query:current.query,limit:12,cursor},current.controller.signal);if(active()){setResults(old=>[...old,...page.items]);setCursor(page.nextCursor);}}catch(e){if(active())setError(e instanceof Error?e.message:'Book search failed');}finally{if(active())setLoading(false);}
  };
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => {authority.current?.controller.abort();setQuery(e.target.value);}}
          placeholder="Search by title, author, or ISBN..."
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
        />
        {loading && (
          <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
          {results.map((item) => {
            const vi = {title:item.title,authors:item.preview.authors,averageRating:item.preview.providerRating};
            const thumb = item.preview.coverUrl;
            const authors = formatAuthors(vi.authors);
            const year = item.preview.yearText;
            return (
              <button
                key={item.externalId}
                onClick={() => onSelect(item)}
                className="flex items-center gap-3 w-full text-left p-2.5 rounded-xl hover:bg-white/6 transition-colors border border-transparent hover:border-white/10"
              >
                <div className="w-10 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-white/5">
                  {thumb ? (
                    <img src={thumb} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen size={14} className="text-white/20" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{vi.title}</p>
                  <p className="text-xs text-white/50 truncate">{authors}</p>
                  {year && <p className="text-[11px] text-white/30">{year}</p>}
                </div>
                {vi.averageRating && (
                  <span className="text-xs text-amber-400 flex-shrink-0 flex items-center gap-0.5">
                    <Star size={10} fill="currentColor" /> {vi.averageRating}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && <div role="alert">{error} <button onClick={() => setQuery(query + " ")}>Retry</button></div>}
      {cursor && <button disabled={loading} onClick={loadMore}>Load more books</button>}
      {!loading && !error && query.trim() && results.length === 0 && (
        <p className="text-sm text-white/30 text-center py-4">No results found for "{query}"</p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main AddBookPage
// ─────────────────────────────────────────────────────────────
const AddBookPage = () => {
  const { listId, bookId } = useParams<{ listId: string; bookId?: string }>();
  const navigate = useNavigate();
  const generation = useAuthStore(state=>state.generation);
  const isEdit = Boolean(bookId);

  // Form state
  const [selectedBook, setSelectedBook] = useState<BookFormSelection | null>(null);
  const [note, setNote] = useState<any>("");
  const [userRating, setUserRating] = useState<number | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [buyLinks, setBuyLinks] = useState<BuyLink[]>([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newSnapshots, setNewSnapshots] = useState<File[]>([]);
  const [existingSnapshots, setExistingSnapshots] = useState<{ id: string; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const [entityId,setEntityId]=useState<string>();
  const editedObservation=useRef<RecommendationObservation>();
  const initialized=useRef<string>();
  const operationAbort=useRef(new AbortController());
  const createdRecommendation=useRef<string>();
  const pendingCreate=useRef<{parent:CollectionObservation;input:Parameters<typeof explorersApiClient.createMyRecommendation>[1];key:string}>();
  const uploadedFiles=useRef(new Map<File,{id:string;url:string}>());
  const selectionSequence=useRef(0);
  const [snapshotPreviews,setSnapshotPreviews]=useState<string[]>([]);
  useEffect(()=>{const urls=newSnapshots.map(file=>URL.createObjectURL(file));setSnapshotPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[newSnapshots]);
  useEffect(()=>{operationAbort.current=new AbortController();setSelectedBook(null);setEntityId(undefined);setNote("");setUserRating(null);setIsPinned(false);setBuyLinks([]);setNewSnapshots([]);setExistingSnapshots([]);setSaving(false);initialized.current=undefined;editedObservation.current=undefined;createdRecommendation.current=undefined;pendingCreate.current=undefined;uploadedFiles.current.clear();return()=>{operationAbort.current.abort();selectionSequence.current++;};},[generation,listId,bookId]);

  // Load existing book list (for display_order)
  const { data:listData,content,error:loadError } = useBooksOwnerContent(listId);
  const existingBooks: RecommendedBook[] = deduplicateBooks(listData?.bookLists?.[0]?.recommended_books);

  // Load book for edit mode
  useEffect(() => {
    if (isEdit && bookId && content?.observation.generation===generation && existingBooks.length > 0 && initialized.current!==bookId) {
      const book = existingBooks.find((b) => b.documentId === bookId);
      if (book) {
        editedObservation.current=content?.details.get(bookId);initialized.current=bookId;setEntityId(book.entity_id);
        setSelectedBook({
          volume_id: book.volume_id,
          title: book.title,
          subtitle: book.subtitle ?? null,
          authors: book.authors ?? [],
          year: book.year ?? "",
          cover_url: book.cover_url ?? "",
          cover_url_large: book.cover_url_large ?? "",
          subjects: book.subjects ?? [],
          publisher: book.publisher ?? null,
          page_count: book.page_count ?? null,
          google_rating: book.google_rating ?? null,
          description: book.description ?? null,
          isbn_13: book.isbn_13 ?? "",
          preview_link: book.preview_link ?? null,
          google_books_buy_link: null,
        });
        setNote(book.user_recommendation_note ?? "");
        setUserRating(book.user_rating ?? null);
        setIsPinned(book.is_pinned ?? false);
        setBuyLinks(book.buy_links ?? []);
        setExistingSnapshots(book.Media.map(media=>({id:media.documentId!,url:media.url})));
      }
    }
  }, [isEdit, bookId, existingBooks.length,content]);

  const handleSelectBook = useCallback(async(item:BookCandidate) => {
    const selection=++selectionSequence.current;
    try {
      const entity=await explorersApiClient.resolveBookEntity({kind:"provider",category:"books",provider:item.provider,externalKind:item.externalKind,externalId:item.externalId},booksCommandKey(),operationAbort.current.signal);
      if(selection!==selectionSequence.current||useAuthStore.getState().generation!==generation)return;
      const f=item.preview;setEntityId(entity.id);
      setSelectedBook({volume_id:item.externalId,title:item.title,subtitle:f.subtitle,authors:f.authors,year:f.yearText??"",cover_url:f.coverUrl??"",cover_url_large:f.coverLargeUrl??"",subjects:f.subjects,publisher:f.publisher,page_count:f.pageCount,google_rating:f.providerRating,description:f.description,isbn_13:f.isbn13??"",preview_link:f.previewLink,google_books_buy_link:item.buyLinkSuggestion});
      setBuyLinks(item.buyLinkSuggestion?[{name:"Google Books",url:item.buyLinkSuggestion,logo:"google-books"}]:[]);
    }catch(e){toast.error(e instanceof Error?e.message:"Could not select Book");}
  },[generation]);
  const handleAddBuyLink = () => {
    if (!newLinkUrl.trim()) return;
    setBuyLinks((prev) => [
      ...prev,
      { name: newLinkName.trim() || "Link", url: newLinkUrl.trim() },
    ]);
    setNewLinkName("");
    setNewLinkUrl("");
  };

  const handleSave = async () => {
    if(!selectedBook||!listId||!entityId||saving)return;setSaving(true);const signal=operationAbort.current.signal;
    try{
      const snapshots=[...existingSnapshots];
      for(const file of newSnapshots){let uploaded=uploadedFiles.current.get(file);if(!uploaded){const media=await explorersApiClient.createMedia(file,"recommendation",signal);signal.throwIfAborted();if(useAuthStore.getState().generation!==generation)return;uploaded={id:media.id,url:`/api/explorers/v1/media/${media.id}/content`};uploadedFiles.current.set(file,uploaded);}snapshots.push(uploaded);}
      signal.throwIfAborted();
      const patch={note:note?{version:1 as const,format:"quill-html" as const,html:String(note)}:null,userRating,bookContext:bookContextFromLinks(buyLinks),mediaIds:snapshots.map(media=>media.id)};
      const retryCreated=!isEdit&&Boolean(createdRecommendation.current||pendingCreate.current);
      let recommendationId=bookId??createdRecommendation.current;
      if(isEdit&&bookId){if(!editedObservation.current)throw new Error("Refresh before editing this Book");await explorersApiClient.updateMyRecommendation(editedObservation.current,patch,booksCommandKey(),signal);editedObservation.current=await explorersApiClient.getMyEditableRecommendation(bookId,signal);}
      else if(!recommendationId){if(!pendingCreate.current){const parent=await explorersApiClient.getMyEditableCollection(listId,signal);const input={...patch,entityId,publicationState:"published" as const};if(!createRecommendationSchema.innerType().omit({collectionId:true,expectedCollectionRevision:true,category:true}).strict().safeParse(input).success)throw new Error("Invalid content command");pendingCreate.current={parent,input,key:booksCommandKey()};}const command=pendingCreate.current;const saved=await explorersApiClient.createMyRecommendation(command.parent,command.input,command.key,signal);recommendationId=saved.id;createdRecommendation.current=saved.id;pendingCreate.current=undefined;setUploadingCover(true);try{const observed=await explorersApiClient.getMyEditableRecommendation(saved.id,signal);const imported=await explorersApiClient.importBookCovers(observed,booksCommandKey(),signal);if(Object.values(imported.slots).some(slot=>slot.status==="fallback"))toast.info("Some covers use the original Book image.");}catch(e){toast.info("Cover copying was unavailable; the original Book image is retained.");}finally{setUploadingCover(false);}}
      if(!recommendationId||useAuthStore.getState().generation!==generation)return;
      if(retryCreated){const observed=editedObservation.current??await explorersApiClient.getMyEditableRecommendation(recommendationId,signal);await explorersApiClient.updateMyRecommendation(observed,patch,booksCommandKey(),signal);editedObservation.current=await explorersApiClient.getMyEditableRecommendation(recommendationId,signal);}
      else if(!isEdit)editedObservation.current=await explorersApiClient.getMyEditableRecommendation(recommendationId,signal);
      const observed=await explorersApiClient.getCompleteMyCategoryTopPicks({category:"books",status:"active"},signal);const pins=(observed.topPicks??[]).filter(pin=>pin.recommendationId!==recommendationId).map(pin=>({recommendationId:pin.recommendationId,collectionId:pin.collectionId}));
      if(isPinned)pins.push({recommendationId,collectionId:listId});
      await explorersApiClient.setMyCategoryTopPicks(observed,pins,booksCommandKey(),signal);
      if(useAuthStore.getState().generation!==generation)return;
      toast.success(isEdit?"Book updated!":"Book added to list!");navigate(`/recommendations/books/${listId}`,{state:{justAddedRecommendation:true}});
    }catch(e){if(useAuthStore.getState().generation===generation)toast.error(e instanceof Error?e.message:"Failed to save. Please try again.");}finally{if(useAuthStore.getState().generation===generation)setSaving(false);}
  };
  return (
    <div className="min-h-screen text-dashboard pb-32">
       {/* Sticky header */}
       <div className="border-b border-dashboard-border px-4 md:px-6 py-3 flex items-center gap-3 sticky top-0 bg-dashboard-bg z-40 w-full">
         <button
           onClick={() => navigate(`/recommendations/books/${listId}`)}
           className="text-white/40 hover:text-white transition-colors"
         >
           <ArrowLeft size={20} />
         </button>
         <div className="flex-1">
           <h1 className="text-base font-semibold text-dashboard">
             {isEdit ? "Edit Book" : "Add a Book"}
           </h1>
           <p className="text-xs text-dashboard-muted mt-0.5">
              {isEdit ? "Update the details and save your changes" : selectedBook ? "Edit the details below before saving" : "Find a book using Google Books"}
           </p>
         </div>
       </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 md:px-0">
        {loadError && <p role="alert">{loadError.message}</p>}
        {/* Step 1: Search */}
        {!isEdit && (
          <div className="mb-4 bg-dashboard-sidebar border border-dashboard-border rounded-2xl p-4">
          {selectedBook ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-16 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                {selectedBook.cover_url_large || selectedBook.cover_url ? (
                  <img
                    src={selectedBook.cover_url_large || selectedBook.cover_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen size={16} className="text-white/20" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{selectedBook.title}</p>
                {selectedBook.subtitle && (
                  <p className="text-xs text-white/40 truncate">{selectedBook.subtitle}</p>
                )}
                <p className="text-xs text-white/50">{formatAuthors(selectedBook.authors)}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/30">
                  {selectedBook.year && <span className="flex items-center gap-0.5"><Calendar size={9} /> {selectedBook.year}</span>}
                  {selectedBook.page_count && <span className="flex items-center gap-0.5"><Hash size={9} /> {selectedBook.page_count}p</span>}
                  {selectedBook.google_rating && (
                    <span className="flex items-center gap-0.5 text-amber-400">
                      <Star size={9} fill="currentColor" /> {(selectedBook.google_rating * 2).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setSelectedBook(null); setBuyLinks([]); }}
                className="text-white/30 hover:text-white transition-colors flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <InlineSearch key={generation} onSelect={handleSelectBook} />
          )}
        </div>
      )}

      {/* Selected book preview in edit mode */}
      {isEdit && selectedBook && (
        <div className="flex items-center gap-3 mb-6 bg-dashboard-sidebar border border-dashboard-border rounded-2xl p-4">
          <div className="w-12 h-16 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
            {selectedBook.cover_url_large || selectedBook.cover_url ? (
              <img src={selectedBook.cover_url_large || selectedBook.cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <BookOpen size={16} className="text-white/20" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{selectedBook.title}</p>
            <p className="text-xs text-white/50">{formatAuthors(selectedBook.authors)}</p>
          </div>
        </div>
      )}

      {/* Form fields (only shown once a book is selected) */}
      {selectedBook && (
        <div className="space-y-5">
          <div className="border-t border-dashboard-border pt-1">
            <p className="text-xs text-dashboard-muted uppercase tracking-wider mb-4 font-medium">
              Your Details
            </p>
          </div>

          {/* Personal note */}
          <div>
            <label className="text-sm font-semibold text-dashboard mb-2 block">
              Your Recommendation Note (optional)
            </label>
            <div className="focus-within:border-dashboard-accent transition-colors">
              <TiptapEditor
                value={note}
                initalValue={note}
                onChange={(val: string) => setNote(val)}
                placeholder="Why do you recommend this book? What makes it special?"
              />
            </div>
          </div>

          {/* User Rating */}
          <div className="mt-4">
            <label className="text-sm font-semibold text-dashboard mb-2 block">Your Rating</label>
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
                <button
                  key={star}
                  aria-label={`Rate ${star} out of 10`}
                  type="button"
                  onClick={() => setUserRating(userRating === star ? null : star)}
                  className={`p-1 transition-all hover:scale-110 active:scale-95 ${userRating && userRating >= star ? "text-amber-400" : "text-white/20 hover:text-white/40"}`}
                >
                  <Star size={24} fill={userRating && userRating >= star ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
            {userRating && (
              <p className="text-xs text-white/30 mt-1">{userRating}/10</p>
            )}
          </div>

          {/* Pin to Top Reads */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPinned(!isPinned)}
              className={`w-5 h-5 rounded border transition-all flex items-center justify-center ${isPinned
                ? "bg-amber-500 border-amber-500"
                : "border-white/20 hover:border-amber-400/50"
                }`}
            >
              {isPinned && <Check size={12} className="text-gray-900" />}
            </button>
            <label className="text-sm text-dashboard cursor-pointer" onClick={() => setIsPinned(!isPinned)}>
              Pin to Top Reads
            </label>
          </div>

          {/* Buy / Find Links */}
          <div>
            <label className="text-sm font-semibold text-dashboard mb-2 block">Where to Find / Buy (optional)</label>
            {buyLinks.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {buyLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
                    <ExternalLink size={12} className="text-white/40 flex-shrink-0" />
                    <span className="text-xs text-white/70 flex-1 truncate">{link.name}: {link.url}</span>
                    <button
                      onClick={() => setBuyLinks((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="Name (e.g. Amazon)"
                className="flex-1 min-w-[120px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
              />
              <input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                onKeyDown={(e) => e.key === "Enter" && handleAddBuyLink()}
                className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/50 transition-colors"
              />
              <button
                aria-label="Add link"
                onClick={handleAddBuyLink}
                disabled={!newLinkUrl.trim()}
                className="px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/70 text-xs disabled:opacity-40 transition-colors flex items-center gap-1"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>

          {/* Manual Snapshots */}
          <div>
            <label className="text-sm font-semibold text-dashboard mb-3 block">
              Photos (optional)
            </label>
            <div className="flex flex-col gap-3">
              {existingSnapshots.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {existingSnapshots.map((snap) => (
                    <div key={snap.id} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-sm group">
                      <img
                        src={snap.url}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                      <button
                        type="button"
                        onClick={() => setExistingSnapshots((prev) => prev.filter((s) => s.id !== snap.id))}
                        className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {newSnapshots.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {newSnapshots.map((_file, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden shadow-sm group border border-white/10">
                      <img src={snapshotPreviews[i]} className="w-full h-full object-cover" alt="" />
                      <button
                        type="button"
                        onClick={() => setNewSnapshots((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-black/60 p-1 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="w-full md:w-auto self-start cursor-pointer flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl px-5 py-3 text-sm text-white/70 transition-colors">
                <Upload size={16} className="text-white/50" />
                <span>Upload Images</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setNewSnapshots((prev) => [...prev, ...Array.from(e.target.files!)]);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-dashboard-border">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(`/recommendations/books/${listId}`)}
                className="px-6 py-3 rounded-xl bg-dashboard-muted hover:bg-white/10 text-sm text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selectedBook || !entityId}
                className="flex-1 py-3 rounded-xl bg-dashboard-accent hover:opacity-90 text-sm text-white font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving || uploadingCover ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {uploadingCover ? "Uploading cover..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    {isEdit ? "Save Changes" : "Add to List"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default AddBookPage;
