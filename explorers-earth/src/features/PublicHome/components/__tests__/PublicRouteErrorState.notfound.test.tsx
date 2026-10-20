import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublicRouteErrorState } from "../PublicRouteContentState";

describe("PublicRouteErrorState", () => {
  it("renders not-found without a Retry for a 404", () => {
    render(<PublicRouteErrorState title="Guide unavailable" error={new Error("PUBLIC_PROFILE_404")} onRetry={() => undefined} backAction={<button>Back</button>} />);
    expect(screen.getByText("Not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByText("Guide unavailable")).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });

  it.each(["PUBLIC_PROFILE_500", "PUBLIC_PROFILE_UNAVAILABLE", "Failed to fetch"])("keeps Retry for %s", (message) => {
    render(<PublicRouteErrorState title="Guide unavailable" error={new Error(message)} onRetry={() => undefined} />);
    expect(screen.getByText("Guide unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
