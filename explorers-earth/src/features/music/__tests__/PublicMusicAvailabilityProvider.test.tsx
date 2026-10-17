import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_MUSIC_DESCRIPTOR_MAX_AGE_MS, PublicMusicAvailabilityProvider, usePublicAccountIdentity, usePublicMusicAvailability, useOwnerMusicAvailability, notifyMusicPublicationVerified } from "../PublicMusicAvailabilityProvider";
import { PublicMusicError } from "../publicMusicClient";

const discover = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());
const usePublicProfileShell = vi.hoisted(() => vi.fn());
vi.mock("@apollo/client", async (importOriginal) => ({ ...(await importOriginal<object>()), useQuery }));
vi.mock("../../PublicHome/api/usePublicProfileShell", () => ({ usePublicProfileShell }));
vi.mock("../publicMusicClient", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  publicMusicClient: { discover },
}));

function Consumer({ label }: { label: string }) {
  const availability = usePublicMusicAvailability();
  return <div>{label}:{availability.state}:{availability.descriptor?.publication.publicSlug ?? "none"}</div>;
}

function OrderedConsumer() {
  const availability = usePublicMusicAvailability();
  return <div><span>page:{availability.state === "revoked" ? "unavailable" : availability.state}</span><span>nav:{availability.state === "available" || availability.state === "revalidating" || availability.state === "revoked" ? "eligible" : "removed"}</span></div>;
}
function RetryConsumer() {
  const availability = usePublicMusicAvailability();
  return <><button onClick={availability.retry}>retry</button><div>retry:{availability.state}:{availability.descriptor?.publication.publicSlug ?? "none"}</div></>;
}
function ErrorConsumer() {
  const availability = usePublicMusicAvailability();
  return <div>{availability.state}:{availability.retryAfterSeconds ?? "no-delay"}</div>;
}

function IdentityConsumer() {
  const identity = usePublicAccountIdentity();
  return <div>identity:{identity.usernameKey}:{identity.status}:{identity.account?.username ?? "none"}</div>;
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={["/alice/music"]}>
      <Routes><Route path=":username/music" element={
        <PublicMusicAvailabilityProvider><Consumer label="nav" /><Consumer label="page" /><Consumer label="landing" /></PublicMusicAvailabilityProvider>
      } /></Routes>
    </MemoryRouter>,
  );
}

describe("PublicMusicAvailabilityProvider", () => {
  it("uses the public-profile gateway shell instead of an anonymous Strapi account query", () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", username: "alice", public_music: "No" }] }, loading: false });
    renderProvider();
    expect(usePublicProfileShell).toHaveBeenCalledWith("alice");
  });

  it("treats a matching cached account as ready during cache-and-network revalidation", () => {
    useQuery.mockReturnValue({
      data: { accounts: [{ documentId: "account-doc", username: "alice", public_music: "No" }] },
      loading: true,
    });
    render(<MemoryRouter initialEntries={["/Alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><IdentityConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    expect(screen.getByText("identity:alice:ready:alice")).toBeInTheDocument();
  });

  it("never exposes the previous username's cached account identity", () => {
    useQuery.mockReturnValue({
      data: { accounts: [{ documentId: "account-a", username: "alice", public_music: "No" }] },
      loading: true,
    });
    render(<MemoryRouter initialEntries={["/bob/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><IdentityConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    expect(screen.getByText("identity:bob:loading:none")).toBeInTheDocument();
  });

  it("settles a cold account lookup with a terminal identity error without changing Music discovery", () => {
    useQuery.mockReturnValue({ data: { accounts: [] }, loading: false, error: new Error("profile unavailable") });
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><IdentityConsumer /><Consumer label="music" /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    expect(screen.getByText("identity:alice:terminal-error:none")).toBeInTheDocument();
    expect(screen.getByText("music:unavailable:none")).toBeInTheDocument();
  });

  it("recovers a previously not-public tab on focus without waiting for an available-only timer", async () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false, refetch: vi.fn().mockResolvedValue({}) });
    discover.mockRejectedValueOnce(new PublicMusicError('PUBLIC_NOT_FOUND'))
      .mockResolvedValue({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } });
    renderProvider();
    await screen.findByText('nav:not-public:none');
    act(() => window.dispatchEvent(new Event('focus')));
    await screen.findByText('nav:available:public_slug-123');
  });
  beforeEach(() => {
    discover.mockReset();
    useQuery.mockReset();
    usePublicProfileShell.mockReset();
    usePublicProfileShell.mockImplementation(() => {
      const result = useQuery();
      return { ...result, data: result.data?.accounts?.[0] };
    });
  });
  afterEach(() => vi.useRealTimers());

  it("shares one Account-document descriptor request across all consumers", async () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockResolvedValue({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } });
    renderProvider();
    await waitFor(() => expect(screen.getByText("nav:available:public_slug-123")).toBeInTheDocument());
    expect(screen.getByText("page:available:public_slug-123")).toBeInTheDocument();
    expect(screen.getByText("landing:available:public_slug-123")).toBeInTheDocument();
    expect(discover).toHaveBeenCalledTimes(1);
    expect(discover).toHaveBeenCalledWith("account-doc", expect.any(AbortSignal));
  });
  it("retries one transient public discovery failure before showing Music as unavailable", async () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockRejectedValueOnce(new PublicMusicError("PUBLIC_UNAVAILABLE", 503))
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } });
    renderProvider();

    await screen.findByText("nav:available:public_slug-123");
    expect(discover).toHaveBeenCalledTimes(2);
  });
  it('ignores other-account and malformed signals, and refreshes this account on a cross-tab final signal', async () => {
    const refetch = vi.fn().mockResolvedValue({});
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: 'account-doc', public_music: 'Yes' }] }, loading: false, refetch });
    discover.mockRejectedValueOnce(new PublicMusicError('PUBLIC_NOT_FOUND')).mockResolvedValue({ version: 'music-public-descriptor/v1', publication: { mode: 'public', publicSlug: 'public_slug-123', revision: 1 } });
    renderProvider(); await screen.findByText('nav:not-public:none');
    await act(async () => {
      notifyMusicPublicationVerified('another-account');
      window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-music-publication-verified/v1', newValue: '{invalid' }));
    });
    expect(refetch).not.toHaveBeenCalled(); expect(discover).toHaveBeenCalledTimes(1);
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'explorers-music-publication-verified/v1', newValue: JSON.stringify({ version: 1, accountDocumentId: 'account-doc', eventId: 'verified-event' }) })));
    await screen.findByText('nav:available:public_slug-123'); expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("fails closed without contacting Local Tunes when profile Music is hidden", () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "No" }] }, loading: false });
    renderProvider();
    expect(screen.getByText("nav:not-public:none")).toBeInTheDocument();
    expect(discover).not.toHaveBeenCalled();
  });
  it.each(["PUBLIC_NOT_FOUND", "RATE_LIMITED"])("does not promote arbitrary %s errors into authoritative publication or rate-limit results", async (code) => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockRejectedValue(Object.assign(new Error("untrusted upstream detail"), { code, retryAfterSeconds: 2 }));
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><ErrorConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    await screen.findByText("unavailable:no-delay");
  });
  it("preserves only the typed rate-limit delay for friendly recovery", async () => {
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockRejectedValue(new PublicMusicError("RATE_LIMITED", 2));
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><ErrorConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    await screen.findByText("unavailable:2");
  });

  it("expires availability, refetches canonically, and removes revoked eligibility", async () => {
    vi.useFakeTimers();
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } })
      .mockRejectedValueOnce(new PublicMusicError("PUBLIC_NOT_FOUND"));
    renderProvider();
    await vi.waitFor(() => expect(screen.getByText("nav:available:public_slug-123")).toBeInTheDocument());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await vi.waitFor(() => expect(screen.getByText("nav:not-public:none")).toBeInTheDocument());
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it("retains stale eligibility while revalidating and exposes terminal page state before removal", async () => {
    vi.useFakeTimers();
    let rejectRevocation!: (reason: unknown) => void;
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } })
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRevocation = reject; }));
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><OrderedConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    await vi.waitFor(() => expect(screen.getByText("page:available")).toBeInTheDocument());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(screen.getByText("page:revalidating")).toBeInTheDocument();
    expect(screen.getByText("nav:eligible")).toBeInTheDocument();
    await act(async () => rejectRevocation(new PublicMusicError("PUBLIC_NOT_FOUND")));
    expect(screen.getByText("page:unavailable")).toBeInTheDocument();
    expect(screen.getByText("nav:eligible")).toBeInTheDocument();
    await act(() => vi.runOnlyPendingTimersAsync());
    expect(screen.getByText("nav:removed")).toBeInTheDocument();
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it("retains the verified descriptor and automatically recovers after a transient outage", async () => {
    vi.useFakeTimers();
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } })
      .mockRejectedValueOnce(new PublicMusicError("PUBLIC_UNAVAILABLE", 503))
      .mockRejectedValueOnce(new PublicMusicError("PUBLIC_UNAVAILABLE", 503))
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 2 } });
    renderProvider();
    await vi.waitFor(() => expect(screen.getByText("nav:available:public_slug-123")).toBeInTheDocument());

    await act(() => vi.advanceTimersByTimeAsync(PUBLIC_MUSIC_DESCRIPTOR_MAX_AGE_MS));
    await vi.waitFor(() => expect(screen.getByText("nav:revalidating:public_slug-123")).toBeInTheDocument());
    expect(screen.queryByText("nav:unavailable:none")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await vi.waitFor(() => expect(screen.getByText("nav:available:public_slug-123")).toBeInTheDocument());
    expect(discover).toHaveBeenCalledTimes(4);
  });

  it("never renders account A state or slug after the query switches to account B", async () => {
    let query = { data: { accounts: [{ documentId: "account-a", public_music: "Yes" }] }, loading: false };
    useQuery.mockImplementation(() => query);
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "slug-a", revision: 1 } })
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "slug-b", revision: 1 } });
    const view = renderProvider();
    await waitFor(() => expect(screen.getByText("nav:available:slug-a")).toBeInTheDocument());
    query = { data: { accounts: [{ documentId: "account-b", public_music: "Yes" }] }, loading: false };
    view.rerender(<MemoryRouter initialEntries={["/bob/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><Consumer label="nav" /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    expect(screen.queryByText(/slug-a/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("nav:available:slug-b")).toBeInTheDocument());
  });

  it("ignores an older request that settles after a retry", async () => {
    let resolveOld!: (value: any) => void;
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "new-slug", revision: 2 } });
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes><Route path=":username/music" element={<PublicMusicAvailabilityProvider><RetryConsumer /></PublicMusicAvailabilityProvider>} /></Routes></MemoryRouter>);
    act(() => screen.getByRole("button", { name: "retry" }).click());
    await waitFor(() => expect(screen.getByText("retry:available:new-slug")).toBeInTheDocument());
    await act(async () => resolveOld({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "old-slug", revision: 1 } }));
    expect(screen.queryByText(/old-slug/)).not.toBeInTheDocument();
  });

  it("cancels deferred revocation work on unmount", async () => {
    vi.useFakeTimers();
    let reject!: (reason: unknown) => void;
    useQuery.mockReturnValue({ data: { accounts: [{ documentId: "account-doc", public_music: "Yes" }] }, loading: false });
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "slug", revision: 1 } })
      .mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    const view = renderProvider();
    await vi.waitFor(() => expect(screen.getByText("nav:available:slug")).toBeInTheDocument());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    await act(async () => reject(new PublicMusicError("PUBLIC_NOT_FOUND")));
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("owner Music publication availability", () => {
  const descriptor = { version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public_slug-123", revision: 1 } };
  beforeEach(() => discover.mockReset());
  afterEach(() => vi.useRealTimers());
  it("retains confirmed eligibility while revalidating instead of flickering auto-pins", async () => {
    discover.mockResolvedValueOnce(descriptor).mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useOwnerMusicAvailability("owner-account", "Yes"));
    await waitFor(() => expect(result.current.state).toBe("available"));
    act(() => result.current.retry());
    expect(result.current.state).toBe("revalidating");
  });

  it.each(["No", undefined, null])("does not infer publication or request a descriptor for preference %s", (preference) => {
    const { result } = renderHook(() => useOwnerMusicAvailability("owner-account", preference));
    expect(result.current.state).toBe("not-public");
    expect(discover).not.toHaveBeenCalled();
  });
  it.each([
    ["private", "PUBLIC_NOT_FOUND", "not-public"],
    ["unlisted", "PUBLIC_NOT_FOUND", "not-public"],
    ["404", "PUBLIC_NOT_FOUND", "not-public"],
    ["429", "PUBLIC_RATE_LIMITED", "unavailable"],
    ["503", "PUBLIC_UNAVAILABLE", "unavailable"],
    ["offline", undefined, "unavailable"],
  ])("keeps %s unavailable without mutating saved account data and recovers on retry", async (_scenario, code, expected) => {
    discover.mockRejectedValueOnce(Object.assign(new Error("descriptor failed"), { code })).mockResolvedValueOnce(descriptor);
    const account = Object.freeze({ documentId: "owner-account", public_music: "Yes", pinned_nav_tabs: Object.freeze(["public_profile", "public_music"]) });
    const { result } = renderHook(() => useOwnerMusicAvailability(account.documentId, account.public_music));
    await waitFor(() => expect(result.current.state).toBe(expected));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state).toBe("available"));
    expect(account.pinned_nav_tabs).toEqual(["public_profile", "public_music"]);
  });
  it("aborts identity A and ignores its completion after switching to B", async () => {
    let resolveA!: (value: unknown) => void;
    discover.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockRejectedValueOnce(new Error("offline"));
    const { result, rerender, unmount } = renderHook(({ id }) => useOwnerMusicAvailability(id, "Yes"), { initialProps: { id: "A" } });
    const signalA = discover.mock.calls[0][1];
    rerender({ id: "B" });
    expect(signalA.aborted).toBe(true);
    await waitFor(() => expect(result.current.state).toBe("unavailable"));
    await act(async () => resolveA(descriptor));
    expect(result.current.state).toBe("unavailable");
    unmount();
    expect(discover.mock.calls[1][1].aborted).toBe(true);
  });
  it("recovers automatically on browser online and revalidates available publication", async () => {
    vi.useFakeTimers();
    discover.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(descriptor).mockRejectedValueOnce(Object.assign(new Error("revoked"), { code: "PUBLIC_NOT_FOUND" }));
    const { result, unmount } = renderHook(() => useOwnerMusicAvailability("owner-account", "Yes"));
    await act(async () => {});
    expect(result.current.state).toBe("unavailable");
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(result.current.state).toBe("available");
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(result.current.state).toBe("not-public");
    unmount(); expect(vi.getTimerCount()).toBe(0);
  });
});
