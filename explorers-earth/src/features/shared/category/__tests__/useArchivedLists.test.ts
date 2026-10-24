import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const client = vi.hoisted(() => ({ getAllMyCollections: vi.fn() }));
vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: client }));
const auth = vi.hoisted(() => ({ accountId: "acc" as string | null }));
vi.mock("../../../../store/store", () => ({ default: (select: (s: typeof auth) => unknown) => select(auth) }));

import { useArchivedLists } from "../useArchivedLists";

const page = (items: unknown[]) => ({ complete: true, items, snapshot: "s", accountId: "acc", generation: 1 });

describe("useArchivedLists", () => {
  beforeEach(() => { client.getAllMyCollections.mockReset(); auth.accountId = "acc"; });

  it("reads the category's archived collections and maps them to cards", async () => {
    client.getAllMyCollections.mockResolvedValue(page([{ id: "z", title: "Old list", visibility: "private" }]));
    const { result } = renderHook(() => useArchivedLists("movies"));
    await waitFor(() => expect(result.current.lists).toHaveLength(1));
    expect(client.getAllMyCollections).toHaveBeenCalledWith({ category: "movies", status: "archived", limit: 100 }, expect.any(AbortSignal));
    expect(result.current.lists[0]).toEqual({ id: "z", title: "Old list", status: "draft", itemCount: 0, pinnedCount: 0, covers: [] });
  });

  it("reload re-reads, and a failed read yields no archived lists", async () => {
    client.getAllMyCollections.mockResolvedValueOnce(page([{ id: "z", title: "Old", visibility: "public" }])).mockRejectedValueOnce(new Error("down"));
    const { result } = renderHook(() => useArchivedLists("places"));
    await waitFor(() => expect(result.current.lists).toHaveLength(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.lists).toEqual([]));
    expect(client.getAllMyCollections).toHaveBeenCalledTimes(2);
  });

  it("does not read when signed out", () => {
    auth.accountId = null;
    const { result } = renderHook(() => useArchivedLists("books"));
    expect(result.current.lists).toEqual([]);
    expect(client.getAllMyCollections).not.toHaveBeenCalled();
  });
});
