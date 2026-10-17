import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useParams } from "react-router-dom";
import { EarthLoader } from "../components/EarthLoader";
import {
  createPublicShellReadiness,
  settlePublicIdentity,
  settlePublicRoute,
  settleUsernameValidation,
  shouldShowColdEntryOverlay,
  syncPublicShell,
  type PublicShellReadiness,
} from "./publicShellReadiness";

export type PublicIdentityStatus = "loading" | "ready" | "terminal-error";

type PublicColdEntryValue = {
  usernameKey: string;
  contentRouteKey: string;
  routeReady: boolean;
  shellRevealed: boolean;
  reportValidation(status: "pending" | "valid" | "terminal-invalid"): void;
  reportIdentity(status: PublicIdentityStatus): void;
  reportRouteReady(ready: boolean): void;
};

type Action =
  | { type: "sync"; usernameKey: string; contentRouteKey: string }
  | { type: "validation"; usernameKey: string; status: "valid" | "terminal-invalid" }
  | { type: "identity"; usernameKey: string }
  | { type: "route"; contentRouteKey: string; ready: boolean };

const reducer = (state: PublicShellReadiness, action: Action): PublicShellReadiness => {
  switch (action.type) {
    case "sync":
      return syncPublicShell(state, action.usernameKey, action.contentRouteKey);
    case "validation":
      return settleUsernameValidation(state, action.usernameKey, action.status);
    case "identity":
      return settlePublicIdentity(state, action.usernameKey, "settled");
    case "route":
      return settlePublicRoute(state, action.contentRouteKey, action.ready);
  }
};

const PublicColdEntryContext = createContext<PublicColdEntryValue | null>(null);

export function usePublicColdEntry(): PublicColdEntryValue {
  const value = useContext(PublicColdEntryContext);
  if (!value) throw new Error("usePublicColdEntry must be used inside PublicColdEntryBoundary");
  return value;
}

export function PublicColdEntryBoundary({ children }: { children: ReactNode }) {
  const { username } = useParams();
  const location = useLocation();
  const usernameKey = (username ?? "").trim().toLowerCase();
  const contentRouteKey = `${usernameKey}:${location.pathname}`;
  const [stored, dispatch] = useReducer(
    reducer,
    undefined,
    () => createPublicShellReadiness(usernameKey, contentRouteKey),
  );
  const readiness = syncPublicShell(stored, usernameKey, contentRouteKey);
  const [paintedUsernameKey, setPaintedUsernameKey] = useState<string | null>(null);

  // Synchronize route identity before descendants render with a new pathname.
  if (readiness !== stored) {
    dispatch({ type: "sync", usernameKey, contentRouteKey });
  }

  const reportValidation = useCallback((status: "pending" | "valid" | "terminal-invalid") => {
    if (status === "pending") return;
    dispatch({ type: "validation", usernameKey, status });
  }, [usernameKey]);
  const reportIdentity = useCallback((status: PublicIdentityStatus) => {
    if (status === "loading") return;
    dispatch({ type: "identity", usernameKey });
  }, [usernameKey]);
  const reportRouteReady = useCallback((ready: boolean) => {
    dispatch({ type: "route", contentRouteKey, ready });
  }, [contentRouteKey]);
  const value: PublicColdEntryValue = {
    usernameKey,
    contentRouteKey,
    routeReady: readiness.routeReady,
    shellRevealed: readiness.shellRevealed,
    reportValidation,
    reportIdentity,
    reportRouteReady,
  };
  useLayoutEffect(() => {
    if (!readiness.shellRevealed || paintedUsernameKey === usernameKey) return;
    const frame = window.requestAnimationFrame(() => setPaintedUsernameKey(usernameKey));
    return () => window.cancelAnimationFrame(frame);
  }, [paintedUsernameKey, readiness.shellRevealed, usernameKey]);

  // Keep the completed shell hidden for one layout frame before replacing the
  // cold overlay. This lets newly mounted route content acquire its geometry
  // without producing a visible cumulative layout shift.
  const stageReadyIdentity = readiness.validation !== "terminal-invalid"
    && readiness.shellRevealed
    && paintedUsernameKey !== usernameKey;
  const showOverlay = shouldShowColdEntryOverlay(readiness) || stageReadyIdentity;
  const interactionGuard = showOverlay ? { inert: "" } : {};

  return <PublicColdEntryContext.Provider value={value}>
    <div
      {...interactionGuard}
      data-testid="public-cold-entry-shell"
      aria-hidden={showOverlay ? true : undefined}
      style={{ visibility: showOverlay ? "hidden" : "visible" }}
    >
      {children}
    </div>
    {showOverlay && <div
      data-testid="public-cold-entry-overlay"
      className="public-cold-entry-overlay bg-black min-h-screen fixed inset-0 z-50 flex items-center justify-center"
    >
      <EarthLoader context="general" size="default" />
    </div>}
  </PublicColdEntryContext.Provider>;
}

export default PublicColdEntryBoundary;
