import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_REVALIDATE_INTERVAL_MS } from "../usePublicRevalidation";

const shell = vi.hoisted(() => vi.fn());
vi.mock("../publicProfileGatewayClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../publicProfileGatewayClient")>()),
  publicProfileGatewayClient: { shell },
}));
import { usePublicProfileShell } from "../usePublicProfileShell";

describe("public shell revalidation", () => {
  beforeEach(() => { vi.useFakeTimers(); shell.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("re-reads conditionally while visible, keeps data on a 429, drops it on a 404", async () => {
    shell.mockResolvedValueOnce({ username: "tk2727", public_books: "Yes" })
      .mockRejectedValueOnce(Object.assign(new Error("PUBLIC_PROFILE_429"), { status: 429 }))
      .mockRejectedValueOnce(new Error("PUBLIC_PROFILE_404"));
    const { result } = renderHook(() => usePublicProfileShell("tk2727"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data).toMatchObject({ public_books: "Yes" });

    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLIC_REVALIDATE_INTERVAL_MS); });
    expect(shell).toHaveBeenCalledTimes(2);
    expect(shell.mock.calls[1][2]).toBe(false); // not a cache bypass
    expect(result.current.data).toMatchObject({ username: "tk2727" });

    await act(async () => { await vi.advanceTimersByTimeAsync(PUBLIC_REVALIDATE_INTERVAL_MS); });
    expect(result.current.data).toBeUndefined();
    expect((result.current.error as Error).message).toBe("PUBLIC_PROFILE_404");
  });
});
