import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { startTransition, Suspense, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { usePublicPagedResource, type PublicPagedOptions } from "../usePublicPagedResource";
import { mergePublicPage, readPublicPageRows } from "../publicProfilePagination";

const rows = (start: number, count: number) => Array.from({ length: count }, (_, i) => ({ documentId: `app-${start + i}` }));
const page = (start: number, count: number) => ({ appLists: rows(start, count) });
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const options = (overrides: Partial<PublicPagedOptions> = {}): PublicPagedOptions => ({
  scope: "alice:apps", enabled: true,
  readFirst: async () => page(0, 12), readNext: async () => page(12, 1),
  readRows: (data) => readPublicPageRows(data, "apps", false),
  merge: (a, b) => mergePublicPage(a, b, "apps", false),
  ...overrides,
});

describe("usePublicPagedResource", () => {
  it("honors a validated 24-row size and rejects an oversized response", async () => {
    const { result } = renderHook(() => usePublicPagedResource(options({
      pageSize: 24, readFirst: async () => page(0, 24), readNext: async () => page(24, 25),
    })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.appLists).toHaveLength(24);
    expect(result.current.hasMore).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data?.appLists).toHaveLength(24);
    expect(result.current.loadMoreError).toEqual(new Error("PUBLIC_PROFILE_INVALID_RESPONSE"));
  });

  it("rejects an unvalidated size without exposing rows", async () => {
    const { result } = renderHook(() => usePublicPagedResource(options({ pageSize: 25 as 12 })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_INVALID_RESPONSE"));
  });
  it.each([
    [0, []], [1, []], [11, []], [12, [12]], [13, [12]], [24, [12, 24]], [25, [12, 24]],
  ] as [number, number[]][])("loads %i rows in bounded pages including empty exact terminals", async (total, offsets) => {
    const readNext = vi.fn(async (offset: number) => page(offset, Math.min(12, total - offset)));
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst: async () => page(0, Math.min(12, total)), readNext })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    for (const offset of offsets) {
      expect(result.current.hasMore).toBe(true);
      await act(async () => { await result.current.loadMore(); });
      expect(readNext).toHaveBeenLastCalledWith(offset, expect.any(AbortSignal), false);
    }
    expect(result.current.data?.appLists).toHaveLength(total);
    expect(result.current.hasMore).toBe(false);
    expect(readNext).toHaveBeenCalledTimes(offsets.length);
  });

  it("deduplicates the first page but advances the cursor by raw rows", async () => {
    const readNext = vi.fn().mockResolvedValue({ appLists: [{ documentId: "app-0" }, { documentId: "next" }] });
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst: async () => ({ appLists: [...rows(0, 11), ...rows(0, 1)] }), readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.data?.appLists).toHaveLength(11);
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledWith(12, expect.any(AbortSignal), false);
    expect(result.current.data?.appLists).toHaveLength(12);
    expect(result.current.error).toBeNull();
  });

  it("gates concurrent continuation synchronously and preserves initial loading semantics", async () => {
    const next = deferred();
    const readNext = vi.fn(() => next.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadMore(); void result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledTimes(1);
    expect(result.current.loadingMore).toBe(true);
    expect(result.current.loading).toBe(false);
    await act(async () => { next.resolve(page(12, 1)); await pending; });
    expect(result.current.data?.appLists).toHaveLength(13);
  });

  it("retains usable partial rows while counting null slots in the raw cursor", async () => {
    const readNext = vi.fn().mockResolvedValue({ appLists: [null, { documentId: "next" }] });
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst: async () => ({ appLists: [...rows(0, 11), null] }), readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.data?.appLists).toHaveLength(11);
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    const partial = result.current.error;
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledWith(12, expect.any(AbortSignal), false);
    expect(result.current.data?.appLists).toHaveLength(12);
    expect(result.current.data?.appLists).not.toContain(null);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.error).toBe(partial);
    expect(result.current.loadMoreError).toBeNull();
  });

  it.each([false, true])("preserves partial evidence through clean continuation for detail=%s", async (detail) => {
    const payload = (items: unknown[]) => detail
      ? { appLists: [{ documentId: "list", recommended_apps: items }] }
      : { appLists: items };
    const readNext = vi.fn().mockResolvedValue(payload(rows(11, 1)));
    const { result } = renderHook(() => usePublicPagedResource(options({
      readFirst: async () => payload([...rows(0, 11), null]), readNext,
      readRows: (data) => readPublicPageRows(data, "apps", detail),
      merge: (a, b) => mergePublicPage(a, b, "apps", detail),
    })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(payload(rows(0, 11)));
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    const partial = result.current.error;
    expect(result.current.hasMore).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledWith(12, expect.any(AbortSignal), false);
    expect(result.current.data).toEqual(payload(rows(0, 12)));
    expect(result.current.error).toBe(partial);
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it("marks a later partial continuation and retains its evidence after a failed continuation retry", async () => {
    const failure = new Error("offline");
    const readNext = vi.fn().mockResolvedValueOnce({ appLists: [...rows(12, 11), null] })
      .mockRejectedValueOnce(failure).mockResolvedValueOnce(page(24, 1));
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    const partial = result.current.error;
    expect(result.current.hasMore).toBe(true);
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.error).toBe(partial);
    expect(result.current.loadMoreError).toBe(failure);
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenLastCalledWith(24, expect.any(AbortSignal), true);
    expect(result.current.data?.appLists).toHaveLength(24);
    expect(result.current.error).toBe(partial);
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it.each([false, true])("retains partial evidence through pending and failed revalidation, then clears on replacement (cached=%s)", async (cached) => {
    const initial = { appLists: [...rows(0, 11), null] };
    const revalidation = deferred();
    const retry = deferred();
    const failure = new Error("offline");
    const readFirst = cached ? vi.fn().mockImplementationOnce(() => revalidation.promise)
      : vi.fn().mockResolvedValueOnce(initial).mockImplementationOnce(() => revalidation.promise);
    readFirst.mockImplementationOnce(() => retry.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst, peek: cached ? () => initial : undefined })));
    if (!cached) await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(page(0, 11));
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    const partial = result.current.error;
    let pending: Promise<void> | undefined;
    if (!cached) act(() => { pending = result.current.refetch(); });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe(partial);
    await act(async () => { revalidation.reject(failure); await pending; });
    expect(result.current.data).toEqual(page(0, 11));
    expect(result.current.error).toBe(failure);
    expect(result.current.hasMore).toBe(false);
    act(() => { pending = result.current.refetch(); });
    expect(result.current.error).toBe(partial);
    expect(result.current.data).toEqual(page(0, 11));
    await act(async () => { retry.resolve(page(100, 1)); await pending; });
    expect(result.current.data).toEqual(page(100, 1));
    expect(result.current.error).toBeNull();
  });

  it.each([1, 12])("marks an all-null raw page of %i slots without inventing renderable data", async (count) => {
    const readNext = vi.fn().mockResolvedValue(page(12, 1));
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst: async () => ({ appLists: Array(count).fill(null) }), readNext })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ appLists: [] });
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    expect(result.current.hasMore).toBe(count === 12);
    if (count === 12) {
      await act(async () => { await result.current.loadMore(); });
      expect(readNext).toHaveBeenCalledWith(12, expect.any(AbortSignal), false);
      expect(result.current.data).toEqual(page(12, 1));
      expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    }
  });

  it.each(["scope", "disable"])("clears partial evidence on %s and ignores stale completion", async (change) => {
    const stale = deferred();
    const fresh = deferred();
    const readFirst = vi.fn().mockResolvedValueOnce({ appLists: [...rows(0, 11), null] }).mockImplementationOnce(() => fresh.promise);
    const { result, rerender } = renderHook(({ scope, enabled }) => usePublicPagedResource(options({ scope, enabled, readFirst, readNext: () => stale.promise })), {
      initialProps: { scope: "alice", enabled: true },
    });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadMore(); });
    rerender({ scope: change === "scope" ? "bob" : "alice", enabled: change !== "disable" });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    await act(async () => { stale.resolve({ appLists: [null] }); await pending; });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    if (change === "disable") rerender({ scope: "alice", enabled: true });
    await act(async () => { fresh.resolve(page(100, 1)); });
    expect(result.current.data).toEqual(page(100, 1));
    expect(result.current.error).toBeNull();
  });

  it.each(["PUBLIC_PROFILE_401", "PUBLIC_PROFILE_403", "PUBLIC_PROFILE_404"])("clears cached partial evidence after access revocation %s", async (message) => {
    const revoked = deferred();
    const retry = deferred();
    const readFirst = vi.fn().mockImplementationOnce(() => revoked.promise).mockImplementationOnce(() => retry.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst, peek: () => ({ appLists: [...rows(0, 11), null] }) })));
    expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_PARTIAL_RESPONSE"));
    await act(async () => { revoked.reject(new Error(message)); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toEqual(new Error(message));
    let pending!: Promise<void>;
    act(() => { pending = result.current.refetch(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeNull();
    await act(async () => { retry.resolve(page(100, 1)); await pending; });
    expect(result.current.error).toBeNull();
  });

  it("retries failed continuations with bypass while retaining cards and offset", async () => {
    const failure = new Error("offline");
    const readNext = vi.fn().mockRejectedValueOnce(failure).mockRejectedValueOnce(failure).mockResolvedValueOnce(page(12, 1));
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.loadMoreError).toBe(failure);
    expect(result.current.error).toBeNull();
    expect(result.current.data?.appLists).toHaveLength(12);
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenLastCalledWith(12, expect.any(AbortSignal), true);
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).toHaveBeenLastCalledWith(12, expect.any(AbortSignal), true);
    expect(result.current.data?.appLists).toHaveLength(13);
    expect(result.current.loadMoreError).toBeNull();
  });

  it.each([undefined, null, [], {}, { appLists: null }, { appLists: [{}] }, page(0, 13)])("rejects invalid first pages %j", async (payload) => {
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst: async () => payload })));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeUndefined();
    expect(result.current.hasMore).toBe(false);
  });

  it.each([{}, page(12, 13)])("rejects invalid continuation without discarding cards %j", async (payload) => {
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext: async () => payload })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.loadMoreError).toBeInstanceOf(Error);
    expect(result.current.data?.appLists).toHaveLength(12);
    expect(result.current.hasMore).toBe(true);
  });

  it.each(["PUBLIC_PROFILE_401", "PUBLIC_PROFILE_403", "PUBLIC_PROFILE_404"])("clears retained data after blocking continuation %s", async (message) => {
    const failure = new Error(message);
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext: async () => { throw failure; } })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBe(failure);
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it("aborts continuation and gates same-tick loadMore when refetch starts", async () => {
    const old = deferred();
    const fresh = deferred();
    const readFirst = vi.fn().mockResolvedValueOnce(page(0, 12)).mockImplementationOnce(() => fresh.promise);
    const readNext = vi.fn(() => old.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst, readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    let continuation!: Promise<void>;
    act(() => { continuation = result.current.loadMore(); });
    let refresh!: Promise<void>;
    act(() => { refresh = result.current.refetch(); void result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledTimes(1);
    expect(readNext.mock.calls[0][1].aborted).toBe(true);
    await continuation;
    await act(async () => { fresh.resolve(page(100, 1)); await refresh; old.resolve(page(12, 12)); });
    expect(result.current.data).toEqual(page(100, 1));
    expect(result.current.hasMore).toBe(false);
  });

  it("retains data after transient refresh failure but disables the stale cursor", async () => {
    const readFirst = vi.fn().mockResolvedValueOnce(page(0, 12)).mockRejectedValueOnce(new Error("offline"));
    const readNext = vi.fn();
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst, readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.data?.appLists).toHaveLength(12);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.hasMore).toBe(false);
    await act(async () => { await result.current.loadMore(); });
    expect(readNext).not.toHaveBeenCalled();
  });

  it("hides old scope content during render and ignores stale first responses", async () => {
    const old = deferred();
    const bob = deferred();
    const snapshots: unknown[] = [];
    const { result, rerender } = renderHook(({ scope }) => {
      const state = usePublicPagedResource(options({ scope, readFirst: () => scope === "alice" ? old.promise : bob.promise, peek: () => page(0, 1) }));
      snapshots.push({ scope, data: state.data });
      return state;
    }, { initialProps: { scope: "alice" } });
    expect(result.current.data).toEqual(page(0, 1));
    rerender({ scope: "bob" });
    expect(snapshots.find((entry: any) => entry.scope === "bob")).toEqual({ scope: "bob", data: undefined });
    await act(async () => { bob.resolve(page(100, 1)); old.resolve(page(200, 1)); });
    expect(result.current.data).toEqual(page(100, 1));
  });

  it("disables reads, aborts active work, and settles retries on unmount or supersession", async () => {
    const first = deferred();
    const readFirst = vi.fn(() => first.promise);
    const { result, rerender, unmount } = renderHook(({ enabled, scope }) => usePublicPagedResource(options({ enabled, scope, readFirst })), { initialProps: { enabled: false, scope: "alice" } });
    expect(readFirst).not.toHaveBeenCalled();
    rerender({ enabled: true, scope: "alice" });
    let retry!: Promise<void>;
    act(() => { retry = result.current.refetch(); });
    rerender({ enabled: true, scope: "bob" });
    await retry;
    expect(readFirst.mock.calls[1][0].aborted).toBe(true);
    act(() => { retry = result.current.refetch(); });
    rerender({ enabled: false, scope: "bob" });
    await retry;
    expect(result.current.data).toBeUndefined();
    rerender({ enabled: true, scope: "bob" });
    act(() => { retry = result.current.refetch(); });
    unmount();
    await retry;
  });

  it("keeps inline callbacks from restarting reads and bypasses every page in a refreshed generation", async () => {
    const readFirst = vi.fn().mockResolvedValue(page(0, 12));
    const readNext = vi.fn().mockImplementation(async (offset: number) => page(offset, 12));
    const { result, rerender } = renderHook(() => usePublicPagedResource(options({ readFirst: (...args) => readFirst(...args), readNext: (...args) => readNext(...args) })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    rerender();
    expect(readFirst).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.refetch(); await result.current.loadMore(); await result.current.loadMore(); });
    expect(readNext).toHaveBeenNthCalledWith(1, 12, expect.any(AbortSignal), true);
    expect(readNext).toHaveBeenNthCalledWith(2, 24, expect.any(AbortSignal), true);
    expect(result.current.data?.appLists).toHaveLength(36);
  });

  it("does not let a suspended scope render replace the visible scope's callbacks", async () => {
    const suspended = new Promise<void>(() => {});
    const readNext = vi.fn(async () => page(12, 1));
    function Resource({ scope }: { scope: string }) {
      const state = usePublicPagedResource(options({ scope, readNext }));
      if (scope === "bob") throw suspended;
      return <button onClick={() => { void state.loadMore(); }}>Rows: {state.data?.appLists.length ?? 0}</button>;
    }
    function App() {
      const [scope, setScope] = useState("alice");
      return <><button onClick={() => startTransition(() => setScope("bob"))}>Switch</button><Suspense fallback="pending"><Resource scope={scope} /></Suspense></>;
    }
    render(<App />);
    await screen.findByRole("button", { name: "Rows: 12" });
    fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    fireEvent.click(screen.getByRole("button", { name: "Rows: 12" }));
    await screen.findByRole("button", { name: "Rows: 13" });
    expect(readNext).toHaveBeenCalledWith(12, expect.any(AbortSignal), false);
  });

  it("exposes the pagination limit without requesting a cursor above 99999 or claiming completion", async () => {
    const readNext = vi.fn(async () => page(0, 12));
    const { result } = renderHook(() => usePublicPagedResource(options({ readNext })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { for (let i = 0; i < 8334; i++) await result.current.loadMore(); });
    expect(readNext).toHaveBeenCalledTimes(8333);
    expect(readNext).toHaveBeenLastCalledWith(99996, expect.any(AbortSignal), false);
    expect(result.current.loadMoreError).toEqual(new Error("PUBLIC_PROFILE_PAGINATION_LIMIT"));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.data?.appLists).toHaveLength(12);
  });

  it.each(["PUBLIC_PROFILE_401", "PUBLIC_PROFILE_403", "PUBLIC_PROFILE_404"])("clears cached or retained content after first-page failure %s", async (message) => {
    const readFirst = vi.fn().mockResolvedValueOnce(page(0, 12)).mockRejectedValue(new Error(message));
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toEqual(new Error(message));
    expect(result.current.hasMore).toBe(false);
  });

  it("settles superseded same-scope retries and ignores their late responses", async () => {
    const stale = deferred();
    const latest = deferred();
    const readFirst = vi.fn().mockResolvedValueOnce(page(0, 12)).mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => latest.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst })));
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    let oldRetry!: Promise<void>;
    let newRetry!: Promise<void>;
    act(() => { oldRetry = result.current.refetch(); });
    expect(result.current.loading).toBe(true);
    act(() => { newRetry = result.current.refetch(); });
    await oldRetry;
    expect(readFirst.mock.calls[1][0].aborted).toBe(true);
    await act(async () => { latest.resolve(page(100, 1)); await newRetry; stale.resolve(page(200, 1)); });
    expect(result.current.data).toEqual(page(100, 1));
  });

  it("refreshVersion revalidates with bypass and resets a previously advanced cursor", async () => {
    const readFirst = vi.fn().mockResolvedValue(page(0, 12));
    const readNext = vi.fn().mockResolvedValue(page(12, 12));
    const { result, rerender } = renderHook(({ version }) => usePublicPagedResource(options({ refreshVersion: version, readFirst, readNext })), { initialProps: { version: 0 } });
    await waitFor(() => expect(result.current.hasMore).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.data?.appLists).toHaveLength(24);
    rerender({ version: 1 });
    await waitFor(() => expect(result.current.data?.appLists).toHaveLength(12));
    await act(async () => { await result.current.loadMore(); });
    expect(readFirst).toHaveBeenLastCalledWith(expect.any(AbortSignal), true);
    expect(readNext).toHaveBeenLastCalledWith(12, expect.any(AbortSignal), true);
  });

  it("does not resurrect a blocked cached page while an explicit retry is pending", async () => {
    const retry = deferred();
    const readFirst = vi.fn().mockRejectedValueOnce(new Error("PUBLIC_PROFILE_403")).mockImplementationOnce(() => retry.promise);
    const { result } = renderHook(() => usePublicPagedResource(options({ readFirst, peek: () => page(0, 12) })));
    await waitFor(() => expect(result.current.error).toEqual(new Error("PUBLIC_PROFILE_403")));
    expect(result.current.data).toBeUndefined();
    let pending!: Promise<void>;
    act(() => { pending = result.current.refetch(); });
    expect(result.current.data).toBeUndefined();
    await act(async () => { retry.resolve(page(100, 1)); await pending; });
    expect(result.current.data).toEqual(page(100, 1));
  });
});
