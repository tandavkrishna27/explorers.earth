import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicHandleRedirect, { withHandle } from "../PublicHandleRedirect";

const shell = vi.hoisted(() => ({ current: undefined as undefined | { data?: { username?: string }; loading: boolean } }));
vi.mock("../../api/PublicAccountIdentityProvider", () => ({ usePublicAccountShell: () => shell.current }));

function Where() { const location = useLocation(); return <span data-testid="where">{location.pathname + location.search + location.hash}</span>; }
const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path=":username/*" element={<><Where /><PublicHandleRedirect><div>profile content</div></PublicHandleRedirect></>} />
    </Routes>
  </MemoryRouter>);

afterEach(() => { shell.current = undefined; });

describe("followed old handle", () => {
  it("swaps only the handle in a path", () => {
    expect(withHandle("/old", "new")).toBe("/new");
    expect(withHandle("/old/places/my-list", "new")).toBe("/new/places/my-list");
  });

  it("moves to the same page under the new handle instead of showing not found", async () => {
    shell.current = { data: { username: "new-handle" }, loading: false };
    renderAt("/Old-Handle/places/trip?tab=map#top");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/new-handle/places/trip?tab=map#top"));
  });

  it("leaves the current handle, any casing of it, alone", () => {
    shell.current = { data: { username: "alice" }, loading: false };
    renderAt("/Alice/books");
    expect(screen.getByText("profile content")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/Alice/books");
  });

  it("waits while loading and does nothing for a handle that does not exist", () => {
    shell.current = { data: undefined, loading: true };
    const first = renderAt("/ghost");
    expect(screen.getByText("profile content")).toBeInTheDocument();
    first.unmount();
    shell.current = { data: undefined, loading: false };
    renderAt("/ghost");
    expect(screen.getByText("profile content")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/ghost");
  });
});
