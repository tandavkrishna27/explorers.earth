import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../store/store";
import Settings from "../Settings";
import { toast } from "sonner";

const apolloMutation = vi.hoisted(() => vi.fn());
vi.mock("../../navigation/CategoryNavigationProvider", () => ({ useCategoryNavigation: () => ({
  snapshot: undefined, authority: undefined, busy: false, error: undefined,
  refresh: async () => {}, request: vi.fn(), setAutoPinning: vi.fn(),
}) }));
vi.mock("@apollo/client", async (original) => ({ ...await original<typeof import("@apollo/client")>(),
  useApolloClient: () => ({ clearStore: async () => undefined }), useMutation: () => [apolloMutation],
  useQuery: () => ({ data: {}, loading: false, refetch: vi.fn() }),
}));
vi.mock("../../Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({
  data: { id: "account-a", handle: "alice", revision: 1, onboardingStatus: "complete" }, isLoading: false,
}) }));
vi.mock("../components/ProfileAccountSettings", () => ({ default: () => null }));
vi.mock("../components/LanguageSelector", () => ({ default: () => null, LANGUAGES: [{ code: "en", name: "English" }] }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function signIn(id = "user-a") {
  useAuthStore.getState().login({ id, documentId: "account-a", username: "alice", email: `${id}@example.invalid`, blocked: false, token: "old" });
}
const active = () => new Response(JSON.stringify({ lifecycle: { accountId: "account-a", status: "active", operationId: null, revision: 1 } }), { status: 200 });

const DELETE_ENTRY = "settings.account.deleteAccount.text settings.account.deleteAccount.description";
const DEACTIVATE_ENTRY = "settings.account.deactivateAccount.text settings.account.deactivateAccount.description";
const REASON = "settings.account.deleteAccount.step3.reasonPlaceholder";
const HANDLE_PLACEHOLDER = "settings.account.deleteAccount.step2.usernamePlaceholder";
const feedbackUrl = "/api/explorers/v1/account/deletion-feedback";
const deletionUrl = "/api/explorers/v1/account/deletion";
const pendingDeletion = () => new Response(JSON.stringify({ lifecycle: { accountId: "account-a", status: "pending_deletion", revision: 2,
  operationId: "op-a", scheduledDeletionAt: "2026-11-18T10:00:00.000Z" } }), { status: 200 });
const feedbackSaved = (id = "feedback-a") => new Response(JSON.stringify({ feedback: { id } }), { status: 201 });

/** Open the delete wizard and type the handle on step 2. */
async function toReasonStep(handle = "alice") {
  fireEvent.click(await screen.findByRole("button", { name: DELETE_ENTRY }));
  fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
  fireEvent.change(screen.getByPlaceholderText(HANDLE_PLACEHOLDER), { target: { value: handle } });
  fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
}
async function toConfirmStep(reason = "Leaving") {
  await toReasonStep();
  fireEvent.change(screen.getByPlaceholderText(REASON), { target: { value: reason } });
  fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
  await screen.findByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" });
}
function confirmDeletion() {
  fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step4.confirmPlaceholder"),
    { target: { value: "settings.account.deleteAccount.step4.confirmTextValue" } });
  fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" }));
}

describe("Settings canonical lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); signIn(); });

  it("keeps the final step retryable after a failed feedback save and reuses its idempotency keys", async () => {
    const keys: string[] = [];
    const deletionKeys: string[] = [];
    let feedbackAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const key = String((init?.headers as Record<string, string>)?.["Idempotency-Key"]);
      if (url.endsWith("/deletion")) { deletionKeys.push(key); return pendingDeletion(); }
      if (!url.endsWith("deletion-feedback")) return active();
      keys.push(key);
      feedbackAttempts++;
      return feedbackAttempts === 1
        ? new Response(JSON.stringify({ error: { code: "UNAVAILABLE", message: "Retry feedback" } }), { status: 503 })
        : feedbackSaved();
    }));
    render(<Settings />);
    await toConfirmStep(" Leaving ");
    confirmDeletion();
    await waitFor(() => expect(feedbackAttempts).toBe(1));
    // The failed feedback save stops the deletion: nothing was requested.
    expect(deletionKeys).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" }));
    await waitFor(() => expect(deletionKeys).toHaveLength(1));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("sends no feedback while the wizard is only being walked through, so abandoning leaves nothing behind", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, init }); return active(); }));
    render(<Settings />);
    await toConfirmStep("  Leaving  ");
    // Reached the final confirmation, then walked away without confirming.
    expect(calls.filter((call) => call.url === feedbackUrl || call.url === deletionUrl)).toEqual([]);
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("records the trimmed feedback immediately before the deletion request, as part of the confirmed deletion", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === feedbackUrl) return feedbackSaved();
      if (url === deletionUrl) return pendingDeletion();
      return active();
    }));
    render(<Settings />);
    await toConfirmStep("  Leaving  ");
    confirmDeletion();
    await waitFor(() => expect(calls.some((call) => call.url === deletionUrl)).toBe(true));
    const lifecycleCalls = calls.filter((call) => call.url === feedbackUrl || call.url === deletionUrl);
    expect(lifecycleCalls.map((call) => call.url)).toEqual([feedbackUrl, deletionUrl]);
    expect(lifecycleCalls[0].init?.credentials).toBe("include");
    expect(JSON.parse(String(lifecycleCalls[0].init?.body))).toEqual({ reason: "Leaving" });
    expect(JSON.parse(String(lifecycleCalls[1].init?.body))).toEqual({ expectedRevision: 1, feedbackId: "feedback-a" });
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("does not delete from a delayed old session response", async () => {
    let release!: (response: Response) => void;
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      calls.push(url);
      return url === feedbackUrl ? new Promise<Response>((resolve) => { release = resolve; }) : Promise.resolve(active());
    }));
    render(<Settings />);
    await toConfirmStep();
    confirmDeletion();
    await waitFor(() => expect(calls).toContain(feedbackUrl));
    act(() => { signIn("user-b"); signIn("user-a"); });
    await act(async () => release(feedbackSaved("old")));
    expect(calls).not.toContain(deletionUrl);
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("states the 30-day grace period and recovery on the first delete step", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => active()));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: DELETE_ENTRY }));
    expect(screen.getByText("settings.account.deleteAccount.step1.modalDescriptionGrace")).toBeInTheDocument();
    expect(screen.queryByText("settings.account.deleteAccount.step1.modalDescription")).toBeNull();
  });

  it("makes the user type their handle to delete: the field starts empty and editable, and a wrong or empty one is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => active()));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: DELETE_ENTRY }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
    const field = screen.getByPlaceholderText(HANDLE_PLACEHOLDER) as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.readOnly).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    expect(toast.error).toHaveBeenCalledWith("settings.account.handleMismatch");
    expect(screen.queryByPlaceholderText(REASON)).toBeNull();
    fireEvent.change(field, { target: { value: "bob" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    expect(screen.queryByPlaceholderText(REASON)).toBeNull();
    fireEvent.change(field, { target: { value: " @Alice " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    expect(screen.getByPlaceholderText(REASON)).toBeInTheDocument();
  });

  it("caps the reason at 2,000 characters, counts them and explains a reason that is too long", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => active()));
    render(<Settings />);
    await toReasonStep();
    const reason = screen.getByPlaceholderText(REASON) as HTMLTextAreaElement;
    expect(reason.maxLength).toBe(2000);
    fireEvent.change(reason, { target: { value: "x".repeat(25) } });
    expect(screen.getByText("25 / 2000")).toBeInTheDocument();
    // A value past the cap (bypassing the input limit) is explained, not reported as empty.
    fireEvent.change(reason, { target: { value: "x".repeat(2001) } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    expect(toast.error).toHaveBeenLastCalledWith("settings.account.deleteAccount.step3.reasonTooLong");
    expect(toast.error).not.toHaveBeenCalledWith("settings.account.deleteAccount.step4.reasonRequired");
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    expect(toast.error).toHaveBeenLastCalledWith("settings.account.deleteAccount.step4.reasonRequired");
  });

  it("deactivates through the canonical session only after the handle is typed, and fences local authority", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/deactivation")) return new Response(JSON.stringify({ lifecycle: {
        accountId: "account-a", status: "suspended", revision: 2, operationId: "op-a",
      } }), { status: 200 });
      return active();
    }));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: DEACTIVATE_ENTRY }));
    const field = screen.getByPlaceholderText("settings.account.deactivateAccount.usernamePlaceholder") as HTMLInputElement;
    expect(field.value).toBe("");
    expect(field.readOnly).toBe(false);
    // Nothing typed: refused, no request.
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deactivateAccount.confirmButton" }));
    fireEvent.change(field, { target: { value: "not-alice" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deactivateAccount.confirmButton" }));
    expect(toast.error).toHaveBeenCalledWith("settings.account.handleMismatch");
    expect(calls.some((call) => call.url.endsWith("/deactivation"))).toBe(false);
    fireEvent.change(field, { target: { value: "alice" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deactivateAccount.confirmButton" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/deactivation"))).toBe(true));
    const deactivation = calls.find((call) => call.url.endsWith("/deactivation"))!;
    expect(JSON.parse(String(deactivation.init?.body))).toEqual({ expectedRevision: 1 });
    await waitFor(() => expect(useAuthStore.getState().status).toBe("signed-out"));
    expect(apolloMutation).not.toHaveBeenCalled();
  });
});

describe("Settings delete-account dialog layout", () => {
  beforeEach(() => { vi.clearAllMocks(); signIn(); });

  it("fills the dialog panel instead of centring a narrow block with a wide empty margin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => active()));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: DELETE_ENTRY }));
    const content = document.querySelector("[data-modal-panel] .modal-content > div") as HTMLElement;
    expect(content).toBeTruthy();
    expect(content).toHaveClass("w-full");
    expect(content.className).not.toMatch(/\bmx-auto\b|min-w-\[|max-w-2xl|md:px-12/);
  });
});
