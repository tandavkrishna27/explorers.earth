import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RecommendedPerson } from "../../../types";
import PersonDetailModal from "../PersonDetailModal";

vi.mock("../../../../../components/ui/MediaViewer", () => ({ default: () => null }));
vi.mock("../../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({ isOpen: false, currentIndex: 0, openViewer: vi.fn(), closeViewer: vi.fn() }),
}));

// WP8 DS-08/DS-09: people are not rated and follower counts are not shown, even on old rows
// that still hold both values.
it("hides the rating and follower text of an old row", () => {
  const person: RecommendedPerson = {
    documentId: "person-1", name: "Old row", username_handle: null, headline: null, location: null, avatar_path: null, media_details: null,
    primary_platform: null, social_urls: {}, skills_tags: null, user_recommendation_note: null, user_rating: 9, is_pinned: false,
    pin_order: null, display_order: 0, person_list: null, full_name: "Old row", follower_count: "12.4k",
  };
  render(<PersonDetailModal person={person} open onClose={() => {}} />);
  expect(screen.queryByText(/9\/10/)).toBeNull();
  expect(screen.queryByText(/Creator's Rating/)).toBeNull();
  expect(screen.queryByText(/followers/)).toBeNull();
});
