import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendedApp } from "../../../types";
import AppDetailModal from "../AppDetailModal";

vi.mock("../../../../../components/ui/MediaViewer", () => ({ default: () => null }));
vi.mock("../../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({
    isOpen: false,
    currentIndex: 0,
    openViewer: vi.fn(),
    closeViewer: vi.fn(),
  }),
}));

const app: RecommendedApp = {
  documentId: "app-1",
  app_url: "https://example.com/app",
  title: "Fixture app",
  description: null,
  logo_url: null,
  developer: null,
  platforms: null,
  price_tier: null,
  download_url: null,
  user_recommendation_note: null,
  user_rating: null,
  is_pinned: false,
  pin_order: null,
  display_order: 0,
  screenshots: null,
  app_list: null,
  app_category: null,
};

describe("AppDetailModal accessibility", () => {
  it("names the icon-only close control and invokes its callback", () => {
    const onClose = vi.fn();
    render(<AppDetailModal app={app} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
