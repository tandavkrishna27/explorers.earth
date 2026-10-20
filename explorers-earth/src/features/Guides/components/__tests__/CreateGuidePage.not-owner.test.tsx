import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useGuidesOwner", () => ({
  useGuidesOwner: () => ({ guide: undefined, observation: undefined, content: undefined, loading: false, error: undefined, refresh: vi.fn() }),
}));

import CreateGuidePage from "../CreateGuidePage";

describe("guide edit route for a guide the viewer does not own", () => {
  it("shows the detail page's failed-to-load state instead of an empty wizard", () => {
    render(
      <MemoryRouter initialEntries={["/guides/foreign/edit"]}>
        <Routes><Route path="/guides/:guideId/edit" element={<CreateGuidePage type="edit" />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Failed to load guide")).toBeInTheDocument();
    expect(screen.queryByText("Edit Guide")).toBeNull();
  });
});
