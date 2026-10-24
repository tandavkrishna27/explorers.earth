import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ListPage from "../../../shared/list/ListPage";
import { useBooksListAdapter } from "../../../shared/list/adapters/books";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";
import useAuthStore from "../../../../store/store";

const BookListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { generation } = useAuthStore();
  const adapter = useBooksListAdapter(listId!);
  const { list, loading, error } = adapter;

  // Post-create/post-add publish prompt, consumed once (BUG-3 loop guard); never for an empty list.
  const [prompt, setPrompt] = useState<{ isOpen: boolean; listName: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => { setPrompt(null); setPublishing(false); }, [generation, listId]);
  const promptShownRef = useRef(false);
  useEffect(() => {
    if (promptShownRef.current) return;
    const wants = location.state?.justAddedRecommendation || location.state?.justCreatedList;
    if (!wants || !list) return;
    if (list.itemCount < 1) return;
    promptShownRef.current = true;
    if (list.status === "draft") setPrompt({ isOpen: true, listName: list.title });
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.pathname, list?.id, list?.itemCount, navigate]);

  // The bounded diagnostic: one root naming the rendered branch.
  const state = error && !list ? "error" : loading && !list ? "loading" : !list ? "missing" : list.itemCount === 0 ? "ready-empty" : "ready-nonempty";

  if (state === "loading") {
    return (
      <div className="p-6 space-y-4 max-w-3xl mx-auto" data-books-owner-state="loading">
        <div className="h-6 w-40 bg-white/5 animate-pulse rounded" />
        <div className="h-4 w-24 bg-white/5 animate-pulse rounded" />
        {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 bg-white/5 animate-pulse rounded-lg" />)}
      </div>
    );
  }
  // A list that is not this owner's (or does not exist) reads as absent, not as an empty "Draft" shell.
  if (state === "missing") {
    return (
      <div className="p-6" data-books-owner-state="missing">
        <p className="text-red-400" role="alert">List not found. <Link to="/recommendations/books" className="text-blue-400 underline">Go back</Link></p>
      </div>
    );
  }

  return (
    <div data-books-owner-state={state}>
      <ListPage adapter={adapter} />
      {list && prompt && (
        <ListVisibilityModal
          isOpen={prompt.isOpen}
          onClose={() => setPrompt(null)}
          listName={prompt.listName}
          categoryName="Books"
          onConfirm={async () => {
            setPublishing(true);
            try {
              await adapter.setStatus("public");
              toast.success(`"${list.title}" published!`);
            } catch {
              toast.error("Failed to update visibility.");
            } finally {
              setPublishing(false);
            }
          }}
          loading={publishing}
        />
      )}
    </div>
  );
};

export default BookListView;
