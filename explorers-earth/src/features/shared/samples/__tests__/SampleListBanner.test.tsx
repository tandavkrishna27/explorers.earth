import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const api = vi.hoisted(() => ({ getMyEditableCollection: vi.fn(), makeMyCollectionMine: vi.fn(), purgeMyCollection: vi.fn() }));
vi.mock("../../../../lib/explorersApiClient", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/explorersApiClient")>();
  return { ExplorersApiError: real.ExplorersApiError, explorersApiClient: api };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SampleListBanner, useSampleState } from "../SampleListBanner";

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyEditableCollection.mockResolvedValue({ resourceId: "g1", resourceRevision: 2 });
  api.makeMyCollectionMine.mockResolvedValue({ id: "g1", revision: 3, isSample: false });
  api.purgeMyCollection.mockResolvedValue({ deleted: true });
});

describe("SampleListBanner (generic, for Places and Guides pages)", () => {
  it("renders nothing for an ordinary collection", () => {
    const { container } = render(<SampleListBanner collection={{ isSample: false }} listId="g1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows badge, hint and bar; Make it mine converts and refetches", async () => {
    const onChanged = vi.fn();
    render(<SampleListBanner collection={{ isSample: true }} listId="g1" onChanged={onChanged} />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(screen.getByText("Only you can see this · can't be published")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    expect(await screen.findByText("Now yours")).toHaveAttribute("role", "status");
    expect(api.makeMyCollectionMine).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalled();
  });

  it("Delete sample confirms, purges and calls onDeleted", async () => {
    const onDeleted = vi.fn();
    render(<SampleListBanner collection={{ isSample: true }} listId="g1" onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete sample" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    expect(api.purgeMyCollection).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("useSampleState gives the pill state and hides sharing for a sample only", () => {
    const sample = renderHook(() => useSampleState({ isSample: true })).result.current;
    expect(sample).toEqual({ isSample: true, publishDisabled: true, hideSharing: true,
      publishReason: "Samples can't be published. Make it mine to edit and publish it." });
    const mine = renderHook(() => useSampleState({})).result.current;
    expect(mine).toEqual({ isSample: false, publishDisabled: false, hideSharing: false, publishReason: undefined });
  });
});
