import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// The script reports loaded while the marker library is missing, which is how a rejected
// key looks. Mounting the live map then throws, so both public map pages must fall back.
vi.mock("@vis.gl/react-google-maps", () => ({
  useApiIsLoaded: () => true,
  useMap: () => null,
  Map: () => {
    throw new Error("live map mounted");
  },
  AdvancedMarker: () => {
    throw new Error("live marker mounted");
  },
  Pin: () => null,
}));
vi.mock("../../../../components/GoogleMapsProvider", () => ({
  withGoogleMapsProvider: (component: unknown) => component,
}));
vi.mock("../../api/usePublicRecommendationCategory", () => ({
  usePublicRecommendationCategory: () => ({
    data: { recommendationLists: [] },
    loading: false,
    error: undefined,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../api/usePublicProfileShell", () => ({
  usePublicProfileShell: () => ({ data: {}, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../../../services/analyticsService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../services/analyticsService")>()),
  useTrackAnalytics: vi.fn(),
}));

describe("public map pages when Maps is unusable", () => {
  it.each([
    ["PlaceMapView", () => import("../PlaceMapView")],
    ["MapView", () => import("../MapView")],
    ["GuideMapView", () => import("../PublicGuideViews/GuideMapView")],
  ])("%s shows the Map Unavailable fallback", async (_name, load) => {
    const Component = (await load()).default as React.ComponentType;
    render(
      <MemoryRouter>
        <Component />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Map Unavailable")).toBeTruthy();
  });
});
