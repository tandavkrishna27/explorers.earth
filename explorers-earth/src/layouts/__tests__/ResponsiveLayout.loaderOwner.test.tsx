import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ResponsiveLayout from "../ResponsiveLayout";

vi.mock("../../components/Header", () => ({ default: () => <header /> }));
vi.mock("../../components/Navbar", () => ({ default: () => <nav /> }));
vi.mock("../../components/Sidenav", () => ({ default: () => <aside /> }));
vi.mock("../../routes/validators", () => ({ DashboardRouteValidator: ({ children }: any) => children }));
vi.mock("../../features/navigation/CategoryNavigationProvider", () => ({ CategoryNavigationProvider: ({ children }: any) => children }));
vi.mock("../../components/EarthLoader", () => ({
  BootSplash: () => <div role="status" aria-label="Earth loading" data-loader-owner="boot" />,
  EarthLoader: () => <div role="status" aria-label="Earth loading" data-loader-owner="other" />,
}));

const routes = [{ path: "/", element: <ResponsiveLayout />, children: [
  { path: "recommendations/people", element: <p>People page</p> },
  { path: "recommendations/people/:listId", element: <p>People list</p> },
] }];

describe("ResponsiveLayout loader owner", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    delete (window as any).__dashboardLoaded;
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

  it("shows exactly one boot loader on cold entry of a category landing page (People included)", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/recommendations/people"] });
    render(<RouterProvider router={router} />);
    const loaders = screen.getAllByRole("status", { name: "Earth loading" });
    expect(loaders).toHaveLength(1);
    expect(loaders[0]).toHaveAttribute("data-loader-owner", "boot");
  });

  it("shows no globe when navigating between pages after boot", async () => {
    (window as any).__dashboardLoaded = true;
    const router = createMemoryRouter(routes, { initialEntries: ["/recommendations/people"] });
    render(<RouterProvider router={router} />);
    await act(async () => { await router.navigate("/recommendations/people/p1"); });
    expect(screen.getByText("People list")).toBeInTheDocument();
    expect(screen.queryAllByRole("status", { name: "Earth loading" })).toHaveLength(0);
  });

  it("RouteLoader is gone", () => {
    expect(existsSync(resolve(__dirname, "../../components/RouteLoader.tsx"))).toBe(false);
  });
});
