import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { usePublicProfileShell, type PublicProfileShellState } from "./usePublicProfileShell";

export type PublicAccountIdentity = {
  usernameKey: string;
  status: "loading" | "ready" | "terminal-error";
  account?: Record<string, any>;
  error?: unknown;
  refetch?: () => Promise<void>;
};

type PublicAccountShell = { identity: PublicAccountIdentity; shell: PublicProfileShellState };

const PublicAccountShellContext = createContext<PublicAccountShell | null>(null);

/**
 * The public profile shell's username and loading state for the whole `/:username`
 * tree. It owns the one shell request; everything below reads it from context.
 * Until P3-3 this lived inside the Music availability provider.
 */
export function PublicAccountIdentityProvider({ children }: { children: ReactNode }) {
  const { username } = useParams();
  const usernameKey = (username ?? "").trim().toLowerCase();
  const shell = usePublicProfileShell(usernameKey);
  const { data, loading, error, refetch } = shell;
  const account = data as Record<string, any> | undefined;
  const accountMatches = typeof account?.username === "string"
    && account.username.trim().toLowerCase() === usernameKey;
  const identity = useMemo<PublicAccountIdentity>(() => ({
    usernameKey,
    status: accountMatches ? "ready" : loading ? "loading" : "terminal-error",
    ...(accountMatches ? { account } : {}),
    ...(!accountMatches && !loading && error ? { error } : {}),
    refetch,
  }), [account, accountMatches, error, loading, refetch, usernameKey]);
  const value = useMemo(() => ({ identity, shell: { data, loading, error, refetch } }),
    [identity, data, loading, error, refetch]);
  return <PublicAccountShellContext.Provider value={value}>{children}</PublicAccountShellContext.Provider>;
}

export function usePublicAccountIdentity(): PublicAccountIdentity {
  return useContext(PublicAccountShellContext)?.identity ?? { usernameKey: "", status: "terminal-error" };
}

/** The shell request owned by the nearest `PublicAccountIdentityProvider`, if any. */
export function usePublicAccountShell(): PublicProfileShellState | undefined {
  return useContext(PublicAccountShellContext)?.shell;
}
