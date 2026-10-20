import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendedApp } from "../../../types";
import AppDetailModal from "../AppDetailModal";
import ModalPortal from "../../../../../components/ui/ModalPortal";

vi.mock("../../../../../components/ui/MediaViewer", () => ({ default: () => null }));
vi.mock("../../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({ isOpen: false, currentIndex: 0, openViewer: vi.fn(), closeViewer: vi.fn() }),
}));

const app = {
  documentId: "app-1", app_url: "https://example.com/app", title: "Fixture app", description: null,
  logo_url: null, developer: null, platforms: null, price_tier: null, download_url: null,
  user_recommendation_note: null, user_rating: null, is_pinned: false, pin_order: null,
  display_order: 0, screenshots: null, app_list: null, app_category: null,
} as RecommendedApp;

// The public content layer is `isolation: isolate; z-index: 0`, a stacking context that sits
// below the public nav layer (z 80). Anything rendered inside it can never cover the nav.
describe("public detail modal stacking", () => {
  it("renders the app modal outside the isolated public content layer", () => {
    const { container } = render(
      <div data-public-content-layer style={{ isolation: "isolate", position: "relative", zIndex: 0 }}>
        <AppDetailModal app={app} open onClose={() => undefined} />
      </div>,
    );
    expect(container.querySelector("[data-public-content-layer] .fixed")).toBeNull();
    const portal = document.body.querySelector(":scope > [data-modal-portal]");
    expect(portal).not.toBeNull();
    expect(portal?.querySelector(".z-\\[150\\]")).not.toBeNull();
  });

  it("portals arbitrary overlays to the document body", () => {
    const { container } = render(<div><ModalPortal><span>overlay</span></ModalPortal></div>);
    expect(container.textContent).toBe("");
    expect(document.body.textContent).toContain("overlay");
  });
});
