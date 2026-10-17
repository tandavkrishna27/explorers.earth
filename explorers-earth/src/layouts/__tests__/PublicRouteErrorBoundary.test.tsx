import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicRouteErrorBoundary from "../PublicRouteErrorBoundary";

function ThrowRoute({ message = "route exploded" }: { message?: string }) {
  throw new Error(message);
}

function renderErrorBoundary(props: Partial<React.ComponentProps<typeof PublicRouteErrorBoundary>> = {}) {
  const reportTerminal = props.reportTerminal ?? vi.fn();
  return {
    reportTerminal,
    ...render(<MemoryRouter>
      <PublicRouteErrorBoundary
        contentRouteKey="alice:/books"
        usernameKey="alice"
        shellRevealed
        reportTerminal={reportTerminal}
        {...props}
      >
        <ThrowRoute />
      </PublicRouteErrorBoundary>
    </MemoryRouter>),
  };
}

describe("PublicRouteErrorBoundary", () => {
  const frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the caught route terminal and focuses one semantic heading on the next frame", () => {
    const reportTerminal = vi.fn();
    renderErrorBoundary({ reportTerminal });

    expect(reportTerminal).toHaveBeenCalledOnce();
    expect(reportTerminal).toHaveBeenCalledWith("alice:/books");
    const heading = screen.getByRole("heading", { name: "This section could not be displayed" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).not.toBe(heading);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelectorAll('[aria-live="assertive"]')).toHaveLength(0);
    expect(screen.getAllByText("This section could not be displayed")).toHaveLength(1);

    act(() => frames.shift()?.(performance.now()));
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/alice");
  });

  it("retries by remounting only the route content", () => {
    let shouldThrow = true;
    function RecoverableRoute() {
      if (shouldThrow) throw new Error("retry me");
      return <div>Recovered route</div>;
    }
    render(<MemoryRouter><PublicRouteErrorBoundary contentRouteKey="alice:/books" usernameKey="alice" shellRevealed reportTerminal={vi.fn()}>
      <RecoverableRoute />
    </PublicRouteErrorBoundary></MemoryRouter>);
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("Recovered route")).toBeInTheDocument();
  });

  it("resets on pathname identity but retains the fallback for search/hash-only changes", () => {
    const reportTerminal = vi.fn();
    const view = render(<MemoryRouter><PublicRouteErrorBoundary key="alice:/books" contentRouteKey="alice:/books" usernameKey="alice" shellRevealed reportTerminal={reportTerminal}>
      <ThrowRoute />
    </PublicRouteErrorBoundary></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    view.rerender(<MemoryRouter><PublicRouteErrorBoundary key="alice:/books" contentRouteKey="alice:/books" usernameKey="alice" shellRevealed reportTerminal={reportTerminal}>
      <div>Search/hash rerender</div>
    </PublicRouteErrorBoundary></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("Search/hash rerender")).not.toBeInTheDocument();

    view.rerender(<MemoryRouter><PublicRouteErrorBoundary key="alice:/games" contentRouteKey="alice:/games" usernameKey="alice" shellRevealed reportTerminal={reportTerminal}>
      <div>Games route</div>
    </PublicRouteErrorBoundary></MemoryRouter>);
    expect(screen.getByText("Games route")).toBeInTheDocument();
  });
});
