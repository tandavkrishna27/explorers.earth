import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ListPage from "../../../shared/list/ListPage";
import { useMoviesListAdapter } from "../../../shared/list/adapters/movies";
import { createMoviesOwnerDiagnostic, type MoviesOwnerObserver } from "../../api/moviesOwnerDiagnostic";
import { ListVisibilityModal } from "../../../../components/ListVisibilityModal";

const MovieListView = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // The bounded owner-read diagnostic this page has always recorded.
  const diagnosticRef = useRef<ReturnType<typeof createMoviesOwnerDiagnostic>>(undefined);
  const attemptObserverRef = useRef<MoviesOwnerObserver | undefined>(undefined);
  useEffect(() => {
    diagnosticRef.current = createMoviesOwnerDiagnostic(globalThis);
    return () => { diagnosticRef.current?.deactivate(); diagnosticRef.current = undefined; attemptObserverRef.current = undefined; };
  }, []);
  const observeOwner = useCallback<MoviesOwnerObserver>(event => {
    if ("owner" in event && ["pending", "disabled", "no-account"].includes(event.owner)) {
      attemptObserverRef.current = diagnosticRef.current?.beginAttempt();
    }
    attemptObserverRef.current?.(event);
  }, []);
  const adapter = useMoviesListAdapter(listId!, observeOwner);
  const { list, loading, error } = adapter;

  // Post-create/post-add publish prompt, consumed once (BUG-3 loop guard); never for an empty list.
  const [prompt, setPrompt] = useState<{ isOpen: boolean; listName: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
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

  useEffect(() => {
    diagnosticRef.current?.commit({
      list: loading && !list ? "loading" : error && !list ? "error" : !list ? "missing" : list.itemCount ? "ready-nonempty" : "ready-empty",
      visibility: !list ? "unavailable" : list.status === "public" ? "public" : "draft",
      signal: location.state?.justAddedRecommendation || location.state?.justCreatedList ? "present" : "absent",
      guard: promptShownRef.current ? "consumed" : "fresh",
      prompt: list && prompt?.isOpen ? "open" : "closed",
    });
  });

  if (!loading && !list && !error) {
    return (
      <div className="p-6">
        <p className="text-red-400" role="alert">List not found. <Link to="/recommendations/movies" className="text-blue-400 underline">Go back</Link></p>
      </div>
    );
  }

  return (
    <>
      <ListPage adapter={adapter} />
      {list && prompt && (
        <ListVisibilityModal
          isOpen={prompt.isOpen}
          onClose={() => setPrompt(null)}
          listName={prompt.listName}
          categoryName="Movies"
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
    </>
  );
};

export default MovieListView;
