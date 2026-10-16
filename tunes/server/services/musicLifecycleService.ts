import { randomUUID } from "node:crypto";
import { fingerprintStrapiProof } from "./proofFingerprint";
import type { ResolvedStrapiIdentity } from "./resolvedIdentity";
import type { MusicIdentityProjection } from "../repositories/musicIdentityRepository";
import { MusicIdentityError } from "../../shared/musicError";

export interface MusicLifecycleStatus {
  operationId: string;
  musicUserId: number | null;
  identityStatus: "pending_deletion" | "suspended" | "tombstoned" | "not_present";
  phase: "prepared" | "finalized";
  state: "completed" | "requested" | "running" | "failed" | "cancelled";
  boundaryCrossed: boolean;
  retryable: boolean;
  deadLetter: boolean;
  upstreamUserDocumentId?: string;
  upstreamAccountDocumentId?: string;
}

export interface MusicIdentityNotPresentProjection {
  identityStatus: "not_present";
  strapiUserDocumentId: string;
  strapiAccountDocumentId: string;
}

type LifecycleBinding = {
  disposition: "present";
  userDocumentId: string;
  accountDocumentId: string;
  identityStatus: "active" | "suspended" | "pending_deletion";
} | {
  disposition: "cancelled" | "suspended_absent";
  userDocumentId: string;
  accountDocumentId: string;
} | { disposition: "not_present" };

interface LifecycleGateway {
  resolve(proof: string, requestId: string): Promise<ResolvedStrapiIdentity>;
  resolveUser(proof: string, requestId: string): Promise<{ userDocumentId: string }>;
  clear(fingerprint?: string): void;
}

interface LifecycleRepository {
  lifecycleBinding(userDocumentId: string, accountDocumentId?: string): Promise<LifecycleBinding>;
  prepareDeletion(input: { userDocumentId: string; accountDocumentId: string; operationId: string }): Promise<MusicLifecycleStatus>;
  lifecycleStatus(input: { userDocumentId: string; accountDocumentId: string }): Promise<MusicLifecycleStatus>;
  markDeletionBoundary(input: { userDocumentId: string; accountDocumentId: string }): Promise<MusicLifecycleStatus>;
  cancelDeletion(input: { userDocumentId: string; accountDocumentId: string; operationId: string }): Promise<MusicLifecycleStatus>;
  suspendIdentity(input: {
    userDocumentId: string;
    accountDocumentId: string;
    operationId: string;
  }): Promise<MusicIdentityProjection | MusicIdentityNotPresentProjection>;
  reactivateIdentity(input: {
    userDocumentId: string;
    accountDocumentId: string;
    operationId: string;
  }): Promise<MusicIdentityProjection | MusicIdentityNotPresentProjection>;
  transitionIdentity(input: {
    strapiUserDocumentId: string;
    operationId: string;
    kind: "suspend" | "reactivate";
    targetStatus: "suspended" | "active";
  }): Promise<MusicIdentityProjection>;
}

export class MusicLifecycleService {
  private readonly operationIdFactory: () => string;
  private readonly disconnectOwner: (musicUserId: number) => Promise<void>;

  constructor(
    private readonly gateway: LifecycleGateway,
    private readonly repository: LifecycleRepository,
    options: {
      operationIdFactory?: () => string;
      disconnectOwner: (musicUserId: number) => Promise<void>;
    },
  ) {
    this.operationIdFactory = options.operationIdFactory ?? randomUUID;
    this.disconnectOwner = options.disconnectOwner;
  }

  async prepareDeletion(proof: string, requestId: string): Promise<MusicLifecycleStatus> {
    const identity = await this.resolvePrepareBinding(proof, requestId);
    const status = await this.repository.prepareDeletion({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: this.operationIdFactory(),
    });
    if (status.musicUserId !== null) await this.disconnectOwner(status.musicUserId);
    return this.withUpstreamBinding(status, identity);
  }

  async status(proof: string, requestId: string): Promise<MusicLifecycleStatus> {
    const identity = await this.resolveStoredBinding(proof, requestId);
    const status = await this.repository.lifecycleStatus({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
    });
    return this.withUpstreamBinding(status, identity);
  }

  async markDeletionBoundary(proof: string, requestId: string): Promise<MusicLifecycleStatus> {
    const identity = await this.resolveStoredBinding(proof, requestId);
    const existing = await this.repository.lifecycleStatus({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
    });
    if (existing.boundaryCrossed) return this.withUpstreamBinding(existing, identity);
    await this.assertAuthoritativeBinding(proof, requestId, identity);
    const status = await this.repository.markDeletionBoundary({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
    });
    return this.withUpstreamBinding(status, identity);
  }

  async cancelDeletion(proof: string, requestId: string): Promise<MusicLifecycleStatus> {
    const identity = await this.resolveStoredBinding(proof, requestId);
    const status = await this.repository.cancelDeletion({
      userDocumentId: identity.userDocumentId,
      accountDocumentId: identity.accountDocumentId,
      operationId: this.operationIdFactory(),
    });
    return this.withUpstreamBinding(status, identity);
  }

  async suspend(strapiUserDocumentId: string): Promise<MusicIdentityProjection> {
    const result = await this.repository.transitionIdentity({
      strapiUserDocumentId,
      operationId: this.operationIdFactory(),
      kind: "suspend",
      targetStatus: "suspended",
    });
    await this.disconnectOwner(result.id);
    return result;
  }

  async suspendFromProof(proof: string, requestId: string): Promise<MusicIdentityProjection | MusicIdentityNotPresentProjection> {
    const authoritative = await this.gateway.resolve(proof, requestId);
    const result = await this.repository.suspendIdentity({
      userDocumentId: authoritative.userDocumentId,
      accountDocumentId: authoritative.accountDocumentId,
      operationId: this.operationIdFactory(),
    });
    if (result.identityStatus !== "not_present") await this.disconnectOwner(result.id);
    return result;
  }

  async reactivateFromProof(proof: string, requestId: string): Promise<MusicIdentityProjection | MusicIdentityNotPresentProjection> {
    this.gateway.clear(fingerprintStrapiProof(proof));
    const authoritative = await this.gateway.resolve(proof, requestId);
    return this.repository.reactivateIdentity({
      userDocumentId: authoritative.userDocumentId,
      accountDocumentId: authoritative.accountDocumentId,
      operationId: this.operationIdFactory(),
    });
  }

  async reactivate(strapiUserDocumentId: string): Promise<MusicIdentityProjection> {
    return this.repository.transitionIdentity({
      strapiUserDocumentId,
      operationId: this.operationIdFactory(),
      kind: "reactivate",
      targetStatus: "active",
    });
  }

  async reactivateBoundIdentity(input: {
    userDocumentId: string;
    accountDocumentId: string;
    operationId: string;
  }): Promise<MusicIdentityProjection | MusicIdentityNotPresentProjection> {
    return this.repository.reactivateIdentity({
      userDocumentId: input.userDocumentId,
      accountDocumentId: input.accountDocumentId,
      operationId: input.operationId,
    });
  }

  private async resolveStoredBinding(proof: string, requestId: string) {
    const user = await this.gateway.resolveUser(proof, requestId);
    const binding = await this.repository.lifecycleBinding(user.userDocumentId);
    if (binding.disposition === "not_present") {
      throw new MusicIdentityError("LIFECYCLE_NOT_FOUND", 409, "No Music lifecycle identity is available.", "none", false);
    }
    return binding;
  }

  private async resolvePrepareBinding(proof: string, requestId: string) {
    const user = await this.gateway.resolveUser(proof, requestId);
    const binding = await this.repository.lifecycleBinding(user.userDocumentId);
    if (binding.disposition === "not_present" || binding.disposition === "cancelled") {
      const authoritative = await this.gateway.resolve(proof, requestId);
      if (authoritative.userDocumentId !== user.userDocumentId) {
        throw new MusicIdentityError(
          "IDENTITY_CONFLICT", 409,
          "The Explorer identity does not match the durable Music owner.", "contact_support", false, undefined, "lifecycle",
        );
      }
      return authoritative;
    }
    if (binding.disposition === "present" && binding.identityStatus === "pending_deletion") {
      const status = await this.repository.lifecycleStatus({
        userDocumentId: binding.userDocumentId,
        accountDocumentId: binding.accountDocumentId,
      });
      if (status.boundaryCrossed) return binding;
    }
    await this.assertAuthoritativeBinding(proof, requestId, binding);
    return binding;
  }

  private async assertAuthoritativeBinding(
    proof: string,
    requestId: string,
    binding: { userDocumentId: string; accountDocumentId: string },
  ): Promise<void> {
    const authoritative = await this.gateway.resolve(proof, requestId);
    if (authoritative.userDocumentId !== binding.userDocumentId
        || authoritative.accountDocumentId !== binding.accountDocumentId) {
      throw new MusicIdentityError(
        "IDENTITY_CONFLICT", 409,
        "The Explorer identity does not match the durable Music owner.", "contact_support", false, undefined, "lifecycle",
      );
    }
  }

  private withUpstreamBinding(
    status: MusicLifecycleStatus,
    binding: { userDocumentId: string; accountDocumentId: string },
  ): MusicLifecycleStatus {
    return {
      ...status,
      upstreamUserDocumentId: binding.userDocumentId,
      upstreamAccountDocumentId: binding.accountDocumentId,
    };
  }

}
