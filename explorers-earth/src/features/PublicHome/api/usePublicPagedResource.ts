import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePublicRevalidation } from "./usePublicRevalidation";
import { PUBLIC_PROFILE_PAGE_SIZE, validatePublicPageSize, type PublicProfilePageSize } from "./publicProfilePagination";

export type PublicPagePayload = Record<string, unknown[]>;
export type PublicPageContinuation = {
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: unknown | null;
  loadMore: () => Promise<void>;
};
export type PublicPagedState = PublicPageContinuation & {
  data: PublicPagePayload | undefined;
  loading: boolean;
  error: unknown | null;
  refetch: () => Promise<void>;
};
export type PublicPagedOptions = {
  pageSize?: PublicProfilePageSize;
  scope: string | undefined;
  enabled: boolean;
  readFirst: (signal: AbortSignal, bypassCache: boolean) => Promise<unknown>;
  readNext: (offset: number, signal: AbortSignal, bypassCache: boolean) => Promise<unknown>;
  peek?: () => PublicPagePayload | undefined;
  readRows: (data: PublicPagePayload) => unknown[];
  readHasMore?: (data: PublicPagePayload) => boolean;
  merge: (previous: PublicPagePayload, next: PublicPagePayload) => PublicPagePayload;
  refreshVersion?: number;
  bypassFirst?: boolean;
  showLoadingOnRevalidation?: boolean;
  retainOnFirst?: boolean;
  restartOnConflict?: boolean;
  cursorTraversal?: boolean;
  /** Re-read the first page on focus / every 60 s while visible, silently. Default off. */
  revalidate?: boolean;
};
type Snapshot = Omit<PublicPagedState, "loadMore" | "refetch"> & { scope: string | undefined; partialError: Error | null };
type Request = { controller: AbortController; settle: () => void };
const empty = (scope: string | undefined, loading = false): Snapshot => ({
  scope, data: undefined, loading, error: null, partialError: null, hasMore: false, loadingMore: false, loadMoreError: null,
});
const blocking = (error: unknown) => error instanceof Error && /^PUBLIC_PROFILE_(401|403|404)$/.test(error.message);

export function canContinuePublicTraversal(offset:number,cursorTraversal=false):boolean {return Number.isSafeInteger(offset)&&offset>=0&&(cursorTraversal||offset<=99999);}

export function usePublicPagedResource(options: PublicPagedOptions): PublicPagedState {
  const pageSize = options.pageSize ?? PUBLIC_PROFILE_PAGE_SIZE;
  options = { ...options, scope: options.scope ? `${options.scope}\u0000${pageSize}` : undefined };
  const callbacks = useRef(options);
  // Only committed renders can replace the visible scope's readers. A suspended
  // transition must not redirect actions on the still-visible previous profile.
  useLayoutEffect(() => { callbacks.current = options; });
  const [snapshot, setSnapshot] = useState(() => empty(options.scope, options.enabled && Boolean(options.scope)));
  const current = useRef(snapshot);
  const mounted = useRef(false);
  const generation = useRef(0);
  const request = useRef<Request>();
  const offset = useRef(0);
  const bypassGeneration = useRef(false);

  const publish = useCallback((value: Snapshot) => {
    current.current = value;
    setSnapshot(value);
  }, []);
  const cancel = useCallback(() => {
    ++generation.current;
    request.current?.controller.abort();
    // A transport may ignore abort forever; callers still finish on teardown.
    request.current?.settle();
    request.current = undefined;
  }, []);

  const start = useCallback((first: boolean, bypass = false, silent = false): Promise<void> => {
    const config = callbacks.current;
    const scope = config.scope;
    if (!mounted.current || !config.enabled || !scope) return Promise.resolve();
    if (!first && (request.current || current.current.scope !== scope || !current.current.hasMore || !current.current.data)) return Promise.resolve();
    if (first && silent && request.current) return Promise.resolve();
    if (first) {
      cancel();
      offset.current = 0;
      bypassGeneration.current = bypass;
    }
    const token = generation.current;
    const requestedOffset = offset.current;
    const previous = current.current.scope === scope ? current.current : empty(scope);
    if (!first && !canContinuePublicTraversal(requestedOffset,config.cursorTraversal)) {
      publish({ ...previous, loadMoreError: new Error("PUBLIC_PROFILE_PAGINATION_LIMIT") });
      return Promise.resolve();
    }

    const controller = new AbortController();
    let settle!: () => void;
    const settled = new Promise<void>((resolve) => { settle = resolve; });
    const pending = { controller, settle };
    request.current = pending;
    const isCurrent = () => mounted.current && !controller.signal.aborted && generation.current === token
      && callbacks.current.enabled && callbacks.current.scope === scope;
    const validate = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
      const data = value as PublicPagePayload;
      const rows = config.readRows(data);
      if (!Array.isArray(rows) || rows.length > validatePublicPageSize(config.pageSize ?? PUBLIC_PROFILE_PAGE_SIZE)) throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
      return { data, rows };
    };

    const dropOnFirst = first && !silent && config.retainOnFirst === false;
    let retained = dropOnFirst ? undefined : previous.data;
    let retainedPartialError = dropOnFirst ? null : previous.partialError;
    if (first && !bypass && !retained && config.peek) {
      try {
        const cached = config.peek();
        if (cached !== undefined) {
          const { data, rows } = validate(cached);
          retained = config.merge(data, data);
          if (rows.includes(null)) retainedPartialError = new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE");
        }
      } catch { /* Invalid cached data must never become visible. Revalidate it. */ }
    }
    publish(first
      ? { ...empty(scope), data: retained, partialError: retainedPartialError, loading: silent ? retained === undefined : (config.showLoadingOnRevalidation ?? true) || retained === undefined }
      : { ...previous, loadingMore: true, loadMoreError: null });
    const bypassCache = first ? bypass : bypassGeneration.current || previous.loadMoreError !== null;
    void (async () => {
      try {
        const requestedSize = validatePublicPageSize(config.pageSize ?? PUBLIC_PROFILE_PAGE_SIZE);
        const value = await (first ? config.readFirst(controller.signal, bypassCache) : config.readNext(requestedOffset, controller.signal, bypassCache));
        if (!isCurrent()) return;
        const { data, rows } = validate(value);
        // Raw null slots are evidence of missing data even after merge filters them.
        // A continuation keeps that evidence; only a first-page replacement resets it.
        const partialError = (!first && previous.partialError) || (rows.includes(null) ? new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE") : null);
        const merged = config.merge(first ? data : previous.data!, data);
        const nextOffset=requestedOffset+rows.length;
        if(!Number.isSafeInteger(nextOffset))throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');
        offset.current = nextOffset;
        publish({ ...empty(scope), data: merged, partialError, hasMore: config.readHasMore ? config.readHasMore(data) : rows.length === requestedSize });
      } catch (error: unknown) {
        if (!isCurrent()) return;
        if (!first && config.restartOnConflict && error instanceof Error && error.message==='PUBLIC_PROFILE_409') {
          publish(empty(scope));
          if(request.current===pending)request.current=undefined;
          void start(true,true);
        }
        else if (blocking(error)) publish({ ...empty(scope), error });
        else if (first && silent) publish({ ...previous, loading: false });
        else if (first) publish({ ...empty(scope), data: retained, partialError: retainedPartialError, error });
        else publish({ ...previous, loadingMore: false, loadMoreError: error });
      } finally {
        if (request.current === pending) request.current = undefined;
        settle();
      }
    })();
    return settled;
  }, [cancel, publish]);

  const previousEffect = useRef<{ scope: string | undefined; refreshVersion: number | undefined }>();
  useEffect(() => {
    mounted.current = true;
    const previous = previousEffect.current;
    const refreshed = previous && previous.scope === options.scope && previous.refreshVersion !== options.refreshVersion;
    previousEffect.current = { scope: options.scope, refreshVersion: options.refreshVersion };
    if (options.enabled && options.scope) void start(true, Boolean(refreshed || callbacks.current.bypassFirst));
    else { cancel(); publish(empty(options.scope)); }
    return () => { mounted.current = false; cancel(); };
  }, [options.scope, options.enabled, options.refreshVersion, cancel, publish, start]);

  const loadMore = useCallback(() => start(false), [start]);
  // Silent revalidation re-reads only the first page, so it is skipped once the visitor has paged
  // further (their extra pages would be dropped) or while a read is in flight.
  usePublicRevalidation(() => {
    if (request.current || offset.current > (callbacks.current.pageSize ?? PUBLIC_PROFILE_PAGE_SIZE)) return;
    void start(true, false, true);
  }, Boolean(options.revalidate && options.enabled && options.scope));
  const refetch = useCallback(() => start(true, true), [start]);
  // Effects run after render: never expose another scope's data in that gap.
  // An idle snapshot (published while disabled) is not a settled read: once enabled it is
  // loading until the effect starts the request, or pages report "ready" too early (OWN-08).
  const idle = snapshot.data === undefined && !snapshot.error && !snapshot.partialError && !snapshot.loading;
  const visible = options.enabled && options.scope && snapshot.scope === options.scope && !idle
    ? snapshot : empty(options.scope, options.enabled && Boolean(options.scope));
  const { partialError, ...state } = visible;
  return { ...state, error: state.error ?? partialError, loadMore, refetch };
}
