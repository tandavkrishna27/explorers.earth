import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../../store/store";
import { canonicalAccountQuery, useCanonicalAccount } from "../useCanonicalAccount";
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

  it("five observers mounted on one page cause one /me request", async () => {
    const getMyProfile = vi.mocked(explorersApiClient.getMyProfile);
    getMyProfile.mockReset().mockResolvedValue({ id: "a", handle: "a-handle", onboardingStatus: "complete", revision: 3 } as any);
    useAuthStore.setState({ user: { id: "a", documentId: "a", username: "a", email: "", blocked: false } });
    const client = new QueryClient();
    const Five = () => { useCanonicalAccount(); useCanonicalAccount(); useCanonicalAccount(); useCanonicalAccount(); useCanonicalAccount(); return null; };
    render(<QueryClientProvider client={client}><Five /><Probe /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("a-handle")).toBeInTheDocument());
    expect(getMyProfile).toHaveBeenCalledTimes(1);
    // A later mount (Sidenav after a route change) within the stale window reuses the read.
    render(<QueryClientProvider client={client}><Five /></QueryClientProvider>);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getMyProfile).toHaveBeenCalledTimes(1);
  });

  it("a new session generation reads the account again", async () => {
    const getMyProfile = vi.mocked(explorersApiClient.getMyProfile);
    getMyProfile.mockReset().mockResolvedValueOnce({ id: "a", handle: "first", onboardingStatus: "complete", revision: 1 } as any)
      .mockResolvedValueOnce({ id: "a", handle: "second", onboardingStatus: "complete", revision: 2 } as any);
    useAuthStore.setState({ generation: 4, user: { id: "a", documentId: "a", username: "a", email: "", blocked: false } });
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText("first")).toBeInTheDocument());
    await act(async () => { useAuthStore.setState({ generation: 5 }); });
    await waitFor(() => expect(screen.getByText("second")).toBeInTheDocument());
    expect(getMyProfile).toHaveBeenCalledTimes(2);
  });

  it("an observer reads the account the bootstrap seeded without fetching", async () => {
    const getMyProfile = vi.mocked(explorersApiClient.getMyProfile);
    getMyProfile.mockReset();
    useAuthStore.setState({ generation: 9, user: { id: "a", documentId: "a", username: "a", email: "", blocked: false } });
    const client = new QueryClient();
    client.setQueryData(canonicalAccountQuery("a", 9).queryKey, { id: "a", handle: "seeded", onboardingStatus: "complete", revision: 1 });
    render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>);
    expect(screen.getByText("seeded")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getMyProfile).not.toHaveBeenCalled();
  });
});
