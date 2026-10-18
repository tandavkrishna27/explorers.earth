import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App";

vi.mock("../routes/AppRoutes", () => ({
  default: () => {
    throw new Error("route render failed");
  },
}));

vi.mock("../components/ScrollToTop", () => ({
  default: () => null,
}));

vi.mock("../components/AccountGenerationCacheReset", () => ({
  default: () => null,
}));

describe("App error boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a visible fallback when a route render fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<App />);

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toBeInTheDocument();
  });
});
