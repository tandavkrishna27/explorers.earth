import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n/index.js";
import Login from "../Login";
import en from "../../i18n/resources/en.json";
import es from "../../i18n/resources/es.json";

vi.mock("../../components/SEO", () => ({ default: () => null }));

// UAT I18N-X01: /login stayed fully English because its keys only existed as inline
// English defaults, so no locale could ever translate them.
describe("Login i18n", () => {
  afterEach(async () => { await i18n.changeLanguage("en"); });

  it("renders the selected language, not English defaults", async () => {
    await i18n.changeLanguage("es");
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(es.auth.loginPage.title2);
    expect(screen.getByText(es.auth.loginPage.recoverCta)).toBeInTheDocument();
    expect(screen.queryByText(en.auth.loginPage.title2)).toBeNull();
    expect(screen.queryByText(en.auth.loginPage.recoverCta)).toBeNull();
  });
});
