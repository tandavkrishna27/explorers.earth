import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../../i18n";
import AccountDeletionLifecyclePanel from "../../features/Settings/components/AccountDeletionLifecyclePanel";
import { formatLifecycleDate } from "../../utils/formatLifecycleDate";
vi.mock("../../components/SEO", () => ({ default: () => null }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
beforeEach(async () => {
  localStorage.clear();
  const { default: store } = await import("../../store/store");
  store.getState().verificationFailed(store.getState().generation, "signed-out");
});

const ACCOUNT = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const SCHEDULED = "2026-11-18T10:00:00.000Z";
const longDate = formatLifecycleDate(SCHEDULED, "en");

it("formats a scheduled date and tolerates a missing or unusable one", () => {
  expect(longDate).toMatch(/2026/);
  expect(formatLifecycleDate(null, "en")).toBe("");
  expect(formatLifecycleDate("not a date", "en")).toBe("");
});

it("tells a pending-deletion owner the date and offers to cancel the deletion", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ recovery: { outcome: "pending", accountId: ACCOUNT,
    status: "pending_deletion", revision: 3, operationId: null, kind: "delete", scheduledDeletionAt: SCHEDULED } }), { status: 200 })));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter><Page /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Cancel deletion" })).toBeInTheDocument());
  expect(screen.getByText(new RegExp(`scheduled for deletion on ${longDate}`))).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Reactivate account/i })).toBeNull();
});

it("keeps the plain reactivation text for a deactivated-only account", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ recovery: { outcome: "pending", accountId: ACCOUNT,
    status: "suspended", revision: 3, operationId: null, kind: "deactivate", scheduledDeletionAt: null } }), { status: 200 })));
  const { default: Page } = await import("../ReactivateConfirm");
  render(<MemoryRouter><Page /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: "Reactivate account" })).toBeInTheDocument());
  expect(screen.queryByText(/scheduled for deletion/i)).toBeNull();
});

it("shows the scheduled date on /reactivate for a signed-in pending-deletion owner and the current text otherwise", async () => {
  const { default: store } = await import("../../store/store");
  const { default: Page } = await import("../ReactivateAccount");
  const generation = store.getState().beginVerification();
  store.getState().verificationFailed(generation, "terminal", SCHEDULED);
  const view = render(<MemoryRouter><Page /></MemoryRouter>);
  expect(screen.getByText(`Your account is scheduled for deletion on ${longDate}. Continue with Google to cancel the deletion.`)).toBeInTheDocument();
  view.unmount();
  const next = store.getState().beginVerification();
  store.getState().verificationFailed(next, "terminal", null);
  render(<MemoryRouter><Page /></MemoryRouter>);
  expect(screen.queryByText(/scheduled for deletion/i)).toBeNull();
  expect(screen.getByText(/reactivate it or cancel a pending deletion/i)).toBeInTheDocument();
});

it("reads the date from a pending-deletion refusal of the account read, and drops it on any other outcome", async () => {
  const { default: store } = await import("../../store/store");
  const { authClient } = await import("../../lib/authClient");
  const respond = (me: Response) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/get-session")) return Response.json({ user: { id: "user-a" }, session: { id: "session-a" } });
    if (url.endsWith("/me")) return me;
    throw new Error(`Unexpected request: ${url}`);
  }));
  respond(Response.json({ error: { code: "FORBIDDEN", message: "Account access is unavailable" },
    lifecycle: { status: "pending_deletion", scheduledDeletionAt: SCHEDULED } }, { status: 403 }));
  await authClient.refresh();
  expect(store.getState()).toMatchObject({ status: "terminal", scheduledDeletionAt: SCHEDULED });
  respond(Response.json({ error: { code: "FORBIDDEN", message: "Account access is unavailable" } }, { status: 403 }));
  await authClient.refresh();
  expect(store.getState()).toMatchObject({ status: "terminal", scheduledDeletionAt: null });
});

it("says when a just-requested deletion becomes final", () => {
  render(<AccountDeletionLifecyclePanel status={{ accountId: "a", status: "pending_deletion", operationId: "o", revision: 2,
    scheduledDeletionAt: SCHEDULED }} onCancel={() => undefined} onRetry={() => undefined} />);
  expect(screen.getByRole("status")).toHaveTextContent(`permanently deleted on ${longDate}`);
});
