/* eslint-disable @typescript-eslint/no-explicit-any -- captured template props */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import { englishI18n } from "../../test/englishI18n";

const captured: Record<string, any>[] = [];
vi.mock("../../features/shared/category/CategoryPage", () => ({ default: (props: Record<string, any>) => { captured.push(props); return <div data-testid="category-page" />; } }));
vi.mock("../../features/navigation/CategoryNavigationProvider", () => ({ useCategoryNavigation: () => ({ snapshot: { visibility: { public_recommendations: "No" } }, authority: "origin", busy: false, request: vi.fn() }) }));
vi.mock("../../features/Favorites/hooks/usePlacesOwner", () => ({ usePlacesOwner: () => ({ loading: false, refetch: vi.fn(), content: undefined, data: { recommendationLists: [
  { documentId: "c1", List_Name: "Goa food", Visibility: true, is_pinned: true, pin_order: 0, account: { documentId: "acc" }, List_Name_Details: { thumbnail: "/t.jpg" }, recommended_places: [{ documentId: "r1" }] },
  { documentId: "c2", List_Name: "Goa beaches", Visibility: false, is_pinned: false, account: { documentId: "acc" }, List_Name_Details: {}, recommended_places: [] },
] } }) }));
vi.mock("../../features/Favorites/api/placesCommands", () => ({ usePlacesCommands: () => ({ importPlacePhoto: vi.fn() }) }));
vi.mock("../../features/Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({ data: { id: "acc", handle: "fixture", onboardingStatus: "complete" } }) }));
vi.mock("../../hooks/useRecommendationsWalkthrough", () => ({ useRecommendationsWalkthrough: () => ({ steps: [], run: false, stepIndex: 0, setRun: vi.fn(), setStepIndex: vi.fn(), handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn(), markProcessingComplete: vi.fn(), isWalkthroughComplete: true }) }));
vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-joyride", () => ({ default: () => null }));
vi.mock("../../features/Favorites/components/Recommendations", () => ({ default: () => null }));
vi.mock("../../store/store", () => {
  const state = { accountId: "acc", generation: 1, user: { username: "fixture" } };
  const hook = (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state);
  hook.getState = () => state;
  return { default: hook };
});

describe("Favorites category view", () => {
  it("renders Places through the shared template in list-pin mode with the New list popup", async () => {
    const { default: Favorites } = await import("../Favorites");
    render(<I18nextProvider i18n={englishI18n}><MemoryRouter initialEntries={["/recommendations"]}><Favorites /></MemoryRouter></I18nextProvider>);
    expect(screen.getByTestId("category-page")).toBeInTheDocument();
    const props = captured[captured.length - 1];
    expect(props.category).toBe("places");
    expect(props.lists.map((l: { id: string; title: string }) => l.title)).toEqual(["Goa food", "Goa beaches"]);
    expect(props.lists[0]).toMatchObject({ status: "public", itemCount: 1, covers: ["/t.jpg"] });
    expect(props.topPicks.map((p: { id: string }) => p.id)).toEqual(["c1"]);
    expect(props.newList.kind).toBe("dialog");
    expect(typeof props.newList.create).toBe("function");
  });

  it("opens a newly created list on the shared list page route, like every other category (UAT A)", async () => {
    const { default: Favorites } = await import("../Favorites");
    render(<I18nextProvider i18n={englishI18n}><MemoryRouter initialEntries={["/recommendations/places"]}><Routes>
      <Route path="/recommendations/places" element={<Favorites />} />
      <Route path="/recommendations/places/:listId" element={<div data-testid="shared-list-page" />} />
    </Routes></MemoryRouter></I18nextProvider>);
    act(() => { captured[captured.length - 1].newList.onCreated("new-list"); });
    expect(screen.getByTestId("shared-list-page")).toBeInTheDocument();
  });
});
