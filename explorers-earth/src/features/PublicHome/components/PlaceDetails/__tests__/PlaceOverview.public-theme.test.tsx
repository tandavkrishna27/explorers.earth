import { StrictMode, type CSSProperties } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceOverview from "../PlaceOverview";
import { PublicCategoryThemeProvider } from "../../PublicCategoryThemeContext";

vi.mock("../Details/MediaGallery", () => ({ default: () => <div>Media content</div> }));
vi.mock("../Details/Address", () => ({ default: () => <div>Address content</div> }));

const place = {
  documentId: "place-1",
  Place_Details: {
    Title: "Charminar",
    Place_Name: "Charminar",
    Place_Address: "Hyderabad, Telangana, India",
    Geometry: { lat: 17.3616, lng: 78.4747 },
  },
  recommendation_category: { Category_Name: "Landmark" },
  media_details: { imageDetails: [] },
};

const themes = [
  {
    name: "light",
    variables: {
      "--bg-card": "#ffffff",
      "--border-card": "#d1d5db",
      "--text-primary": "#111827",
      "--text-secondary": "#4b5563",
      "--accent-color": "#059669",
    },
  },
  {
    name: "dark",
    variables: {
      "--bg-card": "#111827",
      "--border-card": "#374151",
      "--text-primary": "#f9fafb",
      "--text-secondary": "#d1d5db",
      "--accent-color": "#34d399",
    },
  },
] as const;

function renderOverview({
  isPublicProfile = true,
  variables = themes[0].variables,
  category = false,
  scrollLockOwner,
  strict = false,
  place: placeOverride,
}: {
  isPublicProfile?: boolean;
  variables?: CSSProperties;
  category?: boolean;
  scrollLockOwner?: "self" | "wrapper";
  strict?: boolean;
  // The component takes the place from its caller now, so each case supplies one rather
  // than changing what a query mock returns.
  place?: Record<string, unknown>;
} = {}) {
  const onClose = vi.fn();
  const style = variables as CSSProperties;
  const content = (
    <PublicCategoryThemeProvider styles={category ? { '--category-panel': '#FFFFFF', '--category-text': '#0F172A', '--category-muted': '#475569' } : null}><div style={style}>
      <HelmetProvider>
        <MemoryRouter initialEntries={["/alice/place/place-1"]}>
          <Routes>
            <Route
              path="/:username/place/:placeId"
              element={(
                <PlaceOverview
                  placeId="place-1"
                  publicPlace={placeOverride ?? place}
                  isPublicProfile={isPublicProfile}
                  onClose={onClose}
                  scrollLockOwner={scrollLockOwner}
                />
              )}
            />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </div></PublicCategoryThemeProvider>
  );
  const result = render(strict ? <StrictMode>{content}</StrictMode> : content);
  return { ...result, onClose };
}

describe("PlaceOverview public theme surface", () => {
  it("uses the category panel and accessible metadata only in its public variant", () => {
    const { container } = renderOverview({ category: true });
    const panel = container.querySelector<HTMLElement>('[data-public-place-detail]')!;
    expect(panel.style.background).toBe('var(--category-panel)');
    expect(panel.style.getPropertyValue('--dash-text-light')).toBe('var(--category-muted)');
    expect(panel.style.getPropertyValue('--border-card')).toBe('var(--category-control-border)');
  });
  it("shows no opening hours, because the place model has none", () => {
    renderOverview({ category: true });
    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(am|pm)/i)).toBeNull();
  });
  it("uses a contrast-safe category rating while preserving the default yellow rating", () => {
    renderOverview({ category: true, place: { ...place, user_rating: 8 } });
    expect(screen.getByText("Creator's Rating:").style.color).toBe('var(--category-rating)');
  });
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("gives only the public Close control an accessible name and 44px minimum target", () => {
    const publicView = renderOverview({ category: true });
    const publicClose = screen.getByRole("button", { name: "Close place details" });
    expect(publicClose).toHaveClass("min-h-11", "min-w-11", "focus-visible:!transform-none");
    expect(publicClose).toHaveStyle({ minHeight: "44px", minWidth: "44px" });
    publicView.unmount();

    const dashboardView = renderOverview({ isPublicProfile: false });
    expect(screen.queryByRole("button", { name: "Close place details" })).toBeNull();
    expect(dashboardView.container.querySelector("button")).not.toHaveClass("min-h-11", "min-w-11");
    expect(dashboardView.container.querySelector("button")).not.toHaveStyle({ minHeight: "44px", minWidth: "44px" });
  });

  it.each([true, false])("keeps the default %s profile owner on its legacy self-lock lifecycle", (isPublicProfile) => {
    const view = renderOverview({ isPublicProfile });
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("unset");
  });

  it("leaves wrapper-owned scroll state unchanged through StrictMode mount and cleanup", () => {
    document.body.style.overflow = "hidden";
    const view = renderOverview({ category: true, scrollLockOwner: "wrapper", strict: true });
    expect(document.body.style.overflow).toBe("hidden");
    view.unmount();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it.each(themes)("uses inherited public tokens in the $name theme", ({ variables }) => {
    const { container } = renderOverview({ variables });
    const surface = container.querySelector("[data-public-place-detail]");

    expect(surface).toBeInTheDocument();
    expect(surface).not.toHaveClass("dashboard-theme");
    expect(surface).not.toHaveClass("bg-[#2a2a2a]/90");
    expect(surface).toHaveClass("border");
    expect(surface).toHaveStyle({
      background: "var(--bg-card)",
      color: "var(--text-primary)",
    });
    expect(container.querySelector('[data-tab-surface="public-profile"]')).toBeInTheDocument();
  });

  it.each([undefined, null])("keeps the public detail and contact actions usable with %s taxonomy", (recommendationCategory) => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const { container, onClose } = renderOverview({
      place: {
        ...place,
        recommendation_category: recommendationCategory,
        Contact_Number: "+914012345678",
        Places_Social_Link: "https://example.com/charminar",
      },
    });

    expect(container.querySelector("[data-public-place-detail]")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Charminar" })).toBeInTheDocument();
    const call = screen.getByText("Call").parentElement!.querySelector("button")!;
    const website = screen.getByText("Website").parentElement!.querySelector("button")!;
    expect(call).toBeEnabled();
    expect(website).toBeEnabled();
    fireEvent.click(call);
    expect(open).toHaveBeenCalledWith("tel:+914012345678", "_self");
    fireEvent.click(website);
    expect(open).toHaveBeenCalledWith("https://example.com/charminar", "_blank", "noopener,noreferrer");
    fireEvent.click(screen.getByRole("button", { name: "Close place details" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("continues to show a supplied category name", () => {
    renderOverview();
    expect(screen.getByText("Landmark")).toBeInTheDocument();
  });
  it("preserves public tab switching", () => {
    renderOverview();
    expect(screen.getByText("Call")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Media" }));

    expect(screen.getByText("Media content")).toBeInTheDocument();
    expect(screen.queryByText("Call")).not.toBeInTheDocument();
  });

  it("keeps dashboard callers on dashboard styling", () => {
    const { container } = renderOverview({ isPublicProfile: false });
    const surface = container.querySelector(".dashboard-theme");

    expect(surface).toBeInTheDocument();
    expect(surface).toHaveClass("bg-dashboard-sidebar");
    expect(container.querySelector("[data-public-place-detail]")).not.toBeInTheDocument();
  });

  it("uses a saved Place_Details photo for the hero when imageDetails is empty", () => {
    renderOverview({ place: {
      ...place,
      Media: [],
      media_details: { imageDetails: [] },
      Place_Details: {
        ...place.Place_Details,
        Photos: ["/api/explorers/v1/media/55555555-5555-4555-8555-555555555555/content"],
      },
    } });

    expect(screen.getByAltText("Place")).toHaveAttribute(
      "src",
      "/api/explorers/v1/media/55555555-5555-4555-8555-555555555555/content",
    );
  });

  it("uses the next valid saved Place_Details photo for SEO when imageDetails is untrusted", async () => {
    renderOverview({ place: {
      ...place,
      Media: [],
      media_details: {
        imageDetails: [{ url: "https://images.example/untrusted.jpg" }],
      },
      Place_Details: {
        ...place.Place_Details,
        Photos: ["/api/explorers/v1/media/66666666-6666-4666-8666-666666666666/content"],
      },
    } });

    await waitFor(() => {
      expect(document.head.querySelector('meta[property="og:image"]')).toHaveAttribute(
        "content",
        "/api/explorers/v1/media/66666666-6666-4666-8666-666666666666/content",
      );
    });
  });
});
