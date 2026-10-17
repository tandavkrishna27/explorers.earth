import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  getAppUrl: vi.fn(),
  getEmailTemplateByName: vi.fn(),
}));

vi.mock("../email-service", () => ({ emailService: { sendEmail: mocks.sendEmail } }));
vi.mock("../system-settings-service", () => ({ systemSettingsService: { getAppUrl: mocks.getAppUrl } }));
vi.mock("../../storage", () => ({
  storage: {
    getEmailTemplateByName: mocks.getEmailTemplateByName,
    createEmailTemplate: vi.fn(),
  },
}));

import {
  confirmReactivation as confirmReactivationWithAuthority,
  requestReactivation as requestReactivationWithAuthority,
} from "../reactivation-service";
import { MusicIdentityError } from "../../../shared/musicError";

const user = {
  id: 73,
  documentId: "reactivate-user-document",
  username: "reactivate-user",
  email: "reactivate@example.invalid",
  blocked: true,
  confirmed: true,
  accounts: [{ documentId: "reactivate-account-document" }],
};

type StoredToken = {
  strapiUserId: number;
  userDocumentId: string;
  accountDocumentId: string;
  operationId: string;
  leaseOwner?: string;
  consumed?: boolean;
  revoked?: boolean;
};

class FakeDurableTokenAuthority {
  readonly rows = new Map<string, StoredToken>();

  async issueReactivationToken(input: StoredToken & { tokenHash: string }) {
    this.rows.set(input.tokenHash, { ...input });
  }

  async claimReactivationToken(tokenHash: string, leaseOwner: string) {
    const row = this.rows.get(tokenHash);
    if (!row) return { disposition: "missing" as const };
    if (row.consumed) return { disposition: "consumed" as const };
    if (row.revoked) return { disposition: "revoked" as const };
    if (row.leaseOwner) return { disposition: "busy" as const };
    row.leaseOwner = leaseOwner;
    return { disposition: "claimed" as const, ...row };
  }

  async releaseReactivationToken(tokenHash: string, leaseOwner: string) {
    const row = this.rows.get(tokenHash);
    if (!row || row.leaseOwner !== leaseOwner) return false;
    delete row.leaseOwner;
    return true;
  }

  async consumeReactivationToken(tokenHash: string, leaseOwner: string) {
    const row = this.rows.get(tokenHash);
    if (!row || row.leaseOwner !== leaseOwner || row.consumed) return false;
    delete row.leaseOwner;
    row.consumed = true;
    return true;
  }

  async revokeReactivationToken(tokenHash: string) {
    const row = this.rows.get(tokenHash);
    if (!row || row.consumed || row.revoked) return false;
    row.revoked = true;
    delete row.leaseOwner;
    return true;
  }
}

let tokens: FakeDurableTokenAuthority;

function requestReactivation(email: string): Promise<void> {
  return requestReactivationWithAuthority(email, { tokens });
}

function confirmReactivation(
  token: string,
  dependencies: { reactivateMusic(input: { userDocumentId: string; accountDocumentId: string; operationId: string }): Promise<void> },
) {
  return confirmReactivationWithAuthority(token, { ...dependencies, tokens });
}

function fetchToken(): string {
  const variables = mocks.sendEmail.mock.calls.at(-1)?.[2] as { verificationLink: string };
  return new URL(variables.verificationLink).searchParams.get("token")!;
}

describe("Explorer reactivation Music lifecycle composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRAPI_URL", "https://strapi.example.invalid");
    vi.stubEnv("STRAPI_ACCESS_TOKEN", "write-token-for-test");
    mocks.getAppUrl.mockResolvedValue("https://explorers.example.invalid");
    mocks.getEmailTemplateByName.mockResolvedValue({ id: 9 });
    mocks.sendEmail.mockResolvedValue({ success: true });
    tokens = new FakeDurableTokenAuthority();
  });

  it("shares hash-only token authority across service instances and admits one concurrent claimant", async () => {
    let releaseMusic!: () => void;
    const musicBlocked = new Promise<void>((resolve) => { releaseMusic = resolve; });
    let blocked = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        blocked = false;
        return Response.json({ ...user, blocked: false });
      }
      if (new URL(String(input)).pathname === `/api/users/${user.id}`) return Response.json({ ...user, blocked });
      return Response.json([user]);
    }));
    await requestReactivation(user.email);
    const rawToken = fetchToken();
    expect([...tokens.rows.keys()]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/)]);
    expect([...tokens.rows.keys()]).not.toContain(rawToken);
    const reactivateMusic = vi.fn(async () => { await musicBlocked; });

    const first = confirmReactivation(rawToken, { reactivateMusic });
    while (reactivateMusic.mock.calls.length === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await confirmReactivation(rawToken, { reactivateMusic });
    releaseMusic();
    await expect(first).resolves.toEqual({ success: true });
    expect(second).toMatchObject({ success: false });
    expect(reactivateMusic).toHaveBeenCalledOnce();
  });

  it("never logs email, raw token, reactivation link, response body, or provider error objects", async () => {
    const providerError = { message: "sentinel-provider-error", email: user.email };
    mocks.sendEmail.mockResolvedValue({ success: false, error: providerError });
    const logs: unknown[][] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...values) => { logs.push(values); });
    const error = vi.spyOn(console, "error").mockImplementation((...values) => { logs.push(values); });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([user])));
    await requestReactivation(user.email);
    const rawToken = fetchToken();
    const rendered = JSON.stringify(logs);
    expect(rendered).not.toContain(user.email);
    expect(rendered).not.toContain(rawToken);
    expect(rendered).not.toContain("reactivate-confirm");
    expect(rendered).not.toContain("sentinel-provider-error");
    log.mockRestore();
    error.mockRestore();
  });

  it("uses manual redirects and cancels a redirect response before suppressing the request", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() { cancelled = true; },
    });
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      return new Response(body, { status: 302, headers: { location: "https://attacker.invalid" } });
    });
    vi.stubGlobal("fetch", fetchImpl);

    await requestReactivation(user.email);
    expect(cancelled).toBe(true);
    expect(tokens.rows.size).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("aborts a stalled Strapi connection without issuing a token", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("fetch", ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch);
      const operation = requestReactivation(user.email);
      await vi.advanceTimersByTimeAsync(2_000);
      await operation;
      expect(tokens.rows.size).toBe(0);
      expect(mocks.sendEmail).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reactivates the immutable Music binding before unblocking Strapi and consumes the token only after both converge", async () => {
    const events: string[] = [];
    let putSucceeds = false;
    let blocked = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        events.push("strapi-unblock");
        if (!putSucceeds) return new Response("{}", { status: 503 });
        blocked = false;
        return Response.json({
          id: user.id, documentId: user.documentId, username: user.username,
          email: user.email, confirmed: user.confirmed, blocked: false,
        });
      }
      if (new URL(String(input)).pathname === `/api/users/${user.id}`) return Response.json({ ...user, blocked });
      return Response.json([user]);
    }));
    await requestReactivation(user.email);
    const token = fetchToken();
    const inputs: unknown[] = [];
    const reactivateMusic = vi.fn(async (input: unknown) => {
      events.push("music-reactivate");
      inputs.push(input);
    });

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    putSucceeds = true;
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toEqual({ success: true });
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });

    expect(events).toEqual(["music-reactivate", "strapi-unblock", "music-reactivate", "strapi-unblock"]);
    expect(inputs[0]).toEqual({
      userDocumentId: user.documentId,
      accountDocumentId: user.accounts[0].documentId,
      operationId: expect.any(String),
    });
    expect(inputs[1]).toEqual(inputs[0]);
  });

  it("accepts the real flat Users and Permissions PUT only after exact populated readback", async () => {
    // Break caught: a valid Strapi edit omits custom Account relations and is falsely reported as a failure.
    let blocked = true;
    let unblockCalls = 0;
    let identityReads = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (init?.method === "PUT") {
        unblockCalls += 1;
        blocked = false;
        return Response.json({
          id: user.id, documentId: user.documentId, username: user.username,
          email: user.email, confirmed: user.confirmed, blocked: false,
        });
      }
      if (pathname === `/api/users/${user.id}`) {
        identityReads += 1;
        return Response.json({ ...user, blocked });
      }
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toEqual({ success: true });
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    expect(unblockCalls).toBe(1);
    expect(identityReads).toBe(2);
    expect(reactivateMusic).toHaveBeenCalledOnce();
  });

  it("keeps Strapi blocked and the token retryable while Music is unavailable", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") return Response.json({ ...user, blocked: false });
      if (new URL(String(input)).pathname === `/api/users/${user.id}`) return Response.json(user);
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const failedMusic = vi.fn(async () => { throw new Error("Music unavailable"); });

    await expect(confirmReactivation(token, { reactivateMusic: failedMusic })).resolves.toMatchObject({ success: false });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);

    const recoveredMusic = vi.fn(async () => undefined);
    await expect(confirmReactivation(token, { reactivateMusic: recoveredMusic })).resolves.toEqual({ success: true });
    expect(recoveredMusic).toHaveBeenCalledOnce();
  });

  it("retains a tombstoned Music token and never attempts a Strapi unblock", async () => {
    // Break caught: permanent Music retirement is treated as successful absence and Strapi is restored alone.
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") throw new Error("Strapi PUT must not be attempted");
      if (new URL(String(input)).pathname === `/api/users/${user.id}`) return Response.json(user);
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const inputs: unknown[] = [];
    const reactivateMusic = vi.fn(async (input: unknown) => {
      inputs.push(input);
      throw new MusicIdentityError(
        "IDENTITY_TOMBSTONED", 409, "This Music identity was permanently removed.",
        "contact_support", false, undefined, "tombstone",
      );
    });

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toEqual(inputs[0]);
  });

  it.each([
    { label: "an empty object", body: {} },
    { label: "a null body", body: null },
    { label: "a still-blocked user", body: user },
    { label: "a mismatched numeric user", body: { ...user, id: user.id + 1, blocked: false } },
    { label: "a mismatched immutable user", body: { ...user, documentId: "replacement-user-document", blocked: false } },
    { label: "a mismatched immutable Account", body: { ...user, blocked: false, accounts: [{ documentId: "replacement-account-document" }] } },
  ])("retains the token and exact Music operation when unblock returns 2xx with $label", async ({ body }) => {
    // Break caught: response.ok is mistaken for proof that the exact immutable Strapi tuple is unblocked.
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") return Response.json(body);
      if (new URL(String(input)).pathname === `/api/users/${user.id}`) return Response.json(user);
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    expect(reactivateMusic).toHaveBeenCalledTimes(2);
    expect(reactivateMusic.mock.calls[1]).toEqual(reactivateMusic.mock.calls[0]);
  });

  it.each([
    { label: "a missing Account", readback: { ...user, blocked: false, accounts: [] } },
    { label: "multiple Accounts", readback: { ...user, blocked: false, accounts: [user.accounts[0], { documentId: "extra-account" }] } },
    { label: "a replaced Account", readback: { ...user, blocked: false, accounts: [{ documentId: "replacement-account" }] } },
    { label: "a malformed null body", readback: null },
    { label: "an unexpected collection", readback: [{ ...user, blocked: false }] },
    { label: "a still-blocked tuple", readback: user },
  ])("retains the token when flat PUT readback has $label", async ({ readback }) => {
    // Break caught: an absent Account in PUT is accepted without an exact populated postcondition.
    let identityReads = 0;
    let repaired = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (init?.method === "PUT") {
        return Response.json({
          id: user.id, documentId: user.documentId, username: user.username,
          email: user.email, confirmed: user.confirmed, blocked: false,
        });
      }
      if (pathname === `/api/users/${user.id}`) {
        identityReads += 1;
        if (identityReads === 1) return Response.json(user);
        return Response.json(repaired ? { ...user, blocked: false } : readback);
      }
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    repaired = true;
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toEqual({ success: true });
    expect(identityReads).toBe(3);
    expect(reactivateMusic).toHaveBeenCalledTimes(2);
    expect(reactivateMusic.mock.calls[1]).toEqual(reactivateMusic.mock.calls[0]);
  });

  it.each([
    { label: "replacement Account", current: { ...user, accounts: [{ documentId: "replacement-account-document" }] } },
    { label: "replacement user", current: { ...user, documentId: "replacement-user-document" } },
    { label: "missing Account", current: { ...user, accounts: [] } },
    { label: "multiple Accounts", current: { ...user, accounts: [user.accounts[0], { documentId: "extra-account-document" }] } },
  ])("fails closed before Music when current Strapi authority has a $label", async ({ current }) => {
    // Break caught: confirmation trusts the 24-hour token snapshot after Strapi identity replacement.
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (init?.method === "PUT") return new Response("{}", { status: 200 });
      if (pathname === `/api/users/${user.id}`) return Response.json(current);
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    expect(reactivateMusic).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it.each([
    { label: "an authority outage", current: () => new Response("", { status: 503 }) },
    { label: "a malformed user", current: () => Response.json({ ...user, blocked: "false" }) },
    { label: "an unexpected collection", current: () => Response.json([user]) },
  ])("fails closed before Music when fresh Strapi proof has $label", async ({ current }) => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (init?.method === "PUT") return new Response("{}", { status: 200 });
      if (pathname === `/api/users/${user.id}`) return current();
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    expect(reactivateMusic).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(0);
  });

  it("converges a lost unblock response after fresh authority proves the exact tuple is already unblocked", async () => {
    let blocked = true;
    let unblockCalls = 0;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const pathname = new URL(String(input)).pathname;
      if (init?.method === "PUT") {
        unblockCalls += 1;
        blocked = false;
        return new Response("", { status: 503 });
      }
      if (pathname === `/api/users/${user.id}`) return Response.json({ ...user, blocked });
      return Response.json([user]);
    });
    vi.stubGlobal("fetch", fetchImpl);
    await requestReactivation(user.email);
    const token = fetchToken();
    const reactivateMusic = vi.fn(async () => undefined);

    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toMatchObject({ success: false });
    await expect(confirmReactivation(token, { reactivateMusic })).resolves.toEqual({ success: true });
    expect(unblockCalls).toBe(1);
    expect(reactivateMusic).toHaveBeenCalledTimes(2);
    expect(reactivateMusic.mock.calls[1]).toEqual(reactivateMusic.mock.calls[0]);
  });
});
