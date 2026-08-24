import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accountScope, harness, mutationSubmit, toastError, toastSuccess } = vi.hoisted(() => ({
  accountScope: {
    current: {
      documentId: "account-1",
      Account_Name: "Tinoue",
      Account_Type: "personal",
      Bio: "Bio",
      Addresss: {},
      Primary_Address: {},
      Public_Profile_Address: null,
      Feed_Data: [],
      social_media: {
        futureSocial: { keep: true },
        theme_settings: { preset: "cinematic-dark" },
      },
      profile_picture: null,
      bg_picture: null,
    } as any,
  },
  harness: {
    nextValues: {} as Record<string, unknown>,
    lastSubmit: undefined as Promise<any> | undefined,
    registeredSubmit: vi.fn<() => Promise<"saved" | "failed" | "cancelled">>(),
    unsavedProps: undefined as any,
    usernameProps: undefined as any,
    profileFormProps: undefined as any,
    walkthroughEnabled: false,
  },
  mutationSubmit: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess, warning: vi.fn() },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { error?: string }) =>
      options?.error ? `${key}:${options.error}` : key,
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
          accounts: [accountScope.current],
        },
      },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("../../store/store", () => ({
  default: () => ({
    user: { documentId: "user-doc", username: "tinoue" },
    token: "token",
  }),
}));

vi.mock("../../features/Profile/hooks/useUpdateProfile", () => ({
  useUpdateProfile: () => ({ handleSubmit: mutationSubmit }),
}));

vi.mock("../../features/Profile/components/ProfileForm", () => ({
  default: (props: any) => {
    harness.profileFormProps = props;
    props.onRegisterSubmit(harness.registeredSubmit);
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            harness.lastSubmit = props.onSubmit({
              ...props.initialValues,
              ...harness.nextValues,
            });
          }}
        >
          Submit profile
        </button>
        <button type="button" onClick={() => props.onFormDirtyChange(true)}>
          Make dirty
        </button>
        <button type="button" onClick={() => props.onFeedDataChange()}>
          Make Feed dirty
        </button>
      </div>
    );
  },
}));

vi.mock("../../components/ui/UsernameChangeConfirmationModal", () => ({
  default: (props: any) => {
    harness.usernameProps = props;
    return props.isOpen ? (
        <div>
          <span>{props.newUsername}</span>
          <button type="button" onClick={props.onConfirm}>
            Confirm username
          </button>
          <button type="button" onClick={props.onClose}>
            Cancel username
          </button>
        </div>
      ) : null;
  },
}));

vi.mock("../../components/ui/UnsavedChangesModal", () => ({
  default: (props: any) => {
    harness.unsavedProps = props;
    return props.isOpen ? (
      <button type="button" onClick={props.onSave}>
        Save unsaved changes
      </button>
    ) : null;
  },
}));

vi.mock("../../features/Profile/hooks/useReverseGeocoding", () => ({
  useReverseGeocoding: () => ({
    currentLocation: null,
    mappedAddress: {},
    handleGetCurrentLocation: vi.fn(),
  }),
}));
vi.mock("../../hooks/useProfileWalkthrough", () => ({
  useProfileWalkthrough: () => ({
    run: harness.walkthroughEnabled,
    steps: harness.walkthroughEnabled ? [{ target: "body", content: "step" }] : [],
    stepIndex: 0,
    setRun: vi.fn(),
    setStepIndex: vi.fn(),
    handleJoyrideCallback: vi.fn(),
    advanceToNextStep: vi.fn(),
    markProcessingComplete: vi.fn(),
  }),
}));
vi.mock("../../store/useSetupStore", () => ({
  default: () => ({
    isProfileComplete: true,
    isRecommendationsComplete: true,
    setSetupStatus: vi.fn(),
  }),
}));
vi.mock("../../utils/setupStatusCalculations", () => ({
  calculateIsProfileComplete: () => true,
}));
vi.mock("../../components/ImageCropper", () => ({ default: () => null }));
vi.mock("../../assets/icons/Gmail", () => ({
  default: () => <span data-testid="gmail-preview-icon" />,
}));
vi.mock("../../features/Profile/components/PreviewModal", () => ({
  PreviewModal: () => null,
}));
vi.mock("../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-tooltip", () => ({ Tooltip: () => null }));
vi.mock("react-joyride", () => ({
  default: () => <div aria-label="profile walkthrough" />,
}));

import Profile from "../Profile";

describe("Profile save orchestration", () => {
  beforeEach(() => {
    accountScope.current = {
      documentId: "account-1",
      Account_Name: "Tinoue",
      Account_Type: "personal",
      Bio: "Bio",
      Addresss: {},
      Primary_Address: {},
      Public_Profile_Address: null,
      Feed_Data: [],
      social_media: {
        futureSocial: { keep: true },
        theme_settings: { preset: "cinematic-dark" },
      },
      profile_picture: null,
      bg_picture: null,
    };
    harness.nextValues = {};
    harness.lastSubmit = undefined;
    harness.unsavedProps = undefined;
    harness.usernameProps = undefined;
    harness.profileFormProps = undefined;
    harness.walkthroughEnabled = false;
    harness.registeredSubmit.mockReset();
    mutationSubmit.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("returns saved and shows one success only after mutation completion", async () => {
    let resolveMutation!: (value: unknown) => void;
    mutationSubmit.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    render(<Profile />);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    expect(toastSuccess).not.toHaveBeenCalled();

    resolveMutation({ documentId: "account-1" });
    await expect(harness.lastSubmit).resolves.toEqual({ status: "saved" });
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("returns failed, retains the edit, and shows one error on rejection", async () => {
    const failure = Object.assign(new Error("offline"), {
      networkError: new Error("offline"),
    });
    mutationSubmit.mockRejectedValue(failure);
    harness.nextValues = { accountName: "Unsaved edit" };
    render(<Profile />);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));

    await expect(harness.lastSubmit).resolves.toEqual({ status: "failed" });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(mutationSubmit.mock.calls[0][0].accountName).toBe("Unsaved edit");
  });

  it("defers username saves until confirmation and resolves cancellation", async () => {
    harness.nextValues = { username: "tinoue-new" };
    render(<Profile />);
    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const result = await harness.lastSubmit;

    expect(result.status).toBe("deferred");
    expect(mutationSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel username" }));
    await expect(result.completion).resolves.toBe("cancelled");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("supports username failure followed by a successful retry", async () => {
    mutationSubmit
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce({ documentId: "account-1" });
    harness.nextValues = { username: "tinoue-new" };
    render(<Profile />);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const failedResult = await harness.lastSubmit;
    fireEvent.click(screen.getByRole("button", { name: "Confirm username" }));
    await expect(failedResult.completion).resolves.toBe("failed");
    expect(toastError).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const retryResult = await harness.lastSubmit;
    fireEvent.click(screen.getByRole("button", { name: "Confirm username" }));
    await expect(retryResult.completion).resolves.toBe("saved");
    expect(mutationSubmit).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps account B dirty and submitting when account A's confirmed save resolves", async () => {
    let resolveAccountA!: (value: unknown) => void;
    let resolveAccountB!: (value: unknown) => void;
    mutationSubmit
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveAccountA = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveAccountB = resolve;
      }));
    harness.walkthroughEnabled = true;
    harness.nextValues = { username: "tinoue-a" };
    render(<Profile />);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const accountAResult = await harness.lastSubmit;
    let accountAConfirmation!: Promise<void>;
    act(() => {
      accountAConfirmation = harness.usernameProps.onConfirm();
    });
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(1));

    accountScope.current = {
      ...accountScope.current,
      documentId: "account-2",
      Account_Name: "Second account",
      Bio: "Second bio",
    };
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    await waitFor(() =>
      expect(harness.profileFormProps.scopeKey).toBe("account-2"),
    );
    await expect(accountAResult.completion).resolves.toBe("cancelled");

    fireEvent.click(screen.getByRole("button", { name: "Make Feed dirty" }));
    harness.nextValues = { username: "tinoue-b" };
    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const accountBResult = await harness.lastSubmit;
    let accountBConfirmation!: Promise<void>;
    act(() => {
      accountBConfirmation = harness.usernameProps.onConfirm();
    });
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText("profile walkthrough")).not.toBeInTheDocument();

    await act(async () => {
      resolveAccountA({ documentId: "account-1" });
      await accountAConfirmation;
    });

    const accountBUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(accountBUnload);
    expect(accountBUnload.defaultPrevented).toBe(true);
    expect(screen.queryByLabelText("profile walkthrough")).not.toBeInTheDocument();
    expect(toastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveAccountB({ documentId: "account-2" });
      await accountBConfirmation;
    });
    await expect(accountBResult.completion).resolves.toBe("saved");
    expect(screen.getByLabelText("profile walkthrough")).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps account B's username confirmation when account A's confirmed save rejects", async () => {
    let rejectAccountA!: (reason?: unknown) => void;
    mutationSubmit
      .mockReturnValueOnce(new Promise((_, reject) => {
        rejectAccountA = reject;
      }))
      .mockResolvedValueOnce({ documentId: "account-2" });
    harness.nextValues = { username: "tinoue-a" };
    render(<Profile />);

    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const accountAResult = await harness.lastSubmit;
    let accountAConfirmation!: Promise<void>;
    act(() => {
      accountAConfirmation = harness.usernameProps.onConfirm();
    });
    await waitFor(() => expect(mutationSubmit).toHaveBeenCalledTimes(1));

    accountScope.current = {
      ...accountScope.current,
      documentId: "account-2",
      Account_Name: "Second account",
      Bio: "Second bio",
    };
    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    await waitFor(() =>
      expect(harness.profileFormProps.scopeKey).toBe("account-2"),
    );
    await expect(accountAResult.completion).resolves.toBe("cancelled");

    harness.nextValues = { username: "tinoue-b" };
    fireEvent.click(screen.getByRole("button", { name: "Submit profile" }));
    const accountBResult = await harness.lastSubmit;
    expect(screen.getByText("tinoue-b")).toBeInTheDocument();

    await act(async () => {
      rejectAccountA(new Error("account A failed late"));
      await accountAConfirmation;
    });

    expect(screen.getByText("tinoue-b")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm username" })).toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    let accountBConfirmation!: Promise<void>;
    act(() => {
      accountBConfirmation = harness.usernameProps.onConfirm();
    });
    await accountBConfirmation;
    await expect(accountBResult.completion).resolves.toBe("saved");
    expect(mutationSubmit).toHaveBeenCalledTimes(2);
    expect(toastSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps the unsaved modal recoverable on failure and closes it on success", async () => {
    harness.registeredSubmit
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("saved");
    render(<Profile />);

    await act(async () => {
      await harness.unsavedProps.onSave();
    });
    await waitFor(() => expect(harness.unsavedProps.isOpen).toBe(true));

    await act(async () => {
      await harness.unsavedProps.onSave();
    });
    await waitFor(() => expect(harness.unsavedProps.isOpen).toBe(false));
    expect(harness.registeredSubmit).toHaveBeenCalledTimes(2);
  });

  it("exposes exactly three icon tabs as a roving, activating editor rail", () => {
    render(<Profile />);

    const tablist = screen.getByRole("tablist", { name: "Public profile editor" });
    expect(tablist).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Profile",
      "Gallery",
      "Appearance",
    ]);
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(["", "", ""]);
    expect(tabs.map((tab) => tab.getAttribute("data-tooltip-id"))).toEqual([
      "profile-editor-tab-tooltip",
      "profile-editor-tab-tooltip",
      "profile-editor-tab-tooltip",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("data-tooltip-content"))).toEqual([
      "Profile",
      "Gallery",
      "Appearance",
    ]);
    expect(
      tabs.map((tab) => tab.getAttribute("data-profile-editor-tab-position")),
    ).toEqual(["first", "middle", "last"]);
    expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual([
      "0",
      "-1",
      "-1",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("routes every editor workspace through the same complete initial snapshot", () => {
    render(<Profile />);

    const expectedInitialValues = {
      username: "tinoue",
      accountName: "Tinoue",
      accountType: "personal",
      bio: "Bio",
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
      mobilenumberVisiblity: undefined,
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
      Feed_Data: [],
      social_media: {
        futureSocial: { keep: true },
        theme_settings: { preset: "cinematic-dark" },
      },
      theme_settings: { preset: "cinematic-dark" },
      businessPlaceId: "",
    };

    expect(harness.profileFormProps.initialValues).toStrictEqual(expectedInitialValues);
    expect(harness.profileFormProps.surface).toBe("flat");
    expect(
      harness.profileFormProps.formFields.flatMap((section: any) =>
        section.formFields.map((field: any) => field.name),
      ),
    ).toEqual([
      "bio",
      "accountName",
      "primaryAddressCombined",
      "socialLinks",
      "businessLocation",
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "Gallery" }));
    expect(harness.profileFormProps.initialValues).toEqual(expectedInitialValues);
    expect(
      harness.profileFormProps.formFields.flatMap((section: any) =>
        section.formFields.map((field: any) => field.name),
      ),
    ).toEqual(["feed"]);

    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(harness.profileFormProps.initialValues).toEqual(expectedInitialValues);
    expect(
      harness.profileFormProps.formFields.flatMap((section: any) =>
        section.formFields.map((field: any) => field.name),
      ),
    ).toEqual(["theme_settings"]);
  });

  it("prefers canonical email data in the editor snapshot and profile preview", () => {
    accountScope.current = {
      ...accountScope.current,
      social_media: {
        email: { link: "canonical@example.com", visibility: true },
        gmail: { link: "legacy@example.com", visibility: true },
        theme_settings: { preset: "cinematic-dark" },
      },
    };

    render(<Profile />);

    expect(harness.profileFormProps.initialValues.gmailLink).toBe(
      "canonical@example.com",
    );
    expect(harness.profileFormProps.initialValues.gmailvisiblity).toBe(true);
    expect(screen.getByTestId("gmail-preview-icon")).toBeInTheDocument();
  });

  it("retains legacy gmail data in the editor snapshot and profile preview", () => {
    accountScope.current = {
      ...accountScope.current,
      social_media: {
        gmail: { link: "legacy@example.com", visibility: true },
        theme_settings: { preset: "cinematic-dark" },
      },
    };

    render(<Profile />);

    expect(harness.profileFormProps.initialValues.gmailLink).toBe(
      "legacy@example.com",
    );
    expect(harness.profileFormProps.initialValues.gmailvisiblity).toBe(true);
    expect(screen.getByTestId("gmail-preview-icon")).toBeInTheDocument();
  });

  it("rejects an invalid canonical email from the profile preview without falling back", () => {
    accountScope.current = {
      ...accountScope.current,
      social_media: {
        email: { link: "javascript:alert(document.domain)", visibility: true },
        gmail: { link: "legacy@example.com", visibility: true },
        theme_settings: { preset: "cinematic-dark" },
      },
    };

    render(<Profile />);

    expect(harness.profileFormProps.initialValues.gmailLink).toBe(
      "javascript:alert(document.domain)",
    );
    expect(screen.queryByTestId("gmail-preview-icon")).toBeNull();
  });

  it("rejects an invalid legacy gmail value from the profile preview", () => {
    accountScope.current = {
      ...accountScope.current,
      social_media: {
        gmail: { link: "not-an-email", visibility: true },
        theme_settings: { preset: "cinematic-dark" },
      },
    };

    render(<Profile />);

    expect(harness.profileFormProps.initialValues.gmailLink).toBe("not-an-email");
    expect(screen.queryByTestId("gmail-preview-icon")).toBeNull();
  });
});
