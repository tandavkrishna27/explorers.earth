import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import useAuthStore from "../../../../store/store";
import { useListLinks } from "../useListLinks";

const account = "00000000-0000-4000-8000-000000000201";
const host = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", linkId = "44444444-4444-4444-8444-444444444444";
const card = { linkId, direction: "outgoing", role: "Packing list", displayOrder: 2,
  collection: { id: other, category: "books", title: "Reads", slug: "reads", visibility: "private", publicationState: "draft", archived: false, coverMediaId: null } } as const;
const dto = { id: linkId, hostCollectionId: host, hostCategory: "guides", linkedCollectionId: other, linkedCategory: "books", role: "Packing list", displayOrder: 2, createdAt: "2026-10-23T00:00:00.000Z" };

function signIn() {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: account, userId: `user-${account}`, username: "owner", email: "owner@example.invalid", onboardingStatus: "complete", revision: 1 });
}
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useListLinks", () => {
  const calls: Array<{ url: string; method: string; body: unknown; key: string | null }> = [];
  beforeEach(() => {
    calls.length = 0;
    useAuthStore.getState().logout(); signIn();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      calls.push({ url: String(url), method, body: init.body ? JSON.parse(String(init.body)) : undefined, key: new Headers(init.headers).get("Idempotency-Key") });
      if (method === "DELETE") return new Response(JSON.stringify({ link: { link: dto, attached: false, revisions: { guides: 4, books: 8 } } }), { status: 200 });
      return new Response(JSON.stringify({ link: { link: { ...dto, id: "55555555-5555-4555-8555-555555555555" }, attached: true, revisions: { guides: 5, books: 9 } } }), { status: 201 });
    }));
  });

  it("detach then undo re-attaches with the removed role and position and carries revisions forward", async () => {
    const { result } = renderHook(() => useListLinks({ collectionId: host, category: "guides", categoryRevision: 3, linkedLists: [card] }), { wrapper: wrapper() });
    let undo: (() => Promise<void>) | undefined;
    await act(async () => { undo = await result.current.detach(card); });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", url: `/api/explorers/v1/collections/${host}/links/${linkId}`, body: { expectedHostRevision: 3 } });
    expect(calls.at(-1)?.key).toBeTruthy();
    await act(async () => { await undo!(); });
    expect(calls.at(-1)).toMatchObject({ method: "POST", url: `/api/explorers/v1/collections/${host}/links`,
      body: { expectedHostRevision: 4, linkedCollectionId: other, expectedLinkedRevision: 8, role: "Packing list", position: 2 } });
  });

  it("sends the other list's category revision when detaching an incoming link", async () => {
    const incoming = { ...card, direction: "incoming" } as const;
    const { result } = renderHook(() => useListLinks({ collectionId: host, category: "guides", categoryRevision: 3, linkedLists: [incoming] }), { wrapper: wrapper() });
    // Seed the books revision through an attach result first, so no read is needed.
    await act(async () => { await result.current.attach({ id: "66666666-6666-4666-8666-666666666666", category: "guides" }); });
    await act(async () => { await result.current.detach(incoming); });
    expect(calls.at(-1)).toMatchObject({ method: "DELETE", body: { expectedHostRevision: 9 } });
  });

  it("never offers the list itself or an already linked list (either direction)", () => {
    const incoming = { ...card, direction: "incoming", collection: { ...card.collection, id: "33333333-3333-4333-8333-333333333333" } } as const;
    const { result } = renderHook(() => useListLinks({ collectionId: host, category: "guides", categoryRevision: 3, linkedLists: [card, incoming] }), { wrapper: wrapper() });
    expect(result.current.isAttachable({ id: host })).toBe(false);
    expect(result.current.isAttachable({ id: other })).toBe(false);
    expect(result.current.isAttachable({ id: incoming.collection.id })).toBe(false);
    expect(result.current.isAttachable({ id: "66666666-6666-4666-8666-666666666666" })).toBe(true);
  });
});
