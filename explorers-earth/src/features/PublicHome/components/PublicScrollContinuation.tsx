import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicPageContinuation } from "../api/usePublicPagedResource";

export type PublicScrollContinuationProps = PublicPageContinuation & {
  label: string;
  root?: Element | null;
  className?: string;
};

type RequestResult = "fulfilled" | "rejected" | "blocked";
type AutomaticCompletion = {
  startedAtCommit: number;
  rearm: () => void;
};

export function PublicScrollContinuation(
  props: PublicScrollContinuationProps,
): JSX.Element | null {
  const {
    label,
    root = null,
    className,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
  } = props;
  const targetRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const committedRenderRef = useRef(0);
  const pendingAutomaticCompletionRef = useRef<AutomaticCompletion>();
  const [observerGeneration, setObserverGeneration] = useState(0);
  const continuationRef = useRef({
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
  });

  const confirmAutomaticCompletion = useCallback(() => {
    const pending = pendingAutomaticCompletionRef.current;
    const continuation = continuationRef.current;
    if (
      !pending
      || committedRenderRef.current <= pending.startedAtCommit
      || continuation.loadingMore
    ) return;

    pendingAutomaticCompletionRef.current = undefined;
    if (continuation.hasMore && continuation.loadMoreError == null) {
      pending.rearm();
    }
  }, []);

  useLayoutEffect(() => {
    continuationRef.current = {
      hasMore,
      loadingMore,
      loadMoreError,
      loadMore,
    };
    committedRenderRef.current += 1;
    confirmAutomaticCompletion();
  });

  const requestNext = useCallback(async (automatic = false): Promise<RequestResult> => {
    const continuation = continuationRef.current;
    if (
      inFlightRef.current
      || !continuation.hasMore
      || continuation.loadingMore
      || (automatic && continuation.loadMoreError != null)
    ) return "blocked";

    inFlightRef.current = true;
    try {
      await continuation.loadMore();
      return "fulfilled";
    } catch {
      // The continuation state owns and presents request errors.
      return "rejected";
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const target = targetRef.current;
    if (
      !target
      || !hasMore
      || loadingMore
      || loadMoreError != null
      || typeof IntersectionObserver === "undefined"
    ) return;

    let automaticRequestLocked = false;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      const isIntersecting = entries.some((entry) => entry.isIntersecting);
      if (automaticRequestLocked || !isIntersecting) return;

      automaticRequestLocked = true;
      const startedAtCommit = committedRenderRef.current;
      void requestNext(true).then((result) => {
        if (!active || result === "rejected") return;
        if (result === "blocked") {
          automaticRequestLocked = false;
          return;
        }
        pendingAutomaticCompletionRef.current = {
          startedAtCommit,
          rearm: () => {
            if (active) setObserverGeneration((generation) => generation + 1);
          },
        };
        confirmAutomaticCompletion();
      });
    }, {
      root,
      rootMargin: "200px",
      threshold: 0,
    });
    observer.observe(target);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [
    confirmAutomaticCompletion,
    hasMore,
    loadMoreError,
    loadingMore,
    observerGeneration,
    requestNext,
    root,
  ]);

  if (!hasMore) return null;

  return (
    <div
      ref={targetRef}
      aria-busy={loadingMore}
      className={`mx-auto flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-card)] px-4 py-3 font-poppins text-sm ${className ?? ""}`}
      style={{
        background: "var(--bg-card)",
        color: "var(--text-primary)",
      }}
    >
      {loadingMore && <span role="status">{`Loading more ${label}…`}</span>}
      {loadMoreError != null && (
        <p role="status" className="text-[var(--text-secondary)]">
          {`Couldn’t load more ${label}.`}
        </p>
      )}
      <button
        type="button"
        disabled={loadingMore}
        onClick={() => void requestNext()}
        aria-label={loadMoreError != null ? `Retry ${label}` : `Load more ${label}`}
        className="profile-presentation-focus min-h-11 rounded-lg border border-[var(--accent-color)] bg-transparent px-4 py-2 font-semibold text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-60"
      >
        {loadMoreError != null ? "Try again" : `Load more ${label}`}
      </button>
    </div>
  );
}
