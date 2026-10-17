import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PublicColdEntryBoundary,
  usePublicColdEntry,
} from "../PublicColdEntryBoundary";

const loaderLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("../../components/EarthLoader", () => ({
  EarthLoader: () => {
    useEffect(() => {
      loaderLifecycle.mounts += 1;
      return () => { loaderLifecycle.unmounts += 1; };
    }, []);
    return <div role="status" aria-label="Earth loading">Earth loading</div>;
  },
}));

let staleRouteCompletion: ((ready: boolean) => void) | undefined;
let frames = new Map<number, FrameRequestCallback>();
function paintFrame() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach(callback => callback(performance.now())));
}

function Probe() {
  const location = useLocation();
  const navigate = useNavigate();
  const cold = usePublicColdEntry();
  useEffect(() => {
    staleRouteCompletion = cold.reportRouteReady;
  }, [cold.reportRouteReady]);
  return <>
    <nav>Public navigation</nav>
    <div>Route {location.pathname.endsWith("/b") ? "B" : "A"} content</div>
    <div>Location {location.pathname}{location.search}{location.hash}</div>
    <div>Route ready {String(cold.routeReady)}</div>
    <button onClick={() => cold.reportValidation("valid")}>Validate</button>
    <button onClick={() => cold.reportIdentity("ready")}>Identify</button>
    <button onClick={() => cold.reportIdentity("loading")}>Revalidate identity</button>
    <button onClick={() => cold.reportRouteReady(true)}>Settle route</button>
    <button onClick={() => navigate("/alice/b")}>Open B</button>
    <button onClick={() => navigate("/alice/a?utm_source=proof")}>Search only</button>
    <button onClick={() => navigate("/alice/a#details")}>Hash only</button>
    <button onClick={() => navigate("/alice/a")}>Same path entry</button>
    <button onClick={() => navigate("/bob/a")}>Open Bob</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
  </>;
}

function renderBoundary(initialEntry = "/alice/a") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path=":username/*" element={<PublicColdEntryBoundary><Probe /></PublicColdEntryBoundary>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicColdEntryBoundary", () => {
  beforeEach(() => {
    loaderLifecycle.mounts = 0;
    loaderLifecycle.unmounts = 0;
    staleRouteCompletion = undefined;
    frames = new Map();
    let nextFrame = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("owns one uninterrupted Earth overlay across validation, identity, and first-route settlement", () => {
    renderBoundary();

    const earth = screen.getByRole("status", { name: "Earth loading" });
    const shell = screen.getByTestId("public-cold-entry-shell");
    const overlay = screen.getByTestId("public-cold-entry-overlay");
    expect(loaderLifecycle).toEqual({ mounts: 1, unmounts: 0 });
    expect(shell).toHaveAttribute("aria-hidden", "true");
    expect(shell).toHaveAttribute("inert");
    expect(shell).toHaveStyle({ visibility: "hidden" });
    expect(overlay).toHaveClass("fixed", "inset-0");
    expect(overlay).not.toHaveAttribute("aria-hidden");
    expect(overlay).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByText("Validate", { selector: "button" }));
    expect(screen.getByRole("status", { name: "Earth loading" })).toBe(earth);
    fireEvent.click(screen.getByText("Identify", { selector: "button" }));
    expect(screen.getByRole("status", { name: "Earth loading" })).toBe(earth);
    expect(loaderLifecycle).toEqual({ mounts: 1, unmounts: 0 });

    fireEvent.click(screen.getByText("Settle route", { selector: "button" }));
    expect(shell).toHaveAttribute("inert");
    expect(screen.getByRole("status", { name: "Earth loading" })).toBe(earth);
    paintFrame();
    expect(screen.queryByRole("status", { name: "Earth loading" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-cold-entry-overlay")).not.toBeInTheDocument();
    expect(loaderLifecycle).toEqual({ mounts: 1, unmounts: 1 });
    expect(shell).toHaveStyle({ visibility: "visible" });
    expect(shell).not.toHaveAttribute("aria-hidden");
    expect(shell).not.toHaveAttribute("inert");
  });

  it("keeps a revealed shell visible on pathname navigation and ignores stale completion", () => {
    renderBoundary();
    fireEvent.click(screen.getByText("Validate", { selector: "button" }));
    fireEvent.click(screen.getByText("Identify", { selector: "button" }));
    fireEvent.click(screen.getByText("Settle route", { selector: "button" }));
    const settleA = staleRouteCompletion;
    paintFrame();

    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    expect(screen.getByText("Route B content")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => settleA?.(true));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("waits for identity when validation and route settle first, then ignores background revalidation", () => {
    renderBoundary();
    fireEvent.click(screen.getByText("Validate", { selector: "button" }));
    fireEvent.click(screen.getByText("Settle route", { selector: "button" }));
    expect(screen.getByRole("status", { name: "Earth loading" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Identify", { selector: "button" }));
    paintFrame();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revalidate identity" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("preserves content readiness for search, hash, and same-path history entries", () => {
    renderBoundary();
    fireEvent.click(screen.getByText("Validate", { selector: "button" }));
    fireEvent.click(screen.getByText("Identify", { selector: "button" }));
    fireEvent.click(screen.getByText("Settle route", { selector: "button" }));

    for (const name of ["Search only", "Hash only", "Same path entry"]) {
      paintFrame();
      fireEvent.click(screen.getByRole("button", { name }));
      expect(screen.getByText("Route ready true")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("keeps shell continuity through back/forward but resets cold state for another username", () => {
    renderBoundary();
    fireEvent.click(screen.getByText("Validate", { selector: "button" }));
    fireEvent.click(screen.getByText("Identify", { selector: "button" }));
    fireEvent.click(screen.getByText("Settle route", { selector: "button" }));
    paintFrame();
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Location /alice/a")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(screen.getByText("Location /alice/b")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Bob" }));
    expect(screen.getByRole("status", { name: "Earth loading" })).toBeInTheDocument();
    expect(screen.getByTestId("public-cold-entry-shell")).toHaveAttribute("inert");
  });
});
