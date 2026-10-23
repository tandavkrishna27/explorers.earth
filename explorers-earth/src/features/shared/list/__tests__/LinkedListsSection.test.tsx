import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LinkedListsSection } from "../LinkedListsSection";
import { readOrigin } from "../../../../lib/navigation/originBack";

const col = (id: string, category: "products" | "books" | "apps" | "places", title: string, archived = false) =>
  ({ id, category, title, slug: title.toLowerCase().replace(/ /g, "-"), visibility: "private", publicationState: "draft", archived, coverMediaId: null }) as const;
const cards = [
  { linkId: "a2222222-2222-4222-8222-222222222222", direction: "outgoing", role: "Packing list", displayOrder: 0, collection: col("22222222-2222-4222-8222-222222222222", "products", "Packing") },
  { linkId: "a3333333-3333-4333-8333-333333333333", direction: "incoming", role: null, displayOrder: 0, collection: col("33333333-3333-4333-8333-333333333333", "books", "Reads") },
  { linkId: "a4444444-4444-4444-8444-444444444444", direction: "outgoing", role: null, displayOrder: 1, collection: col("44444444-4444-4444-8444-444444444444", "apps", "Old apps", true) },
  { linkId: "a5555555-5555-4555-8555-555555555555", direction: "outgoing", role: null, displayOrder: 2, collection: col("55555555-5555-4555-8555-555555555555", "places", "Paris") },
] as const;

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}|{JSON.stringify(readOrigin(l.state))}</output>; }

describe("LinkedListsSection", () => {
  it("renders nothing when there are no live links", () => {
    const { container } = render(<MemoryRouter><LinkedListsSection linkedLists={[cards[2]]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one card per live linked list in either direction, with its role, and opens it with the origin", () => {
    render(<MemoryRouter initialEntries={["/recommendations/movies/m1"]}>
      <Routes><Route path="*" element={<><LinkedListsSection linkedLists={[...cards]} originLabel="Movie night" /><Where /></>} /></Routes>
    </MemoryRouter>);
    expect(screen.getByRole("region", { name: "Linked lists" })).toBeInTheDocument();
    expect(screen.getByText("Packing list")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reads/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Old apps/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Paris/ })).toHaveAttribute("href", "/recommendations/places/55555555-5555-4555-8555-555555555555");
    fireEvent.click(screen.getByRole("link", { name: /Packing/ }));
    const where = screen.getByTestId("where").textContent ?? "";
    expect(where).toContain("/recommendations/products/22222222-2222-4222-8222-222222222222|");
    expect(where).toContain('"pathname":"/recommendations/movies/m1"');
    expect(where).toContain('"label":"Movie night"');
  });

  it("is read-only: no Detach control even when the owner views it", () => {
    render(<MemoryRouter><LinkedListsSection linkedLists={[...cards]} readOnly /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /detach/i })).toBeNull();
  });

  it("uses the dashboard theme text and surface tokens so it reads in dark and light", () => {
    render(<MemoryRouter><LinkedListsSection linkedLists={[...cards]} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Linked lists" })).toHaveClass("text-dashboard");
    const link = screen.getByRole("link", { name: /Packing/ });
    expect(link).toHaveClass("text-dashboard", "bg-dashboard-sidebar", "border-dashboard-border");
  });
});
