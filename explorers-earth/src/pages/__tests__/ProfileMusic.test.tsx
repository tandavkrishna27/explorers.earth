import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, createRoutesFromElements, MemoryRouter, Outlet, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileMusic from "../public/ProfileMusic";
import { PublicMusicAvailabilityProvider } from "../../features/music/PublicMusicAvailabilityProvider";
import { PublicMusicError } from "../../features/music/publicMusicClient";
import UsernameValidator from "../../routes/validators/UsernameValidator";
import { PublicColdEntryBoundary } from "../../layouts/PublicColdEntryBoundary";

const load = vi.hoisted(() => vi.fn());
const discover = vi.hoisted(() => vi.fn());
const useQuery = vi.hoisted(() => vi.fn());
const retry = vi.hoisted(() => vi.fn());
const subscribe = vi.hoisted(() => vi.fn(() => ({ unsubscribe: vi.fn() })));
const availability = vi.hoisted(() => ({ current: {} as Record<string, unknown>, real: false }));
const identityOverride = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
const trackMusic = vi.hoisted(() => vi.fn());
vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("@apollo/client", async (importOriginal) => ({ ...(await importOriginal<object>()), useQuery }));
vi.mock("../../features/PublicHome/api/usePublicProfileShell", () => ({
  usePublicProfileShell: (username: string | undefined) => {
    const result = useQuery(undefined, { variables: { filters: { username: { eq: username } } } });
    return { ...result, data: result.data?.accounts?.[0] };
  },
}));
vi.mock("../../features/music/publicMusicClient", async (importOriginal) => ({
  ...(await importOriginal<object>()), publicMusicClient: { load, discover },
}));
vi.mock("../../features/music/PublicMusicAvailabilityProvider", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../features/music/PublicMusicAvailabilityProvider")>();
  return { ...original, usePublicMusicAvailability: () => {
    const actual = original.usePublicMusicAvailability();
    return availability.real ? actual : availability.current;
  }, usePublicAccountIdentity: () => identityOverride.current ?? original.usePublicAccountIdentity() };
});
vi.mock("../../features/music/publicMusicAnalytics", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  usePublicMusicProductAnalytics: (input: unknown) => { trackMusic(input); return trackMusic; },
}));
vi.mock("../../features/music/publicMusicLiveClient", () => ({ subscribeToPublicMusic: subscribe }));

const emptyResource = {
  version: "music-public-resource/v1", revision: 3, user: { username: "Alice", venueName: null },
  permissions: { allowSongRequests: false, allowGuestPlayOnDevice: false, allowPlaylistSharing: false, allowRecentlyPlayedVisibility: false, allowQueueVisibility: false },
  currentlyPlaying: null,
  queue: { items: [], total: 0, truncated: false },
  recentlyPlayed: { items: [], total: 0, truncated: false },
  playlists: { items: [], total: 0, truncated: false },
};
const requestableResource = {
  ...emptyResource,
  permissions: { ...emptyResource.permissions, allowSongRequests: true },
};

function renderMusicRoute(entries = ["/before", "/tk2727/music"], settle = vi.fn()) {
  const router = createMemoryRouter(createRoutesFromElements(<>
    <Route path="/before" element={<h1>Before Music</h1>} />
    <Route path=":username" element={<PublicMusicAvailabilityProvider><Outlet context={{ setIsPageLoaded: settle }} /></PublicMusicAvailabilityProvider>}>
      <Route index element={<h1>Profile root</h1>} />
      <Route path="music" element={<ProfileMusic />} />
    </Route>
  </>), { initialEntries: entries, initialIndex: entries.length - 1 });
  render(<RouterProvider router={router} />);
  return { router, settle };
}

describe("ProfileMusic", () => {
  beforeEach(() => {
    load.mockReset(); discover.mockReset(); useQuery.mockReset(); retry.mockReset(); subscribe.mockClear(); trackMusic.mockClear();
    availability.real = false;
    identityOverride.current = undefined;
    useQuery.mockReturnValue({ loading: false, data: { accounts: [{ documentId: "account-friendly-1", public_music: "Yes" }] } });
    discover.mockResolvedValue({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } });
    availability.current = {
      state: "available", account: { documentId: "account-friendly-1" },
      descriptor: { version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } }, retry,
    };
  });
  afterEach(() => vi.useRealTimers());

  it.each([[], ["public_profile", "public_recommendations", "public_guides", "public_books", "public_apps"]])("loads a direct Music URL independently of saved pins %j", async (pins) => {
    availability.current.account = { documentId: "account-friendly-1", public_music: "Yes", auto_pinning: false, pinned_nav_tabs: pins };
    load.mockResolvedValue(emptyResource);
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes>
      <Route path=":username" element={<Outlet />}><Route path="music" element={<ProfileMusic />} /></Route>
    </Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music" });
    expect(load).toHaveBeenCalledWith("stable-public-slug", undefined, expect.any(AbortSignal));
  });

  it("attributes friendly outage acknowledgement through account authority", async () => {
    availability.current = { state: "unavailable", account: { documentId: "account-friendly-1" }, retry };
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes>
      <Route path=":username" element={<Outlet />}><Route path="music" element={<ProfileMusic />} /></Route>
    </Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music is temporarily unavailable." });
    expect(trackMusic).toHaveBeenCalledWith({ accountDocumentId: "account-friendly-1", route: "friendly" });
    expect(trackMusic).toHaveBeenCalledWith({ name: "unavailable", reason: "service_unavailable" }, expect.any(String));
  });

  it.each([["No", "public"], ["Yes", "private"], ["Yes", "unlisted"]] as const)("replaces %s+%s friendly Music with the exact profile root and safe attribution", async (profile, mode) => {
    availability.real = true;
    useQuery.mockReturnValue({ loading: false, data: { accounts: [{ documentId: "account-friendly-1", public_music: profile }] } });
    if (mode !== "public") discover.mockRejectedValue(new PublicMusicError("PUBLIC_NOT_FOUND"));
    const secret = "A".repeat(43);
    const { router, settle } = renderMusicRoute(["/before", `/tk2727/music?utm_source=test&utm_medium=link&access=${secret}#access=${secret}`]);
    await screen.findByRole("heading", { name: "Profile root" });
    expect(router.state.location.pathname).toBe("/tk2727");
    expect(router.state.location.search).toBe("?utm_source=test&utm_medium=link");
    expect(router.state.location.hash).toBe("");
    expect(settle).toHaveBeenCalledExactlyOnceWith(true);
    const events = trackMusic.mock.calls.filter(([event]) => event.name === "unavailable");
    expect(events).toEqual([[{ name: "unavailable", reason: "not_public" }, expect.any(String)]]);
    expect(JSON.stringify(trackMusic.mock.calls)).not.toContain(secret);
    expect(load).not.toHaveBeenCalled();
    await act(async () => router.navigate(-1));
    await screen.findByRole("heading", { name: "Before Music" });
    expect(router.state.location.pathname).toBe("/before");
  });

  it("typed discovery 429 preserves the route and server delay before Retry can recover", async () => {
    vi.useFakeTimers(); availability.real = true;
    discover.mockRejectedValueOnce(new PublicMusicError("RATE_LIMITED", 2)).mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } });
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Too many requests. Try again in 2 seconds." })).toBeInTheDocument();
    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toBeDisabled();
    expect(router.state.location.pathname).toBe("/tk2727/music");
    act(() => vi.advanceTimersByTime(1999)); expect(retryButton).toBeDisabled();
    act(() => vi.advanceTimersByTime(1)); expect(retryButton).toBeEnabled();
    await act(async () => fireEvent.click(retryButton));
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
  });

  it("transient discovery failure receives one automatic retry before rendering an outage", async () => {
    availability.real = true;
    discover.mockRejectedValueOnce(new PublicMusicError("PUBLIC_UNAVAILABLE"))
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } });
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music" });
    expect(discover).toHaveBeenCalledTimes(2);
    expect(router.state.location.pathname).toBe("/tk2727/music");
  });

  it("an untyped discovery outage remains retryable and recovers without a root redirect", async () => {
    availability.real = true;
    const error = Object.assign(new Error("not authoritative"), { code: "PUBLIC_NOT_FOUND" });
    discover.mockRejectedValueOnce(error).mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } });
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music is temporarily unavailable." });
    expect(router.state.location.pathname).toBe("/tk2727/music");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Music" });
    expect(router.state.location.pathname).toBe("/tk2727/music");
    expect(trackMusic.mock.calls.filter(([event]) => event.name === "unavailable")).toEqual([[{ name: "unavailable", reason: "service_unavailable" }, expect.any(String)]]);
  });
  it("Retry recovers the account read itself after an initial GraphQL outage", async () => {
    availability.real = true;
    let accountReadFailed = true;
    const accountReadError = new Error("account read unavailable");
    const refetch = vi.fn(async () => { accountReadFailed = false; return {}; });
    useQuery.mockImplementation(() => ({ loading: false, refetch, error: accountReadFailed ? accountReadError : undefined,
      data: accountReadFailed ? undefined : { accounts: [{ documentId: "account-friendly-1", public_music: "Yes" }] } }));
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music is temporarily unavailable." });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Music" });
    expect(refetch).toHaveBeenCalledOnce();
    expect(router.state.location.pathname).toBe("/tk2727/music");
  });

  it("keeps Music state mounted while revalidating and temporarily disables guest actions", async () => {
    availability.real = true;
    let resolveDiscovery!: (value: unknown) => void;
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveDiscovery = resolve; }));
    load.mockResolvedValue(requestableResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music" });
    const input = screen.getByRole("textbox", { name: "Search for a song or paste a YouTube URL" });
    fireEvent.change(input, { target: { value: "Hyderabad sunrise" } });
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeDisabled());
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search for a song or paste a YouTube URL" })).toBe(input);
    expect(input).toHaveValue("Hyderabad sunrise");
    expect(router.state.location.pathname).toBe("/tk2727/music");

    await act(async () => resolveDiscovery({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 4 } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Search" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Search for a song or paste a YouTube URL" })).toBe(input);
    expect(input).toHaveValue("Hyderabad sunrise");
  });

  it("redirects only after authoritative revocation during revalidation", async () => {
    availability.real = true;
    let rejectDiscovery!: (reason: unknown) => void;
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } })
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectDiscovery = reject; }));
    load.mockResolvedValue(requestableResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music" });

    act(() => window.dispatchEvent(new Event("focus")));
    expect(router.state.location.pathname).toBe("/tk2727/music");
    await act(async () => rejectDiscovery(new PublicMusicError("PUBLIC_NOT_FOUND")));
    await screen.findByRole("heading", { name: "Profile root" });
    expect(router.state.location.pathname).toBe("/tk2727");
    expect(trackMusic.mock.calls.filter(([event]) => event.name === "unavailable")).toEqual([[{ name: "unavailable", reason: "not_public" }, expect.any(String)]]);
  });

  it("live revocation and descriptor confirmation emit one unavailable event before fallback", async () => {
    availability.real = true;
    discover.mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "stable-public-slug", revision: 3 } })
      .mockRejectedValueOnce(new PublicMusicError("PUBLIC_NOT_FOUND"));
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Music" });
    await act(async () => subscribe.mock.calls[0][0].onError(new PublicMusicError("PUBLIC_NOT_FOUND")));
    await screen.findByRole("heading", { name: "Profile root" });
    expect(router.state.location.pathname).toBe("/tk2727");
    expect(screen.queryByText("Nothing has been shared here yet")).not.toBeInTheDocument();
    expect(trackMusic.mock.calls.filter(([event]) => event.name === "unavailable")).toEqual([[{ name: "unavailable", reason: "not_public" }, expect.any(String)]]);
  });

  it("ignores an older username discovery completion after a real router navigation", async () => {
    availability.real = true;
    let rejectOld!: (reason: unknown) => void;
    useQuery.mockImplementation((_query, options) => ({ loading: false, data: { accounts: [{ documentId: options.variables.filters.username.eq === "tk2727" ? "account-a" : "account-b", public_music: "Yes" }] } }));
    discover.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }))
      .mockResolvedValueOnce({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "public-slug-b", revision: 3 } });
    load.mockResolvedValue(emptyResource);
    const { router } = renderMusicRoute();
    expect(screen.getByRole("status")).toHaveTextContent("Loading Music");
    const oldSignal = discover.mock.calls[0][1];
    await act(async () => router.navigate("/bob/music"));
    await screen.findByRole("heading", { name: "Music" });
    expect(oldSignal.aborted).toBe(true);
    await act(async () => rejectOld(new PublicMusicError("PUBLIC_NOT_FOUND")));
    expect(router.state.location.pathname).toBe("/bob/music");
    expect(load).toHaveBeenCalledExactlyOnceWith("public-slug-b", undefined, expect.any(AbortSignal));
    expect(trackMusic.mock.calls.filter(([event]) => event.name === "unavailable")).toEqual([]);
  });
  it("does not treat cached previous-username No as authoritative while the new query loads", async () => {
    availability.real = true;
    let query = { loading: false, data: { accounts: [{ documentId: "account-a", public_music: "No" }] } };
    useQuery.mockImplementation(() => query);
    const { router } = renderMusicRoute();
    await screen.findByRole("heading", { name: "Profile root" });
    trackMusic.mockClear();
    query = { ...query, loading: true };
    await act(async () => router.navigate("/bob/music"));
    expect(router.state.location.pathname).toBe("/bob/music");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Music");
    expect(trackMusic.mock.calls.filter(([event]) => event.name === "unavailable")).toEqual([]);
  });

  it("keeps the existing unknown-username 404 boundary without discovering Music", async () => {
    availability.real = true;
    identityOverride.current = { usernameKey: "unknown", status: "terminal-error", error: new Error("PUBLIC_PROFILE_404") };
    useQuery.mockReturnValue({ loading: false, error: new Error("PUBLIC_PROFILE_404") });
    render(<MemoryRouter initialEntries={["/unknown/music"]}><Routes><Route path=":username/music" element={<PublicColdEntryBoundary><UsernameValidator><PublicMusicAvailabilityProvider><ProfileMusic /></PublicMusicAvailabilityProvider></UsernameValidator></PublicColdEntryBoundary>} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page Not Found" })).toBeInTheDocument();
    expect(discover).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled();
  });

  it("loads by descriptor slug and settles profile-shell readiness exactly once", async () => {
    load.mockResolvedValue(emptyResource);
    const settle = vi.fn();
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes>
      <Route path=":username" element={<Outlet context={{ setIsPageLoaded: settle }} />}>
        <Route path="music" element={<ProfileMusic />} />
      </Route>
    </Routes></MemoryRouter>);

    await screen.findByRole("heading", { name: "Music" });
    expect(load).toHaveBeenCalledWith("stable-public-slug", undefined, expect.any(AbortSignal));
    await waitFor(() => expect(settle).toHaveBeenCalledTimes(1));
    expect(settle).toHaveBeenCalledWith(true);
  });

  it("uses the shared live controller for canonical updates and revocation cleanup", async () => {
    // Break caught: friendly Music remains a one-shot fetch while direct share updates live.
    load.mockResolvedValueOnce(emptyResource).mockResolvedValueOnce({ ...emptyResource, revision: 4 });
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes>
      <Route path=":username" element={<Outlet />}><Route path="music" element={<ProfileMusic />} /></Route>
    </Routes></MemoryRouter>);
    await waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    expect(subscribe.mock.calls[0][0]).toMatchObject({ publicSlug: "stable-public-slug", initialRevision: 3 });
    const result = await subscribe.mock.calls[0][0].onInvalidate(new AbortController().signal);
    expect(result.revision).toBe(4);
    act(() => result.apply());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    act(() => subscribe.mock.calls[0][0].onError(new PublicMusicError("PUBLIC_NOT_FOUND")));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Loading Music"));
    expect(screen.queryByRole("heading", { name: "Music" })).not.toBeInTheDocument();
    expect(retry).toHaveBeenCalledOnce();
  });

  it("retains the ready friendly resource through transient and rate-limited live failures", async () => {
    load.mockResolvedValue(emptyResource);
    render(<MemoryRouter initialEntries={["/alice/music"]}><Routes>
      <Route path=":username" element={<Outlet />}><Route path="music" element={<ProfileMusic />} /></Route>
    </Routes></MemoryRouter>);
    await screen.findByRole("heading", { name: "Music" });
    const options = subscribe.mock.calls[0][0];
    options.onError(new (await import("../../features/music/publicMusicClient")).PublicMusicError("PUBLIC_UNAVAILABLE"));
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    options.onError(new (await import("../../features/music/publicMusicClient")).PublicMusicError("RATE_LIMITED", 90));
    expect(screen.getByRole("heading", { name: "Music" })).toBeInTheDocument();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
