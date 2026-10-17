import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RecommendedPerson } from "../../../types";
import PersonDetailModal from "../PersonDetailModal";

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

const person: RecommendedPerson = {
  documentId: "person-1",
  name: "Fixture person",
  username_handle: null,
  headline: null,
  location: null,
  avatar_path: null,
  media_details: null,
  primary_platform: null,
  social_urls: {},
  skills_tags: null,
  user_recommendation_note: null,
  user_rating: null,
  is_pinned: false,
  pin_order: null,
  display_order: 0,
  person_list: null,
  full_name: "Fixture person",
};

describe("PersonDetailModal accessibility", () => {
  it("names the icon-only close control and invokes its callback", () => {
    const onClose = vi.fn();
    render(<PersonDetailModal person={person} open onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
