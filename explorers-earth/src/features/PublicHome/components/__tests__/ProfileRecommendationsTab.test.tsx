import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apolloCalls, apolloResults, musicResult } = vi.hoisted(() => ({
  apolloCalls: [] as { operation: string; options: any; source: string }[],
  apolloResults: new Map<string, any>(),
  musicResult: {
    data: undefined as any,
    isLoading: false,
    isFetching: false,
    isRefetchError: false,
    error: null as unknown,
    refetch: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useQuery: (document: any, options: any) => {
      const operation = document.definitions.find(
        (definition: any) => definition.kind === "OperationDefinition",
      )?.name?.value;
      apolloCalls.push({
        operation,
        options,
        source: document.loc?.source?.body || "",
      });
      return (
        apolloResults.get(operation) || {
          data: undefined,
          loading: false,
          error: null,
          refetch: vi.fn().mockResolvedValue(undefined),
        }
      );
    },
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (options: any) => ({ ...musicResult, queryOptions: options }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: any) =>
      typeof options === "string"
        ? options
        : options?.defaultValue || _key,
  }),
}));

import ProfileRecommendationsTab from "../ProfileRecommendationsTab";

const retryPlaces = vi.fn().mockResolvedValue(undefined);
const retryBooks = vi.fn().mockResolvedValue(undefined);

const placesData = {
  recommendationLists: [
    {
      documentId: "places-1",
      List_Name: "Local places",
      slug: "local-places",
      Visibility: true,
      recommendationCount: [{ documentId: "p1" }],
      recommended_places: [],
    },
  ],
};

const booksData = {
  bookLists: [
    {
      documentId: "books-1",
      List_Name: "Reading list",
      slug: "reading-list",
      visibility: true,
      recommendationCount: [{ documentId: "b1" }],
      recommended_books: [],
    },
  ],
};

const visibleAccount = {
  documentId: "account-1",
  public_recommendations: "Yes",
  public_books: "Yes",
  public_music: "No",
  public_movie: "No",
  public_games: "No",
  public_guides: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
};

const renderTab = (props: Record<string, unknown> = {}) =>
  render(
    <MemoryRouter>
      <ProfileRecommendationsTab
        accountData={visibleAccount}
        username="alice"
        {...props}
      />
    </MemoryRouter>,
  );

describe("ProfileRecommendationsTab", () => {
  beforeEach(() => {
    apolloCalls.length = 0;
    apolloResults.clear();
    retryPlaces.mockReset().mockResolvedValue(undefined);
    retryBooks.mockReset().mockResolvedValue(undefined);
    musicResult.data = undefined;
    musicResult.isLoading = false;
    musicResult.isFetching = false;
    musicResult.isRefetchError = false;
    musicResult.error = null;
    musicResult.refetch.mockReset().mockResolvedValue(undefined);
    apolloResults.set("GetPlacesLists", {
      data: placesData,
      loading: false,
      error: null,
      refetch: retryPlaces,
    });
    apolloResults.set("GetBooksLists", {
      data: booksData,
      loading: false,
      error: null,
      refetch: retryBooks,
    });
  });

  it("applies the saved layout and exact category order", () => {
    renderTab({
      presentation: { layout: "grid", categoryOrder: ["books", "places"] },
    });

    const root = screen.getByTestId("recommendations-grid");
    expect(
      within(root)
        .getAllByRole("heading", { level: 2 })
        .map((node) => node.textContent),
    ).toEqual(["Books", "Places"]);
  });

  it("promotes the preferred category without hiding its peers", () => {
    renderTab({
      presentation: { layout: "grid", categoryOrder: ["books", "places"] },
      preferredCategory: "places",
    });

    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((node) => node.textContent),
    ).toEqual(["Places", "Books"]);
  });

  it("renders a ready later category while an earlier category loads", () => {
    apolloResults.set("GetPlacesLists", {
      data: undefined,
      loading: true,
      error: null,
      refetch: retryPlaces,
    });
    renderTab({
      presentation: { layout: "grid", categoryOrder: ["places", "books"] },
    });

    expect(screen.getByRole("region", { name: "Recommendations" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByLabelText("Loading Places")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Books" })).toBeVisible();
  });

  it("keeps partial Apollo content visible with one nonblocking error notice", () => {
    apolloResults.set("GetPlacesLists", {
      data: placesData,
      loading: false,
      error: new Error("partial"),
      refetch: retryPlaces,
    });
    renderTab({ presentation: { layout: "shelves" } });

    expect(screen.getByRole("link", { name: "Open Places" })).toBeVisible();
    expect(screen.getByText("Some categories are unavailable")).toBeVisible();
    expect(screen.queryByText("No public recommendations yet")).toBeNull();
  });

  it("shows recovery when all content fails and retries only failed queries once", async () => {
    apolloResults.set("GetPlacesLists", {
      data: undefined,
      loading: false,
      error: new Error("places failed"),
      refetch: retryPlaces,
    });
    apolloResults.set("GetBooksLists", {
      data: undefined,
      loading: false,
      error: new Error("books failed"),
      refetch: retryBooks,
    });
    renderTab();

    expect(screen.getByText("Couldn’t load recommendations")).toBeVisible();
    const retry = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    fireEvent.click(retry);

    await vi.waitFor(() => expect(retryPlaces).toHaveBeenCalledTimes(1));
    expect(retryBooks).toHaveBeenCalledTimes(1);
  });

  it("does not call a failed empty state a true empty state", () => {
    apolloResults.set("GetPlacesLists", {
      data: { recommendationLists: [] },
      loading: false,
      error: null,
      refetch: retryPlaces,
    });
    apolloResults.set("GetBooksLists", {
      data: undefined,
      loading: false,
      error: new Error("books failed"),
      refetch: retryBooks,
    });
    renderTab();

    expect(screen.getByText("Couldn’t load recommendations")).toBeVisible();
    expect(screen.queryByText("No public recommendations yet")).toBeNull();
  });

  it("shows true empty copy only after successful empty results", () => {
    apolloResults.set("GetPlacesLists", {
      data: { recommendationLists: [] },
      loading: false,
      error: null,
      refetch: retryPlaces,
    });
    apolloResults.set("GetBooksLists", {
      data: { bookLists: [] },
      loading: false,
      error: null,
      refetch: retryBooks,
    });
    renderTab();

    expect(screen.getByText("No public recommendations yet")).toBeVisible();
    expect(screen.queryByText(/hasn't enabled/i)).toBeNull();
  });

  it("treats a missing account id as recoverable without issuing requests", () => {
    renderTab({ accountData: { ...visibleAccount, documentId: undefined } });

    expect(screen.getByText("Couldn’t load recommendations")).toBeVisible();
    expect(
      apolloCalls
        .filter(({ operation }) =>
          ["GetPlacesLists", "GetBooksLists"].includes(operation),
        )
        .every(({ options }) => options.skip === true),
    ).toBe(true);
  });

  it("keeps cached Music visible during a refetch error", () => {
    musicResult.data = {
      playlists: [
        {
          id: 7,
          name: "Road songs",
          isVisibleToGuests: true,
          songs: [{ thumbnailUrl: "/song.jpg" }],
        },
      ],
    };
    musicResult.isRefetchError = true;
    musicResult.error = new Error("music refresh failed");
    renderTab({
      accountData: {
        ...visibleAccount,
        public_recommendations: "No",
        public_books: "No",
        public_music: "Yes",
        localtunes_public: "https://localtunes.example/guest/abc",
      },
      presentation: { layout: "grid", categoryOrder: ["music"] },
    });

    expect(screen.getByRole("link", { name: "Open Music" })).toBeVisible();
    expect(screen.getByText("Some categories are unavailable")).toBeVisible();
  });

  it("uses shelves defaults and skips every disabled category request", () => {
    renderTab({
      accountData: {
        ...visibleAccount,
        public_recommendations: "No",
        public_books: "No",
      },
    });

    expect(screen.queryByTestId("recommendations-grid")).toBeNull();
    expect(apolloCalls.every(({ options }) => options.skip === true)).toBe(true);
  });

  it("bounds public-profile list previews without downloading duplicate count relations", () => {
    renderTab({
      accountData: {
        ...visibleAccount,
        public_movie: "Yes",
        public_games: "Yes",
        public_apps: "Yes",
        public_products: "Yes",
        public_people: "Yes",
      },
    });

    const sources = apolloCalls.map(({ source }) => source).join("\n");
    expect(sources).not.toContain("recommendationCount:");
    expect(sources).not.toMatch(
      /recommended_(?:places|movies|books|games|apps|products|people)\(pagination:\s*\{\s*limit:\s*(?:[5-9]|\d{2,})/,
    );
  });
});
