import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RecommendedApp } from "../../../types";
import AppDetailModal from "../AppDetailModal";

vi.mock("../../../../../components/ui/MediaViewer", () => ({ default: () => null }));
vi.mock("../../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({ isOpen: false, currentIndex: 0, openViewer: vi.fn(), closeViewer: vi.fn() }),
}));

const base: RecommendedApp = {
  documentId: "app-1", app_url: "https://apps.apple.com/app/x", title: "Fixture app", description: null, logo_url: null, developer: null,
  platforms: null, price_tier: null, download_url: null, user_recommendation_note: null, user_rating: null, is_pinned: false,
  pin_order: null, display_order: 0, screenshots: null, app_list: null, app_category: null,
};

it("shows each other platform link by its label beside the app link", () => {
  render(<AppDetailModal app={{ ...base, other_links: [{ label: "Google Play", url: "https://play.google.com/store/apps/details?id=x" }] }} open onClose={() => {}} />);
  expect(screen.getByRole("link", { name: /Google Play/ })).toHaveAttribute("href", "https://play.google.com/store/apps/details?id=x");
  expect(screen.getByRole("link", { name: /Website/ })).toHaveAttribute("href", "https://apps.apple.com/app/x");
});

it("renders an old download-link row as one link", () => {
  render(<AppDetailModal app={{ ...base, download_url: "https://dl.example/app" }} open onClose={() => {}} />);
  expect(screen.getAllByRole("link", { name: /Get App/ })).toHaveLength(1);
});
