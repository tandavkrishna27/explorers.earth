import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, mutationSubmit, post, translationLanguage } = vi.hoisted(() => ({
  get: vi.fn(),
  mutationSubmit: vi.fn(),
  post: vi.fn(),
  translationLanguage: { current: "en" },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock("axios", () => ({ default: { get, post } }));
vi.mock("../../../../utils/aspectRatioUtils", () => ({
  detectMediaAspectRatio: vi.fn().mockResolvedValue({
    aspectRatio: "4:5", width: 800, height: 1000,
  }),
  detectUrlAspectRatio: vi.fn().mockResolvedValue({
    aspectRatio: "4:5", width: 800, height: 1000,
  }),
}));
vi.mock("../AddressInput", () => ({
  default: ({ setPlaces }: { setPlaces: (place: unknown) => void }) => (
    <button type="button" onClick={() => setPlaces({ place_id: "fixture-place", name: "Fixture place" })}>
      Select fixture place
    </button>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) => {
      if (key === "dashboard.profile.editor.tabs.appearance") {
        return "Appearance and recommendation presentation workspace";
      }
      if (typeof fallback === "string") return fallback;
      if (
        fallback &&
        typeof fallback === "object" &&
        "defaultValue" in fallback &&
        typeof fallback.defaultValue === "string"
      ) {
        return Object.entries(fallback).reduce(
          (result, [name, value]) =>
            result.split(`{{${name}}}`).join(String(value)),
          fallback.defaultValue,
        );
      }
      return key;
    },
    i18n: { language: translationLanguage.current },
  }),
}));
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: "/profile" }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return {
    ...actual,
    useQuery: () => ({
      data: {
        usersPermissionsUser: {
          username: "tinoue",
          createdAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
          accounts: [{
            documentId: "account-1",
            Account_Name: "Tinoue",
            Account_Type: "personal",
            Bio: "Original bio",
            Addresss: {},
            Primary_Address: {},
            Feed_Data: [{ id: "existing-media", url: "/existing.jpg", type: "image" }],
            social_media: {
              futureSocial: { keep: true },
              theme_settings: {
                preset: "cinematic-dark",
                futureTheme: { keep: true },
              },
            },
          }],
        },
      },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    }),
  };
});
vi.mock("../../../../store/store", () => ({
  default: () => ({ user: { documentId: "user-doc", username: "tinoue" }, token: "token" }),
}));
vi.mock("../../hooks/useUpdateProfile", () => ({
  useUpdateProfile: () => ({ handleSubmit: mutationSubmit }),
}));
vi.mock("../../hooks/useReverseGeocoding", () => ({
  useReverseGeocoding: () => ({
    currentLocation: null,
    mappedAddress: {},
    handleGetCurrentLocation: vi.fn(),
  }),
}));
vi.mock("../../../../hooks/useProfileWalkthrough", () => ({
  useProfileWalkthrough: () => ({
    run: false, steps: [], stepIndex: 0, setRun: vi.fn(), setStepIndex: vi.fn(),
    handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn(), markProcessingComplete: vi.fn(),
  }),
}));
vi.mock("../../../../store/useSetupStore", () => ({
  default: () => ({ isProfileComplete: true, isRecommendationsComplete: true, setSetupStatus: vi.fn() }),
}));
vi.mock("../../../../utils/setupStatusCalculations", () => ({ calculateIsProfileComplete: () => true }));
vi.mock("../../../../components/ImageCropper", () => ({ default: () => null }));
vi.mock("../PreviewModal", () => ({ PreviewModal: () => null }));
vi.mock("../../../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
vi.mock("react-joyride", () => ({ default: () => null }));

import Profile from "../../../../pages/Profile";

describe("Profile editor cross-tab save boundary", () => {
  beforeEach(() => {
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    mutationSubmit.mockReset();
    get.mockReset();
    post.mockReset();
    translationLanguage.current = "en";
  });

  it.each(["ar", "he"])(
    "renders a focus-visible fixed tooltip for a long RTL tab name in %s",
    async (language) => {
      translationLanguage.current = language;
      render(<Profile />);

      const editor = screen.getByTestId("profile-editor-root");
      expect(editor).toHaveAttribute("dir", "rtl");
      const appearanceTab = screen.getByRole("tab", {
        name: "Appearance and recommendation presentation workspace",
      });
      expect(appearanceTab).toHaveAttribute(
        "data-tooltip-id",
        "profile-editor-tab-tooltip",
      );
      expect(appearanceTab).toHaveAttribute(
        "data-tooltip-content",
        "Appearance and recommendation presentation workspace",
      );
      expect(appearanceTab).toHaveAttribute(
        "data-profile-editor-tab-position",
        "last",
      );

      fireEvent.focus(appearanceTab);

      const tooltip = await screen.findByRole("tooltip");
      expect(tooltip).toHaveAttribute("id", "profile-editor-tab-tooltip");
      expect(tooltip).toHaveTextContent(
        "Appearance and recommendation presentation workspace",
      );
      expect(tooltip).toHaveStyle({ position: "fixed" });
      await waitFor(() =>
        expect(appearanceTab).toHaveAttribute(
          "aria-describedby",
          "profile-editor-tab-tooltip",
        ),
      );
    },
  );

  it("keeps every persistent tabpanel label resolvable while the active panel uses the one visible workspace heading", () => {
    render(<Profile />);

    const editor = screen.getByTestId("profile-editor-root");
    const assertResolvablePanelLabels = (
      activeTabName: string,
      activeHeadingName: string,
    ) => {
      const activeTab = screen.getByRole("tab", { name: activeTabName });
      const activeHeading = within(editor).getByRole("heading", {
        level: 2,
        name: activeHeadingName,
      });
      const visibleHeadings = within(editor).getAllByRole("heading", {
        level: 2,
      });
      const activePanel = screen.getByRole("tabpanel");
      const panels = screen.getAllByRole("tabpanel", { hidden: true });

      expect(visibleHeadings).toEqual([activeHeading]);
      expect(activePanel).toHaveAttribute(
        "aria-labelledby",
        `${activeTab.id} ${activeHeading.id}`,
      );
      expect(activePanel).toHaveAccessibleName(
        `${activeTabName} ${activeHeadingName}`,
      );

      for (const panel of panels) {
        const labelIds =
          panel.getAttribute("aria-labelledby")?.trim().split(/\s+/) || [];
        expect(labelIds.length, `${panel.id} must have a label`).toBeGreaterThan(0);
        for (const labelId of labelIds) {
          expect(
            document.getElementById(labelId),
            `${panel.id} references missing #${labelId}`,
          ).not.toBeNull();
        }

        if (panel !== activePanel) {
          expect(labelIds).toEqual([
            panel.id.replace("profile-editor-panel-", "profile-editor-tab-"),
          ]);
        }
      }
    };

    assertResolvablePanelLabels("Profile", "Profile details");

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    assertResolvablePanelLabels("Gallery", "Gallery");
    expect(document.getElementById("profile-editor-heading-profile")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    assertResolvablePanelLabels("Appearance", "Appearance");

    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    assertResolvablePanelLabels("Profile", "Profile details");
  });

  it("cancels a local Appearance reorder when another workspace becomes active", async () => {
    render(<Profile />);
    mutationSubmit.mockResolvedValue({ documentId: "account-1" });

    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    const handle = screen.getByRole("button", { name: "Drag Places" });
    fireEvent.keyDown(handle, { key: " " });
    fireEvent.keyDown(handle, { key: "End" });
    expect(
      screen
        .getAllByTestId("recommendations-order-category")
        .map((node) => node.getAttribute("data-category-id"))
        .at(-1),
    ).toBe("places");

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));

    expect(
      screen
        .getAllByTestId("recommendations-order-category")
        .map((node) => node.getAttribute("data-category-id")),
    ).toEqual([
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
    fireEvent.click(screen.getByRole("button", {
      name: "dashboard.profile.common.saveAndPublish",
    }));
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(1));
    expect(mutationSubmit.mock.calls[0][0].theme_settings).toEqual({
      preset: "cinematic-dark",
      futureTheme: { keep: true },
    });
  });

  it("keeps Profile, Gallery, and Appearance mounted through a failed save and retry", async () => {
    const { container } = render(<Profile />);

    // The mounted panels are the persistence boundary: switching must never rebuild
    // a tab-specific Formik snapshot and discard edits or Gallery local state.
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(3);
    expect(panels.map((panel) => panel.id)).toEqual([
      "profile-editor-panel-profile",
      "profile-editor-panel-gallery",
      "profile-editor-panel-appearance",
    ]);

    mutationSubmit
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ documentId: "account-1" });
    post.mockResolvedValue({
      data: [{ id: "gallery-edit", documentId: "gallery-edit-doc", url: "/gallery-edit.jpg" }],
    });

    const bioEditor = container.querySelector<HTMLElement>(".ql-editor");
    expect(bioEditor).toHaveTextContent("Original bio");
    fireEvent.input(bioEditor!, {
      target: { innerHTML: "Cross-tab bio" },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    const galleryFileInput = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"][multiple]'),
    ).find((input) => input.accept.includes("image/jpeg"));
    expect(galleryFileInput).toBeDefined();
    fireEvent.change(galleryFileInput!, {
      target: { files: [new File(["gallery"], "gallery-edit.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    fireEvent.click(screen.getByRole("button", { name: /Glassmorphism Frost/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    fireEvent.click(screen.getByRole("button", {
      name: "dashboard.profile.publicProfile.sections.socialMedia",
    }));
    fireEvent.click(screen.getByRole("button", {
      name: "dashboard.profile.publicProfile.fields.instagram",
    }));
    const instagramVisibility = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        'button[data-tooltip-id="visibility-tooltip"]',
      ),
    )[0];
    expect(instagramVisibility).toBeDefined();
    fireEvent.click(instagramVisibility);
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));

    const save = screen.getByRole("button", {
      name: "dashboard.profile.common.saveAndPublish",
    });
    fireEvent.click(save);
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(1));
    const routeLink = document.createElement("a");
    routeLink.href = "/settings";
    routeLink.textContent = "Leave profile";
    document.body.appendChild(routeLink);
    fireEvent.click(routeLink);
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(2));

    const expectedPayload = {
      username: "tinoue",
      accountName: "Tinoue",
      accountType: "personal",
      bio: "<p>Cross-tab&nbsp;bio</p>",
      address: "",
      primaryAddressCombined: "",
      streetName: "",
      postalCode: undefined,
      state: "",
      city: "",
      country: "",
      instagramLink: "",
      whatsappLink: "",
      websiteLink: "",
      spotifyLink: "",
      XLink: "",
      youtubeLink: "",
      mobilenumberLink: "",
      mobilenumberVisiblity: true,
      youtubeMusicLink: "",
      linkedinLink: "",
      gmailLink: "",
      appleMusicLink: "",
      tiktokLink: "",
      snapchatLink: "",
      facebookLink: "",
      instagramvisiblity: false,
      whatsappvisiblity: false,
      websitevisiblity: false,
      spotifyvisiblity: false,
      Xvisiblity: false,
      youtubevisiblity: false,
      youtubeMusicvisiblity: false,
      linkedinvisiblity: false,
      gmailvisiblity: false,
      appleMusicvisiblity: false,
      tiktokvisiblity: false,
      snapchatvisiblity: false,
      facebookvisiblity: false,
      localTunesvisiblity: false,
      title: "",
      businessAddress: "",
      businessContact: "",
      businessWebsite: "",
      about: "",
      businessPlaceId: "",
      Feed_Data: [
        { id: "existing-media", url: "/existing.jpg", type: "image" },
        {
          id: "feed-uploaded-gallery-edit",
          documentId: "gallery-edit-doc",
          url: "/gallery-edit.jpg",
          fileName: "gallery-edit.jpg",
          type: "image",
          aspectRatio: "4:5",
          width: 800,
          height: 1000,
          uploadSource: "manual",
        },
      ],
      social_media: {
        futureSocial: { keep: true },
        theme_settings: {
          preset: "cinematic-dark",
          futureTheme: { keep: true },
        },
      },
      theme_settings: {
        preset: "glassmorphism",
        accentColor: "#38BDF8",
        futureTheme: { keep: true },
      },
      visibility: {
        AppleMusic: false,
        Facebook: false,
        Gmail: false,
        Instagram: true,
        Linkedin: false,
        Snapchat: false,
        Spotify: false,
        Tiktok: false,
        Website: false,
        Whatsapp: false,
        X: false,
        Youtube: false,
        YoutubeMusic: false,
      },
    };
    expect(mutationSubmit).toHaveBeenNthCalledWith(1, expectedPayload);
    expect(mutationSubmit).toHaveBeenNthCalledWith(2, expectedPayload);
  });
});
