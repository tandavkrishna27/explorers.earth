import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlaceProfileCard from "../PlaceProfileCard";
import Overview from "../../../PublicHome/components/PlaceDetails/Details/Overview";

vi.mock("../../../../components/ui/MediaViewer", () => ({
  default: () => null,
}));

vi.mock("../../../../components/ui/MediaPreviewGrid", () => ({
  default: () => null,
}));

vi.mock("../../../../components/YoutubeEmbed", () => ({
  default: () => null,
}));

vi.mock("../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({
    isOpen: false,
    currentIndex: 0,
    openViewer: vi.fn(),
    closeViewer: vi.fn(),
  }),
}));

vi.mock("../../../../utils/getCurrentLocation", () => ({
  getCurrentLocation: vi.fn().mockResolvedValue(null),
}));

const makeProfile = (Website: string) => ({
  documentId: "place-1",
  Name: "Fixture place",
  Phone: "",
  Address: "Earth",
  Website,
  Recommendation_Count: 1,
  Place_Id: "place-id",
  Meta_Data: {},
  Long: 0,
  Lat: 0,
  Is_Claimed: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  publishedAt: "2026-01-01",
});

describe("public place website URL policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not make an unsafe claim-card website executable", () => {
    render(
      <PlaceProfileCard
        profile={makeProfile("javascript:alert(document.domain)")}
        onClaim={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByRole("link", { name: "javascript:alert(document.domain)" })).toBeNull();
    expect(screen.getByText("javascript:alert(document.domain)")).toBeInTheDocument();
  });

  it("normalizes a protocol-relative claim-card website and retains external-link protection", () => {
    render(
      <PlaceProfileCard
        profile={makeProfile("//trusted.example/place")}
        onClaim={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "//trusted.example/place" })).toHaveAttribute(
      "href",
      "https://trusted.example/place",
    );
    expect(screen.getByRole("link", { name: "//trusted.example/place" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("does not open an unsafe place-overview website", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <Overview
        fetchedPlace={{
          Place_Details: {},
          Places_Social_Link: "javascript:alert(document.domain)",
        }}
      />,
    );

    fireEvent.click(screen.getByText("Website").previousElementSibling as HTMLButtonElement);

    expect(openSpy).not.toHaveBeenCalled();
  });

  it("normalizes and safely opens a valid place-overview website", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(
      <Overview
        fetchedPlace={{
          Place_Details: {},
          Places_Social_Link: "trusted.example/place",
        }}
      />,
    );

    fireEvent.click(screen.getByText("Website").previousElementSibling as HTMLButtonElement);

    expect(openSpy).toHaveBeenCalledWith(
      "https://trusted.example/place",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
