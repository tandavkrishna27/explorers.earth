import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { harness, mutationSubmit, toastError, toastSuccess } = vi.hoisted(() => ({
  harness: {
    nextValues: {} as Record<string, unknown>,
    lastSubmit: undefined as Promise<any> | undefined,
    registeredSubmit: vi.fn<() => Promise<"saved" | "failed" | "cancelled">>(),
    unsavedProps: undefined as any,
    profileFormProps: undefined as any,
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

const account = {
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
          accounts: [account],
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
      </div>
    );
  },
}));

vi.mock("../../components/ui/UsernameChangeConfirmationModal", () => ({
  default: (props: any) =>
    props.isOpen ? (
      <div>
        <button type="button" onClick={props.onConfirm}>
          Confirm username
        </button>
        <button type="button" onClick={props.onClose}>
          Cancel username
        </button>
      </div>
    ) : null,
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
    run: false,
    steps: [],
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
vi.mock("../../features/Profile/components/PreviewModal", () => ({
  PreviewModal: () => null,
}));
vi.mock("../../components/ProfileSetupAccordion", () => ({ default: () => null }));
vi.mock("../../components/SEO", () => ({ default: () => null }));
vi.mock("react-tooltip", () => ({ Tooltip: () => null }));

import Profile from "../Profile";

describe("Profile save orchestration", () => {
  beforeEach(() => {
    harness.nextValues = {};
    harness.lastSubmit = undefined;
    harness.unsavedProps = undefined;
    harness.profileFormProps = undefined;
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

  it("shows exactly Profile, Gallery, and Appearance with their existing fields", () => {
    render(<Profile />);

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent?.trim()),
    ).toEqual(["Profile", "Gallery", "Appearance"]);
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
    expect(
      harness.profileFormProps.formFields.flatMap((section: any) =>
        section.formFields.map((field: any) => field.name),
      ),
    ).toEqual(["feed"]);

    fireEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(
      harness.profileFormProps.formFields.flatMap((section: any) =>
        section.formFields.map((field: any) => field.name),
      ),
    ).toEqual(["theme_settings"]);
  });
});
