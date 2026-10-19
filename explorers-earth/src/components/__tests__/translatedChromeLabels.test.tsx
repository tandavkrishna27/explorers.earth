import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import Navbar from "../Navbar";
import es from "../../i18n/resources/es.json";

const root = resolve(__dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("dashboard chrome labels are translated", () => {
  it("renders the mobile nav labels in the chosen language", async () => {
    const i18n = i18next.createInstance();
    await i18n.use(initReactI18next).init({ lng: "es", resources: { es: { translation: es } }, interpolation: { escapeValue: false } });
    render(<I18nextProvider i18n={i18n}><MemoryRouter><Navbar /></MemoryRouter></I18nextProvider>);
    for (const label of [es.sidebar.home, es.sidebar.profile, es.sidebar.recommendations, es.sidebar.analytics, es.sidebar.settings])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText("Recommendations")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it.each([
    ["components/Header.tsx", [">Logout<", ">Settings<"]],
    ["components/Sidenav.tsx", [">Logout<", '{"Recommendations"}']],
    ["features/Settings/Settings.tsx", [">Danger Zone<"]],
  ])("%s has no hard-coded English label", (file, literals) => {
    const source = read(file).replace(/\s+</g, "<").replace(/>\s+/g, ">");
    for (const literal of literals) expect(source).not.toContain(literal);
  });

  it("has a translated Danger zone label in every locale", () => {
    const dir = resolve(root, "i18n/resources");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    expect(files).toHaveLength(47);
    for (const file of files) {
      const value = JSON.parse(readFileSync(resolve(dir, file), "utf8")).settings?.dangerZone;
      expect(typeof value === "string" && value.trim().length > 0, file).toBe(true);
      if (file !== "en.json") expect(value, file).not.toBe("Danger zone");
    }
  });
});
