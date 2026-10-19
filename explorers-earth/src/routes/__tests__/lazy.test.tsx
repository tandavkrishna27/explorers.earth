import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it } from "vitest";
import RouteFallback from "../../components/RouteFallback";
import { lazyNamed } from "../lazy";

describe("lazyNamed", () => {
  it("shows the fallback, then the named export of a barrel module", async () => {
    const Page = lazyNamed(async () => ({ Named: () => <p>loaded page</p>, Other: () => null }), "Named");
    render(<Suspense fallback={<RouteFallback />}><Page /></Suspense>);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(await screen.findByText("loaded page")).toBeInTheDocument();
  });
});
