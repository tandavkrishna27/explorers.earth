import { useCallback, useEffect, useRef, useState } from "react";
import { publicProfileGatewayClient } from "./publicProfileGatewayClient";
import { subscribePublicProfileInvalidation } from "./publicProfileInvalidation";

export type PublicProfileShellState = {
  data: Record<string, unknown> | undefined;
  loading: boolean;
  error: unknown | null;
  refetch: () => Promise<void>;
};

export function usePublicProfileShell(username: string | undefined): PublicProfileShellState {
  const [attempt, setAttempt] = useState(0);
  const requestGeneration = useRef(0);
  const bypassCacheRef = useRef(false);
  const [state, setState] = useState<Omit<PublicProfileShellState, "refetch"> & { username?: string }>({
    username,
    data: undefined,
    loading: Boolean(username),
    error: null,
  });
  const retryResolvers = useRef<Array<() => void>>([]);
  const settleRetries = useCallback(() => { retryResolvers.current.splice(0).forEach((resolve) => resolve()); }, []);
  const refetch = useCallback(async () => {
    if (!username) return;
    bypassCacheRef.current = true;
    const settled = new Promise<void>((resolve) => retryResolvers.current.push(resolve));
    setAttempt((value) => value + 1);
    await settled;
  }, [username]);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    if (!username) {
      setState({ username, data: undefined, loading: false, error: null });
      return () => controller.abort();
    }
    setState((previous) => previous.username === username
      ? { ...previous, loading: previous.data === undefined, error: null }
      : { username, data: undefined, loading: true, error: null });
    const bypassCache = bypassCacheRef.current;
    bypassCacheRef.current = false;
    publicProfileGatewayClient.shell(username, controller.signal, bypassCache)
      .then((data) => { if (!controller.signal.aborted && requestGeneration.current === generation) { setState({ username, data: data as Record<string, unknown>, loading: false, error: null }); settleRetries(); } })
      .catch((error: unknown) => { if (!controller.signal.aborted && requestGeneration.current === generation) { setState((previous) => ({ username, data: previous.username === username ? previous.data : undefined, loading: false, error })); settleRetries(); } });
    return () => controller.abort();
  }, [attempt, settleRetries, username]);
  useEffect(() => {
    const normalizedUsername = username?.trim().toLowerCase();
    if (!normalizedUsername) return;
    return subscribePublicProfileInvalidation((event) => {
      if (event.username.trim().toLowerCase() === normalizedUsername) void refetch();
    });
  }, [refetch, username]);
  // Effects clear stale data after a username change, but descendants also render
  // once before that effect runs. Never expose the previous user's shell during
  // that frame or validators can incorrectly commit a terminal 404.
  if (state.username !== username) {
    return { data: undefined, loading: Boolean(username), error: null, refetch };
  }
  return { data: state.data, loading: state.loading, error: state.error, refetch };
}
