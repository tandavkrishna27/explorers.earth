import { render, screen, waitFor } from "@testing-library/react";
import { useQuery } from "@apollo/client";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  PublicColdEntryBoundary,
  usePublicColdEntry,
} from "../../layouts/PublicColdEntryBoundary";
import TabVisibilityGuard from "../validators/TabVisibilityGuard";
import { publishPublicProfileInvalidation } from "../../features/PublicHome/api/publicProfileInvalidation";

const usePublicAccountIdentity = vi.hoisted(() => vi.fn());

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => "div" }),
}));
vi.mock("../../features/music/PublicMusicAvailabilityProvider", () => ({ usePublicAccountIdentity }));

const mockUseQuery = vi.mocked(useQuery);

const LocationWitness = () => {
  const location = useLocation();
  return (
    <output aria-label="current path">
      {location.pathname}{location.search}{location.hash}
    </output>
  );
};

const SettledPublicRouteFrame = () => {
  const coldEntry = usePublicColdEntry();

  useEffect(() => {
    coldEntry.reportValidation("valid");
    coldEntry.reportIdentity("ready");
    coldEntry.reportRouteReady(true);
  }, [
    coldEntry.reportIdentity,
    coldEntry.reportRouteReady,
    coldEntry.reportValidation,
  ]);

  return <Outlet />;
};

const renderBooksRoute = (initialEntry = "/tk2727/books") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/:username/*"
          element={
            <PublicColdEntryBoundary>
              <SettledPublicRouteFrame />
            </PublicColdEntryBoundary>
          }
        >
          <Route
            path="books"
            element={
              <TabVisibilityGuard tabField="public_books">
                <div>Books category</div>
              </TabVisibilityGuard>
            }
          />
          <Route
            index
            element={
              <>
                <div>Profile root</div>
                <LocationWitness />
              </>
            }
          />
          <Route
            path="games"
            element={
              <>
                <div>Games category</div>
                <LocationWitness />
              </>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("TabVisibilityGuard", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    usePublicAccountIdentity.mockReset();
    usePublicAccountIdentity.mockImplementation(() => {
      const result = mockUseQuery();
      const account = result.data?.accounts?.[0];
      return { usernameKey: "tk2727", status: account ? "ready" : result.loading ? "loading" : "terminal-error", ...(account ? { account } : {}) };
    });
  });

  it("renders an explicitly visible category inside the settled public shell", async () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [{ public_books: "Yes" }] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(screen.getByText("Books category")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("public-cold-entry-shell")).not.toHaveAttribute("inert"));
    expect(screen.queryByTestId("public-cold-entry-overlay")).not.toBeInTheDocument();
  });

  it("replaces a hidden category with the username root even when another category is visible", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        accounts: [
          {
            public_books: "No",
            public_games: "Yes",
            public_profile: "Yes",
          },
        ],
      },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.getByLabelText("current path")).toHaveTextContent("/tk2727");
    expect(screen.queryByText("Games category")).not.toBeInTheDocument();
  });

  it("treats a missing opt-in visibility field as hidden", async () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [{ public_profile: "Yes" }] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.getByLabelText("current path")).toHaveTextContent("/tk2727");
  });

  it("fails closed when category visibility cannot be loaded", async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: new Error("visibility unavailable"),
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.queryByText("Books category")).not.toBeInTheDocument();
  });

  it("fails closed when the visibility lookup succeeds without an account", async () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.getByLabelText("current path")).toHaveTextContent("/tk2727");
    expect(screen.queryByText("Books category")).not.toBeInTheDocument();
  });

  it("preserves attribution parameters when replacing a hidden category URL", async () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [{ public_books: "No" }] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute(
      "/tk2727/books?utm_source=newsletter&utm_campaign=spring#profile",
    );

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.getByLabelText("current path")).toHaveTextContent(
      "/tk2727?utm_source=newsletter&utm_campaign=spring#profile",
    );
  });

  it("fails closed immediately when the owner confirms this category was unpublished while stale shell data remains", async () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [{ public_books: "Yes" }] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute("/tk2727/books?utm_source=owner#books");
    expect(screen.getByText("Books category")).toBeInTheDocument();

    publishPublicProfileInvalidation({
      accountDocumentId: "account-tk2727",
      username: "tk2727",
      category: "public_books",
      action: "unpublish",
      eventId: "books-unpublished-while-shell-stale",
    });

    expect(await screen.findByText("Profile root")).toBeInTheDocument();
    expect(screen.getByLabelText("current path")).toHaveTextContent(
      "/tk2727?utm_source=owner#books",
    );
  });
});
