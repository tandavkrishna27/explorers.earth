// P3-4: the Music product left the SPA; Music-only cases were removed and the generic pin cases now use Books/Games.
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
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

const SECOND_ACCOUNT = "22222222-2222-4222-8222-222222222222";
// writtenPins reads the canonical categories payload as a pin order, so these
// assertions stay legible while checking what the client actually sends.
const lastWrittenPins = () => writtenPins(navigation.mutate.mock.lastCall![0]);
const translations = createInstance();
const initialAccount = () => surfaceAccount({ documentId: navigation.accountId, pinned_nav_tabs: navigation.pins, auto_pinning: navigation.auto, public_books: navigation.booksPublic });
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
  const settle = async () => { await h.ready(); };
  // A deferred profile read is the point of those cases, so they settle themselves.
  if (!options.deferProfile) await settle();
  return { ...h, settle, async rerender(next: ReactElement) {
    if (h.saved.documentId !== navigation.accountId) h.saved = initialAccount();
    h.rerenderChild(wrapped(next));
    await h.ready();
    // Switching accounts resets the panel to collapsed, so reopen it before looking for
    // the pin; a new account inheriting the previous one's open panel would be the bug.
    if (!screen.queryByRole("checkbox", { name: "Pin Books Tab" })) {
      fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    }
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeEnabled());
  } };
}
const navigation = vi.hoisted(() => ({
  pins: ["public_profile"] as string[], auto: false, accountId: "account-1", booksPublic: "Yes",
  mutate: vi.fn(), refetch: vi.fn(),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); useAuthStore.getState().logout(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: () => ({ data: [] }) };
});

beforeEach(async () => {
  await translations.init({ lng: "en", fallbackLng: "en", resources: { en: { translation: english } }, interpolation: { escapeValue: false } });
  navigation.pins = ["public_profile"];
  navigation.auto = false; navigation.booksPublic = "Yes";
  // Must match the account loginSurface() signs in as, so the canonical store and the
  // harness agree on which account every write belongs to.
  navigation.accountId = canonicalAccountFixture().id;
  navigation.mutate.mockReset().mockResolvedValue(undefined);
  navigation.refetch.mockReset().mockResolvedValue({ data: {} });
  sessionStorage.clear();
  loginSurface();
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
vi.mock("../components/BillingTab", () => ({
  default: () => <div data-testid="existing-billing">Existing billing</div>,
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
  it("provides visible keyboard focus on a pin's visible switch", async () => {
    const user = userEvent.setup(); await render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole("checkbox", { name: "Pin Books Tab" });
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
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeDisabled();
    await act(async () => reject(new Error("save failed")));
    expect(await screen.findByRole("alert")).toHaveTextContent(/save/i);
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeEnabled();
  });
  it("lets the owner explicitly free a hidden saved slot before pinning Games", async () => {
    // Books is private but still occupies a saved slot; unpinning it frees room for Games.
    navigation.booksPublic = "No";
    navigation.pins = ["public_profile", "public_recommendations", "public_guides", "public_books", "public_apps"];
    const user = userEvent.setup(); await render(<Settings />);
    await user.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const books = screen.getByRole("checkbox", { name: "Pin Books Tab" });
    expect(books).toBeEnabled();
    await user.click(books);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Games Tab" })).toBeEnabled());
    await user.click(screen.getByRole("checkbox", { name: "Pin Games Tab" }));
    await waitFor(() => expect(lastWrittenPins()).toEqual(["public_profile", "public_recommendations", "public_guides", "public_apps", "public_games"]));
  });
  it("does not call an empty mutation acknowledgement a confirmed save", async () => {
    // Canonically, an empty acknowledgement is a response that never advanced the
    // revision — the client must not treat it as a confirmed save.
    navigation.mutate.mockImplementation(() => explorersApiClient.getMyProfile());
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/save/i);
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).not.toBeChecked();
  });
  it("lets owners pin a public category with one whole-array write", async () => {
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    await waitFor(() => expect(lastWrittenPins()).toEqual(["public_profile", "public_books"]));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeChecked());
    expect(navigation.mutate).toHaveBeenCalledTimes(1);
  });
  it("uses shared auto ranking without writing pins", async () => {
    // With no list counts, auto mode falls back to NAV_TAB_ORDER: Places, Guides,
    // Movies & Shows, Books fill the four slots after Profile; Apps & Tools does not fit.
    navigation.auto = true;
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    const pin = screen.getByRole("checkbox", { name: "Pin Books Tab" });
    expect(pin).toBeChecked(); expect(pin).toBeDisabled();
    expect(screen.getByText(/Categories with the most lists come first/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Pin Apps & Tools Tab" })).not.toBeChecked();
    expect(navigation.mutate).not.toHaveBeenCalled();
  });
  it("does not carry optimistic or confirmed pins across account switches or apply an old account completion", async () => {
    let rejectOld!: (value: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject; }));
    const view = await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    navigation.accountId = SECOND_ACCOUNT;
    loginSurface("u1", SECOND_ACCOUNT);
    fireEvent.click(screen.getByRole("tab", { name: "Billing" }));
    fireEvent.click(screen.getByRole("tab", { name: "Account" }));
    await view.rerender(<Settings />);
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeEnabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(2));
    await act(async () => rejectOld(new Error("old save failed")));
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("opens and focuses public navigation after account data arrives through the hash link", async () => {
    window.history.replaceState(null, "", "/settings#public-navigation");
    let deliverAccount!: () => void;
    const deferProfile = new Promise<void>(resolve => { deliverAccount = resolve; });
    // The account now arrives from the canonical profile read, so that is what is withheld.
    const view = await render(<Settings />, { deferProfile });
    expect(screen.queryByRole("checkbox", { name: "Pin Books Tab" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pinned Navigation Tabs" })).not.toHaveFocus();
    await act(async () => { deliverAccount(); await deferProfile; });
    await view.settle();
    const heading = await screen.findByRole("heading", { name: "Pinned Navigation Tabs" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeInTheDocument();
  });
  it("rejects a sixth saved slot without mutation or silently evicting another pin", async () => {
    navigation.pins = ["public_profile", "public_recommendations", "public_guides", "public_books", "public_apps"];
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Games Tab" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/5/);
    expect(navigation.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "Pin Games Tab" })).not.toBeChecked();
  });
  it("serializes whole-array saves", async () => {
    // The "ignores older query data after confirmation" clause went with the Apollo
    // account path (see the rollback case above); serialization is what stays observable.
    let finish!: (value: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Books Tab" }));
    expect(screen.getByRole("checkbox", { name: "Pin Places Tab" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Places Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    await act(async () => finish(undefined));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Books Tab" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Pin Places Tab" })).toBeEnabled();
    expect(navigation.mutate).toHaveBeenCalledTimes(1);
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
    expect(screen.getByTestId("existing-billing")).toBeInTheDocument();
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
