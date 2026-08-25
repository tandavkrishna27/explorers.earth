import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferredProfileSave } from "../../types/profileSave";
import ProfileForm from "../ProfileForm";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const formFields = [
  {
    heading: "Profile",
    formFields: [
      { name: "accountName", label: "Account name", type: "text" },
    ],
  },
];

const renderForm = ({
  onSubmit,
  onFormDirtyChange = vi.fn(),
  onRegisterSubmit = vi.fn(),
}: {
  onSubmit: ReturnType<typeof vi.fn>;
  onFormDirtyChange?: ReturnType<typeof vi.fn>;
  onRegisterSubmit?: ReturnType<typeof vi.fn>;
}) => {
  render(
    <ProfileForm
      {...({
        initialValues: { accountName: "Original" },
        onSubmit,
        formFields,
        setPlaces: vi.fn(),
        DetectLocation: vi.fn(),
        onFormDirtyChange,
        onRegisterSubmit,
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
});
