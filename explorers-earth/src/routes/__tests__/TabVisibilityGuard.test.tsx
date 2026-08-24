import { render, screen } from "@testing-library/react";
import { useQuery } from "@apollo/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import TabVisibilityGuard from "../validators/TabVisibilityGuard";

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => "div" }),
}));

const mockUseQuery = vi.mocked(useQuery);

const LocationWitness = () => {
  const location = useLocation();
  return (
    <output aria-label="current path">
      {location.pathname}{location.search}{location.hash}
    </output>
  );
};

const renderBooksRoute = (initialEntry = "/tk2727/books") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/:username/books"
          element={
            <TabVisibilityGuard tabField="public_books">
              <div>Books category</div>
            </TabVisibilityGuard>
          }
        />
        <Route
          path="/:username"
          element={
            <>
              <div>Profile root</div>
              <LocationWitness />
            </>
          }
        />
        <Route
          path="/:username/games"
          element={
            <>
              <div>Games category</div>
              <LocationWitness />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe("TabVisibilityGuard", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("renders an explicitly visible category", () => {
    mockUseQuery.mockReturnValue({
      data: { accounts: [{ public_books: "Yes" }] },
      loading: false,
    } as ReturnType<typeof useQuery>);

    renderBooksRoute();

    expect(screen.getByText("Books category")).toBeInTheDocument();
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
});
