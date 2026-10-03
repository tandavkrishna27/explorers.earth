import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../../store/store";
import { useCanonicalAccount } from "../useCanonicalAccount";
import { explorersApiClient } from "../../../../lib/explorersApiClient";

vi.mock("../../../../lib/explorersApiClient", () => ({ explorersApiClient: { getMyProfile: vi.fn() } }));

function Probe() {
  const { data } = useCanonicalAccount();
  return <span>{data?.handle ?? "loading"}</span>;
}

describe("canonical account query", () => {
  beforeEach(() => { useAuthStore.setState({ user: null, isAuthenticated: false }); });

  it("does not show a late A response after B becomes the active identity", async () => {
    let resolveA!: (value: any) => void;
    vi.mocked(explorersApiClient.getMyProfile).mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve; }))
      .mockResolvedValueOnce({ id: "b", handle: "b-handle", onboardingStatus: "complete" } as any);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState({ user: { id: "a", documentId: "a", username: "a", email: "", blocked: false } });
    render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    await act(async () => { useAuthStore.setState({ user: { id: "b", documentId: "b", username: "b", email: "", blocked: false } }); });
    await waitFor(() => expect(screen.getByText("b-handle")).toBeInTheDocument());
    await act(async () => resolveA({ id: "a", handle: "a-handle" }));
    expect(screen.queryByText("a-handle")).not.toBeInTheDocument();
  });
});
