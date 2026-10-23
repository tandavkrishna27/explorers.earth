import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Routes, useParams } from "react-router-dom";
import { expect, it, vi } from "vitest";

vi.mock("../../components/ProtectedRoute", () => ({ default: () => <Outlet /> }));
vi.mock("../../layouts/ResponsiveLayout", () => ({ default: () => <Outlet /> }));
vi.mock("../../features/Favorites/components/PlacesListView", () => ({
  default: function PlacesListViewStub() { const { listId } = useParams(); return <p>{`ListPage places ${listId}`}</p>; },
}));

// pages/Favorites is real: the ?list= redirect happens before the Places home renders.
import ProtectedRoutes from "../../routes/ProtectedRoutes";

const mount = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>{ProtectedRoutes()}</Routes></MemoryRouter>);

it("/recommendations/places/:listId renders the shared list page", async () => {
  mount("/recommendations/places/abc");
  expect(await screen.findByText("ListPage places abc")).toBeTruthy();
});

it("the legacy ?list= deep link redirects to the shared route", async () => {
  mount("/recommendations/places?list=abc");
  expect(await screen.findByText("ListPage places abc")).toBeTruthy();
});
