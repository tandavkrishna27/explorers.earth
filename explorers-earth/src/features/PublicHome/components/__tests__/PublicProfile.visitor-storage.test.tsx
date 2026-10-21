import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ANL-01: the owner approved anonymous, cookie-less, storage-less counting on public pages.
// A visitor's page load (auth bootstrap, render, the anonymous view event) must leave
// localStorage, sessionStorage and cookies exactly as empty as it found them.

const { state } = vi.hoisted(() => ({ state: { account: null as Record<string, any> | null } }));

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: () => ({ data: undefined, loading: false }) };
});

vi.mock("../../api/usePublicProfileShell", () => ({
  usePublicProfileShell: () => ({
    data: state.account,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));



vi.mock("../../../../hooks/useQRActions", () => ({
  useQRActions: vi.fn(),
}));

vi.mock("../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({
    isOpen: false,
    currentIndex: 0,
    openViewer: vi.fn(),
    closeViewer: vi.fn(),
  }),
}));

vi.mock("../../../../components/SEO", () => ({
  default: (props: Record<string, any>) => {
    void props;
    return null;
  },
}));
vi.mock("../../../../components/ui/QRModal", () => ({ default: () => null }));
vi.mock("../../../../components/ui/MediaViewer", () => ({
  default: (props: Record<string, any>) => {
    return null;
  },
}));
vi.mock("../../../../components/ui/FeedLayout", () => ({
  default: () => <div data-testid="gallery-feed" />,
}));
vi.mock("../PublicProfileFooter", () => ({ default: () => null }));
vi.mock("../ProfileRecommendationsTab", () => ({
  default: (props: Record<string, any>) => {
    return (
      <div
        data-testid="recommendations-content"
        data-layout={props.presentation?.layout}
        data-preferred={props.preferredCategory || ""}
      />
    );
  },
}));


import PublicProfile from "../PublicProfile";
import useAuthStore from "../../../../store/store";

const clearCookies = () => {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
};

describe("public page as a signed-out visitor", () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCookies();
    vi.stubGlobal("fetch", fetchMock);
    // A handle only: the public shell carries no account id (SEC-03).
    state.account = { username: "alice", Account_Name: "Alice", Bio: "", Feed_Data: [],
      public_recommendations: "Yes", public_movie: "No", public_books: "No", public_games: "No",
      public_guides: "No", public_apps: "No", public_products: "No", public_people: "No",
      social_media: { theme_settings: {} } };
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); fetchMock.mockClear(); });

  it("writes no localStorage, sessionStorage or cookies on load", async () => {
    const localWrites = vi.spyOn(localStorage, "setItem"), sessionWrites = vi.spyOn(sessionStorage, "setItem");
    const auth = useAuthStore.getState();
    auth.verificationFailed(auth.beginVerification(), "signed-out");
    const router = createMemoryRouter([{ path: "/:username", element: <PublicProfile /> }], { initialEntries: ["/alice"] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("tablist", { name: "Profile sections" })).toBeInTheDocument();
    // The anonymous view event went out, naming the creator by handle.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ basis: "anonymous-v1", accountId: "alice" });
    expect(localWrites).not.toHaveBeenCalled();
    expect(sessionWrites).not.toHaveBeenCalled();
    expect(localStorage.getItem("auth-storage")).toBeNull();
    expect(document.cookie).toBe("");
  });

  it("persists the auth record only while signed in and removes it on sign-out", () => {
    useAuthStore.getState().login({ id: 1, documentId: "acct", username: "owner", email: "o@example.test", blocked: false, token: "t" } as never);
    expect(localStorage.getItem("auth-storage")).not.toBeNull();
    useAuthStore.getState().logout();
    expect(localStorage.getItem("auth-storage")).toBeNull();
  });
});
