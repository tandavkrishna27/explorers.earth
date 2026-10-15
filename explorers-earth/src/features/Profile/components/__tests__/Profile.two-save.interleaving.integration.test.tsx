import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api, auth, setup, music } = vi.hoisted(() => ({
  api: { getMyProfile: vi.fn(), updateAccount: vi.fn(), createMedia: vi.fn(), deleteMedia: vi.fn() },
  auth: { user: { id: "synthetic-user", documentId: "synthetic-user", username: "synthetic" }, token: "synthetic", generation: 1, updateUsername: vi.fn() },
  setup: { isProfileComplete: true, isRecommendationsComplete: true, setSetupStatus: vi.fn(), bindAccount: vi.fn() },
  music: { refreshIdentity: vi.fn() },
}));
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: api }));
vi.mock("../../../../store/store", () => ({ default: Object.assign(
  (selector?: (state: typeof auth) => unknown) => selector ? selector(auth) : auth,
  { getState: () => auth },
) }));
vi.mock("../../../../store/useSetupStore", () => ({ default:
  (selector?: (state: typeof setup) => unknown) => selector ? selector(setup) : setup,
}));
vi.mock("../../../music/musicApi", () => ({ musicApi: music }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, fallback?: unknown) => typeof fallback === "string" ? fallback :
    fallback && typeof fallback === "object" && "defaultValue" in fallback ? fallback.defaultValue : key,
  i18n: { language: "en" },
}) }));
vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/profile" }), useNavigate: () => vi.fn() }));
// External geolocation and walkthrough/UI surfaces do not participate in save ownership.
vi.mock("../../hooks/useReverseGeocoding", () => ({ useReverseGeocoding: () => ({ currentLocation: null, mappedAddress: {}, handleGetCurrentLocation: vi.fn() }) }));
vi.mock("../../../../hooks/useProfileWalkthrough", () => ({ useProfileWalkthrough: () => ({ run: false, steps: [], stepIndex: 0,
  setRun: vi.fn(), setStepIndex: vi.fn(), handleJoyrideCallback: vi.fn(), advanceToNextStep: vi.fn(), markProcessingComplete: vi.fn() }) }));
vi.mock("../AddressInput", () => ({ default: () => null }));
vi.mock("../../../../components/ImageCropper", () => ({ default: () => null }));
vi.mock("../PreviewModal", () => ({ PreviewModal: () => null }));
vi.mock("../../../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../../../components/SEO", () => ({ default: () => null }));
vi.mock("react-joyride", () => ({ default: () => null }));

import Profile from "../../../../pages/Profile";
import type { AccountDto } from "../../../../../../tunes/shared/explorersContract";

const ACCOUNT = "00000000-0000-4000-8000-000000000001";
const original: AccountDto = {
  id: ACCOUNT, handle: "synthetic", displayName: "Original", accountType: "Personal",
  bioPlain: "Synthetic bio", bioRich: null, revision: 1, onboardingStatus: "complete",
  socialLinks: [], additionalAddresses: [], feedItems: [], themeSettings: {}, categories: [],
  primaryAddress: { address: "Synthetic address" }, publicAddress: null,
  mobileNumber: "+919999999999", mobileNumberVisible: false, publicProfile: true, autoPinning: false,
  status: "active", locale: "en", profilePlaceDetails: null, businessDetails: {},
};
const first = { ...original, displayName: "First edit", revision: 2 };
const second = { ...original, displayName: "Second edit", revision: 3 };
function barrier<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { release = resolve; });
  return { promise, release };
}
const saveButton = () => screen.getByRole("button", { name: "dashboard.profile.common.saveAndPublish" });
const nameInput = () => {
  const input = document.querySelector<HTMLInputElement>('input[data-field="accountName"]');
  expect(input).not.toBeNull();
  return input!;
};

describe("real Profile consecutive save interleaving", () => {
  let client: QueryClient;
  let originalResizeObserver: typeof ResizeObserver;
  let originalTooltipFlag: string | null;
  beforeEach(() => {
    vi.clearAllMocks();
    api.getMyProfile.mockReset();
    api.updateAccount.mockReset();
    music.refreshIdentity.mockResolvedValue(undefined);
    auth.generation = 1;
    originalTooltipFlag = localStorage.getItem("hasSeenPublicProfileTooltip");
    localStorage.setItem("hasSeenPublicProfileTooltip", "true");
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  });
  afterEach(() => {
    client.clear();
    notifyManager.setScheduler((callback) => setTimeout(callback, 0));
    globalThis.ResizeObserver = originalResizeObserver;
    if (originalTooltipFlag === null) localStorage.removeItem("hasSeenPublicProfileTooltip");
    else localStorage.setItem("hasSeenPublicProfileTooltip", originalTooltipFlag);
  });

  // Removing the real form's latest-edit restoration or committed-revision update
  // must fail these input/payload assertions. Query hooks and save hooks are real.
  it.each(["cache-before-ack", "cache-after-ack", "equal-cache-write-after-settlement", "refetch-only", "default-scheduler"] as const)(
    "retains the second edit and revision under %s",
    async (schedule) => {
      if (schedule !== "default-scheduler") {
        // Deliver notifications inside explicit act barriers; the default-scheduler
        // case also exercises the normal TanStack notification scheduling unchanged.
        notifyManager.setScheduler((callback) => callback());
      }
      const ack = barrier<AccountDto>();
      const refetch = barrier<AccountDto>();
      const candidates: Array<{ displayName?: string | null; expectedRevision: number }> = [];
      let persisted = original;
      api.getMyProfile.mockResolvedValueOnce(original).mockImplementationOnce(() => {
        return refetch.promise;
      }).mockImplementation(() => Promise.resolve(persisted));
      api.updateAccount.mockImplementation((candidate) => {
        candidates.push({ displayName: candidate.displayName, expectedRevision: candidate.expectedRevision });
        if (candidates.length === 1) {
          // This is a local API double, never an assertion about actual network persistence.
          persisted = { ...first, displayName: candidate.displayName };
          return ack.promise;
        }
        persisted = { ...second, displayName: candidate.displayName };
        return Promise.resolve(persisted);
      });
      let unmount: (() => void) | undefined;
      let assertionFailed = false;
      try {
        ({ unmount } = render(<QueryClientProvider client={client}><Profile /></QueryClientProvider>));
        await waitFor(() => expect(nameInput()).toHaveValue("Original"));
        fireEvent.change(nameInput(), { target: { value: "First edit" } });
        await act(async () => { fireEvent.click(saveButton()); });
        await waitFor(() => expect(candidates).toHaveLength(1));
        expect(candidates).toEqual([{ displayName: "First edit", expectedRevision: 1 }]);
        expect(saveButton()).toBeDisabled();
        fireEvent.change(nameInput(), { target: { value: "Second edit" } });
        const key = ["explorers-account", "synthetic-user", 1];
        if (schedule === "cache-before-ack") {
          await act(async () => { client.setQueryData(key, first); });
          expect(nameInput()).toHaveValue("Second edit");
          expect(saveButton()).toBeDisabled();
        }
        await act(async () => { ack.release(first); });
        await waitFor(() => expect(api.getMyProfile).toHaveBeenCalledTimes(2));
        expect(saveButton()).toBeDisabled();
        expect(candidates).toHaveLength(1);
        if (schedule === "cache-after-ack") {
          await act(async () => { client.setQueryData(key, first); });
          expect(nameInput()).toHaveValue("Second edit");
          expect(saveButton()).toBeDisabled();
        }
        await act(async () => { refetch.release(first); });
        await waitFor(() => expect(saveButton()).toBeEnabled());
        if (schedule === "equal-cache-write-after-settlement") {
          // Equal data can be structurally shared/deduplicated. This characterizes
          // an idempotent cache write, not a distinct hydration or rerender.
          await act(async () => { client.setQueryData(key, { ...first }); });
        }
        expect(client.getQueryData(key)).toMatchObject({ displayName: "First edit", revision: 2 });
        expect(nameInput()).toHaveValue("Second edit");
        // Match the visible enabled-button action, not the registered programmatic action.
        await act(async () => { fireEvent.click(saveButton()); });
        await waitFor(() => expect(candidates).toHaveLength(2));
        expect(candidates).toEqual([
          { displayName: "First edit", expectedRevision: 1 },
          { displayName: "Second edit", expectedRevision: 2 },
        ]);
        await waitFor(() => expect(saveButton()).toBeEnabled());
        expect(nameInput()).toHaveValue("Second edit");
        expect(client.getQueryData(key)).toMatchObject({ displayName: "Second edit", revision: 3 });
      } catch (error) {
        assertionFailed = true;
        throw error;
      } finally {
        let cleanupFailure: unknown;
        try {
          // Release both API holds even when an assertion failed before dispatch.
          // Never await a start event that may not happen on a broken product path.
          await act(async () => {
            ack.release(first);
            refetch.release(first);
            await Promise.all([ack.promise, refetch.promise]);
          });
        } catch (cleanupError) {
          cleanupFailure = cleanupError;
        }
        try { unmount?.(); } catch (cleanupError) { cleanupFailure ??= cleanupError; }
        try { client.clear(); } catch (cleanupError) { cleanupFailure ??= cleanupError; }
        // The original assertion remains the reported failure if cleanup also errs.
        // eslint-disable-next-line no-unsafe-finally -- guarded: this throw is reachable only when no original failure is in flight, so nothing is masked.
        if (!assertionFailed && cleanupFailure) throw cleanupFailure;
      }
    },
    // Five real Profile render/save interleavings per case, against real query and save
    // hooks. Vitest's default 5s budget is not a correctness bound here and was exceeded on
    // loaded CI runners, failing ~half of runs with a render timeout rather than an assertion.
    30_000,
  );
});
