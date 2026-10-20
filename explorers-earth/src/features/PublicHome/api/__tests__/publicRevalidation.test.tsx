import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePublicRevalidation, PUBLIC_REVALIDATE_INTERVAL_MS, PUBLIC_REVALIDATE_MIN_GAP_MS } from "../usePublicRevalidation";
import { usePublicPagedResource } from "../usePublicPagedResource";

let visibility: "visible" | "hidden" = "visible";
const setVisibility = (value: "visible" | "hidden") => {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("usePublicRevalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  });
  afterEach(() => vi.useRealTimers());

  it("fires every interval while visible and not while hidden", () => {
    const run = vi.fn();
    renderHook(() => usePublicRevalidation(run, true));
    vi.advanceTimersByTime(PUBLIC_REVALIDATE_INTERVAL_MS);
    expect(run).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    vi.advanceTimersByTime(PUBLIC_REVALIDATE_INTERVAL_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("fires when the tab becomes visible again, but not more than once per minimum gap", () => {
    const run = vi.fn();
    renderHook(() => usePublicRevalidation(run, true));
    setVisibility("hidden");
    vi.advanceTimersByTime(PUBLIC_REVALIDATE_MIN_GAP_MS + 1);
    act(() => setVisibility("visible"));
    expect(run).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does nothing when inactive and cleans up on unmount", () => {
    const run = vi.fn();
    const { unmount } = renderHook(() => usePublicRevalidation(run, false));
    vi.advanceTimersByTime(PUBLIC_REVALIDATE_INTERVAL_MS * 2);
    expect(run).not.toHaveBeenCalled();
    const active = renderHook(() => usePublicRevalidation(run, true));
    active.unmount();
    unmount();
    vi.advanceTimersByTime(PUBLIC_REVALIDATE_INTERVAL_MS * 2);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("usePublicPagedResource revalidation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  });
  afterEach(() => vi.useRealTimers());

  const setup = (readFirst: () => Promise<unknown>) => renderHook(() => usePublicPagedResource({
    scope: "u\u0000apps", enabled: true, revalidate: true, retainOnFirst: false,
    readFirst, readNext: readFirst, readRows: (d) => d.rows, merge: (_p, n) => n,
  }));

  it("removes content that became private (404) without a reload, keeps it on a transient 429", async () => {
    const reads = [
      async () => ({ rows: [1, 2] }),
      async () => { throw Object.assign(new Error("PUBLIC_PROFILE_429"), { status: 429 }); },
      async () => { throw new Error("PUBLIC_PROFILE_404"); },
    ];
    let i = 0;
    const { result } = setup(() => reads[Math.min(i++, reads.length - 1)]());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data).toEqual({ rows: [1, 2] });

    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLIC_REVALIDATE_INTERVAL_MS); });
    expect(i).toBe(2);
    expect(result.current.data).toEqual({ rows: [1, 2] });
    expect(result.current.loading).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLIC_REVALIDATE_INTERVAL_MS); });
    expect(i).toBe(3);
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe("PUBLIC_PROFILE_404");
  });
});
