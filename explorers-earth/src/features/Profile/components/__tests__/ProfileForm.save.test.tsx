import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredProfileSave } from "../../types/profileSave";
import ProfileForm from "../ProfileForm";

const { settingsQuery } = vi.hoisted(() => ({
  settingsQuery: {
    data: {
      usersPermissionsUser: {
        username: "settings-user",
        createdAt: "2020-01-01T00:00:00.000Z",
        updatedAt: "2020-01-01T00:00:00.000Z",
        accounts: [{
          documentId: "settings-account",
          Account_Name: "Settings account",
          Account_Type: "personal",
          mobile_number: "+919999999999",
          Bio: "Settings bio",
          Addresss: {},
          Primary_Address: {},
          Public_Profile_Address: null,
          Feed_Data: [],
          social_media: {},
        }],
      },
    },
    loading: false,
    error: undefined,
    refetch: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("../../api/useCanonicalAccount", () => ({
  useCanonicalAccount: () => ({ data: { id: "00000000-0000-4000-8000-000000000001", handle: "settings-user",
    displayName: "Settings account", accountType: "Personal", onboardingStatus: "complete", revision: 1,
    bioPlain: "Settings bio", primaryAddress: {}, additionalAddresses: [], publicAddress: null, feedItems: [],
    socialLinks: [], themeSettings: {}, mobileNumber: "+919999999999", mobileNumberVisible: false,
    publicProfile: true, autoPinning: true }, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock("@apollo/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@apollo/client")>();
  return { ...actual, useQuery: () => settingsQuery };
});
vi.mock("../../../../store/store", () => ({
  default: () => ({ user: { documentId: "user-doc", username: "settings-user" }, token: "token" }),
}));
vi.mock("../../hooks/useUpdateProfile", () => ({
  useUpdateProfile: () => ({ handleSubmit: vi.fn().mockResolvedValue({ documentId: "settings-account" }) }),
}));
vi.mock("../../hooks/useReverseGeocoding", () => ({
  useReverseGeocoding: () => ({ currentLocation: null, mappedAddress: {}, handleGetCurrentLocation: vi.fn() }),
}));
vi.mock("../../../../components/ui/UsernameChangeConfirmationModal", () => ({ default: () => null }));
vi.mock("../../../../components/ui/UsernameInput", () => ({
  default: ({ name }: { name: string }) => <input aria-label={name} />,
}));

import ProfileAccountSettings from "../../../Settings/components/ProfileAccountSettings";

const formFields = [
  {
    heading: "Profile",
    defaultOpen: true,
    formFields: [
      { name: "accountName", label: "Account name", type: "text" },
    ],
  },
];

const renderForm = ({
  onSubmit,
  onFormDirtyChange = vi.fn(),
  onRegisterSubmit = vi.fn(),
  surface,
  externalRevisionAdvance,
}: {
  onSubmit: ReturnType<typeof vi.fn>;
  onFormDirtyChange?: ReturnType<typeof vi.fn>;
  onRegisterSubmit?: ReturnType<typeof vi.fn>;
  surface?: "contained" | "flat";
  externalRevisionAdvance?: { accountId: string; fromRevision: number; toRevision: number };
}) => {
  render(
    <ProfileForm
      {...({
        initialValues: { accountName: "Original", documentId: "settings-account", revision: 1 },
        onSubmit,
        formFields,
        setPlaces: vi.fn(),
        DetectLocation: vi.fn(),
        onFormDirtyChange,
        onRegisterSubmit,
        surface,
        externalRevisionAdvance,
      } as never)}
    />,
  );
  return { onFormDirtyChange, onRegisterSubmit };
};

const makeDirty = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
  });
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Edited" },
  });
};

describe("ProfileForm save outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers a submit action and clears dirty state only after saved", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: "saved" });
    const { onFormDirtyChange, onRegisterSubmit } = renderForm({ onSubmit });
    await makeDirty();
    await waitFor(() =>
      expect(onFormDirtyChange).toHaveBeenLastCalledWith(true),
    );
    const registeredSubmit = onRegisterSubmit.mock.calls.at(-1)?.[0];

    await expect(registeredSubmit()).resolves.toBe("saved");

    await waitFor(() =>
      expect(onFormDirtyChange).toHaveBeenLastCalledWith(false),
    );
  });

  it("uses each committed revision for consecutive saves in the same mounted form", async () => {
    const onSubmit = vi.fn()
      .mockResolvedValueOnce({ status: "saved", committedRevision: 2 })
      .mockResolvedValueOnce({ status: "saved", committedRevision: 3 });
    const { onRegisterSubmit } = renderForm({ onSubmit });
    await makeDirty();
    await act(async () => { await onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited again" } });
    await act(async () => { await onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    expect(onSubmit.mock.calls.map(([values]) => values.revision)).toEqual([1, 2]);
    expect(onSubmit.mock.calls[1][0].accountName).toBe("Edited again");
  });

  it("preserves edits typed during a deferred save and advances its committed revision", async () => {
    const deferred = createDeferredProfileSave();
    const onSubmit = vi.fn().mockResolvedValueOnce(deferred.result)
      .mockResolvedValueOnce({ status: "saved", committedRevision: 3 });
    const { onRegisterSubmit, onFormDirtyChange } = renderForm({ onSubmit });
    await makeDirty();
    let pending!: Promise<unknown>;
    act(() => { pending = onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Typed during save" } });
    await act(async () => { deferred.settle("saved", 2); await pending; });
    expect(screen.getByRole("textbox")).toHaveValue("Typed during save");
    expect(onFormDirtyChange).toHaveBeenLastCalledWith(true);
    await act(async () => { await onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ accountName: "Typed during save", revision: 2 });
  });

  it("advances the mounted form after its own avatar save", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: "saved", committedRevision: 3 });
    const { rerender } = render(<ProfileForm {...({ initialValues: { accountName: "Original",
      documentId: "settings-account", revision: 1 }, onSubmit, formFields, setPlaces: vi.fn(),
      DetectLocation: vi.fn() } as never)} />);
    rerender(<ProfileForm {...({ initialValues: { accountName: "Original",
      documentId: "settings-account", revision: 1 }, onSubmit, formFields, setPlaces: vi.fn(),
      DetectLocation: vi.fn(), externalRevisionAdvance: { accountId: "settings-account",
        fromRevision: 1, toRevision: 2 } } as never)} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "After avatar" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "dashboard.profile.common.saveAndPublish" })); });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, accountName: "After avatar" }));
  });

  it.each(["failed", "cancelled"] as const)(
    "retains dirty state after a terminal %s outcome",
    async (terminal) => {
      const deferred = createDeferredProfileSave();
      const onSubmit = vi.fn().mockResolvedValue(deferred.result);
      const { onFormDirtyChange, onRegisterSubmit } = renderForm({ onSubmit });
      await makeDirty();
      await waitFor(() =>
        expect(onFormDirtyChange).toHaveBeenLastCalledWith(true),
      );
      const registeredSubmit = onRegisterSubmit.mock.calls.at(-1)?.[0];

      const completion = registeredSubmit();
      deferred.settle(terminal);

      await expect(completion).resolves.toBe(terminal);
      expect(onFormDirtyChange).toHaveBeenLastCalledWith(true);
    },
  );

  it("removes only the outer bordered surface when Profile requests flat rendering", () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: "saved" });
    renderForm({ onSubmit, surface: "flat" });

    const surface = screen.getByRole("textbox").closest("form")
      ?.firstElementChild;
    expect(surface).not.toHaveClass("border");
    expect(surface).not.toHaveClass("rounded-2xl");
  });

  it("keeps the contained outer surface available for Settings forms", () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: "saved" });
    renderForm({ onSubmit, surface: "contained" });

    const surface = screen.getByRole("textbox").closest("form")
      ?.firstElementChild;
    expect(surface).toHaveClass("border");
    expect(surface).toHaveClass("rounded-2xl");
  });

  it("renders the shared Save action inside the responsive floating dock", () => {
    renderForm({
      onSubmit: vi.fn().mockResolvedValue({ status: "saved" }),
      surface: "flat",
    });

    const saveButton = screen.getByRole("button", {
      name: "dashboard.profile.common.saveAndPublish",
    });
    expect(saveButton.closest(".profile-editor-save-dock")).not.toBeNull();
  });

  it("keeps the real Settings account call site on the contained default", () => {
    render(<ProfileAccountSettings section="account" />);

    const sectionTrigger = screen.getByRole("button", {
      name: "dashboard.profile.account.sections.account",
    });
    expect(sectionTrigger).toHaveAttribute("aria-expanded", "false");
    const surface = sectionTrigger.closest("form")?.firstElementChild;
    expect(surface).toHaveClass("border");
    expect(surface).toHaveClass("rounded-2xl");
  });

  it("marks a social visibility toggle dirty", async () => {
    const onFormDirtyChange = vi.fn();
    const { container } = render(
      <ProfileForm
        {...({
          initialValues: {
            instagramLink: "https://instagram.com/tinoue",
            instagramvisiblity: false,
          },
          onSubmit: vi.fn().mockResolvedValue({ status: "saved" }),
          formFields: [{
            heading: "Social",
            defaultOpen: true,
            formFields: [{
              name: "socialLinks",
              label: "Social media",
              type: "custom",
              components: [{
                name: "instagramLink",
                label: "dashboard.profile.publicProfile.fields.instagram",
                type: "text",
              }],
            }],
          }],
          setPlaces: vi.fn(),
          DetectLocation: vi.fn(),
          onFormDirtyChange,
        } as never)}
      />,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });

    const visibilityToggle = container.querySelector<HTMLButtonElement>(
      'button[data-tooltip-id="visibility-tooltip"]',
    );
    expect(visibilityToggle).not.toBeNull();
    fireEvent.click(visibilityToggle!);

    await waitFor(() =>
      expect(onFormDirtyChange).toHaveBeenLastCalledWith(true),
    );
  });

  it("shares one in-flight save between the visible and registered entry points", async () => {
    const deferred = createDeferredProfileSave();
    const onSubmit = vi.fn().mockResolvedValue(deferred.result);
    const { onRegisterSubmit } = renderForm({ onSubmit });
    const registeredSubmit = onRegisterSubmit.mock.calls.at(-1)?.[0];

    let navigationCompletion!: Promise<"saved" | "failed" | "cancelled">;
    let repeatedNavigationCompletion!: Promise<"saved" | "failed" | "cancelled">;
    act(() => {
      fireEvent.click(screen.getByRole("button", {
        name: "dashboard.profile.common.saveAndPublish",
      }));
      navigationCompletion = registeredSubmit();
      repeatedNavigationCompletion = registeredSubmit();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(repeatedNavigationCompletion).toBe(navigationCompletion);
    await act(async () => {
      deferred.settle("saved");
      await navigationCompletion;
    });
    await expect(navigationCompletion).resolves.toBe("saved");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
