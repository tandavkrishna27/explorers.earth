import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import ThemeAppearanceSection from "../ThemeAppearanceSection";

const INDEX_CSS = readFileSync(
  resolve(__dirname, "../../../../index.css"),
  "utf8",
);

const PRESETS = [
  ["Cinematic Dark", "cinematic-dark", "#10B981"],
  ["Glassmorphism Frost", "glassmorphism", "#38BDF8"],
  ["Sunset Glow", "sunset-glow", "#EC4899"],
  ["Minimal Light", "minimal-light", "#0F172A"],
  ["Emerald Nature", "emerald-nature", "#059669"],
  ["Neon Cyber", "neon-cyber", "#F43F5E"],
] as const;

const LANDING_VALUES = [
  "all-recommendations",
  "places",
  "music",
  "movies",
  "books",
  "games",
  "guides",
  "apps",
  "products",
  "people",
  "gallery",
  "business",
] as const;

describe("ThemeAppearanceSection", () => {
  it("renders exactly four flat H3 areas in the approved order", () => {
    const { container } = render(
      <ThemeAppearanceSection themeSettings={{}} onChange={vi.fn()} />,
    );

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) =>
        heading.textContent?.trim(),
      ),
    ).toEqual([
      "Theme style",
      "Public landing",
      "Recommendations layout",
      "Category order",
    ]);

    const workspace = screen.getByTestId("appearance-workspace");
    expect(workspace.className).not.toMatch(
      /rounded|border-dashboard|bg-dashboard-sidebar/,
    );
    expect(
      container.querySelectorAll("[data-appearance-area]"),
    ).toHaveLength(4);
    expect(
      screen.queryByRole("heading", { name: "Recommendations presentation" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Recommendations layout")).toHaveLength(1);
    expect(screen.getAllByText("Category order")).toHaveLength(1);
  });

  it("emits every exact preset/default-accent pair without dropping future keys", () => {
    const handleChange = vi.fn();
    const recommendations = {
      layout: "featured" as const,
      categoryOrder: ["music", "places"] as const,
      futureRecommendation: 7,
    };
    render(
      <ThemeAppearanceSection
        themeSettings={{
          preset: "cinematic-dark",
          futureTheme: { keep: true },
          recommendations,
        }}
        onChange={handleChange}
      />,
    );

    for (const [index, [name, preset, accentColor]] of PRESETS.entries()) {
      const presetButton = screen.getByRole("button", {
        name: new RegExp(name),
      });
      expect(presetButton).toBeVisible();
      fireEvent.click(presetButton);
      expect(handleChange).toHaveBeenNthCalledWith(index + 1, {
        preset,
        accentColor,
        futureTheme: { keep: true },
        recommendations,
      });
    }
  });

  it("gives every theme choice a visual miniature and an unambiguous selected state", () => {
    const { container } = render(
      <ThemeAppearanceSection
        themeSettings={{ preset: "minimal-light" }}
        onChange={vi.fn()}
      />,
    );

    const presetButtons = PRESETS.map(([name, preset]) => {
      const button = screen.getByRole("button", { name: new RegExp(name) });
      expect(button).toHaveAttribute("data-theme-preset", preset);
      expect(
        button.querySelector(".appearance-theme-preview"),
      ).toBeInTheDocument();
      return button;
    });

    expect(
      container.querySelectorAll(".appearance-theme-preview"),
    ).toHaveLength(PRESETS.length);
    expect(
      presetButtons.filter((button) => button.getAttribute("aria-pressed") === "true"),
    ).toEqual([screen.getByRole("button", { name: /Minimal Light/ })]);
    expect(presetButtons[0].parentElement).toHaveClass(
      "appearance-horizontal-strip",
    );
    expect(container.querySelector(".appearance-layout-options")).toHaveClass(
      "appearance-horizontal-strip",
    );
  });

  it("keeps every wallpaper value and accent update on the existing wire", () => {
    const handleChange = vi.fn();
    render(
      <ThemeAppearanceSection
        themeSettings={{ futureTheme: "keep" }}
        onChange={handleChange}
      />,
    );

    const wallpaper = screen.getByRole("combobox", {
      name: "Wallpaper and cover style",
    });
    expect(
      within(wallpaper)
        .getAllByRole("option")
        .map((option) => (option as HTMLOptionElement).value),
    ).toEqual([
      "banner-top",
      "full-wallpaper-image",
      "ambient-gradient",
      "solid-color",
    ]);

    fireEvent.change(wallpaper, { target: { value: "solid-color" } });
    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        wallpaperMode: "solid-color",
        futureTheme: "keep",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Royal Purple" }));
    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accentColor: "#8B5CF6",
        futureTheme: "keep",
      }),
    );
  });

  it("preserves future theme and recommendation keys when a preset changes", () => {
    const handleChange = vi.fn();
    render(
      <ThemeAppearanceSection
        themeSettings={{
          preset: "cinematic-dark",
          futureTheme: { keep: true },
          recommendations: {
            layout: "featured",
            categoryOrder: ["music", "places"],
            futureRecommendation: 7,
          },
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Glassmorphism Frost/ }),
    );

    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        preset: "glassmorphism",
        accentColor: "#38BDF8",
        futureTheme: { keep: true },
        recommendations: {
          layout: "featured",
          categoryOrder: ["music", "places"],
          futureRecommendation: 7,
        },
      }),
    );
  });

  it("selects all twelve exact First view wires without dropping future keys", () => {
    const handleChange = vi.fn();
    const recommendations = {
      layout: "grid" as const,
      categoryOrder: ["movies", "places"] as const,
      futureRecommendation: "keep",
    };
    render(
      <ThemeAppearanceSection
        themeSettings={{
          landingTab: "business",
          futureTheme: { keep: true },
          recommendations,
        }}
        onChange={handleChange}
      />,
    );
    const firstView = screen.getByRole("combobox", { name: "First view" });
    const values = within(firstView)
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value);

    expect(values).toEqual(LANDING_VALUES);
    expect(new Set(values).size).toBe(12);

    for (const [index, landingTab] of LANDING_VALUES.entries()) {
      fireEvent.change(firstView, { target: { value: landingTab } });
      expect(handleChange).toHaveBeenNthCalledWith(index + 1, {
        landingTab,
        futureTheme: { keep: true },
        recommendations,
      });
    }
  });

  it("merges recommendation changes without discarding nested future keys", () => {
    const handleChange = vi.fn();
    render(
      <ThemeAppearanceSection
        themeSettings={{
          recommendations: {
            layout: "shelves",
            categoryOrder: ["places", "music"],
            futureRecommendation: "keep",
          },
        }}
        onChange={handleChange}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Featured First" }));

    expect(handleChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recommendations: expect.objectContaining({
          layout: "featured",
          futureRecommendation: "keep",
        }),
      }),
    );
  });

  it("defines the exact named-container responsive boundaries and sticky gate", () => {
    expect(INDEX_CSS).toMatch(
      /\.profile-editor-workspace-shell\s*\{[^}]*container-name:\s*profile-editor;[^}]*container-type:\s*inline-size;/s,
    );
    expect(INDEX_CSS).toMatch(
      /@container\s+profile-editor\s*\(min-width:\s*768px\)[\s\S]*?\.appearance-layout-options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/,
    );
    expect(INDEX_CSS).toMatch(
      /@container\s+profile-editor\s*\(min-width:\s*904px\)[\s\S]*?\.appearance-order-layout\s*\{[^}]*grid-template-columns:\s*minmax\(560px,\s*1fr\)\s+minmax\(0,\s*320px\);[^}]*gap:\s*1\.5rem;/,
    );
    expect(INDEX_CSS).not.toMatch(
      /@container\s+profile-editor\s*\(min-width:\s*903px\)/,
    );
    expect(INDEX_CSS).toMatch(
      /@media\s*\(min-width:\s*1024px\)\s*and\s*\(min-height:\s*720px\)[\s\S]*?@container\s+profile-editor\s*\(min-width:\s*904px\)[\s\S]*?\.appearance-preview\s*\{[^}]*position:\s*sticky;[^}]*max-height:\s*calc\([^}]*100dvh[^}]*\);[^}]*overflow-y:\s*auto;/,
    );
  });

  it("keeps hidden previews authoritative over layout display rules", () => {
    expect(INDEX_CSS).toMatch(
      /\.appearance-preview-items\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/s,
    );
    expect(INDEX_CSS).toMatch(
      /\.appearance-preview-items\[data-layout="grid"\]:not\(\[hidden\]\)\s*\{[^}]*display:\s*grid;/s,
    );
    expect(INDEX_CSS).not.toMatch(
      /\.appearance-preview-items\[data-layout="grid"\]\s*\{[^}]*display:\s*grid;/s,
    );
  });
});
