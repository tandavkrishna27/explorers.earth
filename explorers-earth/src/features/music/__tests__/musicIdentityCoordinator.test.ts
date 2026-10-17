import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMusicIdentityCoordinator,
  selectExplorerAccountDocument,
  selectExplorerAccountUploadTarget,
  selectCompletedAccount,
} from "../musicIdentityCoordinator";
import * as identityModule from "../musicIdentityCoordinator";

const account = {
  documentId: "account-document-7",
  Account_Name: "Seven",
  Account_Type: "Personal",
  mobile_number: "+15555550123",
};

describe("automatic Music identity coordinator", () => {
  it("does not lend completed readiness to another account or user before reconciliation", async () => {
    const ensureIdentity = vi.fn(async () => undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    await coordinator.reconcile({ provider: "google", authenticated: true, verified: true, userDocumentId: "user-a", account: { documentId: "account-a" } });
    const readyFor = (coordinator as any).isReadyFor;
    expect(readyFor).toBeTypeOf("function");
    expect(readyFor({ userDocumentId: "user-a", accountDocumentId: "account-a" })).toBe(true);
    expect(readyFor({ userDocumentId: "user-a", accountDocumentId: "account-b" })).toBe(false);
    expect(readyFor({ userDocumentId: "user-b", accountDocumentId: "account-a" })).toBe(false);
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
    coordinator.reset();
    expect(readyFor({ userDocumentId: "user-a", accountDocumentId: "account-a" })).toBe(false);
  });
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("selects a sole completed immutable Account and rejects ambiguity without positional fallback", () => {
    expect(selectCompletedAccount([account])).toEqual({ documentId: account.documentId });
    expect(selectCompletedAccount([{ ...account, mobile_number: "" }])).toBeUndefined();
    expect(selectCompletedAccount([account, { ...account, documentId: "account-document-8" }])).toBeUndefined();
    expect(selectCompletedAccount(undefined)).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, documentId: "" }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, documentId: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Name: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Name: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Type: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, Account_Type: 7 }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, mobile_number: " " }])).toBeUndefined();
    expect(selectCompletedAccount([{ ...account, mobile_number: 7 }])).toBeUndefined();
  });

  it("returns one authoritative shared Account-selection state for reordered, incomplete, ambiguous, and partial results", () => {
    const select = (identityModule as any).selectExplorerAccountState;
    expect(typeof select).toBe("function");
    const incomplete = { ...account, documentId: "account-incomplete", mobile_number: "" };
    expect(select([incomplete, account], { authoritative: true })).toEqual({ kind: "selected", account: { documentId: account.documentId } });
    expect(select([account, incomplete], { authoritative: true })).toEqual({ kind: "selected", account: { documentId: account.documentId } });
    expect(select([account, { ...account, documentId: "account-document-8" }], { authoritative: true })).toEqual({ kind: "ambiguous" });
    expect(select([], { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(select(undefined, { authoritative: false })).toEqual({ kind: "unknown" });
    expect(select([incomplete], { authoritative: false })).toEqual({ kind: "unknown" });
  });

  it("selects onboarding and upload Account authority by immutable document ID, never order", () => {
    const partial = { id: 7, documentId: "account-partial" };
    expect(selectExplorerAccountDocument([partial], { authoritative: true })).toEqual({
      kind: "selected", account: { documentId: "account-partial" },
    });
    expect(selectExplorerAccountDocument(undefined, { authoritative: false })).toEqual({ kind: "unknown" });
    expect(selectExplorerAccountDocument([], { authoritative: true })).toEqual({ kind: "missing" });
    expect(selectExplorerAccountDocument([{ id: 7 }], { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(selectExplorerAccountDocument([partial, { id: 8, documentId: "account-b" }], { authoritative: true })).toEqual({ kind: "ambiguous" });

    const accountA = [{ id: 42, documentId: "account-a" }];
    const accountB = [{ id: "91", documentId: "account-b" }];
    expect(selectExplorerAccountUploadTarget(accountA, "account-a", { authoritative: true })).toEqual({
      kind: "selected", account: { documentId: "account-a", id: "42" },
    });
    expect(selectExplorerAccountUploadTarget(accountB, "account-b", { authoritative: true })).toEqual({
      kind: "selected", account: { documentId: "account-b", id: "91" },
    });
    expect(selectExplorerAccountUploadTarget([...accountB, ...accountA], "account-a", { authoritative: true })).toEqual({ kind: "ambiguous" });
    expect(selectExplorerAccountUploadTarget([{ id: 1, documentId: "account-a" }, { id: 2, documentId: "account-a" }], "account-a", { authoritative: true })).toEqual({ kind: "ambiguous" });
    expect(selectExplorerAccountUploadTarget([{ documentId: "account-a" }], "account-a", { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(selectExplorerAccountUploadTarget([{ id: "not-numeric", documentId: "account-a" }], "account-a", { authoritative: true })).toEqual({ kind: "incomplete" });
    expect(selectExplorerAccountUploadTarget([], "account-a", { authoritative: true })).toEqual({ kind: "missing" });
    expect(selectExplorerAccountUploadTarget(undefined, "account-a", { authoritative: true })).toEqual({ kind: "unknown" });
    expect(selectExplorerAccountUploadTarget(accountA, "account-c", { authoritative: true })).toEqual({ kind: "missing" });
    expect(selectExplorerAccountUploadTarget(accountA, "account-a", { authoritative: false })).toEqual({ kind: "unknown" });
  });

  it.each(["google", "email"] as const)("uses the same bodyless automatic path after verified %s auth and onboarding", async (provider) => {
    const ensureIdentity = vi.fn(async () => undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    await coordinator.reconcile({
      provider,
      authenticated: true,
      verified: true,
      userDocumentId: "user-document-4",
      account: { documentId: account.documentId },
    });
    expect(ensureIdentity).toHaveBeenCalledWith();
  });

  it("does not project before verified authentication and completed onboarding", async () => {
    const ensureIdentity = vi.fn(async () => undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    await coordinator.reconcile({ provider: "email", authenticated: true, verified: false, userDocumentId: "user-1", account: { documentId: "account-1" } });
    await coordinator.reconcile({ provider: "google", authenticated: true, verified: true, userDocumentId: "user-1" });
    expect(ensureIdentity).not.toHaveBeenCalled();
  });

  it("coalesces rerenders and route changes without browser storage", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ensureIdentity = vi.fn(() => gate);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const input = {
      provider: "email" as const,
      authenticated: true,
      verified: true,
      userDocumentId: "user-document-4",
      account: { documentId: account.documentId },
    };
    const calls = Array.from({ length: 20 }, () => coordinator.reconcile(input));
    release();
    await Promise.all(calls);
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("retries after a retryable failure and starts a new identity after account switch", async () => {
    const ensureIdentity = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("contained"), { retryable: true }))
      .mockResolvedValue(undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const first = { provider: "email" as const, authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } };
    await expect(coordinator.reconcile(first)).rejects.toThrow("contained");
    await coordinator.retry();
    await coordinator.reconcile({ ...first, account: { documentId: "account-2" } });
    expect(ensureIdentity).toHaveBeenCalledTimes(3);
  });

  it("publishes one contained status stream for loading, retryable, conflict, and ready", async () => {
    const ensureIdentity = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("safe"), { code: "AUTH_UNAVAILABLE", retryable: true }))
      .mockRejectedValueOnce(Object.assign(new Error("safe"), { upstreamCode: "IDENTITY_CONFLICT" }))
      .mockResolvedValue(undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const changes: string[] = [];
    const unsubscribe = coordinator.subscribe(() => changes.push(coordinator.getSnapshot()));
    const input = { provider: "email" as const, authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } };
    await coordinator.reconcile(input).catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("retryable");
    await coordinator.retry().catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("conflict");
    await coordinator.reconcile({ ...input, account: { documentId: "account-2" } });
    expect(coordinator.getSnapshot()).toBe("ready");
    expect(changes).toEqual(["setting_up", "retryable", "setting_up", "conflict", "setting_up", "ready"]);
    unsubscribe();
  });

  it("does not own a second automatic attempt budget for retryable client failures", async () => {
    const ensureIdentity = vi.fn().mockRejectedValue(Object.assign(new Error("safe"), { retryable: true }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const input = { provider: "email" as const, authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } };
    await coordinator.reconcile(input).catch(() => undefined);
    await coordinator.retry().catch(() => undefined);
    await coordinator.retry().catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("retryable");
  });

  it("allows an explicit manual retry after a generic unavailable identity failure", async () => {
    const ensureIdentity = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("safe"), { retryable: false }))
      .mockResolvedValueOnce(undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const input = {
      provider: "email" as const, authenticated: true, verified: true,
      userDocumentId: "user-1", account: { documentId: "account-1" },
    };

    await coordinator.reconcile(input).catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("unavailable");
    await coordinator.reconcile(input);
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
    await coordinator.retry();
    await coordinator.reconcile(input).catch(() => undefined);

    expect(coordinator.getSnapshot()).toBe("ready");
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it("publishes only a sanitized request ID in the failure diagnostic snapshot", async () => {
    const ensureIdentity = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("safe"), { retryable: true, requestId: "safe-request-42" }))
      .mockRejectedValueOnce(Object.assign(new Error("safe"), { retryable: true, requestId: "unsafe/request" }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const diagnosticChanges: Array<{ requestId?: string }> = [];
    const unsubscribe = coordinator.subscribe(() => diagnosticChanges.push(coordinator.getDiagnosticSnapshot()));
    const diagnostic = () => coordinator.getDiagnosticSnapshot();

    await coordinator.reconcile({
      provider: "email", authenticated: true, verified: true,
      userDocumentId: "user-1", account: { documentId: "account-1" },
    }).catch(() => undefined);
    expect(diagnostic()).toEqual({ requestId: "safe-request-42" });

    await coordinator.retry().catch(() => undefined);
    expect(diagnostic()).toEqual({ requestId: undefined });
    expect(diagnosticChanges).toContainEqual({ requestId: "safe-request-42" });
    unsubscribe();
  });

  it.each([
    ["IDENTITY_PENDING_DELETION", "pending_deletion"],
    ["IDENTITY_TOMBSTONED", "pending_deletion"],
    ["IDENTITY_SUSPENDED", "suspended"],
    ["AUTH_REQUIRED", "auth_required"],
    ["AUTH_INVALID", "auth_required"],
    ["ACCOUNT_AMBIGUOUS", "conflict"],
    ["ACCOUNT_SWITCH_CONFLICT", "conflict"],
  ] as const)("maps upstream %s to %s", async (upstreamCode, expected) => {
    const ensureIdentity = vi.fn().mockRejectedValue(Object.assign(new Error("safe"), { upstreamCode }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    await coordinator.reconcile({ provider: "email", authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } }).catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe(expected);
  });

  it.each([
    ["IDENTITY_PENDING_DELETION", "pending_deletion"],
    ["IDENTITY_TOMBSTONED", "pending_deletion"],
    ["IDENTITY_SUSPENDED", "suspended"],
  ] as const)("maps direct canonical failure %s to %s", (code, expected) => {
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity: vi.fn() });
    coordinator.reportFailure(Object.assign(new Error("safe"), { code }));
    expect(coordinator.getSnapshot()).toBe(expected);
  });

  it.each([
    ["IDENTITY_PENDING_DELETION", "pending_deletion"],
    ["IDENTITY_TOMBSTONED", "pending_deletion"],
    ["IDENTITY_SUSPENDED", "suspended"],
    ["AUTH_REQUIRED", "auth_required"],
  ] as const)("accepts terminal workspace failure %s after readiness and hides readiness as %s", (upstreamCode, expected) => {
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity: vi.fn().mockResolvedValue(undefined) });
    coordinator.reportFailure(Object.assign(new Error("safe"), { status: 403, upstreamCode }));
    expect(coordinator.getSnapshot()).toBe(expected);
  });

  it("maps a direct authentication error, resets state, and makes an ineligible retry a no-op", async () => {
    const ensureIdentity = vi.fn().mockRejectedValue(Object.assign(new Error("safe"), { code: "AUTH_REQUIRED" }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const listener = vi.fn();
    const unsubscribe = coordinator.subscribe(listener);
    await coordinator.reconcile({ provider: "email", authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } }).catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("auth_required");
    coordinator.reset();
    expect(coordinator.getSnapshot()).toBe("idle");
    await coordinator.retry();
    unsubscribe();
    coordinator.reset();
    expect(ensureIdentity).toHaveBeenCalledTimes(1);
  });

  it("skips a completed identity and starts a fresh flight after reset", async () => {
    const ensureIdentity = vi.fn().mockResolvedValue(undefined);
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const input = { provider: "email" as const, authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } };
    await coordinator.reconcile(input);
    await coordinator.reconcile(input);
    coordinator.reset();
    await coordinator.reconcile(input);
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it("does not let an in-flight ensure publish authority after logout reset", async () => {
    let release!: () => void;
    const ensureIdentity = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const pending = coordinator.reconcile({ provider: "email", authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } });
    coordinator.reset();
    release();
    await pending;
    expect(coordinator.getSnapshot()).toBe("idle");
  });

  it("does not let an in-flight failure publish status after logout reset", async () => {
    let reject!: (error: Error) => void;
    const ensureIdentity = vi.fn(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const pending = coordinator.reconcile({ provider: "email", authenticated: true, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } });
    coordinator.reset();
    reject(new Error("safe"));
    await pending.catch(() => undefined);
    expect(coordinator.getSnapshot()).toBe("idle");
  });

  it("detaches an old account flight so only the new account can publish readiness", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const ensureIdentity = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSecond = resolve; }));
    const coordinator = createMusicIdentityCoordinator({ ensureIdentity });
    const first = coordinator.reconcile({
      provider: "email", authenticated: true, verified: true,
      userDocumentId: "user-1", account: { documentId: "account-1" },
    });
    const second = coordinator.reconcile({
      provider: "email", authenticated: true, verified: true,
      userDocumentId: "user-1", account: { documentId: "account-2" },
    });

    releaseFirst();
    await first;
    expect(coordinator.getSnapshot()).toBe("setting_up");
    releaseSecond();
    await second;
    expect(coordinator.getSnapshot()).toBe("ready");
    expect(ensureIdentity).toHaveBeenCalledTimes(2);
  });

  it.each([
    { provider: "email" as const, authenticated: false, verified: true, userDocumentId: "user-1", account: { documentId: "account-1" } },
    { provider: "email" as const, authenticated: true, verified: false, userDocumentId: "user-1", account: { documentId: "account-1" } },
    { provider: "email" as const, authenticated: true, verified: true, account: { documentId: "account-1" } },
    { provider: "email" as const, authenticated: true, verified: true, userDocumentId: "user-1" },
  ])("does not start for each incomplete eligibility shape", async (input) => {
    const ensureIdentity = vi.fn().mockResolvedValue(undefined);
    await createMusicIdentityCoordinator({ ensureIdentity }).reconcile(input);
    expect(ensureIdentity).not.toHaveBeenCalled();
  });
});
