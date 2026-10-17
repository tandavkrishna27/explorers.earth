import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { shell } = vi.hoisted(() => ({ shell: vi.fn() }));

vi.mock("../publicProfileGatewayClient", () => ({
  publicProfileGatewayClient: { shell },
}));

import { usePublicProfileShell } from "../usePublicProfileShell";
import { publishPublicProfileInvalidation } from "../publicProfileInvalidation";

describe("usePublicProfileShell", () => {
  beforeEach(() => shell.mockReset());

  it("loads the shell only from the public-profile gateway", async () => {
    shell.mockResolvedValueOnce({ Account_Name: "Alice" });
    const { result } = renderHook(() => usePublicProfileShell("tk2727"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(shell).toHaveBeenCalledWith("tk2727", expect.any(AbortSignal), false);
    expect(result.current.data).toEqual({ Account_Name: "Alice" });
  });

  it("bypasses cache only when an invalidation matches this public username", async () => {
    shell.mockResolvedValue({ Account_Name: "Alice" });
    renderHook(() => usePublicProfileShell("alice"));
    await waitFor(() => expect(shell).toHaveBeenCalledTimes(1));

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-bob", username: "bob", category: "public_books", action: "pin", eventId: "other-profile" }));
    await Promise.resolve();
    expect(shell).toHaveBeenCalledTimes(1);

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "Alice", category: "public_books", action: "pin", eventId: "matching-profile" }));
    await waitFor(() => expect(shell).toHaveBeenCalledTimes(2));
    expect(shell).toHaveBeenLastCalledWith("alice", expect.any(AbortSignal), true);
  });

  it("does not let an aborted older response overwrite matching invalidation data", async () => {
    let resolveOld!: (value: unknown) => void;
    shell.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ Account_Name: "Fresh" });
    const { result } = renderHook(() => usePublicProfileShell("alice"));
    await waitFor(() => expect(shell).toHaveBeenCalledTimes(1));

    act(() => publishPublicProfileInvalidation({ accountDocumentId: "account-alice", username: "alice", category: "public_books", action: "pin", eventId: "fresh-request" }));
    await waitFor(() => expect(shell).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toEqual({ Account_Name: "Fresh" }));
    await act(async () => resolveOld({ Account_Name: "Stale" }));
    expect(result.current.data).toEqual({ Account_Name: "Fresh" });
  });

  it("does not expose the previous account while a different username is loading", async () => {
    let resolveBob!: (value: unknown) => void;
    shell.mockResolvedValueOnce({ username: "alice", Account_Name: "Alice" })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBob = resolve; }));
    const { result, rerender } = renderHook(({ username }) => usePublicProfileShell(username), {
      initialProps: { username: "alice" },
    });
    await waitFor(() => expect(result.current.data).toMatchObject({ username: "alice" }));

    rerender({ username: "bob" });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(shell).toHaveBeenLastCalledWith("bob", expect.any(AbortSignal), false));
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeUndefined();
    await act(async () => resolveBob({ username: "bob", Account_Name: "Bob" }));
    await waitFor(() => expect(result.current.data).toMatchObject({ username: "bob" }));
  });
});
