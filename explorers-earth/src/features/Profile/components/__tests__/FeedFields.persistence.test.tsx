import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountScope, get, post, mutationSubmit, toastError, toastSuccess } = vi.hoisted(() => ({
  accountScope: {
    current: {
      documentId: "account-1",
      Account_Name: "Tinoue",
      Account_Type: "personal",
      Bio: "Bio",
      Addresss: {},
      Primary_Address: {},
      Feed_Data: [],
      social_media: { theme_settings: {} },
    } as any,
  },
  get: vi.fn(), post: vi.fn(), mutationSubmit: vi.fn(), toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get, post } }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess, warning: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, fallback?: unknown) => typeof fallback === "string" ? fallback : key,
}) }));
vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/profile" }), useNavigate: () => vi.fn() }));
vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: () => ({
    data: { usersPermissionsUser: {
      username: "tinoue", createdAt: "2020-01-01T00:00:00.000Z", updatedAt: "2020-01-01T00:00:00.000Z",
      accounts: [accountScope.current],
    } }, loading: false, error: undefined, refetch: vi.fn(),
  }) };
});
vi.mock("../../../../store/store", () => ({ default: () => ({ user: { documentId: "user-doc", username: "tinoue" }, token: "token" }) }));
vi.mock("../../hooks/useUpdateProfile", () => ({ useUpdateProfile: () => ({ handleSubmit: mutationSubmit }) }));
vi.mock("../../hooks/useReverseGeocoding", () => ({ useReverseGeocoding: () => ({ currentLocation: null, mappedAddress: {}, handleGetCurrentLocation: vi.fn() }) }));
vi.mock("../../../../hooks/useProfileWalkthrough", () => ({ useProfileWalkthrough: () => ({ run: false, steps: [], stepIndex: 0, setRun: vi.fn(), setStepIndex: vi.fn(), handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn(), markProcessingComplete: vi.fn() }) }));
vi.mock("../../../../store/useSetupStore", () => ({ default: () => ({ isProfileComplete: true, isRecommendationsComplete: true, setSetupStatus: vi.fn() }) }));
vi.mock("../../../../utils/setupStatusCalculations", () => ({ calculateIsProfileComplete: () => true }));
vi.mock("../../../../utils/aspectRatioUtils", () => ({ detectMediaAspectRatio: vi.fn(), detectUrlAspectRatio: vi.fn().mockResolvedValue({ aspectRatio: "4:5", width: 800, height: 1000 }) }));
vi.mock("../AddressInput", () => ({
  default: ({ setPlaces }: { setPlaces: (place: unknown) => void }) => (
    <>
      <button type="button" onClick={() => setPlaces({ place_id: "fixture-place", name: "Fixture place" })}>
        Select fixture place
      </button>
      <button type="button" onClick={() => setPlaces({ place_id: "fixture-place-2", name: "Second fixture place" })}>
        Select second fixture place
      </button>
    </>
  ),
}));
vi.mock("../../../../components/ImageCropper", () => ({ default: () => null }));
vi.mock("../PreviewModal", () => ({ PreviewModal: () => null }));
vi.mock("../../../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
vi.mock("react-tooltip", () => ({ Tooltip: () => null }));
vi.mock("react-joyride", () => ({ default: () => null }));

import Profile from "../../../../pages/Profile";
import FeedFields from "../FeedFields";

const openGalleryImporter = () => {
  const tabs = screen.getAllByRole("tab");
  fireEvent.click(tabs[1]);
  fireEvent.click(screen.getByRole("button", { name: "Import photos" }));
  fireEvent.click(screen.getByRole("button", { name: "Google Photos" }));
  fireEvent.click(screen.getByRole("button", { name: "Select fixture place" }));
};

const switchAwayAndBackTwice = () => {
  const tabs = screen.getAllByRole("tab");
  fireEvent.click(tabs[0]);
  fireEvent.click(tabs[1]);
  fireEvent.click(tabs[0]);
  fireEvent.click(tabs[1]);
};

describe("FeedFields tab persistence", () => {
  beforeEach(() => {
    accountScope.current = {
      documentId: "account-1",
      Account_Name: "Tinoue",
      Account_Type: "personal",
      Bio: "Bio",
      Addresss: {},
      Primary_Address: {},
      Feed_Data: [],
      social_media: { theme_settings: {} },
    };
    class ResizeObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    get.mockReset();
    post.mockReset();
    mutationSubmit.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("keeps Gallery actions trailing and exposes importers through a disclosure instead of switches", () => {
    render(
      <FeedFields
        values={{ Feed_Data: [] }}
        setFieldValue={vi.fn()}
        showHeading={false}
      />,
    );

    const actions = screen.getByRole("group", { name: "Gallery" });
    expect(actions).toHaveClass("gallery-desktop-actions");
    expect(actions.parentElement).toHaveClass("justify-end");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    const disclosure = screen.getByRole("button", { name: "Import photos" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Import sources" })).not.toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Import sources" })).toBeVisible();

    const google = screen.getByRole("button", { name: "Google Photos" });
    const instagram = screen.getByRole("button", { name: "Instagram" });
    expect(google).toHaveAttribute("aria-pressed", "false");
    expect(instagram).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(google);
    expect(google).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select fixture place" })).toBeVisible();

    fireEvent.click(instagram);
    expect(instagram).toHaveAttribute("aria-pressed", "true");
    expect(google).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByPlaceholderText("username or https://instagram.com/username")).toBeVisible();
  });

  it("keeps delayed importer progress and selection across real Profile editor tab switches", async () => {
    let resolvePhotos!: (value: unknown) => void;
    get.mockReturnValueOnce(new Promise((resolve) => { resolvePhotos = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<Profile />);

    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
    openGalleryImporter();
    expect(screen.getByText("dashboard.recommendations.addRecommendationForm.fetchingImages")).toBeInTheDocument();
    switchAwayAndBackTwice();
    resolvePhotos({ data: { photos: [{ name: "fixture-place/fixture-photo" }] } });

    const image = await screen.findByRole("button", { name: "Select image for feed" });
    fireEvent.click(image);
    switchAwayAndBackTwice();
    expect(screen.getByText("1 selected of 1")).toBeInTheDocument();
  });

  it("clears pending progress and exposes the failure after delayed importer rejection", async () => {
    let rejectPhotos!: (reason?: unknown) => void;
    get.mockReturnValueOnce(new Promise((_, reject) => { rejectPhotos = reject; }));
    render(<Profile />);

    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
    openGalleryImporter();
    expect(screen.getByText("dashboard.recommendations.addRecommendationForm.fetchingImages")).toBeInTheDocument();
    switchAwayAndBackTwice();
    rejectPhotos(new Error("offline"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("toast.error.failedToFetchImages"));
    expect(screen.queryByText("dashboard.recommendations.addRecommendationForm.fetchingImages")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select fixture place" })).toBeEnabled();
  });

  it("protects a pristine manual upload from route and beforeunload navigation while tabs remain safe", async () => {
    let resolveUpload!: (value: unknown) => void;
    post.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const { container } = render(<Profile />);

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    const galleryFileInput = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"][multiple]'),
    ).find((input) => input.accept.includes("image/jpeg"));
    expect(galleryFileInput).toBeDefined();
    fireEvent.change(galleryFileInput!, {
      target: { files: [new File(["pending"], "pending.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    const routeLink = document.createElement("a");
    routeLink.href = "/settings";
    routeLink.textContent = "Leave profile";
    document.body.appendChild(routeLink);
    fireEvent.click(routeLink);
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

    await act(async () => {
      resolveUpload({ data: [] });
      await Promise.resolve();
    });
    await waitFor(() => {
      const afterUpload = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(afterUpload);
      expect(afterUpload.defaultPrevented).toBe(false);
    });
  });

  it("tracks overlapping Google requests independently and ignores a superseded result", async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    get
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const asyncStates: any[] = [];
    render(
      <FeedFields
        values={{ Feed_Data: [] }}
        setFieldValue={vi.fn()}
        onAsyncStateChange={(state) => asyncStates.push(state)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Import photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Google Photos" }));
    fireEvent.click(screen.getByRole("button", { name: "Select fixture place" }));
    fireEvent.click(screen.getByRole("button", { name: "Select second fixture place" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));

    const starts = asyncStates.filter((state) => state.pending);
    expect(starts).toHaveLength(2);
    expect(new Set(starts.map((state) => state.requestId)).size).toBe(2);

    resolveSecond({
      data: { photos: [{ name: "fixture-place-2/second-photo" }] },
    });
    const selectedResult = await screen.findByRole("button", {
      name: "Select image for feed",
    });
    expect(selectedResult.querySelector("img")?.src).toContain(
      "/fixture-place-2/second-photo/media",
    );
    expect(asyncStates.filter((state) => !state.pending)).toHaveLength(1);

    resolveFirst({
      data: { photos: [{ name: "fixture-place/older-photo" }] },
    });
    await waitFor(() =>
      expect(asyncStates.filter((state) => !state.pending)).toHaveLength(2),
    );
    expect(screen.getByRole("button", {
      name: "Select image for feed",
    }).querySelector("img")?.src).toContain(
      "/fixture-place-2/second-photo/media",
    );
  });

  it("clears prior-account Feed dirty and pending guards only when account scope changes", async () => {
    let resolvePendingUpload!: (value: unknown) => void;
    post
      .mockResolvedValueOnce({
        data: [{
          id: "old-account-upload",
          documentId: "old-account-upload-doc",
          url: "/old-account-upload.jpg",
        }],
      })
      .mockReturnValueOnce(new Promise((resolve) => {
        resolvePendingUpload = resolve;
      }));
    const { container } = render(<Profile />);

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    const galleryFileInput = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"][multiple]'),
    ).find((input) => input.accept.includes("image/jpeg"));
    expect(galleryFileInput).toBeDefined();
    fireEvent.change(galleryFileInput!, {
      target: { files: [new File(["dirty"], "dirty.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("1 file uploaded successfully"),
    );

    fireEvent.change(galleryFileInput!, {
      target: { files: [new File(["pending"], "pending.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    const oldScopeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(oldScopeUnload);
    expect(oldScopeUnload.defaultPrevented).toBe(true);

    accountScope.current = {
      ...accountScope.current,
      Account_Name: "Same account server refresh",
      Bio: "Refreshed server bio",
    };
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByDisplayValue("Tinoue")).toBeInTheDocument();
    const sameScopeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(sameScopeUnload);
    expect(sameScopeUnload.defaultPrevented).toBe(true);

    accountScope.current = {
      documentId: "account-2",
      Account_Name: "Second account",
      Account_Type: "creator",
      Bio: "Second bio",
      Addresss: {},
      Primary_Address: {},
      Feed_Data: [{ id: "second-media", url: "/second.jpg", type: "image" }],
      social_media: { theme_settings: { preset: "minimal-light" } },
    };
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));

    expect(await screen.findByDisplayValue("Second account")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Second account" })).toBeInTheDocument();
    expect(screen.getByTestId("profile-editor-root")).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel", { hidden: true })).toHaveLength(3);
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    expect(screen.getByRole("tab", { name: "Gallery" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByDisplayValue("Second account")).toBeInTheDocument();
    const newScopeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(newScopeUnload);
    expect(newScopeUnload.defaultPrevented).toBe(false);

    const routeLink = document.createElement("a");
    routeLink.href = "/settings";
    routeLink.textContent = "Leave second account";
    let guardedBeforeTarget = false;
    routeLink.addEventListener("click", (event) => {
      guardedBeforeTarget = event.defaultPrevented;
      event.preventDefault();
    });
    document.body.appendChild(routeLink);
    fireEvent.click(routeLink);
    expect(guardedBeforeTarget).toBe(false);
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();

    await act(async () => {
      resolvePendingUpload({
        data: [{
          id: "stale-old-account-upload",
          documentId: "stale-old-account-upload-doc",
          url: "/stale-old-account-upload.jpg",
        }],
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledTimes(2));
    const afterStaleCompletion = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterStaleCompletion);
    expect(afterStaleCompletion.defaultPrevented).toBe(false);
  });
});
