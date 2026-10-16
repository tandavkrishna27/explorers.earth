import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../components/SEO", () => ({ default: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
beforeEach(async () => {
  localStorage.clear();
  const { default: store } = await import("../../store/store");
  // These purpose-only flow cases start after bootstrap established signed-out.
  store.getState().verificationFailed(store.getState().generation, "signed-out");
});

const ACCOUNT = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

/** Serve one observation from /status and record what the page then does. */
async function confirmWith(recovery: unknown) {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    return input.endsWith("/status")
      ? new Response(JSON.stringify({ recovery }), { status: 200 })
      : new Response(JSON.stringify({ lifecycle: { status: "active", revision: 8 } }), { status: 200 });
  }));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter><Page /></MemoryRouter>);
  return requests;
}

it("starts Google recovery without collecting an email address", async () => {
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    return input.endsWith("/start") ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ url: "https://accounts.google.com/example" }), { status: 200 });
  }));
  const { default: Page } = await import("../ReactivateAccount");
  render(<MemoryRouter><Page /></MemoryRouter>);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Google/i }));
  await waitFor(() => expect(requests).toEqual(["/api/explorers/v1/recovery/start", "/api/auth/sign-in/social"]));
});

it("ignores a legacy URL token and requires the cookie proof before submitting revision-bound recovery", async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: input, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return input.endsWith("/status")
      ? new Response(JSON.stringify({ recovery: { outcome: "pending", accountId: ACCOUNT, status: "suspended",
        revision: 7, operationId: null, kind: "deactivate" } }), { status: 200 })
      : new Response(JSON.stringify({ lifecycle: { status: "active", revision: 8 } }), { status: 200 });
  }));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter initialEntries={["/reactivate-confirm?token=untrusted"]}><Page /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: /reactivate/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /reactivate/i }));
  await waitFor(() => expect(requests).toEqual([
    { url: "/api/explorers/v1/recovery/status", method: "GET" },
    { url: "/api/explorers/v1/recovery/complete", method: "POST", body: { expectedRevision: 7 } },
  ]));
});

// Ticket 2.4 package L0. Each outcome is its own state. Before this the page decided from
// the raw status and showed "This account cannot be recovered." for all of them - which
// was wrong, not merely terse, for the first case below.

it("tells an owner whose success response was lost that the account is already active", async () => {
  await confirmWith({ outcome: "recovered", accountId: ACCOUNT, status: "active", revision: 8, operationId: null });
  await waitFor(() => expect(screen.getByText(/already active/i)).toBeInTheDocument());
  // Same destination as a fresh success - a new session - and no claim that recovery failed.
  expect(screen.getByRole("button", { name: /Sign in with Google/i })).toBeInTheDocument();
  expect(screen.queryByText(/cannot be recovered/i)).toBeNull();
  expect(screen.queryByRole("button", { name: /Reactivate account/i })).toBeNull();
});

it("offers no retry for a deleted account, because no retry can succeed", async () => {
  await confirmWith({ outcome: "terminal", accountId: ACCOUNT, status: "deleted", revision: 9, operationId: null });
  await waitFor(() => expect(screen.getByText(/was deleted/i)).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent(/permanent/i);
  // The retry affordance is the defect: it invited an owner to repeat something impossible.
  expect(screen.queryByRole("button", { name: /Try Google recovery again/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /Reactivate account/i })).toBeNull();
});

it("gives a quotable reference and no action when a transition needs a person", async () => {
  await confirmWith({ outcome: "manual_review", accountId: ACCOUNT, status: "pending_deletion", revision: 9,
    operationId: "11111111-2222-4333-8444-555555555555", reason: "operation_failed", failureCode: "music_release_timeout" });
  await waitFor(() => expect(screen.getByText(/needs a person/i)).toBeInTheDocument());
  expect(screen.getByText(/11111111-2222-4333-8444-555555555555/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Reactivate account/i })).toBeNull();
  // An internal failure code is for support to match, not for the owner to read as prose.
  expect(screen.queryByText(/music_release_timeout/)).toBeNull();
});

it("treats an indeterminate observation as retryable rather than as a refusal", async () => {
  await confirmWith({ outcome: "unknown" });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i));
  expect(screen.getByRole("button", { name: /Try Google recovery again/i })).toBeInTheDocument();
  expect(screen.queryByText(/cannot be recovered/i)).toBeNull();
});

it("does not act on an observation shape it does not understand", async () => {
  // A future outcome, or a tampered body, is indeterminate - never an implied success.
  const requests = await confirmWith({ outcome: "definitely_fine", accountId: ACCOUNT, revision: 7 });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/unavailable/i));
  expect(requests).toEqual(["/api/explorers/v1/recovery/status"]);
  expect(screen.queryByRole("button", { name: /Reactivate account/i })).toBeNull();
});

function heldResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const pendingRecovery = { outcome: "pending", accountId: ACCOUNT, status: "suspended", revision: 7, operationId: null, kind: "deactivate" };
for (const phase of ["status", "complete"] as const) {
  for (const replacement of ["B", "fresh A", "unmount"] as const) {
    for (const failure of [false, true]) {
      it(`fences held ${phase} ${failure ? "rejection" : "success"} on ${replacement}`, async () => {
        const { act } = await import("@testing-library/react");
        localStorage.clear();
        const { default: store } = await import("../../store/store");
        const { authClient } = await import("../../lib/authClient");
        const held = heldResponse();
        const requests: Array<{ url: string; method: string; body?: unknown }> = [];
        let owner = ACCOUNT;
        vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
          requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
          if (url.endsWith("/get-session")) return Response.json({ user: { id: `user-${owner}` }, session: { id: `session-${owner}` } });
          if (url.endsWith("/me")) return Response.json({ account: { id: owner, onboardingStatus: "complete", revision: 1 } });
          if (url.endsWith(`/${phase}`)) return held.promise;
          if (url.endsWith("/status")) return Response.json({ recovery: pendingRecovery });
          throw new Error(`Unexpected request: ${url}`);
        }));
        const { default: Page } = await import("../ReactivateConfirm");
        const view = render(<MemoryRouter initialEntries={["/reactivate-confirm"]}><Page /></MemoryRouter>);
        if (phase === "complete") fireEvent.click(await screen.findByRole("button", { name: "Reactivate account" }));
        if (replacement === "unmount") view.unmount();
        else await act(async () => {
          owner = "11111111-2222-4333-8444-555555555555";
          await authClient.refresh();
          if (replacement === "fresh A") { owner = ACCOUNT; await authClient.refresh(); }
          expect(store.getState().accountId).toBe(owner);
          expect(store.getState().isAuthenticated).toBe(true);
          expect(store.getState().token).toBeNull();
        });
        const authority = store.getState();
        await act(async () => {
          if (failure) held.reject(new Error("Old recovery failed"));
          else held.resolve(Response.json(phase === "status" ? { recovery: pendingRecovery } : { lifecycle: { status: "active", revision: 8 } }));
        });
        if (replacement === "unmount") expect(view.container).toBeEmptyDOMElement();
        else {
          expect(screen.getByText(/recovery flow has expired/i)).toBeInTheDocument();
          expect(screen.queryByRole("button")).toBeNull();
          expect(screen.queryByRole("alert")).toBeNull();
          expect(screen.queryByText(/Account reactivated|already active|Old recovery failed/)).toBeNull();
        }
        expect(store.getState()).toBe(authority);
        expect(requests.filter(request => request.method === "POST")).toEqual(phase === "complete" ? [
          { url: "/api/explorers/v1/recovery/complete", method: "POST", body: { expectedRevision: 7 } },
        ] : []);
        expect(requests.filter(request => request.url.endsWith("/status"))).toHaveLength(1);
      });
    }
  }
}
it("submits signed-out purpose-only recovery once on a batched double click", async () => {
  const { act } = await import("@testing-library/react");
  localStorage.clear();
  const { default: store } = await import("../../store/store");
  const held = heldResponse();
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    return url.endsWith("/status") ? Response.json({ recovery: pendingRecovery }) : held.promise;
  }));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter><Page /></MemoryRouter>);
  const button = await screen.findByRole("button", { name: "Reactivate account" });
  act(() => { button.click(); button.click(); });
  expect(requests.filter(url => url.endsWith("/complete"))).toHaveLength(1);
  expect(store.getState().isAuthenticated).toBe(false);
  await act(async () => { held.resolve(Response.json({ lifecycle: { status: "active", revision: 8 } })); });
  expect(screen.getByText("Account reactivated")).toBeInTheDocument();
});

it("expires ready recovery synchronously when ordinary session verification begins", async () => {
  const { act } = await import("@testing-library/react");
  localStorage.clear();
  const { default: store } = await import("../../store/store");
  const { authClient } = await import("../../lib/authClient");
  const session = heldResponse();
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith("/status")) return Response.json({ recovery: pendingRecovery });
    if (url.endsWith("/get-session")) return session.promise;
    throw new Error(`Unexpected request: ${url}`);
  }));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter><Page /></MemoryRouter>);
  const oldButton = await screen.findByRole("button", { name: "Reactivate account" });
  let verification!: Promise<void>;
  act(() => { verification = authClient.refresh(); oldButton.click(); });
  expect(screen.getByText(/recovery flow has expired/i)).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
  await act(async () => { session.resolve(new Response(null, { status: 401 })); await verification; });
  expect(store.getState().status).toBe("signed-out");
  expect(requests).toEqual(["/api/explorers/v1/recovery/status", "/api/auth/get-session"]);
  expect(screen.getByText(/recovery flow has expired/i)).toBeInTheDocument();
});

it("binds cold-entry recovery after StrictMode AuthSyncManager bootstrap settles signed out", async () => {
  const { StrictMode } = await import("react");
  const { act } = await import("@testing-library/react");
  const { ApolloClient, ApolloProvider, InMemoryCache, ApolloLink } = await import("@apollo/client");
  localStorage.clear();
  const { default: store } = await import("../../store/store");
  store.setState({ status: "loading", generation: 0 });
  const sessions: ReturnType<typeof heldResponse>[] = [];
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    requests.push(url);
    if (url.endsWith("/get-session")) { const held = heldResponse(); sessions.push(held); return held.promise; }
    if (url.endsWith("/status")) return Response.json({ recovery: pendingRecovery });
    if (url.endsWith("/complete")) return Response.json({ lifecycle: { status: "active", revision: 8 } });
    throw new Error(`Unexpected request: ${url}`);
  }));
  const { default: Manager } = await import("../../components/AuthSyncManager");
  const { default: Page } = await import("../ReactivateConfirm");
  const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
  render(<StrictMode><ApolloProvider client={client}><MemoryRouter><Manager /><Page /></MemoryRouter></ApolloProvider></StrictMode>);
  expect(requests.filter(url => url.endsWith("/status"))).toHaveLength(0);
  await act(async () => { for (const session of sessions) session.resolve(new Response(null, { status: 401 })); });
  expect(store.getState().status).toBe("signed-out");
  const button = await screen.findByRole("button", { name: "Reactivate account" });
  fireEvent.click(button);
  expect(await screen.findByText("Account reactivated")).toBeInTheDocument();
  expect(requests.filter(url => url.endsWith("/complete"))).toHaveLength(1);
  expect(store.getState().isAuthenticated).toBe(false);
  expect(requests.filter(url => url.endsWith("/status"))).toHaveLength(1);
  const { authClient } = await import("../../lib/authClient");
  let laterVerification!: Promise<void>;
  act(() => { laterVerification = authClient.refresh(); });
  expect(screen.getByText(/recovery flow has expired/i)).toBeInTheDocument();
  await act(async () => { sessions[sessions.length - 1].resolve(new Response(null, { status: 401 })); await laterVerification; });
  expect(screen.getByText(/recovery flow has expired/i)).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
  expect(requests.filter(url => url.endsWith("/status"))).toHaveLength(1);
});
