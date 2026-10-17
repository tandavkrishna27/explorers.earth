import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PublicProfileFixedHeader } from "../PublicProfileChromePrimitives";
import PublicProfileFooter from "../PublicProfileFooter";

describe("public branding primitives", () => {
  it("keeps a small brand icon and icon-only Share action inside transparent theme-owned chrome", () => {
    render(
      <BrowserRouter>
        <div style={{ "--public-chrome-ink": "rgb(15, 23, 42)" } as React.CSSProperties}>
          <PublicProfileFixedHeader shareUrl="https://explorers.test/alice" profileName="Alice" onTrackClick={vi.fn()} />
        </div>
      </BrowserRouter>,
    );

    expect(screen.getByRole("banner")).toHaveClass("public-brand-header");
    expect(screen.getByRole("banner")).not.toHaveClass("top-0", "h-14", "z-50");
    expect(screen.getByRole("banner").firstElementChild).toHaveClass("public-brand-header-inner");
    expect(screen.getByRole("link", { name: "Explorers.Earth home" })).toHaveClass("public-brand-logo");
    expect(screen.getByRole("link", { name: "Explorers.Earth home" })).toHaveClass("min-h-11", "min-w-11");
    expect(screen.getByRole("button", { name: "Share" })).toHaveClass("public-brand-action", "min-h-11", "min-w-11");
    const banner = screen.getByRole("banner");
    expect(banner.querySelector(".public-brand-icon")).toHaveAttribute("role", "img");
    expect(banner.querySelector(".public-brand-wordmark")).not.toBeInTheDocument();
    const share = screen.getByRole("button", { name: "Share" });
    expect(share).toHaveTextContent("");
    expect(share.querySelector("[data-public-header-share-icon]")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders a theme-owned footer instead of a fixed white badge", () => {
    render(
      <BrowserRouter>
        <div style={{ "--bg-page": "rgb(248, 250, 252)", "--public-chrome-ink": "rgb(15, 23, 42)" } as React.CSSProperties}>
          <PublicProfileFooter brandingStyle="enabled" />
        </div>
      </BrowserRouter>,
    );

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("public-brand-footer");
    expect(screen.getByRole("img", { name: "Explorers.Earth" })).toHaveClass("public-brand-wordmark");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });
});
