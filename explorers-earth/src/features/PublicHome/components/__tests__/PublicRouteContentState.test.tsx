import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  isPublicProfileNotFound,
  PublicRouteErrorState,
  PublicRoutePartialNotice,
} from "../PublicRouteContentState";
import { PublicCategoryThemeProvider } from "../PublicCategoryThemeContext";

describe("PublicRouteContentState public recovery boundary", () => {
  it("classifies only the explicit public-profile 404 error as not found", () => {
    expect(isPublicProfileNotFound(new Error("PUBLIC_PROFILE_404"))).toBe(true);

    for (const value of [
      null,
      undefined,
      "PUBLIC_PROFILE_404",
      new Error("PUBLIC_PROFILE_403"),
      new Error("PUBLIC_PROFILE_503"),
      new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"),
    ]) {
      expect(isPublicProfileNotFound(value)).toBe(false);
    }
  });

  it("does not expose raw GraphQL, network, or internal error details", () => {
    render(
      <PublicRouteErrorState
        title="Apps unavailable"
        error={new Error("Forbidden access: role public token=secret")}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Apps unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Please try again. If the problem continues, come back later.")).toBeInTheDocument();
    expect(screen.queryByText(/Forbidden access|token=secret/i)).not.toBeInTheDocument();
  });

  it("contains a rejected single-query Retry at the shared control boundary", async () => {
    const retry = vi.fn().mockRejectedValue(new Error("Failed to fetch"));
    const unhandled = vi.fn((event: PromiseRejectionEvent) => event.preventDefault());
    window.addEventListener("unhandledrejection", unhandled);

    try {
      render(<PublicRouteErrorState title="Map unavailable" error={new Error("offline")} onRetry={retry} />);
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(retry).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("unhandledrejection", unhandled);
    }
  });

  it("inherits resolved route ink for terminal and partial states", () => {
    const { rerender } = render(
      <div style={{ color: "rgb(15, 23, 42)" }}>
        <PublicRouteErrorState title="Profile unavailable" error={new Error("offline")} onRetry={vi.fn()} />
      </div>,
    );

    expect(screen.getByRole("heading", { name: "Profile unavailable" })).not.toHaveClass("text-white");
    expect(screen.getByText("Please try again. If the problem continues, come back later.")).not.toHaveClass("text-white/60");

    rerender(
      <div style={{ color: "rgb(15, 23, 42)" }}>
        <PublicRoutePartialNotice message="Some profile data is unavailable." />
      </div>,
    );
    expect(screen.getByRole("status")).not.toHaveClass("text-amber-100");
  });

  it("limits the important category focus outline and transform reset to category Retry controls", () => {
    const retryState = (
      <PublicRouteErrorState title="Apps unavailable" error={new Error("offline")} onRetry={vi.fn()} />
    );
    const { rerender } = render(
      <PublicCategoryThemeProvider styles={{ "--category-focus": "#2563EB" }}>
        {retryState}
      </PublicCategoryThemeProvider>,
    );

    const categoryRetry = screen.getByRole("button", { name: "Retry" });
    expect(categoryRetry).toHaveClass(
      "focus-visible:!outline",
      "focus-visible:!outline-2",
      "focus-visible:!outline-offset-2",
      "focus-visible:!outline-[var(--category-focus)]",
      "focus-visible:!transform-none",
    );

    rerender(<PublicCategoryThemeProvider styles={null}>{retryState}</PublicCategoryThemeProvider>);

    const neutralRetry = screen.getByRole("button", { name: "Retry" });
    expect(neutralRetry).toHaveClass(
      "focus-visible:outline",
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
    );
    expect(neutralRetry).not.toHaveClass(
      "focus-visible:!outline",
      "focus-visible:!outline-2",
      "focus-visible:!outline-offset-2",
      "focus-visible:!outline-[var(--category-focus)]",
      "focus-visible:!transform-none",
    );
    expect(neutralRetry.style.outlineColor).toBe("var(--public-chrome-focus, currentColor)");
  });
});
