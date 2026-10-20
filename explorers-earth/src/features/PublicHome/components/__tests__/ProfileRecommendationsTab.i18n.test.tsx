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

vi.mock("../../api/usePublicRecommendationCategory", () => ({
  usePublicRecommendationCategory: (_username: string, category: string, enabled: boolean) => {
    const operationByCategory: Record<string, string> = {
      places: "GetPlacesLists", movies: "GetMoviesLists", books: "GetBooksLists", games: "GetGamesLists",
      apps: "GetAppsLists", products: "GetProductsLists", people: "GetPeopleLists", guides: "GetGuidesLists",
    };
    const operation = operationByCategory[category];
    apolloCalls.push({ operation, options: { skip: !enabled }, source: "gateway" });
    return apolloResults.get(operation) || {
      data: undefined,
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: (options: any) => ({ ...musicResult, queryOptions: options }),
  };
});

import i18n from "../../../../i18n/index.js";
import es from "../../../../i18n/resources/es.json";
import ar from "../../../../i18n/resources/ar.json";
import ProfileRecommendationsTab from "../ProfileRecommendationsTab";

const list = (id: string, n: number) => ({
  documentId: id,
  List_Name: `List ${id}`,
  slug: id,
  Visibility: true,
  recommendationCount: [],
  recommended_places: Array.from({ length: n }, (_, i) => ({ documentId: `${id}-${i}` })),
});

const account = {
  documentId: "account-1",
  public_recommendations: "Yes",
  public_books: "No",
  public_music: "No",
  public_movie: "No",
  public_games: "No",
  public_guides: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
};

const renderTab = () =>
  render(
    <MemoryRouter>
      <ProfileRecommendationsTab accountData={account} username="alice" />
    </MemoryRouter>,
  );

describe("ProfileRecommendationsTab localisation (I18N-X01)", () => {
  beforeEach(() => {
    apolloCalls.length = 0;
    apolloResults.clear();
    musicResult.data = undefined;
    apolloResults.set("GetPlacesLists", {
      data: { recommendationLists: [list("one", 1), list("two", 2)] },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("renders the category label and pluralised counts in Spanish", async () => {
    i18n.addResourceBundle("es", "translation", es, true, true);
    await i18n.changeLanguage("es");
    renderTab();
    expect(screen.getByRole("region", { name: "Recomendaciones" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((n) => n.textContent)).toContain("Lugares");
    expect(screen.getAllByText("1 lugar").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 lugares").length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bplaces?\b/i)).toBeNull();
  });

  it("uses the Arabic plural categories (one, two)", async () => {
    i18n.addResourceBundle("ar", "translation", ar, true, true);
    await i18n.changeLanguage("ar");
    renderTab();
    expect(screen.getAllByText("مكان واحد").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مكانان").length).toBeGreaterThan(0);
  });
});
