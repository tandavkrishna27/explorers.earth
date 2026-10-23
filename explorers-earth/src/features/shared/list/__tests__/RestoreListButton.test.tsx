import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string) => d }) }));
const client = vi.hoisted(() => ({ getMyEditableCollection: vi.fn(), restoreMyCollection: vi.fn() }));
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: client }));
import { RestoreListButton } from "../RestoreListButton";

const observed = (category = "movies") => ({ kind: "collection", resourceId: "l1", detail: { id: "l1", category } });
const conflict = () => Object.assign(new Error("Slug taken"), { status: 409 });

describe("RestoreListButton", () => {
  beforeEach(() => {
    client.getMyEditableCollection.mockReset().mockResolvedValue(observed());
    client.restoreMyCollection.mockReset().mockResolvedValue({ id: "l1" });
  });

  it("restores the observed list and calls onRestored", async () => {
    const onRestored = vi.fn();
    render(<RestoreListButton listId="l1" category="movies" onRestored={onRestored} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(client.getMyEditableCollection).toHaveBeenCalledWith("l1", undefined, { archived: true });
    expect(client.restoreMyCollection).toHaveBeenCalledWith(observed(), expect.any(String), {});
  });

  it("a 409 shows the URL field and a restore with the new slug passes {slug}", async () => {
    const onRestored = vi.fn();
    client.restoreMyCollection.mockRejectedValueOnce(conflict());
    render(<RestoreListButton listId="l1" category="movies" onRestored={onRestored} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    const field = await screen.findByLabelText("That URL is used by another list. Pick a new one:");
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restore" })).toBeDisabled();
    fireEvent.change(field, { target: { value: "comfort-movies-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledTimes(1));
    expect(client.restoreMyCollection).toHaveBeenLastCalledWith(observed(), expect.any(String), { slug: "comfort-movies-2" });
  });

  it("a category mismatch never calls restore and shows a message", async () => {
    client.getMyEditableCollection.mockResolvedValue(observed("books"));
    const onRestored = vi.fn();
    render(<RestoreListButton listId="l1" category="movies" onRestored={onRestored} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(client.restoreMyCollection).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it("other errors show their message instead of throwing", async () => {
    client.restoreMyCollection.mockRejectedValue(Object.assign(new Error("Server unavailable"), { status: 503 }));
    render(<RestoreListButton listId="l1" category="movies" onRestored={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    expect(screen.getByRole("button", { name: "Restore" })).toBeEnabled();
  });
});
