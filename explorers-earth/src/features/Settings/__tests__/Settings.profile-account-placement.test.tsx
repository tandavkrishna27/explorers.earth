import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { readyMusic } from "../../music/__tests__/musicPublishHarness";
import { musicIdentityCoordinator } from "../../music/musicApi";
import { musicWorkspaceClient } from "../../../hooks/useTunesDashboard";
import { loginSurface, surfaceAccount, surfaceHarness, writtenPins } from "../../navigation/__tests__/surfaceHarness";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import english from "../../../i18n/resources/en.json";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../store/store";
import { canonicalAccountFixture } from "../../../test/canonicalAccountFixture";
import { explorersApiClient } from "../../../lib/explorersApiClient";
vi.mock("../../Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({
  data: { id: navigation.accountId, revision: 1 }, isLoading: false,
}) }));

const preference = vi.hoisted(() => ({ value: "Yes" as string | undefined }));
const SECOND_ACCOUNT = "22222222-2222-4222-8222-222222222222";
// writtenPins reads the canonical categories payload as a pin order, so these
// assertions stay legible while checking what the client actually sends.
const lastWrittenPins = () => writtenPins(navigation.mutate.mock.lastCall![0]);
const translations = createInstance();
const initialAccount = () => surfaceAccount({ documentId: navigation.accountId, pinned_nav_tabs: navigation.pins, auto_pinning: navigation.auto, public_music: preference.value ?? null, public_books: navigation.booksPublic });
async function render(ui: ReactElement, options: { deferProfile?: Promise<unknown> } = {}) {
  const wrapped = (child: ReactElement) => <I18nextProvider i18n={translations}>{child}</I18nextProvider>;
  const h = surfaceHarness(wrapped(ui), { initial: initialAccount(), deferProfile: options.deferProfile });
  // Saving a pin is a canonical PATCH now, not the UpdateTabVisibility mutation, so the
  // controllable seam is explorersApiClient.updateAccount. navigation.mutate observes
  // every canonical write: resolving undefined lets the harness commit it normally, while
  // resolving a DTO, hanging or throwing stands in for the server's own answer.
  // vi.spyOn is idempotent, so re-spying would hand back the harness's own spy and
  // recurse; wrap the implementation it already installed instead.
  const write = vi.mocked(explorersApiClient.updateAccount);
  const commitWrite = write.getMockImplementation()!;
  write.mockImplementation(async input => {
    const supplied = await navigation.mutate(input);
    return supplied === undefined ? commitWrite(input) : supplied;
  });
  await act(async () => { if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0); });
  const settle = async () => {
    await h.ready();
    await waitFor(() => expect(musicWorkspaceClient.loadDashboard).toHaveBeenCalled());
  };
  // A deferred profile read is the point of those cases, so they settle themselves.
  if (!options.deferProfile) await settle();
  return { ...h, settle, async rerender(next: ReactElement) {
    if (h.saved.documentId !== navigation.accountId) {
      await act(async () => readyMusic("u1", navigation.accountId));
      h.saved = initialAccount();
    }
    h.rerenderChild(wrapped(next));
    await h.ready();
    // Switching accounts resets the panel to collapsed, so reopen it before looking for
    // the pin; a new account inheriting the previous one's open panel would be the bug.
    if (!screen.queryByRole("checkbox", { name: "Pin Music Tab" })) {
      fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    }
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeEnabled());
  } };
}
const navigation = vi.hoisted(() => ({
  pins: ["public_profile"] as string[], auto: false, accountId: "account-1", booksPublic: "Yes",
  mutate: vi.fn(), discover: vi.fn(), refetch: vi.fn(),
}));
vi.mock("../../music/publicMusicClient", async (original) => ({
  ...(await original<object>()), publicMusicClient: { discover: navigation.discover },
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); useAuthStore.getState().logout(); musicIdentityCoordinator.reset(); vi.restoreAllMocks(); preference.value = "Yes"; window.history.replaceState(null, "", "/"); });

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: () => ({ data: [] }) };
});

beforeEach(async () => {
  await translations.init({ lng: "en", fallbackLng: "en", resources: { en: { translation: english }, ar: { translation: { music: { publication: { label: "ظهور الموسيقى" } } } } }, interpolation: { escapeValue: false } });
  navigation.pins = ["public_profile"];
  navigation.auto = false; navigation.booksPublic = "Yes";
  // Must match the account loginSurface() signs in as. It was "account-1", a legacy
  // style id, so the Music coordinator reconciled against an account the canonical
  // store had never heard of, never reached "ready", and left useTunesDashboard
  // disabled — which is why every case in this file timed out waiting for
  // loadDashboard rather than failing on its own assertion.
  navigation.accountId = canonicalAccountFixture().id;
  navigation.mutate.mockReset().mockResolvedValue(undefined);
  navigation.refetch.mockReset().mockResolvedValue({ data: {} });
  navigation.discover.mockReset().mockResolvedValue({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "test-slug", revision: 1 } });
  sessionStorage.clear();
  musicIdentityCoordinator.reset();
  let mode = "public";
  vi.spyOn(musicWorkspaceClient, "loadDashboard").mockImplementation(async () => ({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode, publicSlug: "test-slug" } } as never));
  vi.spyOn(musicWorkspaceClient, "setPublication").mockImplementation(async next => { mode = next; return { version: "music-publication/v1", publication: { mode: next, publicSlug: "test-slug" } }; });
  loginSurface();
  // After sign-in: reconciling before it leaves the coordinator with no account.
  await readyMusic("u1", navigation.accountId);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("../components/ProfileAccountSettings", () => ({
  default: ({ section }: { section: string }) => (
    <div data-testid={`moved-${section}`}>{section}</div>
  ),
}));
vi.mock("../components/LanguageSelector", () => ({
  default: () => null,
  LANGUAGES: [
    { code: "en", name: "English", nativeName: "English", flag: "EN" },
  ],
}));

import Settings from "../Settings";

describe("native Games interaction dispatch probe", () => {
  it.each(["input", "visual-label", "keyboard"] as const)("dispatches the actual Games control via %s", async method => {
    const user = userEvent.setup();
    const h = surfaceHarness(<I18nextProvider i18n={translations}><Settings /></I18nextProvider>, { initial: { ...initialAccount(), public_games: "No" } });
    await h.ready();
    await user.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const control = screen.getByRole("checkbox", { name: "Games Tab", exact: true });
    expect(control).not.toBeChecked(); expect(control).toBeEnabled();
    const change = vi.fn(); control.addEventListener("change", change);
    if (method === "keyboard") { control.focus(); await user.keyboard("[Space]"); }
    else await user.click(method === "input" ? control : control.nextElementSibling!);
    await waitFor(() => expect(h.saved.public_games).toBe("Yes"));
    expect(change).toHaveBeenCalledTimes(1);
    expect(control).toBeChecked(); expect(h.writes).toHaveLength(1);
    control.removeEventListener("change", change);
  });

  it("separates a delivered Games change from a held pretransport read and a queued write", async () => {
    const h = surfaceHarness(<I18nextProvider i18n={translations}><Settings /></I18nextProvider>, { initial: { ...initialAccount(), public_games: "No" } });
    await h.ready();
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const games = screen.getByRole("checkbox", { name: "Games Tab", exact: true });
    const books = screen.getByRole("checkbox", { name: "Books Tab", exact: true });
    const read = vi.mocked(explorersApiClient.getMyProfile);
    const original = read.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    read.mockImplementationOnce(async () => { await gate; return original(); });
    const change = vi.fn(); games.addEventListener("change", change);
    fireEvent.click(books);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(games);
    await act(async () => { await Promise.resolve(); });
    expect(change).toHaveBeenCalledTimes(1);
    expect(h.navigation.pending.map(operation => operation.category)).toEqual(["public_books", "public_games"]);
    expect(games).toBeDisabled(); expect(games).not.toBeChecked();
    expect(h.writes).toHaveLength(0);
    await act(async () => { release(); await gate; });
    await waitFor(() => expect(h.writes).toHaveLength(2));
    await waitFor(() => expect(games).toBeChecked());
    expect(h.navigation.pending).toHaveLength(0);
    games.removeEventListener("change", change);
  });

  it("produces no PATCH for a delivered Games change whose authoritative read is already public", async () => {
    const h = surfaceHarness(<I18nextProvider i18n={translations}><Settings /></I18nextProvider>, { initial: { ...initialAccount(), public_games: "No" } });
    await h.ready();
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const games = screen.getByRole("checkbox", { name: "Games Tab", exact: true });
    expect(games).not.toBeChecked();
    h.saved = { ...h.saved, public_games: "Yes" };
    const change = vi.fn(); games.addEventListener("change", change);
    fireEvent.click(games);
    await waitFor(() => expect(games).toBeChecked());
    expect(change).toHaveBeenCalledTimes(1);
    expect(h.navigation.pending).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
    games.removeEventListener("change", change);
  });

  it("blocks a delivered Games change after session generation invalidates a held read", async () => {
    const h = surfaceHarness(<I18nextProvider i18n={translations}><Settings /></I18nextProvider>, { initial: { ...initialAccount(), public_games: "No" } });
    await h.ready();
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const games = screen.getByRole("checkbox", { name: "Games Tab", exact: true });
    const generation = useAuthStore.getState().generation;
    const read = vi.mocked(explorersApiClient.getMyProfile);
    const original = read.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    read.mockImplementationOnce(async () => { await gate; return original(); });
    const change = vi.fn(); games.addEventListener("change", change);
    fireEvent.click(games);
    await act(async () => { await Promise.resolve(); });
    expect(change).toHaveBeenCalledTimes(1);
    expect(h.navigation.pending).toHaveLength(1);
    expect(h.writes).toHaveLength(0);
    act(() => useAuthStore.getState().logout());
    expect(useAuthStore.getState().generation === generation).toBe(false);
    await act(async () => { release(); await gate; });
    expect(h.navigation.authority).toBeUndefined();
    expect(h.navigation.pending).toHaveLength(0);
    expect(h.writes).toHaveLength(0);
    games.removeEventListener("change", change);
  });
});

describe("Settings moved profile data placement", async () => {
  it("provides visible keyboard focus on Music visibility and the pin's visible switch", async () => {
    const user = userEvent.setup(); await render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const visibility = screen.getByRole("switch", { name: "Music public visibility" });
    visibility.focus();
    expect(visibility).toHaveFocus();
    expect(visibility).toHaveClass("focus-visible:ring-2");
    await user.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole("checkbox", { name: "Pin Music Tab" });
    pin.focus(); await user.keyboard("{Tab}"); await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(pin).toHaveFocus();
    // The input is sr-only, so its visible sibling must carry the indicator.
    expect(pin.nextElementSibling).toHaveClass("peer-focus-visible:ring-2", "peer-focus-visible:ring-[var(--dash-focus-ring)]");
  });
  it.each([true, false])("keeps final scroll at the hash heading without breaking ordinary panel scrolling (hash=%s)", async (hash) => {
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scrollToHeading = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollToHeading });
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 2000, left: 0, right: 300, height: 2000, width: 300, x: 0, y: 0, toJSON: () => ({}) });
    if (hash) window.history.replaceState(null, "", "/settings#public-navigation");
    const view = await render(<Settings />);
    vi.useFakeTimers();
    try {
      if (!hash) fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
      await act(() => vi.advanceTimersByTimeAsync(150));
      if (hash) {
        const heading = screen.getByRole("heading", { name: "Pinned Navigation Tabs" });
        expect(heading).toHaveFocus();
        expect(scrollToHeading).toHaveBeenCalledWith({ block: "start" });
        expect(scrollToHeading.mock.contexts.at(-1)).toBe(heading);
        expect(scrollBy).not.toHaveBeenCalled();
      } else {
        expect(scrollToHeading).not.toHaveBeenCalled();
        expect(scrollBy).toHaveBeenCalledWith({ top: expect.any(Number), behavior: "smooth" });
      }
    } finally {
      view.unmount(); rect.mockRestore(); scrollBy.mockRestore();
      if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      vi.useRealTimers();
    }
  });
  it("rolls back to the captured confirmed value when the save fails", async () => {
    // This case also used to push stale Apollo data mid-flight. Settings no longer reads
    // the account through Apollo at all - categoryNavigationSurfaces.test.tsx:353 asserts
    // that no SettingsAccount query is issued - so that clause had no path left to
    // exercise and was dropped rather than faked. The rollback invariant it guarded stays.
    let reject!: (reason: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeDisabled();
    await act(async () => reject(new Error("save failed")));
    expect(await screen.findByRole("alert")).toHaveTextContent(/save/i);
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeEnabled();
  });
  it("lets the owner explicitly free a hidden saved slot before pinning Music", async () => {
    navigation.booksPublic = "No";
    navigation.pins = ["public_profile", "public_recommendations", "public_guides", "public_books", "public_apps"];
    const user = userEvent.setup(); await render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const books = screen.getByRole("checkbox", { name: "Pin Books Tab" });
    expect(books).toBeEnabled();
    await user.click(books);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(lastWrittenPins()).toEqual(["public_profile", "public_recommendations", "public_guides", "public_apps", "public_music"]));
  });
  it("does not call an empty mutation acknowledgement a confirmed save", async () => {
    // Canonically, an empty acknowledgement is a response that never advanced the
    // revision — the client must not treat it as a confirmed save.
    navigation.mutate.mockImplementation(() => explorersApiClient.getMyProfile());
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/save/i);
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).not.toBeChecked();
  });
  it("keeps Music settings findable by searching Music", async () => {
    await render(<Settings />);
    fireEvent.change(screen.getByPlaceholderText("Search settings..."), { target: { value: "music" } });
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    expect(screen.getByRole("switch", { name: "Music public visibility" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pinned Navigation Tabs/ })).toBeInTheDocument();
  });
  it("supports keyboard and touch removal of hidden saved Music pins but never adds a hidden pin", async () => {
    preference.value = "No"; navigation.pins = ["public_profile", "public_music"];
    const user = userEvent.setup();
    await render(<Settings />);
    screen.getByRole("button", { name: /Pinned Navigation Tabs/ }).focus();
    await user.keyboard("{Enter}");
    const pin = screen.getByRole("checkbox", { name: "Pin Music Tab" });
    pin.focus(); await user.keyboard("[Space]");
    await waitFor(() => expect(pin).not.toBeChecked());
    expect(pin).toBeDisabled();
    await user.pointer([{ keys: "[TouchA>]", target: pin }, { keys: "[/TouchA]" }]);
    expect(pin).not.toBeChecked();
    expect(navigation.mutate).toHaveBeenCalledTimes(1);
    expect(lastWrittenPins()).toEqual(["public_profile"]);
  });
  it("switches translated Music labels live with English fallback, RTL direction and narrow wrapping", async () => {
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    await screen.findByText("Music is public.");
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    await act(async () => { await translations.changeLanguage("ar"); });
    const visibility = screen.getByRole("switch", { name: "ظهور الموسيقى" });
    expect(visibility.closest("[dir]")).toHaveAttribute("dir", "rtl");
    expect(visibility.closest("[dir]")).toHaveClass("min-w-0", "break-words");
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pinned Navigation Tabs" })).toBeInTheDocument();
    await act(async () => { await translations.changeLanguage("en"); });
    expect(screen.getByRole("switch", { name: "Music public visibility" })).toBeInTheDocument();
  });
  it("uses shared auto ranking and does not assume preference means publication", async () => {
    navigation.auto = true;
    let resolve!: (value: unknown) => void;
    let discoveryCompleted = false;
    navigation.discover.mockImplementationOnce(() => new Promise(done => { resolve = value => { discoveryCompleted = true; done(value); }; }));
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole("checkbox", { name: "Pin Music Tab" });
    expect(pin).not.toBeChecked(); expect(pin).toBeDisabled();
    expect(navigation.discover).toHaveBeenCalled();
    expect(discoveryCompleted).toBe(false);
    await act(async () => resolve({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "test-slug", revision: 1 } }));
    expect(discoveryCompleted).toBe(true);
    expect(pin).toBeChecked();
    expect(screen.getByText(/Available Music comes first/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Pin Apps & Tools Tab" })).not.toBeChecked();
    expect(navigation.mutate).not.toHaveBeenCalled();
  });
  it("does not carry optimistic or confirmed pins across account switches or apply an old account completion", async () => {
    let rejectOld!: (value: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const view = await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    navigation.accountId = SECOND_ACCOUNT;
    loginSurface("u1", SECOND_ACCOUNT);
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    fireEvent.click(screen.getByRole("tab", { name: "Account" }));
    await view.rerender(<Settings />);
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(2));
    await act(async () => rejectOld(new Error("old save failed")));
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("opens and focuses public navigation after account data arrives through the hash link", async () => {
    window.history.replaceState(null, "", "/settings#public-navigation");
    let deliverAccount!: () => void;
    const deferProfile = new Promise<void>(resolve => { deliverAccount = resolve; });
    // The account now arrives from the canonical profile read, so that is what is withheld.
    const view = await render(<Settings />, { deferProfile });
    expect(screen.queryByRole("checkbox", { name: "Pin Music Tab" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pinned Navigation Tabs" })).not.toHaveFocus();
    await act(async () => { deliverAccount(); await deferProfile; });
    await view.settle();
    const heading = await screen.findByRole("heading", { name: "Pinned Navigation Tabs" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeInTheDocument();
  });
  it("shows canonical Music availability and lets owners pin without changing publication", async () => {
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    await screen.findByText("Music is public.");
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(lastWrittenPins()).toEqual(["public_profile", "public_music"]));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeChecked());
    expect(navigation.mutate).toHaveBeenCalledTimes(1);
  });
  it("rejects a sixth saved slot without mutation or silently evicting another pin", async () => {
    navigation.pins = ["public_profile", "public_recommendations", "public_guides", "public_books", "public_apps"];
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/5/);
    expect(navigation.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).not.toBeChecked();
  });
  it("keeps saved Music pins manageable during an outage and restores the confirmed pin after save failure", async () => {
    navigation.pins = ["public_profile", "public_music"];
    navigation.discover.mockRejectedValue(new Error("offline"));
    navigation.mutate.mockRejectedValue(new Error("save unavailable"));
    await render(<Settings />);
    await waitFor(() => expect(navigation.discover).toHaveBeenCalled());
    await expect(navigation.discover.mock.results[0].value).rejects.toThrow("offline");
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole("checkbox", { name: "Pin Music Tab" });
    expect(pin).toBeChecked(); expect(pin).toBeEnabled();
    fireEvent.click(pin);
    await waitFor(() => expect(pin).toBeChecked());
    expect(await screen.findByRole("alert")).toHaveTextContent(/save/i);
  });
  it("serializes whole-array saves", async () => {
    // The "ignores older query data after confirmation" clause went with the Apollo
    // account path (see the rollback case above); serialization is what stays observable.
    let finish!: (value: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    expect(screen.getByRole("checkbox", { name: "Pin Places Tab" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Places Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    await act(async () => finish(undefined));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Pin Places Tab" })).toBeEnabled();
    expect(navigation.mutate).toHaveBeenCalledTimes(1);
  });
  it("keeps saved pins and confirmed publication during an outage without requiring recommendation lists", async () => {
    navigation.pins = ["public_profile", "public_music"];
    vi.mocked(musicWorkspaceClient.setPublication).mockRejectedValue(new Error("offline"));
    const view = await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const visibility = screen.getByRole("switch", { name: "Music public visibility" });
    await waitFor(() => expect(visibility).toBeChecked());
    fireEvent.click(visibility);
    expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/i);
    expect(visibility).toBeChecked();
    expect(view.saved.pinned_nav_tabs).toEqual(["public_profile", "public_music"]);
    expect(navigation.mutate).not.toHaveBeenCalled();
  });
  it.each([["Yes", true], ["No", false], [undefined, false]])("combines saved Music preference %s with verified backend publication", async (saved, checked) => {
    preference.value = saved as string | undefined;
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Public Visibility/i }));
    const visibility = screen.getByRole("switch", { name: "Music public visibility" });
    await waitFor(() => expect(visibility).toBeEnabled());
    expect(visibility).toHaveAttribute("aria-checked", String(checked));
    if (checked) expect(screen.getByText("Music is public.")).toBeInTheDocument();
    else expect(screen.getByRole("button", { name: "Make private" })).toBeEnabled();
    expect(screen.queryByText(/does not confirm Music is published or available/)).not.toBeInTheDocument();
  });
  it("renders account settings when Music configuration is invalid", async () => {
    vi.stubEnv("VITE_LOCAL_TUNES_API_URL", "http://localhost:5000");
    try {
      await render(<Settings />);
      expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
      expect(screen.getByText("Pinned Navigation Tabs")).toBeInTheDocument();
    } finally { vi.unstubAllEnvs(); }
  });
  it("places private identity in Account and billing address in Billing", async () => {
    await render(<Settings />);

    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moved-account")).toBeInTheDocument();
    expect(screen.queryByTestId("moved-billing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));

    expect(screen.getByRole("tab", { name: "Billing" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("moved-billing")).toBeInTheDocument();
    expect(screen.queryByTestId("moved-account")).not.toBeInTheDocument();
  });
});

it.each([/Public Visibility/i, /Language Preference/i])("ignores detached panel delayed scrolling for %s", async (panel) => {
  const view = await render(<Settings />);
  const pending: Array<() => void> = [];
  const originalTimeout = window.setTimeout.bind(window);
  const timer = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 100 && typeof handler === "function") {
      pending.push(() => handler(...args));
      return 0;
    }
    return originalTimeout(handler, delay, ...args);
  }) as typeof window.setTimeout);
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: 2000, left: 0, right: 300, height: 2000, width: 300, x: 0, y: 0, toJSON: () => ({}) });
  try {
    fireEvent.click(screen.getByRole("button", { name: panel }));
    expect(pending).toHaveLength(1);
    view.unmount();
    act(() => { pending.forEach(callback => callback()); });
    expect(scrollBy).not.toHaveBeenCalled();
  } finally { timer.mockRestore(); scrollBy.mockRestore(); rect.mockRestore(); }
});
