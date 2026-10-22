import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// PLC-01. Typing a list name without picking a suggestion and pressing Add Location must
// say so next to the field, not do nothing (or only flash a toast behind the modal).
vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock("../../../store/store", () => ({ default: () => ({ user: { username: "qa" }, token: "t" }) }));
vi.mock("../../../features/Profile/components/AddressInput", () => ({
  default: (props: { onChange: (value: string, origin: string) => void }) =>
    <input aria-label="Location" onChange={e => props.onChange(e.target.value, "input")} />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import AddLocationModal from "../AddLocationModal";

describe("AddLocationModal without a picked suggestion (PLC-01)", () => {
  it.each([["a typed name", "Paris"], ["nothing typed", ""]])("shows a visible field error with %s and does not submit", async (_case, typed) => {
    const onSubmit = vi.fn();
    render(<AddLocationModal isOpen isEditing={false} existingPlaces={[]} onClose={vi.fn()} onSubmit={onSubmit} />);
    if (typed) fireEvent.change(screen.getByLabelText("Location"), { target: { value: typed } });

    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.addLocation" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("toast.error.pickPlaceFromSuggestions"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
