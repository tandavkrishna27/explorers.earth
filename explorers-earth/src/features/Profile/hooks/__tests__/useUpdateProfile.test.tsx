import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, updateAccount, updateUsername, refreshIdentity, useAuthStoreMock } = vi.hoisted(() => ({
  authState: {
    user: { id: "user-1", documentId: "user-doc", username: "tinoue" },
    token: "token",
    login: vi.fn(),
    updateUsername: vi.fn(),
  },
  updateAccount: vi.fn(),
  updateUsername: vi.fn(),
  refreshIdentity: vi.fn(),
  useAuthStoreMock: vi.fn(),
}));

vi.mock("../../../../lib/explorersApiClient", () => ({
  explorersApiClient: { updateAccount },
}));

vi.mock("../../../music/musicApi", () => ({ musicApi: { refreshIdentity } }));

vi.mock("../../../../store/store", () => ({
  default: Object.assign(useAuthStoreMock, {
    getState: () => ({ ...authState, updateUsername }),
  }),
}));
vi.mock("../../../../services/localTunesService", () => ({
  updateLocalTunesUsername: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  buildSocialMediaInput,
  useUpdateProfile,
} from "../useUpdateProfile";

// The id the form was built from. Both callers get it from useCanonicalAccount, so it is
// always a canonical UUID; the hook refuses anything else.
const ACCOUNT = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

const account = {
  id: ACCOUNT, handle: "tinoue", displayName: "Tinoue", accountType: "Personal",
  bioPlain: "Bio", bioRich: null, revision: 8, onboardingStatus: "complete",
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/tinoue", visible: true }],
  additionalAddresses: [], feedItems: [], themeSettings: {}, categories: [],
  primaryAddress: null, publicAddress: null, mobileNumber: null, mobileNumberVisible: false,
  publicProfile: true, autoPinning: false,
} as never;

const values = {
  documentId: ACCOUNT,
  revision: 8,
  username: "tinoue",
  accountName: "Tinoue",
  accountType: "personal",
  bio: "Bio",
  visibility: { Instagram: true },
  instagramLink: "https://instagram.com/tinoue",
  theme_settings: {
    preset: "glassmorphism",
    futureTheme: { keep: true },
    recommendations: {
      layout: "featured",
      categoryOrder: ["music", "places"],
      futureRecommendation: 7,
    },
  },
  social_media: {
    futureSocial: { keep: true },
    localTunes: { visibility: true, futureLocalTunes: 8 },
    instagram: { futureInstagram: "keep" },
    theme_settings: {
      oldTheme: "keep",
      recommendations: { oldRecommendation: "keep" },
    },
  },
};

describe("useUpdateProfile", () => {
  beforeEach(() => {
    updateAccount.mockReset();
    updateUsername.mockReset();
    refreshIdentity.mockReset();
    refreshIdentity.mockResolvedValue(undefined);
    useAuthStoreMock.mockReturnValue({ user: authState.user });
    updateAccount.mockResolvedValue(account);
  });

  it("builds a lossless social_media input while applying known form edits", () => {
    expect(buildSocialMediaInput(values)).toEqual(
      expect.objectContaining({
        futureSocial: { keep: true },
        localTunes: { visibility: true, futureLocalTunes: 8 },
        instagram: {
          futureInstagram: "keep",
          link: "https://instagram.com/tinoue",
          visibility: true,
        },
        theme_settings: {
          oldTheme: "keep",
          preset: "glassmorphism",
          futureTheme: { keep: true },
          recommendations: {
            oldRecommendation: "keep",
            layout: "featured",
            categoryOrder: ["music", "places"],
            futureRecommendation: 7,
          },
        },
      }),
    );
  });

  it("preserves every form visibility key, including the spaced music labels", () => {
    const socialMedia = buildSocialMediaInput({
      ...values,
      visibility: {
        Instagram: true,
        Youtube: true,
        Whatsapp: true,
        Website: true,
        Facebook: true,
        Linkedin: true,
        Snapchat: true,
        Tiktok: true,
        Gmail: true,
        X: true,
        Spotify: true,
        "Youtube Music": true,
        "Apple Music": true,
      },
    });

    for (const platform of [
      "instagram",
      "youtube",
      "whatsapp",
      "website",
      "facebook",
      "linkedin",
      "snapchat",
      "tiktok",
      "email",
      "X",
      "spotify",
      "youtubeMusic",
      "appleMusic",
    ]) {
      expect(socialMedia[platform]).toEqual(
        expect.objectContaining({ visibility: true }),
      );
    }
  });

  it("honors explicit canonical music visibility toggles over legacy aliases", () => {
    const socialMedia = buildSocialMediaInput({
      ...values,
      visibility: {
        YoutubeMusic: false,
        "Youtube Music": true,
        AppleMusic: true,
        "Apple Music": false,
      },
    });

    expect(socialMedia.youtubeMusic).toEqual(
      expect.objectContaining({ visibility: false }),
    );
    expect(socialMedia.appleMusic).toEqual(
      expect.objectContaining({ visibility: true }),
    );
  });

  it("returns only after a confirmed account update and refetch", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, refetch));

    let response: unknown;
    await act(async () => {
      response = await result.current.handleSubmit(values as never);
    });

    expect(response).toEqual(expect.objectContaining({ documentId: ACCOUNT, username: "tinoue" }));
    expect(refetch).toHaveBeenCalledTimes(1);
    // The update is sent at the revision the form was read at, so a concurrent edit is
    // rejected by the server rather than silently overwritten here.
    expect(updateAccount).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 8 }));
    expect(updateAccount.mock.calls[0][0].socialLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ platform: "instagram", url: "https://instagram.com/tinoue", visible: true }),
      ]),
    );
  });

  // Worth pinning because it is the one place the canonical account is deliberately NOT a
  // superset of the Strapi blob. social_media was free-form JSON, so anything in it
  // survived a save untouched; socialLinks is a typed list of platform/url/visible, so a
  // blob entry carrying only a visibility - localTunes, which no form field writes - has no
  // link to become and is dropped. That is not a lost setting: Music visibility on a public
  // profile is account_category_settings for "music", which travels as categories.
  it("drops a stored blob entry that is not a link", async () => {
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    const platforms = updateAccount.mock.calls[0][0].socialLinks.map(
      (link: { platform: string }) => link.platform,
    );
    expect(platforms).not.toContain("localTunes");
    expect(platforms).not.toContain("futureSocial");
  });

  // The removed Strapi branches took a missing or legacy id as "create an account" or
  // "write to Strapi". Canonically neither exists: ensureInitialAccount provisions the
  // account during authentication, so a missing id means the form was submitted before its
  // snapshot arrived and nothing is written.
  it.each([
    ["no account id", undefined, values],
    ["a legacy non-UUID id", "account-1", values],
    ["a snapshot from a different account", ACCOUNT, { ...values, documentId: "0f1e2d3c-0000-0000-0000-000000000000" }],
    ["no revision", ACCOUNT, { ...values, revision: undefined }],
    ["a non-integer revision", ACCOUNT, { ...values, revision: 1.5 }],
    ["a revision below the first", ACCOUNT, { ...values, revision: 0 }],
  ])("refuses to save with %s", async (_label, documentId, submitted) => {
    const { result } = renderHook(() => useUpdateProfile(documentId, vi.fn()));

    await expect(result.current.handleSubmit(submitted as never)).rejects.toThrow(
      "Profile form snapshot is unavailable",
    );
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("propagates a failure from the account update", async () => {
    const failure = new Error("offline");
    updateAccount.mockRejectedValue(failure);
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await expect(result.current.handleSubmit(values as never)).rejects.toBe(failure);
  });

  // Every public link and QR code in the dashboard is built from the auth store's username,
  // not from the account query, so a rename that updates only the account leaves them all
  // pointing at the old handle. Nothing else in the app writes that field.
  it("writes a renamed handle back to the auth store", async () => {
    updateAccount.mockResolvedValue({ ...(account as object), handle: "renamed" } as never);
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await act(async () => {
      await result.current.handleSubmit({ ...values, username: "renamed" } as never);
    });

    expect(updateUsername).toHaveBeenCalledWith("renamed");
  });

  // The Music venue name follows the account's display name, and ensureMusicAccount only
  // converges it when something asks - this is what asks. It was inert before the server
  // side was fixed, so it is pinned here rather than left to look decorative.
  it("propagates the saved profile to the Music venue, after the account accepted it", async () => {
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    expect(refreshIdentity).toHaveBeenCalledTimes(1);
    expect(updateAccount).toHaveBeenCalled();
  });

  it("does not propagate to Music when the account refused the save", async () => {
    updateAccount.mockRejectedValue(new Error("conflict"));
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await expect(result.current.handleSubmit(values as never)).rejects.toThrow("conflict");
    expect(refreshIdentity).not.toHaveBeenCalled();
  });

  it("keeps the profile save successful when the Music propagation fails", async () => {
    refreshIdentity.mockRejectedValue(new Error("music unavailable"));
    const refetch = vi.fn();
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, refetch));

    await act(async () => {
      await expect(result.current.handleSubmit(values as never)).resolves.toBeTruthy();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("leaves the stored username alone when it did not change", async () => {
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await act(async () => {
      await result.current.handleSubmit(values as never);
    });

    expect(updateUsername).not.toHaveBeenCalled();
  });

  it("does not advertise a new handle the account refused", async () => {
    updateAccount.mockRejectedValue(new Error("handle is taken"));
    const { result } = renderHook(() => useUpdateProfile(ACCOUNT, vi.fn()));

    await expect(
      result.current.handleSubmit({ ...values, username: "renamed" } as never),
    ).rejects.toThrow("handle is taken");
    expect(updateUsername).not.toHaveBeenCalled();
  });
});
