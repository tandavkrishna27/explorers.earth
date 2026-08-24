import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authState,
  createAccount,
  updateAccount,
  updateUser,
  useAuthStoreMock,
  useMutation,
} = vi.hoisted(
  () => ({
    authState: {
      user: { id: "user-1", documentId: "user-doc", username: "tinoue" },
      token: "token",
      login: vi.fn(),
    },
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    updateUser: vi.fn(),
    useAuthStoreMock: vi.fn(),
    useMutation: vi.fn(),
  }),
);

vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useMutation };
});

vi.mock("../../../../store/store", () => ({
  default: Object.assign(useAuthStoreMock, { getState: () => authState }),
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

const values = {
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
    createAccount.mockReset();
    updateAccount.mockReset();
    updateUser.mockReset();
    useMutation.mockReset();
    useAuthStoreMock.mockReturnValue({ user: authState.user });
    useMutation
      .mockReturnValueOnce([updateAccount])
      .mockReturnValueOnce([createAccount])
      .mockReturnValueOnce([updateUser]);
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
    updateAccount.mockResolvedValue({
      data: { updateAccount: { documentId: "account-1" } },
    });
    const { result } = renderHook(() => useUpdateProfile("account-1", refetch));

    let response: unknown;
    await act(async () => {
      response = await result.current.handleSubmit(values);
    });

    expect(response).toEqual({ documentId: "account-1" });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(updateAccount.mock.calls[0][0].variables.data.social_media).toEqual(
      expect.objectContaining({
        futureSocial: { keep: true },
        localTunes: { visibility: true, futureLocalTunes: 8 },
      }),
    );
  });

  it("throws when the backend does not confirm the update", async () => {
    updateAccount.mockResolvedValue({ data: { updateAccount: null } });
    const { result } = renderHook(() =>
      useUpdateProfile("account-1", vi.fn()),
    );

    await expect(result.current.handleSubmit(values)).rejects.toThrow(
      "Profile update was not confirmed",
    );
  });

  it("propagates GraphQL and network failures", async () => {
    const failure = Object.assign(new Error("offline"), {
      networkError: new Error("offline"),
    });
    updateAccount.mockRejectedValue(failure);
    const { result } = renderHook(() =>
      useUpdateProfile("account-1", vi.fn()),
    );

    await expect(result.current.handleSubmit(values)).rejects.toBe(failure);
  });
});
