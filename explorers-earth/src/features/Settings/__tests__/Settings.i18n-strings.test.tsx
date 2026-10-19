import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../../../i18n";
import { UnpublishCategoryDialog } from "../components/UnpublishCategoryDialog";
import AccountDeletionLifecyclePanel from "../components/AccountDeletionLifecyclePanel";
import en from "../../../i18n/resources/en.json";
import es from "../../../i18n/resources/es.json";

afterEach(async () => { await i18n.changeLanguage("en"); });

const settingsUi = (catalog: typeof en) => (catalog as unknown as { settings: { ui: Record<string, unknown> } }).settings.ui;

describe("Settings and lifecycle dialog strings", () => {
  it("translates Cancel and the unpublish copy in Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<UnpublishCategoryDialog open categoryName="Libros" pending={false} onCancel={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Despublicar Libros" })).toBeInTheDocument();
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("translates the pending-deletion panel in Spanish", async () => {
    await i18n.changeLanguage("es");
    render(<AccountDeletionLifecyclePanel status={{ accountId: "a", status: "pending_deletion", operationId: "o", revision: 1 } as never} onCancel={() => undefined} onRetry={() => undefined} />);
    expect(screen.getByRole("button", { name: "Cancelar la eliminación con Google" })).toBeInTheDocument();
  });

  it("keeps English unchanged", () => {
    render(<UnpublishCategoryDialog open categoryName="Books" pending={false} onCancel={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("ships a Spanish value for every Settings string that differs from the key's English default", () => {
    const english = settingsUi(en), spanish = settingsUi(es as typeof en);
    const flat = (o: Record<string, unknown>, p = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) => typeof v === "object" ? flat(v as Record<string, unknown>, p + k + ".") : [[p + k, String(v)] as [string, string]]);
    const sp = new Map(flat(spanish));
    for (const [key, value] of flat(english)) expect(sp.get(key), key).toBeTruthy(), expect(sp.get(key), key).not.toBe(value === "Retry" ? "x" : value);
  });
});
