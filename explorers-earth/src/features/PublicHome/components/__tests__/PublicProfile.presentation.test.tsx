import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, recommendationProps, seoProps, openViewer, mediaViewerProps } = vi.hoisted(() => ({
  state: {
    account: null as Record<string, any> | null,
  },
  recommendationProps: [] as Array<Record<string, any>>,
  seoProps: [] as Array<Record<string, any>>,
  openViewer: vi.fn(),
  mediaViewerProps: [] as Array<Record<string, any>>,
}));

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useQuery: (document: any) => {
      const operation = document.definitions.find(
        (definition: any) => definition.kind === "OperationDefinition",
      )?.name?.value;

      if (operation === "PublicProfileData") {
        return {
          data: { accounts: state.account ? [state.account] : [] },
          loading: false,
        };
      }

      return { data: undefined, loading: false };
    },
  };
});

vi.mock("../../../../services/analyticsService", () => ({
  createAnalyticsOptions: { profile: vi.fn(() => ({})) },
  useTrackAnalytics: () => ({ trackClick: vi.fn() }),
}));

vi.mock("../../../../hooks/useQRActions", () => ({
  useQRActions: vi.fn(),
}));

vi.mock("../../../../hooks/useMediaViewer", () => ({
  convertToMediaItems: () => [],
  useMediaViewer: () => ({
    isOpen: false,
    currentIndex: 0,
    openViewer,
    closeViewer: vi.fn(),
  }),
}));

vi.mock("../../../../components/SEO", () => ({
  default: (props: Record<string, any>) => {
    seoProps.push(props);
    return null;
  },
}));
vi.mock("../../../../components/ui/QRModal", () => ({ default: () => null }));
vi.mock("../../../../components/ui/MediaViewer", () => ({
  default: (props: Record<string, any>) => {
    mediaViewerProps.push(props);
    return null;
  },
}));
vi.mock("../../../../components/ui/FeedLayout", () => ({
  default: () => <div data-testid="gallery-feed" />,
}));
vi.mock("../PublicProfileFooter", () => ({ default: () => null }));
vi.mock("../ProfileRecommendationsTab", () => ({
  default: (props: Record<string, any>) => {
    recommendationProps.push(props);
    return (
      <div
        data-testid="recommendations-content"
        data-layout={props.presentation?.layout}
        data-preferred={props.preferredCategory || ""}
      />
    );
  },
}));

import PublicProfile from "../PublicProfile";

const themeSettings = (overrides: Record<string, unknown> = {}) => ({
  preset: "cinematic-dark",
  wallpaperMode: "solid-color",
  landingTab: "all-recommendations",
  visibleTabs: {
    recommendations: true,
    gallery: true,
    business: true,
  },
  recommendations: {
    layout: "shelves",
    categoryOrder: [
      "places",
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ],
  },
  ...overrides,
});

const makeAccount = (overrides: Record<string, unknown> = {}) => ({
  documentId: "account-1",
  Account_Name: "Alice",
  Bio: "",
  Primary_Address: { address: "Earth" },
  Feed_Data: [],
  public_recommendations: "Yes",
  public_music: "No",
  public_movie: "No",
  public_books: "No",
  public_games: "No",
  public_guides: "No",
  public_apps: "No",
  public_products: "No",
  public_people: "No",
  social_media: { theme_settings: themeSettings() },
  ...overrides,
});

const renderProfile = (path = "/alice") => {
  const router = createMemoryRouter(
    [{ path: "/:username", element: <PublicProfile /> }],
    { initialEntries: [path] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
};

const selectedTab = () =>
  screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");

describe("PublicProfile recommendation presentation", () => {
  beforeEach(() => {
    recommendationProps.length = 0;
    seoProps.length = 0;
    state.account = makeAccount();
    (window as any).__publicProfileLoaded = false;
  });

  it("sanitizes API rich text at the public render boundary and rejects an unsafe business website", () => {
    (window as any).__publicProfileXss = "clean";
    state.account = makeAccount({
      Bio: [
        '<p>Safe <strong>profile</strong></p>',
        '<img src="x" onerror="window.__publicProfileXss=\'bio\'">',
        '<script>window.__publicProfileXss="script"</script>',
        '<a href="https://safe.example/profile" onclick="window.__publicProfileXss=\'link\'">Profile link</a>',
      ].join(""),
      Public_Profile_Address: JSON.stringify({
        businessTitle: "Alice Studio",
        businessDescription: [
          '<p>Safe <em>business</em></p>',
          '<a href="javascript:window.__publicProfileXss=\'business\'">Unsafe business link</a>',
          '<a href="https://safe.example/business">Safe business link</a>',
        ].join(""),
        businessWebsite: "javascript:window.__publicProfileXss='website'",
      }),
    });

    const { container } = renderProfile();

    expect(screen.getByText("profile").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[src='x']")).toBeNull();
    const profileLink = screen.getByRole("link", { name: "Profile link" });
    expect(profileLink).toHaveAttribute("href", "https://safe.example/profile");
    expect(profileLink).toHaveAttribute("target", "_blank");
    expect(profileLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(profileLink).not.toHaveAttribute("onclick");

    fireEvent.click(screen.getByRole("tab", { name: "Business Details" }));
    expect(screen.getByText("business").tagName).toBe("EM");
    expect(screen.getByText("Unsafe business link")).not.toHaveAttribute("href");
    const safeBusinessLink = screen.getByRole("link", { name: "Safe business link" });
    expect(safeBusinessLink).toHaveAttribute("href", "https://safe.example/business");
    expect(safeBusinessLink).toHaveAttribute("target", "_blank");
    expect(safeBusinessLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "Visit Website" })).toBeNull();
    expect((window as any).__publicProfileXss).toBe("clean");
  });

  it("prefers canonical email data for the public link and SEO, preserving mailto links", () => {
    state.account = makeAccount({
      social_media: {
        email: { link: "alice@example.com", visibility: true },
        gmail: { link: "legacy@example.com", visibility: true },
        theme_settings: themeSettings(),
      },
    });

    const { container, unmount } = renderProfile();
    expect(container.querySelector('a[href="mailto:alice@example.com"]')).not.toBeNull();
    expect(container.querySelector('a[href="mailto:legacy@example.com"]')).toBeNull();
    expect(seoProps.at(-1)?.description).toContain("Connect via Gmail");

    unmount();
    seoProps.length = 0;
    state.account = makeAccount({
      social_media: {
        email: { link: "mailto:alice@example.com", visibility: true },
        theme_settings: themeSettings(),
      },
    });
    const explicit = renderProfile();
    expect(explicit.container.querySelector('a[href="mailto:alice@example.com"]')).not.toBeNull();
  });

  it("supports legacy gmail data but rejects unsafe email schemes from rendering and SEO", () => {
    state.account = makeAccount({
      social_media: {
        gmail: { link: "legacy@example.com", visibility: true },
        theme_settings: themeSettings(),
      },
    });

    const legacy = renderProfile();
    expect(legacy.container.querySelector('a[href="mailto:legacy@example.com"]')).not.toBeNull();
    legacy.unmount();

    seoProps.length = 0;
    state.account = makeAccount({
      social_media: {
        gmail: { link: "javascript:alert(1)", visibility: true },
        theme_settings: themeSettings(),
      },
    });
    const unsafe = renderProfile();
    expect(unsafe.container.querySelector('a[href*="javascript"]')).toBeNull();
    expect(seoProps.at(-1)?.description).not.toContain("Gmail");
    unsafe.unmount();

    seoProps.length = 0;
    state.account = makeAccount({
      social_media: {
        email: {
          link: "mailto:alice@example.com?subject=Hi%0ABcc:attacker@example.com",
          visibility: true,
        },
        theme_settings: themeSettings(),
      },
    });
    const injectedHeader = renderProfile();
    expect(injectedHeader.container.querySelector('a[href*="%0A"]')).toBeNull();
    expect(seoProps.at(-1)?.description).not.toContain("Gmail");
  });

  it.each([
    [
      "minimal-light",
      "solid-color",
      "var(--text-primary)",
      "var(--text-secondary)",
      false,
    ],
    [
      "minimal-light",
      "ambient-gradient",
      "var(--text-primary)",
      "var(--text-primary)",
      false,
    ],
    ["cinematic-dark", "banner-top", "#FFFFFF", "#FFFFFF", false],
    ["minimal-light", "full-wallpaper-image", "#FFFFFF", "#FFFFFF", false],
  ])(
    "uses a contrasting currentColor icon foreground for %s with %s wallpaper",
    (preset, wallpaperMode, socialColor, locationColor, usesMetadataScrim) => {
      state.account = makeAccount({
        social_media: {
          instagram: { link: "https://instagram.com/alice", visibility: true },
          theme_settings: themeSettings({ preset, wallpaperMode }),
        },
      });

      const { container } = renderProfile();
      const socialLink = container.querySelector<HTMLAnchorElement>(
        'a[href="https://instagram.com/alice"]',
      );
      const socialRow = socialLink?.parentElement;
      const locationText = screen.getByText("Earth");
      const locationRow = locationText.parentElement;
      const locationIcon = locationText.previousElementSibling;
      const metadata = screen.getByTestId("public-profile-header-metadata");

      expect(socialRow).toHaveStyle(`color: ${socialColor}`);
      expect(socialLink?.querySelector("path")).toHaveAttribute("fill", "currentColor");
      expect(locationRow).toHaveStyle(`color: ${locationColor}`);
      expect(locationIcon).toHaveAttribute("fill", "currentColor");
      expect(locationIcon).not.toHaveClass("text-white/70");
      expect(metadata).toContainElement(socialLink);
      expect(usesMetadataScrim).toBe(false);
      expect(metadata).not.toHaveClass("bg-black/75", "backdrop-blur-md");
    },
  );

  it("uses accessible logo and avatar controls without an accent ring", () => {
    renderProfile();

    const brand = screen.getByRole("link", { name: "Explorers.Earth home" });
    expect(brand.querySelector("img")).toHaveAttribute("src", "/eoe-icon.svg");

    const avatar = screen.getByRole("button", { name: "View Alice's profile photo" });
    expect(avatar).not.toHaveClass("border-4");
    fireEvent.click(avatar);
    expect(openViewer).toHaveBeenCalledWith(0);
    expect(mediaViewerProps.at(-1)?.mediaItems?.[0]).toMatchObject({
      alt: "Alice's profile photo",
      type: "image",
    });
  });

  it("gives every visible social action an accessible mobile-sized target", () => {
    state.account = makeAccount({
      social_media: {
        instagram: { link: "https://instagram.com/alice", visibility: true },
        localTunes: { link: "https://localtunes.earth/alice", visibility: true },
        theme_settings: themeSettings(),
      },
    });
    renderProfile();

    for (const name of ["Instagram", "Local Tunes"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveClass("min-h-11", "min-w-11");
      expect(link).toHaveClass("profile-presentation-focus");
    }
  });

  it("opens a saved recommendation category and passes normalized layout settings", () => {
    state.account = makeAccount({
      public_music: "Yes",
      social_media: {
        theme_settings: themeSettings({
          landingTab: "music",
          recommendations: {
            layout: "featured",
            categoryOrder: ["books", "music", "places"],
          },
        }),
      },
    });

    renderProfile();

    expect(selectedTab()).toHaveAccessibleName("Recommendations");
    expect(screen.getByTestId("recommendations-content")).toHaveAttribute(
      "data-layout",
      "featured",
    );
    expect(screen.getByTestId("recommendations-content")).toHaveAttribute(
      "data-preferred",
      "music",
    );
    expect(recommendationProps.at(-1)?.presentation.categoryOrder).toEqual([
      "books",
      "music",
      "places",
      "movies",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
  });

  it.each([
    "cinematic-dark",
    "glassmorphism",
    "sunset-glow",
    "minimal-light",
    "emerald-nature",
    "neon-cyber",
  ])("keeps the bio and profile sections on the page surface in %s", (preset) => {
    state.account = makeAccount({
      Bio: "A short public bio",
      social_media: {
        theme_settings: themeSettings({ preset }),
      },
    });

    renderProfile();

    const bioSurface = screen.getByText("A short public bio").parentElement;
    const sectionsSurface = screen.getByRole("tablist").parentElement;
    const panelSpacing = screen.getByRole("tabpanel").parentElement;

    expect(bioSurface).not.toBeNull();
    expect(bioSurface?.className).not.toMatch(
      /\b(?:rounded-xl|border|shadow-sm)\b/,
    );
    expect(bioSurface).not.toHaveStyle("background-color: var(--bg-card)");

    expect(sectionsSurface).not.toBeNull();
    expect(sectionsSurface?.className).not.toMatch(
      /\b(?:rounded-xl|border|shadow-sm)\b/,
    );
    expect(sectionsSurface).not.toHaveStyle(
      "background-color: var(--bg-card)",
    );

    expect(panelSpacing).not.toBeNull();
    expect(panelSpacing?.className).not.toMatch(/\bpb-20\b/);
  });

  it("opens Gallery even when the gallery is empty", () => {
    state.account = makeAccount({
      social_media: {
        theme_settings: themeSettings({ landingTab: "gallery" }),
      },
    });

    renderProfile();

    expect(selectedTab()).toHaveAccessibleName("Gallery");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Gallery");
    expect(screen.getByText("No Photos Yet")).toBeVisible();
  });

  it("opens Business only when valid business content exists", () => {
    state.account = makeAccount({
      Public_Profile_Address: JSON.stringify({
        businessTitle: "Alice Studio",
        businessAddress: "Moon Street",
      }),
      social_media: {
        theme_settings: themeSettings({ landingTab: "business" }),
      },
    });

    renderProfile();

    expect(selectedTab()).toHaveAccessibleName("Business Details");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Alice Studio");
  });

  it("falls back safely when Business is unavailable or malformed", () => {
    state.account = makeAccount({
      Public_Profile_Address: "{ definitely-not-json",
      social_media: {
        theme_settings: themeSettings({ landingTab: "business" }),
      },
    });

    expect(() => renderProfile()).not.toThrow();
    expect(selectedTab()).toHaveAccessibleName("Recommendations");
    expect(
      screen.queryByRole("tab", { name: "Business Details" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the fixed tab taxonomy despite legacy visibleTabs flags", () => {
    state.account = makeAccount({
      Public_Profile_Address: { title: "Alice Studio" },
      social_media: {
        theme_settings: themeSettings({
          visibleTabs: {
            recommendations: false,
            gallery: false,
            business: false,
          },
        }),
      },
    });

    renderProfile();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["Recommendations", "Gallery", "Business Details"]);
  });

  it("falls back to Gallery when every recommendation category is disabled", () => {
    state.account = makeAccount({ public_recommendations: "No" });

    renderProfile();

    expect(screen.queryByRole("tab", { name: "Recommendations" })).toBeNull();
    expect(selectedTab()).toHaveAccessibleName("Gallery");
  });

  it("retains legacy Places visibility when its flag is missing", () => {
    state.account = makeAccount({ public_recommendations: undefined });

    renderProfile();

    expect(screen.getByRole("tab", { name: "Recommendations" })).toBeVisible();
    expect(selectedTab()).toHaveAccessibleName("Recommendations");
  });

  it("normalizes malformed and unknown presentation settings", () => {
    state.account = makeAccount({
      social_media: {
        theme_settings: {
          preset: "unknown-theme",
          wallpaperMode: "unknown-mode",
          landingTab: "unknown-tab",
          recommendations: {
            layout: "unknown-layout",
            categoryOrder: ["nope", "places", "places"],
          },
        },
      },
    });

    renderProfile();

    expect(selectedTab()).toHaveAccessibleName("Recommendations");
    expect(screen.getByTestId("recommendations-content")).toHaveAttribute(
      "data-layout",
      "shelves",
    );
    expect(recommendationProps.at(-1)?.presentation.categoryOrder).toEqual([
      "places",
      "music",
      "movies",
      "books",
      "games",
      "guides",
      "apps",
      "products",
      "people",
    ]);
  });

  it("keeps a manual selection for one profile and resets it for another", async () => {
    const { router } = renderProfile();
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    expect(selectedTab()).toHaveAccessibleName("Gallery");

    state.account = makeAccount({
      Public_Profile_Address: { title: "Updated business" },
      social_media: {
        theme_settings: themeSettings({ landingTab: "business" }),
      },
    });
    await act(() => router.navigate("/alice?refreshed=1"));
    expect(selectedTab()).toHaveAccessibleName("Gallery");

    state.account = makeAccount({
      documentId: "account-2",
      Account_Name: "Bob",
      Public_Profile_Address: { title: "Bob's business" },
      social_media: {
        theme_settings: themeSettings({ landingTab: "business" }),
      },
    });
    await act(() => router.navigate("/bob"));

    await waitFor(() =>
      expect(selectedTab()).toHaveAccessibleName("Business Details"),
    );
  });

  it("implements roving keyboard focus and manual tab activation", () => {
    state.account = makeAccount({
      Public_Profile_Address: { title: "Alice Studio" },
    });
    renderProfile();

    const recommendations = screen.getByRole("tab", { name: "Recommendations" });
    const gallery = screen.getByRole("tab", { name: "Gallery" });
    const business = screen.getByRole("tab", { name: "Business Details" });

    recommendations.focus();
    fireEvent.keyDown(recommendations, { key: "ArrowLeft" });
    expect(business).toHaveFocus();
    expect(business).toHaveAttribute("tabindex", "0");
    expect(recommendations).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(business, { key: "Enter" });
    expect(business).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(business, { key: "Home" });
    expect(recommendations).toHaveFocus();
    fireEvent.keyDown(recommendations, { key: "End" });
    expect(business).toHaveFocus();
    fireEvent.keyDown(business, { key: "ArrowRight" });
    expect(recommendations).toHaveFocus();
    fireEvent.keyDown(recommendations, { key: "ArrowRight" });
    expect(gallery).toHaveFocus();
    fireEvent.keyDown(gallery, { key: " " });
    expect(gallery).toHaveAttribute("aria-selected", "true");
  });

  it("connects tabs to stable labelled panels without changing the route", () => {
    const { router } = renderProfile();
    const gallery = screen.getByRole("tab", { name: "Gallery" });

    expect(gallery).toHaveAttribute("id", "public-profile-gallery-tab");
    expect(gallery).toHaveAttribute(
      "aria-controls",
      "public-profile-gallery-panel",
    );
    fireEvent.click(gallery);

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "public-profile-gallery-panel");
    expect(panel).toHaveAttribute("aria-labelledby", gallery.id);
    expect(router.state.location.pathname).toBe("/alice");
  });
});
