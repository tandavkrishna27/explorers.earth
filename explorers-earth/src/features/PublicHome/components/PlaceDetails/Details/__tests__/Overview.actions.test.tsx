import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../../utils/getCurrentLocation", () => ({ getCurrentLocation: async () => null }));
import Overview from "../Overview";

const geometry = { lat: 12.9, lng: 77.6 };
const render_ = (place: Record<string, unknown>) =>
  render(<Overview fetchedPlace={{ Place_Details: {}, ...place } as never} />);

describe("place Overview action buttons", () => {
  it("renders none of Directions, Call or Website without data", () => {
    render_({});
    expect(screen.queryByText("Directions")).toBeNull();
    expect(screen.queryByText("Call")).toBeNull();
    expect(screen.queryByText("Website")).toBeNull();
  });

  it("renders each button only when its data exists", () => {
    render_({ Place_Details: { Geometry: geometry }, Contact_Number: "+911234567890" });
    expect(screen.getByText("Directions")).toBeTruthy();
    expect(screen.getByText("Call")).toBeTruthy();
    expect(screen.queryByText("Website")).toBeNull();
  });

  it("shows Website for a safe web link", () => {
    render_({ Places_Social_Link: "https://example.com" });
    expect(screen.getByText("Website")).toBeTruthy();
  });
});
