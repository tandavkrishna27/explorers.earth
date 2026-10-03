import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { readyMusic } from "../../music/__tests__/musicPublishHarness";
import { musicIdentityCoordinator } from "../../music/musicApi";
import { musicWorkspaceClient } from "../../../hooks/useTunesDashboard";
import { loginSurface, surfaceAccount, surfaceHarness } from "../../navigation/__tests__/surfaceHarness";
import { categoryNavigationAccountQuery } from "../../navigation/categoryNavigationApi";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import english from "../../../i18n/resources/en.json";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../store/store";
vi.mock("../../Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({
  data: { id: navigation.accountId, revision: 1 }, isLoading: false,
}) }));

const preference = vi.hoisted(() => ({ value: "Yes" as string | undefined }));
const translations = createInstance();
const initialAccount = () => surfaceAccount({ documentId: navigation.accountId, pinned_nav_tabs: navigation.pins, auto_pinning: navigation.auto, public_music: preference.value ?? null, public_books: navigation.booksPublic });
async function render(ui: ReactElement, options: { settingsResponse?: Promise<unknown> } = {}) {
  const wrapped = (child: ReactElement) => <I18nextProvider i18n={translations}>{child}</I18nextProvider>;
  const h = surfaceHarness(wrapped(ui), { initial: initialAccount(), respond: (name, variables) => {
    if (name === "SettingsAccount" && options.settingsResponse) return options.settingsResponse;
    if (name !== "UpdateTabVisibility") return undefined;
    return navigation.mutate({ variables }).then((result: any) => {
      const changed = result.data?.updateAccount;
      if (changed?.documentId === h.saved.documentId) h.saved = { ...h.saved, ...changed };
      return { updateAccount: changed ? { ...h.saved, ...changed } : null };
    });
  } });
  await act(async () => { if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0); });
  await h.ready();
  await waitFor(() => expect(musicWorkspaceClient.loadDashboard).toHaveBeenCalled());
  return { ...h, async rerender(next: ReactElement) {
    if (h.saved.documentId !== navigation.accountId) {
      await act(async () => readyMusic("u1", navigation.accountId));
      h.saved = initialAccount();
      await act(async () => h.client.cache.writeQuery({ query: categoryNavigationAccountQuery, variables: { documentId: "u1" },
        data: { usersPermissionsUser: { __typename: "UsersPermissionsUser", documentId: "u1", provider: "google", confirmed: true, blocked: false, accounts: [h.saved] } } }));
    }
    h.rerenderChild(wrapped(next));
    await h.ready();
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
  navigation.auto = false; navigation.accountId = "account-1"; navigation.booksPublic = "Yes";
  navigation.mutate.mockReset().mockImplementation(({ variables }) => Promise.resolve({ data: { updateAccount: { documentId: variables.documentId, ...variables.data } } }));
  navigation.refetch.mockReset().mockResolvedValue({ data: {} });
  navigation.discover.mockReset().mockResolvedValue({ version: "music-public-descriptor/v1", publication: { mode: "public", publicSlug: "test-slug", revision: 1 } });
  sessionStorage.clear();
  musicIdentityCoordinator.reset();
  await readyMusic("u1", "account-1");
  let mode = "public";
  vi.spyOn(musicWorkspaceClient, "loadDashboard").mockImplementation(async () => ({ queueRevision: 0, songs: [], currentlyPlaying: null, playedSongs: [], publication: { mode, publicSlug: "test-slug" } } as never));
  vi.spyOn(musicWorkspaceClient, "setPublication").mockImplementation(async next => { mode = next; return { version: "music-publication/v1", publication: { mode: next, publicSlug: "test-slug" } }; });
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
  it("rolls back to the captured confirmed value even if stale query data arrives during a failed save", async () => {
    let reject!: (reason: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const view = await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    const settingsQuery = [...view.client.getObservableQueries().values()].find(query => query.queryName === "SettingsAccount")!;
    const olderData = settingsQuery.getCurrentResult().data;
    await act(async () => view.client.cache.writeQuery({ query: settingsQuery.options.query, variables: settingsQuery.variables,
      data: { ...olderData, usersPermissionsUser: { ...olderData.usersPermissionsUser,
        accounts: [{ ...olderData.usersPermissionsUser.accounts[0], pinned_nav_tabs: ["public_profile", "public_music"] }] } } }));
    expect(settingsQuery.getCurrentResult().data.usersPermissionsUser.accounts[0].pinned_nav_tabs).toEqual(["public_profile", "public_music"]);
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
    await waitFor(() => expect(navigation.mutate).toHaveBeenLastCalledWith({ variables: { documentId: "account-1", data: { pinned_nav_tabs: ["public_profile", "public_recommendations", "public_guides", "public_apps", "public_music"] } } }));
  });
  it("does not call an empty mutation acknowledgement a confirmed save", async () => {
    navigation.mutate.mockResolvedValue({ data: { updateAccount: null } });
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
    expect(navigation.mutate).toHaveBeenCalledWith({ variables: { documentId: "account-1", data: { pinned_nav_tabs: ["public_profile"] } } });
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
    navigation.accountId = "account-2";
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
    let deliverAccount!: (data: unknown) => void;
    const settingsResponse = new Promise<unknown>(resolve => { deliverAccount = resolve; });
    const view = await render(<Settings />, { settingsResponse });
    const settingsQuery = [...view.client.getObservableQueries().values()].find(query => query.queryName === "SettingsAccount")!;
    expect(view.requests.some(request => request.name === "SettingsAccount")).toBe(true);
    expect(settingsQuery.getCurrentResult().loading).toBe(true);
    expect(screen.queryByRole("checkbox", { name: "Pin Music Tab" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pinned Navigation Tabs" })).not.toHaveFocus();
    await act(async () => deliverAccount({ usersPermissionsUser: { __typename: "UsersPermissionsUser", documentId: "u1", accounts: [{ ...initialAccount(), Addresss: null }] } }));
    await waitFor(() => expect(settingsQuery.getCurrentResult().loading).toBe(false));
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
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledWith({ variables: { documentId: "account-1", data: { pinned_nav_tabs: ["public_profile", "public_music"] } } }));
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
  it("serializes whole-array saves and ignores older query data after confirmation", async () => {
    let finish!: (value: unknown) => void;
    navigation.mutate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = await render(<Settings />);
    fireEvent.click(screen.getByRole("button", { name: /Pinned Navigation Tabs/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Music Tab" }));
    expect(screen.getByRole("checkbox", { name: "Pin Places Tab" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pin Places Tab" }));
    await waitFor(() => expect(navigation.mutate).toHaveBeenCalledTimes(1));
    await act(async () => finish({ data: { updateAccount: { documentId: "account-1", pinned_nav_tabs: ["public_profile", "public_music"] } } }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeChecked());
    const settingsQuery = [...view.client.getObservableQueries().values()].find(query => query.queryName === "SettingsAccount")!;
    const confirmedData = settingsQuery.getCurrentResult().data;
    await act(async () => view.client.cache.writeQuery({ query: settingsQuery.options.query, variables: settingsQuery.variables,
      data: { ...confirmedData, usersPermissionsUser: { ...confirmedData.usersPermissionsUser,
        accounts: [{ ...confirmedData.usersPermissionsUser.accounts[0], pinned_nav_tabs: ["public_profile"] }] } } }));
    expect(settingsQuery.getCurrentResult().data.usersPermissionsUser.accounts[0].pinned_nav_tabs).toEqual(["public_profile"]);
    expect(screen.getByRole("checkbox", { name: "Pin Music Tab" })).toBeChecked();
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
    expect(screen.getByTestId("existing-billing")).toBeInTheDocument();
    expect(screen.queryByTestId("moved-account")).not.toBeInTheDocument();
  });
});
