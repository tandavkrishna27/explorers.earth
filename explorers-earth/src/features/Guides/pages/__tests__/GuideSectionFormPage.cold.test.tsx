import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const owner = vi.hoisted(() => ({
  guide: { documentId: "g1", guide_sections: [{ documentId: "s1", Title: "Old town", Sequence: 1 }] },
}));
vi.mock("../../hooks/useGuidesOwner", () => ({
  useGuidesOwner: () => ({ guide: owner.guide, observation: undefined, content: undefined, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("../../context/GuideEditingProvider", () => ({ GuideEditingProvider: ({ children }: any) => <>{children}</> }));
vi.mock("../../components/GuideSectionForm", () => ({
  default: (props: any) => <div data-testid="form">{props.sectionId ?? "new"}:{props.initialData?.Title ?? "empty"}</div>,
}));
import GuideSectionFormPage from "../GuideSectionFormPage";

afterEach(cleanup);
const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guides/:guideId/sections/:sectionId/edit" element={<GuideSectionFormPage />} />
        <Route path="/guides/:guideId/sections/new" element={<GuideSectionFormPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("guide section edit page opened cold", () => {
  it("loads the section named by the route", () => {
    open("/guides/g1/sections/s1/edit");
    expect(screen.getByTestId("form").textContent).toBe("s1:Old town");
    expect(screen.getByRole("heading", { name: "Edit Day/Stop" })).toBeTruthy();
  });

  it("shows not-found for a section that is not in the guide", () => {
    open("/guides/g1/sections/nope/edit");
    expect(screen.queryByTestId("form")).toBeNull();
    expect(screen.getByText(/could not be found/i)).toBeTruthy();
  });

  it("still offers the add form on the new-section route", () => {
    open("/guides/g1/sections/new");
    expect(screen.getByTestId("form").textContent).toBe("new:empty");
  });
});
