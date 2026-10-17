import { describe, expect, it, vi } from "vitest";
import { MusicIdentityError } from "../../shared/musicError";
import { MusicLifecycleService } from "../services/musicLifecycleService";
import { StrapiIdentityGateway } from "../services/strapiIdentityGateway";

const identity = {
  userDocumentId: "user-document-a",
  accountDocumentId: "account-document-a",
  username: "mutable-name",
  email: "private@example.invalid",
  provider: "local" as const,
  accountName: "Account A",
  accountType: "Explorer",
  accountMobile: "+10000000000",
};

function harness() {
  const status = {
    operationId: "6f74f9e0-7eb3-41fc-9c71-6572ce77ab47",
    musicUserId: 41,
    identityStatus: "pending_deletion" as const,
    phase: "prepared" as const,
    state: "completed" as const,
    boundaryCrossed: false,
    retryable: false,
    deadLetter: false,
  };
  const repository = {
    prepareDeletion: vi.fn(async () => status),
    lifecycleStatus: vi.fn(async () => status),
    markDeletionBoundary: vi.fn(async () => ({ ...status, boundaryCrossed: true, state: "requested" as const })),
    cancelDeletion: vi.fn(async () => ({ ...status, identityStatus: "suspended" as const, state: "cancelled" as const })),
    lifecycleBinding: vi.fn(async () => ({
      disposition: "present" as const,
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      identityStatus: "active" as const,
    })),
    suspendIdentity: vi.fn(async () => ({
      identityStatus: "not_present" as const,
      strapiUserDocumentId: identity.userDocumentId,
      strapiAccountDocumentId: identity.accountDocumentId,
    })),
    reactivateIdentity: vi.fn(async () => ({
      identityStatus: "not_present" as const,
      strapiUserDocumentId: identity.userDocumentId,
      strapiAccountDocumentId: identity.accountDocumentId,
    })),
    transitionIdentity: vi.fn(),
  };
  const gateway = {
    resolveUser: vi.fn(async () => ({ userDocumentId: identity.userDocumentId })),
    resolve: vi.fn(async () => identity),
    clear: vi.fn(),
  };
  const disconnectOwner = vi.fn(async () => undefined);
  return { status, repository, gateway, disconnectOwner };
}

describe("MusicLifecycleService", () => {
  it("prepares from the authoritative tuple and disconnects the durable numeric owner", async () => {
    // Break caught: accepting caller identity fields or omitting immediate socket eviction.
    const h = harness();
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.prepareDeletion("authoritative-proof", "request-a")).resolves.toMatchObject(h.status);
    expect(h.repository.prepareDeletion).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: h.status.operationId,
    });
    expect(h.disconnectOwner).toHaveBeenCalledWith(41);
  });

  it("fails closed when the active authoritative Account differs from the stored owner binding", async () => {
    const h = harness();
    h.gateway.resolve.mockResolvedValue({ ...identity, accountDocumentId: "account-document-other" });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.prepareDeletion("authoritative-proof", "request-conflict")).rejects.toMatchObject({
      code: "IDENTITY_CONFLICT",
      status: 409,
    });
    expect(h.repository.prepareDeletion).not.toHaveBeenCalled();
    expect(h.disconnectOwner).not.toHaveBeenCalled();
  });

  it("refuses cancellation after the repository reports the irreversible boundary", async () => {
    // Break caught: allowing a cancel after any upstream deletion attempt.
    const h = harness();
    h.repository.cancelDeletion.mockRejectedValueOnce(new MusicIdentityError(
      "LIFECYCLE_CANCEL_FORBIDDEN", 409, "Music deletion can no longer be cancelled.", "contact_support", false,
    ));
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "3e34409a-3836-4223-b8c1-5d5da0cc249c",
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.cancelDeletion("authoritative-proof", "request-b")).rejects.toMatchObject({
      code: "LIFECYCLE_CANCEL_FORBIDDEN",
      status: 409,
    });
  });

  it("recovers a pending tuple by authoritative user when the selected Account is already absent", async () => {
    // Break caught: a lost Account-delete response makes every lifecycle retry fail onboarding before repository lookup.
    const h = harness();
    const crossed = { ...h.status, boundaryCrossed: true, state: "requested" as const };
    h.repository.lifecycleBinding.mockResolvedValue({
      disposition: "present",
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      identityStatus: "pending_deletion",
    });
    h.repository.lifecycleStatus.mockResolvedValue(crossed);
    h.repository.prepareDeletion.mockResolvedValue(crossed);
    h.repository.markDeletionBoundary.mockResolvedValue(crossed);
    h.gateway.resolve.mockRejectedValue(new MusicIdentityError(
      "ONBOARDING_INCOMPLETE", 409, "Complete onboarding.", "complete_onboarding", false,
    ));
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.status("authoritative-proof", "request-reload")).resolves.toMatchObject(crossed);
    await expect(service.prepareDeletion("authoritative-proof", "request-retry")).resolves.toMatchObject(crossed);
    await expect(service.markDeletionBoundary("authoritative-proof", "request-boundary")).resolves.toMatchObject({ boundaryCrossed: true });
    expect(h.gateway.resolveUser).toHaveBeenCalledTimes(3);
    expect(h.gateway.resolve).not.toHaveBeenCalled();
    expect(h.repository.lifecycleBinding).toHaveBeenCalledWith(identity.userDocumentId);
  });

  it("rejects a replacement Account before the irreversible boundary", async () => {
    // Break caught: pending Account A can be replaced by B, then boundary/delete destroys B outside the durable operation.
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({
      disposition: "present",
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      identityStatus: "pending_deletion",
    });
    h.gateway.resolve.mockResolvedValue({ ...identity, accountDocumentId: "account-document-b" });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.prepareDeletion("authoritative-proof", "request-replacement-prepare"))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    await expect(service.markDeletionBoundary("authoritative-proof", "request-replacement-boundary"))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    expect(h.repository.markDeletionBoundary).not.toHaveBeenCalled();
  });

  it("uses the real user-only gateway path for an Account-absent pending reload", async () => {
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({
      disposition: "present",
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      identityStatus: "pending_deletion",
    });
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(new URL(String(input)).pathname).toBe("/api/users/me");
      return new Response(JSON.stringify({
        documentId: identity.userDocumentId,
        username: identity.username,
        email: identity.email,
        provider: identity.provider,
        confirmed: true,
        blocked: false,
      }), { status: 200 });
    });
    const gateway = new StrapiIdentityGateway({
      baseUrl: "https://strapi.example", fetchImpl, maxConcurrency: 1, maxPending: 2, retries: 0,
      connectTimeoutMs: 100, readTimeoutMs: 100, overallTimeoutMs: 500, cacheTtlMs: 0,
      circuitFailureThreshold: 2, circuitOpenMs: 100,
    });
    const service = new MusicLifecycleService(gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.status("authoritative-proof", "request-real-reload")).resolves.toMatchObject(h.status);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(h.repository.lifecycleStatus).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
    });
  });

  it("suspends without exposing an HTTP owner input and evicts owner sockets", async () => {
    // Break caught: suspension preserving a live session/socket or remapping ownership.
    const h = harness();
    h.repository.transitionIdentity.mockResolvedValueOnce({
      id: 41,
      strapiUserDocumentId: identity.userDocumentId,
      strapiAccountDocumentId: identity.accountDocumentId,
      identityStatus: "suspended",
      sessionVersion: 8,
    });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "a7275ae4-a8ce-414a-9aef-cf5813eaeebf",
      disconnectOwner: h.disconnectOwner,
    });

    const result = await service.suspend(identity.userDocumentId);
    expect(result).toMatchObject({ id: 41, identityStatus: "suspended", sessionVersion: 8 });
    expect(h.disconnectOwner).toHaveBeenCalledWith(41);
  });

  it("suspends only the exact authoritative Explorer tuple", async () => {
    const h = harness();
    h.repository.suspendIdentity.mockImplementation(async (input) => {
      if (input.accountDocumentId !== identity.accountDocumentId) {
        throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "Identity conflict.", "contact_support", false);
      }
      return {
        id: 41, strapiUserDocumentId: identity.userDocumentId, strapiAccountDocumentId: identity.accountDocumentId,
        identityStatus: "suspended" as const, sessionVersion: 8,
      };
    });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "suspend-proof-operation",
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.suspendFromProof("authoritative-proof", "request-suspend")).resolves.toMatchObject({
      id: 41, identityStatus: "suspended",
    });
    expect(h.gateway.resolve).toHaveBeenCalledWith("authoritative-proof", "request-suspend");
    expect(h.repository.suspendIdentity).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "suspend-proof-operation",
    });

    h.gateway.resolve.mockResolvedValueOnce({ ...identity, accountDocumentId: "account-document-other" });
    await expect(service.suspendFromProof("authoritative-proof", "request-conflict"))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  });

  it("reactivates only the exact authoritative Explorer tuple for compensation", async () => {
    const h = harness();
    h.repository.reactivateIdentity.mockResolvedValueOnce({
      id: 41,
      strapiUserDocumentId: identity.userDocumentId,
      strapiAccountDocumentId: identity.accountDocumentId,
      identityStatus: "active" as const,
      sessionVersion: 9,
    });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "resume-proof-operation",
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.reactivateFromProof("authoritative-proof", "request-resume")).resolves.toMatchObject({
      id: 41, identityStatus: "active", sessionVersion: 9,
    });
    expect(h.gateway.clear).toHaveBeenCalledOnce();
    expect(h.gateway.clear).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(h.gateway.clear.mock.invocationCallOrder[0]).toBeLessThan(h.gateway.resolve.mock.invocationCallOrder[0]);
    expect(h.gateway.resolve).toHaveBeenCalledWith("authoritative-proof", "request-resume");
    expect(h.repository.reactivateIdentity).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "resume-proof-operation",
    });
  });

  it("acknowledges exact local absence for suspend and reactivate without inventing a Music owner", async () => {
    // Break caught: a never-provisioned Explorer is stranded by LIFECYCLE_NOT_FOUND.
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({ disposition: "not_present" } as never);
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "absence-noop-operation",
      disconnectOwner: h.disconnectOwner,
    });
    const expected = {
      identityStatus: "not_present",
      strapiUserDocumentId: identity.userDocumentId,
      strapiAccountDocumentId: identity.accountDocumentId,
    };

    await expect(service.suspendFromProof("authoritative-proof", "request-absent-suspend")).resolves.toEqual(expected);
    await expect(service.reactivateBoundIdentity({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "absence-noop-operation",
    })).resolves.toEqual(expected);
    expect(h.repository.suspendIdentity).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "absence-noop-operation",
    });
    expect(h.repository.reactivateIdentity).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "absence-noop-operation",
    });
    expect(h.repository.transitionIdentity).not.toHaveBeenCalled();
    expect(h.disconnectOwner).not.toHaveBeenCalled();
  });

  it("recovers exact cancelled nullable status and cancel after a lost response", async () => {
    // Break caught: the cancelled durable tuple is collapsed to generic absence on reload.
    const h = harness();
    const cancelled = {
      ...h.status,
      musicUserId: null,
      identityStatus: "not_present" as const,
      state: "cancelled" as const,
    };
    h.repository.lifecycleBinding.mockResolvedValue({
      disposition: "cancelled",
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
    } as never);
    h.repository.lifecycleStatus.mockResolvedValue(cancelled);
    h.repository.cancelDeletion.mockResolvedValue(cancelled);
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "cancel-retry-operation",
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.status("authoritative-proof", "request-cancelled-reload")).resolves.toMatchObject({
      identityStatus: "not_present", state: "cancelled", boundaryCrossed: false,
      upstreamUserDocumentId: identity.userDocumentId,
      upstreamAccountDocumentId: identity.accountDocumentId,
    });
    await expect(service.cancelDeletion("authoritative-proof", "request-cancelled-retry"))
      .resolves.toMatchObject({ identityStatus: "not_present", state: "cancelled", boundaryCrossed: false });
    expect(h.gateway.resolve).not.toHaveBeenCalled();
  });

  it("prepares durable deletion authority for a never-provisioned tuple without inventing an owner", async () => {
    // Break caught: deletion prepare assumes every authoritative Explorer tuple already has a Music users row.
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({ disposition: "not_present" } as never);
    h.repository.prepareDeletion.mockResolvedValue({ ...h.status, musicUserId: null } as never);
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.prepareDeletion("authoritative-proof", "request-absent-delete")).resolves.toMatchObject({
      operationId: h.status.operationId,
      musicUserId: null,
      boundaryCrossed: false,
      upstreamUserDocumentId: identity.userDocumentId,
      upstreamAccountDocumentId: identity.accountDocumentId,
    });
    expect(h.repository.prepareDeletion).toHaveBeenCalledWith({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: h.status.operationId,
    });
    expect(h.disconnectOwner).not.toHaveBeenCalled();
  });

  it("keeps non-prepare lifecycle actions fail-closed when no durable local tuple exists", async () => {
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({ disposition: "not_present" } as never);
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.status("authoritative-proof", "request-absent-status"))
      .rejects.toMatchObject({ code: "LIFECYCLE_NOT_FOUND", status: 409 });
    expect(h.repository.lifecycleStatus).not.toHaveBeenCalled();
  });

  it("rejects a changed authoritative user across the two-step absent prepare proof", async () => {
    const h = harness();
    h.repository.lifecycleBinding.mockResolvedValue({ disposition: "not_present" } as never);
    h.gateway.resolve.mockResolvedValue({ ...identity, userDocumentId: "replacement-user-document" });
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => h.status.operationId,
      disconnectOwner: h.disconnectOwner,
    });

    await expect(service.prepareDeletion("authoritative-proof", "request-changed-user"))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT", status: 409 });
    expect(h.repository.prepareDeletion).not.toHaveBeenCalled();
  });

  it("resolves every browser lifecycle action from the authoritative tuple", async () => {
    const h = harness();
    const service = new MusicLifecycleService(h.gateway, h.repository, {
      operationIdFactory: () => "a7275ae4-a8ce-414a-9aef-cf5813eaeebf",
      disconnectOwner: h.disconnectOwner,
    });

    await service.status("authoritative-proof", "request-status");
    await service.markDeletionBoundary("authoritative-proof", "request-boundary");
    await service.cancelDeletion("authoritative-proof", "request-cancel");

    const tuple = { userDocumentId: identity.userDocumentId, accountDocumentId: identity.accountDocumentId };
    expect(h.repository.lifecycleStatus).toHaveBeenCalledWith(tuple);
    expect(h.repository.markDeletionBoundary).toHaveBeenCalledWith(tuple);
    expect(h.repository.cancelDeletion).toHaveBeenCalledWith({ ...tuple, operationId: "a7275ae4-a8ce-414a-9aef-cf5813eaeebf" });
  });

  it("reactivates the stable owner and uses a cryptographic operation id by default", async () => {
    const h = harness();
    h.repository.transitionIdentity.mockResolvedValueOnce({
      id: 41, strapiUserDocumentId: identity.userDocumentId, strapiAccountDocumentId: identity.accountDocumentId,
      identityStatus: "active", sessionVersion: 8,
    });
    const service = new MusicLifecycleService(h.gateway, h.repository, { disconnectOwner: h.disconnectOwner });

    await expect(service.reactivate(identity.userDocumentId)).resolves.toMatchObject({ id: 41, identityStatus: "active" });
    expect(h.repository.transitionIdentity).toHaveBeenCalledWith(expect.objectContaining({
      strapiUserDocumentId: identity.userDocumentId,
      operationId: expect.stringMatching(/^[a-f0-9-]{36}$/),
      kind: "reactivate",
      targetStatus: "active",
    }));
    expect(h.disconnectOwner).not.toHaveBeenCalled();
  });

  it("reactivates only the immutable tuple carried by the public confirmation token", async () => {
    const h = harness();
    h.repository.reactivateIdentity.mockImplementation(async (candidate) => {
      if (candidate.accountDocumentId !== identity.accountDocumentId) {
        throw new MusicIdentityError("IDENTITY_CONFLICT", 409, "Identity conflict.", "contact_support", false);
      }
      return {
        id: 41, strapiUserDocumentId: identity.userDocumentId, strapiAccountDocumentId: identity.accountDocumentId,
        identityStatus: "active" as const, sessionVersion: 9,
      };
    });
    const service = new MusicLifecycleService(h.gateway, h.repository, { disconnectOwner: h.disconnectOwner });
    const input = {
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: "reactivation-token-operation",
    };

    await expect(service.reactivateBoundIdentity(input)).resolves.toMatchObject({ id: 41, sessionVersion: 9 });
    expect(h.repository.reactivateIdentity).toHaveBeenCalledWith(input);

    await expect(service.reactivateBoundIdentity({ ...input, accountDocumentId: "account-document-other" }))
      .rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  });
});
