import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import useAuthStore from "../../../../store/store";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, d: string, o?: Record<string, string>) => d.replace(/{{(\w+)}}/g, (_m, k) => o?.[k] ?? "") }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const dialog = vi.hoisted(() => ({ props: null as null | Record<string, any> }));
vi.mock("../../lists/NewListDialog", () => ({ default: (props: Record<string, any>) => { dialog.props = props; return <div data-testid="new-list-dialog" />; } }));
import { LinkedListsUnderItems, ManageLinkedLists } from "../OwnerListLinks";

const account = "00000000-0000-4000-8000-000000000201";
const host = "11111111-1111-4111-8111-111111111111", created = "77777777-7777-4777-8777-777777777777";
const card = { linkId: "a2222222-2222-4222-8222-222222222222", direction: "outgoing", role: null, displayOrder: 0,
  collection: { id: "22222222-2222-4222-8222-222222222222", category: "products", title: "Packing", slug: "packing", visibility: "private", publicationState: "draft", archived: false, coverMediaId: null } };
const detail = { id: host, accountId: account, category: "movies", title: "Movie night", slug: "movie-night", visibility: "private", publicationState: "draft", revision: 4,
  description: null, heading: null, coverMediaId: null, isSample: false, archived: false, displayOrder: 0, pinOrder: null, categoryRevision: "12", linkedLists: [card] };

function signIn() {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: account, userId: `user-${account}`, username: "owner", email: "owner@example.invalid", onboardingStatus: "complete", revision: 1 });
}
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}</output>; }
function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter initialEntries={["/recommendations/movies/" + host]}><Routes><Route path="*" element={<>{children}<Where /></>} /></Routes></MemoryRouter></QueryClientProvider>;
}

describe("OwnerListLinks mounting points", () => {
  const writes: Array<{ url: string; method: string; body: any }> = [];
  beforeEach(() => {
    writes.length = 0; dialog.props = null; toast.success.mockClear(); toast.error.mockClear();
    useAuthStore.getState().logout(); signIn();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      if (method === "GET") {
        if (String(url).includes(`/collections/${host}`)) return new Response(JSON.stringify({ collection: detail }), { status: 200 });
        return new Response(JSON.stringify({ items: [], nextCursor: null, snapshotToken: "s" }), { status: 200 });
      }
      writes.push({ url: String(url), method, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ collection: { id: created, accountId: account, category: "products", title: "Gear", slug: "gear", visibility: "private", publicationState: "draft",
        revision: 1, description: null, heading: null, coverMediaId: null, isSample: false, attachedTo: { hostCollectionId: host, linkId: "a9999999-9999-4999-8999-999999999999", hostCategoryRevision: 13 } } }), { status: 201 });
    }));
  });

  it("render nothing without a query client (isolated page tests)", () => {
    const { container } = render(<MemoryRouter><LinkedListsUnderItems collectionId={host} /><ManageLinkedLists collectionId={host} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the list's linked lists under the items", async () => {
    render(wrap(<LinkedListsUnderItems collectionId={host} />));
    expect(await screen.findByRole("link", { name: /Packing/ })).toBeInTheDocument();
  });

  it("create a new list attaches it to this list in one command and stays on this list (LNK-06)", async () => {
    render(wrap(<ManageLinkedLists collectionId={host} />));
    fireEvent.click(await screen.findByRole("button", { name: "Attach" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Category for the new list" }), { target: { value: "products" } });
    fireEvent.click(screen.getByRole("button", { name: "Create a new list" }));
    await waitFor(() => expect(dialog.props).not.toBeNull());
    expect(dialog.props!.category).toBe("products");
    const result = await dialog.props!.create({ category: "products", title: "Gear", slug: "gear", description: null }, null);
    expect(result.id).toBe(created);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "POST", url: "/api/explorers/v1/collections",
      body: { category: "products", title: "Gear", attachTo: { hostCollectionId: host, expectedHostRevision: 12, role: null } } });
    dialog.props!.onCreated(created);
    expect(screen.getByTestId("where").textContent).toBe(`/recommendations/movies/${host}`);
  });

  it("enables roles only for guides by default", async () => {
    render(wrap(<ManageLinkedLists collectionId={host} />));
    await screen.findByRole("button", { name: "Detach Packing" });
    expect(screen.queryByRole("combobox", { name: "Role for Packing" })).toBeNull();
  });
});
