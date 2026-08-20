import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import StatePreservingRedirect from "../StatePreservingRedirect";

const StateProbe = () => {
  const location = useLocation();
  return <div data-testid="state">{JSON.stringify(location.state)}</div>;
};

const renderAt = (entry: { pathname: string; state?: unknown }) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/music"
          element={<StatePreservingRedirect to="/recommendations/music" />}
        />
        <Route path="/recommendations/music" element={<StateProbe />} />
      </Routes>
    </MemoryRouter>
  );

describe("StatePreservingRedirect", () => {
  it("forwards navigation state through the redirect (justCreatedList survives)", () => {
    // Regression: navigate('/music', { state: { justCreatedList: true } }) must
    // still deliver justCreatedList to the redirected target. A plain <Navigate>
    // would drop it and this would read `null`.
    renderAt({ pathname: "/music", state: { justCreatedList: true } });
    expect(screen.getByTestId("state").textContent).toBe(
      JSON.stringify({ justCreatedList: true })
    );
  });

  it("redirects with null state when the caller supplied none", () => {
    renderAt({ pathname: "/music" });
    expect(screen.getByTestId("state").textContent).toBe("null");
  });
});
