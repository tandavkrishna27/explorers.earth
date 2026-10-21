import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// AddressInput pulls in the Google Maps hook — stub it out.
vi.mock("@vis.gl/react-google-maps", () => ({ useMapsLibrary: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock("../../../store/store", () => ({
  default: () => ({ user: { username: "qa" }, token: "t" }),
}));
vi.mock("../../../features/Profile/components/AddressInput", () => ({
  default: (props: any) => <input aria-label="Location" disabled={props.disabled} value={props.initalValue} readOnly />,
}));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import AddLocationModal from "../AddLocationModal";

// Editing mode skips the "select a place" guard, so we can drive submit purely
// from the returned boolean contract.
const baseProps = {
  isOpen: true,
  isEditing: true,
  existingPlaces: [],
  initialValues: { listName: "Paris", placeUrl: "paris" },
};

describe("AddLocationModal submit contract (BUG-5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the modal OPEN when the submitter returns false", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(false);

    render(<AddLocationModal {...baseProps} onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // The submit failed → modal must not close.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the modal OPEN when the submitter rejects", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<AddLocationModal {...baseProps} onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the modal only on explicit success (true)", async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(true);

    render(<AddLocationModal {...baseProps} onClose={onClose} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe("canonical location edit identity", () => {
  const initialValues = { documentId: "location-a", listName: "Fixture Zero City", placeUrl: "fixture-zero-city", placeId: "provider-city" };
  const self = { documentId: "location-a", slug: "fixture-zero-city", List_Name_Details: { place_id: "provider-city" } };
  beforeEach(() => vi.clearAllMocks());

  it("enables the share slug while keeping geography disabled", () => {
    render(<AddLocationModal {...baseProps} initialValues={initialValues} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText("Enter the Name to a create a Shareable link")).toBeEnabled();
    expect(screen.getByLabelText("Location")).toBeDisabled();
  });

  it("submits a changed slug without treating the same native row as a duplicate", async () => {
    const submit = vi.fn().mockResolvedValue(true);
    const close = vi.fn();
    render(<AddLocationModal {...baseProps} initialValues={initialValues} existingPlaces={[self]} onClose={close} onSubmit={submit} />);
    fireEvent.change(screen.getByPlaceholderText("Enter the Name to a create a Shareable link"), { target: { value: "edited-fixture-city" } });
    fireEvent.change(screen.getByPlaceholderText("Enter a note related to your Recommendation"), { target: { value: "updated note" } });
    fireEvent.change(screen.getByPlaceholderText("Enter URL (Youtube / Instagram)"), { target: { value: "https://example.com/social" } });
    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ placeUrl: "edited-fixture-city", listName: initialValues.listName, placeId: initialValues.placeId, note: "updated note", recommendationSocialLink: "https://example.com/social" })));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(["other-slug", "fixture-zero-city"])("refuses another native row with the same provider even at slug %s", async (slug) => {
    const submit = vi.fn();
    const close = vi.fn();
    render(<AddLocationModal {...baseProps} initialValues={initialValues} existingPlaces={[self, { ...self, documentId: "location-b", slug }]} onClose={close} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("toast.error.locationAlreadyExists"));
    expect(submit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("does not treat missing native IDs as self identity", async () => {
    const submit = vi.fn();
    render(<AddLocationModal {...baseProps} initialValues={{ ...initialValues, documentId: undefined }} existingPlaces={[{ ...self, documentId: undefined }]} onClose={vi.fn()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(submit).not.toHaveBeenCalled();
  });

  it("requires a nonempty share slug", async () => {
    const submit = vi.fn();
    render(<AddLocationModal {...baseProps} initialValues={{ ...initialValues, placeUrl: "" }} onClose={vi.fn()} onSubmit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "dashboard.categoryPages.updateLocation" }));
    await screen.findByText("Url name is Required");
    expect(submit).not.toHaveBeenCalled();
  });
});
