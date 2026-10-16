import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../../../store/store";
import Settings from "../Settings";

const apolloMutation = vi.hoisted(() => vi.fn());
vi.mock("../../navigation/CategoryNavigationProvider", () => ({ useCategoryNavigation: () => ({
  snapshot: undefined, authority: undefined, busy: false, error: undefined,
  refresh: async () => {}, request: vi.fn(), setAutoPinning: vi.fn(),
}) }));
vi.mock("../../music/MusicPublishProvider", () => ({ useMusicPublish: () => ({
  state: { kind: "unknown" }, canChange: false, canRecover: false, request: vi.fn(), resume: vi.fn(), refresh: vi.fn(),
}) }));
vi.mock("@apollo/client", async (original) => ({ ...await original<typeof import("@apollo/client")>(),
  useApolloClient: () => ({ clearStore: async () => undefined }), useMutation: () => [apolloMutation],
  useQuery: () => ({ data: {}, loading: false, refetch: vi.fn() }),
}));
vi.mock("../../Profile/api/useCanonicalAccount", () => ({ useCanonicalAccount: () => ({
  data: { id: "account-a", handle: "alice", revision: 1, onboardingStatus: "complete" }, isLoading: false,
}) }));
vi.mock("../components/ProfileAccountSettings", () => ({ default: () => null }));
vi.mock("../components/BillingTab", () => ({ default: () => null }));
vi.mock("../components/LanguageSelector", () => ({ default: () => null, LANGUAGES: [{ code: "en", name: "English" }] }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function signIn(id = "user-a") {
  useAuthStore.getState().login({ id, documentId: "account-a", username: "alice", email: `${id}@example.invalid`, blocked: false, token: "old" });
}
const active = () => new Response(JSON.stringify({ lifecycle: { accountId: "account-a", status: "active", operationId: null, revision: 1 } }), { status: 200 });

describe("Settings canonical lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); signIn(); });

  it("keeps the reason step retryable after a failed feedback save and reuses its idempotency key", async () => {
    const keys: string[] = [];
    let feedbackAttempts = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.endsWith("deletion-feedback")) return active();
      keys.push(String((init?.headers as Record<string, string>)?.["Idempotency-Key"]));
      feedbackAttempts++;
      return feedbackAttempts === 1
        ? new Response(JSON.stringify({ error: { code: "UNAVAILABLE", message: "Retry feedback" } }), { status: 503 })
        : new Response(JSON.stringify({ feedback: { id: "feedback-a" } }), { status: 201 });
    }));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: "settings.account.deleteAccount.text settings.account.deleteAccount.description" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step3.reasonPlaceholder"), { target: { value: " Leaving " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    await waitFor(() => expect(feedbackAttempts).toBe(1));
    expect(screen.queryByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    await screen.findByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("saves trimmed deletion feedback through the canonical cookie route before final confirmation", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return url.endsWith("deletion-feedback") ? new Response(JSON.stringify({ feedback: { id: "feedback-a" } }), { status: 201 }) : active();
    }));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: "settings.account.deleteAccount.text settings.account.deleteAccount.description" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step3.reasonPlaceholder"), { target: { value: "  Leaving  " } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    await waitFor(() => expect(calls.some((call) => call.url === "/api/explorers/v1/account/deletion-feedback")).toBe(true));
    const feedback = calls.find((call) => call.url.endsWith("deletion-feedback"))!;
    expect(feedback.init?.credentials).toBe("include");
    expect(JSON.parse(String(feedback.init?.body))).toEqual({ reason: "Leaving" });
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("does not advance the deletion wizard from a delayed old session response", async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("deletion-feedback")
      ? new Promise<Response>((resolve) => { release = resolve; }) : Promise.resolve(active())));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: "settings.account.deleteAccount.text settings.account.deleteAccount.description" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step3.reasonPlaceholder"), { target: { value: "Leaving" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    act(() => { signIn("user-b"); signIn("user-a"); });
    await act(async () => release(new Response(JSON.stringify({ feedback: { id: "old" } }), { status: 201 })));
    expect(screen.queryByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" })).toBeNull();
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("submits final deletion with canonical revision and feedback ID without a Strapi mutation", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("deletion-feedback")) return new Response(JSON.stringify({ feedback: { id: "feedback-a" } }), { status: 201 });
      if (url.endsWith("/deletion")) return new Response(JSON.stringify({ lifecycle: { accountId: "account-a", status: "pending_deletion", revision: 2, operationId: "op-a" } }), { status: 200 });
      return active();
    }));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: "settings.account.deleteAccount.text settings.account.deleteAccount.description" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step1.continueButton" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step2.continueButton" }));
    fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step3.reasonPlaceholder"), { target: { value: "Leaving" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step3.continueButton" }));
    await screen.findByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" });
    fireEvent.change(screen.getByPlaceholderText("settings.account.deleteAccount.step4.confirmPlaceholder"),
      { target: { value: "settings.account.deleteAccount.step4.confirmTextValue" } });
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deleteAccount.step4.deleteButton" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/deletion"))).toBe(true));
    const deletion = calls.find((call) => call.url.endsWith("/deletion"))!;
    expect(JSON.parse(String(deletion.init?.body))).toEqual({ expectedRevision: 1, feedbackId: "feedback-a" });
    expect(apolloMutation).not.toHaveBeenCalled();
  });

  it("deactivates through the canonical session and fences local authority", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/deactivation")) return new Response(JSON.stringify({ lifecycle: {
        accountId: "account-a", status: "suspended", revision: 2, operationId: "op-a",
      } }), { status: 200 });
      return active();
    }));
    render(<Settings />);
    fireEvent.click(await screen.findByRole("button", { name: "settings.account.deactivateAccount.text settings.account.deactivateAccount.description" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.account.deactivateAccount.confirmButton" }));
    await waitFor(() => expect(calls.some((call) => call.url.endsWith("/deactivation"))).toBe(true));
    const deactivation = calls.find((call) => call.url.endsWith("/deactivation"))!;
    expect(JSON.parse(String(deactivation.init?.body))).toEqual({ expectedRevision: 1 });
    await waitFor(() => expect(useAuthStore.getState().status).toBe("signed-out"));
    expect(apolloMutation).not.toHaveBeenCalled();
  });
});
