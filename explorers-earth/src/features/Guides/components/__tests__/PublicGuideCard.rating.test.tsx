import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PublicGuideCard from "../PublicGuideCard";

const guide = (placeDetails: unknown) =>
  ({ documentId: "g1", Title: "Weekend", Number_Of_Days: 2, Guide_Type: "Itinerary", Place_Details: placeDetails }) as never;

describe("PublicGuideCard rating", () => {
  it("shows no rating when the guide has none", () => {
    const { container } = render(<PublicGuideCard guide={guide({})} onClickHandler={() => {}} />);
    expect(container.textContent).not.toContain("★");
    expect(container.textContent).toContain("2 Days");
  });

  it("shows the real rating when there is one", () => {
    const { container } = render(<PublicGuideCard guide={guide({ Rating: 4.2 })} onClickHandler={() => {}} />);
    expect(container.textContent).toContain("★ 4.2");
  });
});
