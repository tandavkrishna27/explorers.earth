import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coordinatorState = vi.hoisted(() => ({ diagnostic: {} as { requestId?: string } }));

vi.mock("../../features/music/musicApi", () => ({
  musicApi: { request: vi.fn() },
  musicIdentityCoordinator: {
    getSnapshot: () => "ready",
    getDiagnosticSnapshot: () => coordinatorState.diagnostic,
    subscribe: () => () => undefined,
    retry: vi.fn(async () => undefined),
    reportFailure: vi.fn(),
  },
}));

import { musicWorkspaceClient, useTunesDashboard } from "../useTunesDashboard";
import * as dashboardModule from "../useTunesDashboard";

const scopeA = { userDocumentId: "user-document-a", accountDocumentId: "account-document-a" };
const scopeB = { userDocumentId: "user-document-b", accountDocumentId: "account-document-b" };

function workspace(name: string) {
  return {
    playlists: [{ id: 1, name, description: null, isVisibleToGuests: false, songs: [] }],
    dashboard: { songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private" as const, publicSlug: "public-slug" } },
    entitlement: { state: "included" as const, coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600 },
  };
}

function Probe({ scope }: { scope: typeof scopeA }) {
  const result = useTunesDashboard(scope);
  return <div>{result.playlists[0]?.name ?? "empty"}</div>;
}

function ErrorProbe({ scope }: { scope: typeof scopeA }) {
  const result = useTunesDashboard(scope);
  return <div>{result.playlists[0]?.name ?? "no cached Music"} — {result.error ?? "pending"}</div>;
}

function RetryProbe({ scope }: { scope: typeof scopeA }) {
  const result = useTunesDashboard(scope);
  return <button onClick={() => void result.retryIdentity().catch(() => undefined)}>Retry identity</button>;
}

function RefetchProbe({ scope }: { scope: typeof scopeA }) {
  const result = useTunesDashboard(scope);
  const [outcome, setOutcome] = useState("idle");
  return <div>
    <span>{result.playlists[0]?.name ?? "no cached Music"}</span>
    <span>{outcome}</span>
    <button onClick={() => { void result.refetch().then((refresh) => setOutcome((refresh as { error?: unknown } | undefined)?.error ? "resolved refresh error" : "refreshed"), () => setOutcome("rejected refresh")); }}>Refetch Music</button>
  </div>;
}

function CorrelationProbe({ scope }: { scope: typeof scopeA }) {
  const result = useTunesDashboard(scope);
  return <div>{(result as typeof result & { requestId?: string }).requestId ?? "no request"}</div>;
}

function NoScopeProbe() {
  const result = useTunesDashboard();
  return <div>{result.isLoading ? "loading" : "no scope"}</div>;
}

describe("private Music query identity isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    coordinatorState.diagnostic = {};
  });

  it("never renders identity A data while the same QueryClient switches through logout to identity B", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    vi.spyOn(musicWorkspaceClient, "load")
      .mockResolvedValueOnce(workspace("Authority A"))
      .mockResolvedValueOnce(workspace("Authority B"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const view = render(<Probe scope={scopeA} />, { wrapper });
    expect(await screen.findByText("Authority A")).toBeInTheDocument();

    await dashboardModule.clearMusicWorkspaceScope(queryClient, scopeA);
    view.rerender(<Probe scope={scopeB} />);
    expect(screen.queryByText("Authority A")).not.toBeInTheDocument();
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(await screen.findByText("Authority B")).toBeInTheDocument();
    expect(musicWorkspaceClient.load).toHaveBeenCalledTimes(2);
  });

  it("cancels and removes only the exact prior immutable identity query family", async () => {
    const queryClient = new QueryClient();
    const aKey = dashboardModule.musicWorkspaceQueryKey(scopeA);
    const bKey = dashboardModule.musicWorkspaceQueryKey(scopeB);
    queryClient.setQueryData(aKey, workspace("Authority A"));
    queryClient.setQueryData(bKey, workspace("Authority B"));

    await dashboardModule.clearMusicWorkspaceScope(queryClient, scopeA);

    await waitFor(() => expect(queryClient.getQueryData(aKey)).toBeUndefined());
    expect(queryClient.getQueryData(bKey)).toEqual(workspace("Authority B"));
  });

  it("clears every private Music identity query on the global session boundary", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(dashboardModule.musicWorkspaceQueryKey(scopeA), workspace("Authority A"));
    queryClient.setQueryData(dashboardModule.musicWorkspaceQueryKey(scopeB), workspace("Authority B"));
    await dashboardModule.clearAllMusicWorkspaceQueries(queryClient);
    expect(queryClient.getQueriesData({ queryKey: ["music-workspace"] })).toEqual([]);
  });

  it("keeps the workspace query disabled until immutable scope exists", () => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<NoScopeProbe />, { wrapper });
    expect(screen.getByText("no scope")).toBeInTheDocument();
  });

  it("adapts canonical Music requests through the in-memory authority client", async () => {
    const { musicApi } = await import("../../features/music/musicApi");
    vi.mocked(musicApi.request).mockImplementation(async ({ path }) => {
      if (path === "/api/playlists") return new Response("[]", { status: 200 });
      if (path === "/api/music/dashboard") return new Response(JSON.stringify({
        queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode: "private", publicSlug: "slug" },
      }), { status: 200 });
      return new Response(JSON.stringify({
        state: "included", coreRead: true, coreMutation: true, paidMutation: false, maxAgeSeconds: 600,
      }), { status: 200 });
    });
    await expect(musicWorkspaceClient.load()).resolves.toMatchObject({ playlists: [] });
    expect(musicApi.request).toHaveBeenCalledTimes(3);
  });

  it("does not put terminal lifecycle authority errors through the generic query retry loop", async () => {
    const { musicIdentityCoordinator } = await import("../../features/music/musicApi");
    const terminalError = Object.assign(new Error("contained"), {
      status: 403,
      upstreamCode: "IDENTITY_SUSPENDED",
      retryable: false,
      requestId: "suspended-request",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    vi.spyOn(musicWorkspaceClient, "load").mockRejectedValue(terminalError);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<ErrorProbe scope={scopeA} />, { wrapper });
    expect(await screen.findByText(/Music is temporarily unavailable\./)).toBeInTheDocument();
    expect(musicWorkspaceClient.load).toHaveBeenCalledTimes(1);
    expect(musicIdentityCoordinator.reportFailure).toHaveBeenCalledWith(terminalError);
  });

  it("keeps ordinary workspace failures scoped to content state", async () => {
    const { musicIdentityCoordinator } = await import("../../features/music/musicApi");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    vi.spyOn(musicWorkspaceClient, "load").mockRejectedValue(new Error("contained"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<ErrorProbe scope={scopeA} />, { wrapper });
    expect(await screen.findByText(/Music is temporarily unavailable\./)).toBeInTheDocument();
    expect(musicIdentityCoordinator.reportFailure).not.toHaveBeenCalled();
  });

  it("rejects a resolved TanStack refetch error while preserving the last good workspace", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    queryClient.setQueryData(dashboardModule.musicWorkspaceQueryKey(scopeA), workspace("Cached Music"));
    vi.spyOn(musicWorkspaceClient, "load").mockRejectedValue(new Error("refresh failed"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<RefetchProbe scope={scopeA} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Refetch Music" }));

    expect(await screen.findByText("resolved refresh error")).toBeInTheDocument();
    expect(screen.getByText("Cached Music")).toBeInTheDocument();
  });

  it("retains the one generic retry budget and exposes explicit identity retry", async () => {
    expect(dashboardModule.retryWorkspaceFailure(0, new Error("contained"))).toBe(true);
    expect(dashboardModule.retryWorkspaceFailure(1, new Error("contained"))).toBe(false);
    const queryClient = new QueryClient();
    vi.spyOn(musicWorkspaceClient, "load").mockResolvedValue(workspace("Ready"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    render(<RetryProbe scope={scopeA} />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Retry identity" }));
    const { musicIdentityCoordinator } = await import("../../features/music/musicApi");
    expect(musicIdentityCoordinator.retry).toHaveBeenCalledOnce();
  });

  it("does not republish an account A retry error after rendering account B", async () => {
    const { musicIdentityCoordinator } = await import("../../features/music/musicApi");
    let rejectRetry!: (reason?: unknown) => void;
    const retryFlight = new Promise<void>((_resolve, reject) => { rejectRetry = reject; });
    vi.mocked(musicIdentityCoordinator.retry).mockReturnValueOnce(retryFlight);
    vi.mocked(musicIdentityCoordinator.reportFailure).mockImplementation((error: unknown) => {
      coordinatorState.diagnostic = { requestId: (error as { requestId?: string }).requestId };
    });
    const queryClient = new QueryClient();
    vi.spyOn(musicWorkspaceClient, "load").mockResolvedValue(workspace("Ready"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const view = render(<RetryProbe scope={scopeA} />, { wrapper });

    fireEvent.click(screen.getByRole("button", { name: "Retry identity" }));
    view.rerender(<RetryProbe scope={scopeB} />);
    rejectRetry(Object.assign(new Error("contained"), { requestId: "account-a-request" }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(musicIdentityCoordinator.reportFailure).not.toHaveBeenCalled();
    expect(coordinatorState.diagnostic).toEqual({});
  });

  it("exposes the coordinator's sanitized request ID to UI state", () => {
    coordinatorState.diagnostic = { requestId: "safe-request-8" };
    const queryClient = new QueryClient();
    vi.spyOn(musicWorkspaceClient, "load").mockResolvedValue(workspace("Ready"));
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

    render(<CorrelationProbe scope={scopeA} />, { wrapper });

    expect(screen.getByText("safe-request-8")).toBeInTheDocument();
  });

  it.each([
    { label: "TOKEN_INVALID", code: "AUTH_REQUIRED", upstreamCode: "TOKEN_INVALID", status: 401 },
    { label: "TOKEN_REVOKED", code: "AUTH_REQUIRED", upstreamCode: "TOKEN_REVOKED", status: 401 },
    { label: "direct suspension", code: "IDENTITY_SUSPENDED", upstreamCode: undefined, status: 403 },
    { label: "pending deletion", code: "SERVICE_UNAVAILABLE", upstreamCode: "IDENTITY_PENDING_DELETION", status: 403 },
  ])("treats $label as terminal at the hook boundary and hides cached content", async ({ code, upstreamCode, status }) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    queryClient.setQueryData(dashboardModule.musicWorkspaceQueryKey(scopeA), workspace("Previous authority"), { updatedAt: 0 });
    const terminalError = Object.assign(new Error("contained"), {
      code,
      status,
      upstreamCode,
      retryable: false,
    });
    expect((dashboardModule as unknown as { retryWorkspaceFailure: (count: number, error: unknown) => boolean })
      .retryWorkspaceFailure(0, terminalError)).toBe(false);
    vi.spyOn(musicWorkspaceClient, "load").mockRejectedValue(terminalError);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

    render(<ErrorProbe scope={scopeA} />, { wrapper });

    expect(await screen.findByText(/Music is temporarily unavailable\./)).toBeInTheDocument();
    expect(screen.queryByText(/Previous authority/)).not.toBeInTheDocument();
    expect(musicWorkspaceClient.load).toHaveBeenCalledTimes(1);
  });
});
