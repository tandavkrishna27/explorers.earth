import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProfileForm from "../ProfileForm";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("../../../Favorites/components/TiptapEditor", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div>
      <output data-testid="bio-value">{value}</output>
      <button type="button" onClick={() => onChange("<p>My&nbsp;new bio</p>")}>type-bio</button>
      <button type="button" onClick={() => onChange("<p>My new  bio</p>")}>normalise-bio</button>
      <button type="button" onClick={() => onChange("<p>Really different</p>")}>edit-bio</button>
    </div>
  ),
}));

const formFields = [{
  heading: "Profile",
  defaultOpen: true,
  formFields: [
    { name: "accountName", label: "Account name", type: "text" },
    { name: "bio", label: "dashboard.profile.publicProfile.fields.bio", type: "text" },
  ],
}];

const renderForm = () => {
  const onFormDirtyChange = vi.fn();
  const onRegisterSubmit = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue({ status: "saved", committedRevision: 2 });
  render(<ProfileForm {...({
    initialValues: { accountName: "Original", bio: "<p>Old bio</p>", documentId: "acc", revision: 1 },
    onSubmit, formFields, setPlaces: vi.fn(), DetectLocation: vi.fn(), onFormDirtyChange, onRegisterSubmit,
  } as never)} />);
  return { onFormDirtyChange, onRegisterSubmit, onSubmit };
};

describe("ProfileForm bio dirty state (PRF-06)", () => {
  it("stays clean when the editor re-emits the saved bio in normalised form after save", async () => {
    const { onFormDirtyChange, onRegisterSubmit } = renderForm();
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    fireEvent.click(screen.getByText("type-bio"));
    await waitFor(() => expect(onFormDirtyChange).toHaveBeenLastCalledWith(true));

    await act(async () => { await onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    await waitFor(() => expect(onFormDirtyChange).toHaveBeenLastCalledWith(false));

    fireEvent.click(screen.getByText("normalise-bio"));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onFormDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("still becomes dirty for a real bio edit after save", async () => {
    const { onFormDirtyChange, onRegisterSubmit } = renderForm();
    await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
    fireEvent.click(screen.getByText("type-bio"));
    await act(async () => { await onRegisterSubmit.mock.calls.at(-1)?.[0](); });
    await waitFor(() => expect(onFormDirtyChange).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByText("edit-bio"));
    await waitFor(() => expect(onFormDirtyChange).toHaveBeenLastCalledWith(true));
  });
});
