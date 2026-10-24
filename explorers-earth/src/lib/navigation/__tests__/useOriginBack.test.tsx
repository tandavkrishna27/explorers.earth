import { fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router-dom";
import { BackToOrigin } from "../BackToOrigin";
import { withOrigin } from "../originBack";
import en from "../../../i18n/resources/en.json";

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
});

function Where() {
  const l = useLocation();
  return <output aria-label="path">{l.pathname}{l.search}</output>;
}

function AddPage() {
  return <><BackToOrigin fallback={{ to: "/recommendations/books/b1", label: "Back to list" }} /><Where /></>;
}

function ListPage() {
  const location = useLocation();
  return (
    <>
      <Link to="/recommendations/books/b1/add" state={withOrigin(location, "Weekend reads")}>Add book</Link>
      <Where />
    </>
  );
}

const routes = [
  { path: "/home", element: <><Link to="/recommendations/books/b1/add" state={withOrigin({ pathname: "/home", search: "" }, "Home")}>Quick add</Link><Where /></> },
  { path: "/recommendations/books", element: <Where /> },
  { path: "/recommendations/books/b1", element: <ListPage /> },
  { path: "/recommendations/places", element: <Where /> },
  { path: "/recommendations/books/b1/add", element: <AddPage /> },
];

const renderRouter = (router: ReturnType<typeof createMemoryRouter>) =>
  render(<I18nextProvider i18n={i18n}><RouterProvider router={router} /></I18nextProvider>);

describe("BackToOrigin", () => {
  it("returns to the list it came from and shows its name", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/recommendations/books/b1"] });
    renderRouter(router);
    fireEvent.click(screen.getByText("Add book"));
    const back = screen.getByRole("button", { name: "Back to Weekend reads" });
    expect(back).toHaveTextContent("‹ Back to Weekend reads");
    fireEvent.click(back);
    expect(screen.getByLabelText("path")).toHaveTextContent("/recommendations/books/b1");
  });

  it("returns to a non-list origin (Home)", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/home"] });
    renderRouter(router);
    fireEvent.click(screen.getByText("Quick add"));
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(screen.getByLabelText("path")).toHaveTextContent("/home");
  });

  it("deep link falls back to the caller's fallback", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/recommendations/books/b1/add"] });
    renderRouter(router);
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByLabelText("path")).toHaveTextContent("/recommendations/books/b1");
  });

  it("browser refresh keeps the origin (state restored from history entry)", () => {
    // A reload re-creates the router with the same history entry, state included.
    const router = createMemoryRouter(routes, {
      initialEntries: ["/home", { pathname: "/recommendations/books/b1/add", state: withOrigin({ pathname: "/home", search: "" }, "Home") }],
      initialIndex: 1,
    });
    renderRouter(router);
    fireEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(screen.getByLabelText("path")).toHaveTextContent("/home");
  });

  it("honours a safe redirectBack from linked pages", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/recommendations/books/b1/add?redirectBack=%2Frecommendations%2Fplaces%3Flist%3Dgoa"] });
    renderRouter(router);
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    expect(screen.getByLabelText("path")).toHaveTextContent("/recommendations/places?list=goa");
  });
});
