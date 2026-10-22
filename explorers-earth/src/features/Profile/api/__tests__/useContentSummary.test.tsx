import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { explorersApiClient } from "../../../../lib/explorersApiClient";
import { useContentSummary } from "../useContentSummary";

// HUB-X02. Home shows nothing until the one summary read lands, then the exact totals.
describe("useContentSummary", () => {
  it("is undefined while loading and sums active lists and items across categories", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof explorersApiClient.getMyContentSummary>>) => void;
    vi.spyOn(explorersApiClient, "getMyContentSummary").mockReturnValue(new Promise((r) => { resolve = r; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useContentSummary(), { wrapper });
    expect(result.current.totals).toBeUndefined();
    resolve({ version: "explorers-owner-content/v2", categories: [
      { category: "products", lists: 2, activeLists: 1, items: 16, activeItems: 9 },
      { category: "guides", lists: 3, activeLists: 2, items: 3, activeItems: 2 },
    ] });
    await waitFor(() => expect(result.current.totals).toEqual({ activeLists: 3, activeItems: 11 }));
  });
});
