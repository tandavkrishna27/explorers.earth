import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MusicIdentityProjection } from "../repositories/musicIdentityRepository";
import type { IdentityResolverPort, ResolvedStrapiIdentity } from "./resolvedIdentity";
import { fingerprintStrapiProof } from "./proofFingerprint";
import { MusicIdentityError } from "../../shared/musicError";

export interface EnsureMusicIdentityInput extends ResolvedStrapiIdentity {
  internalUsername: string;
  password: string;
  guestUrl: string;
  guestCapabilityHash: string;
  operationId: string;
  requestId: string;
}

export interface ProjectionRepository {
  ensureIdentity(input: EnsureMusicIdentityInput): Promise<MusicIdentityProjection>;
}

export class MusicProjectionService {
  private readonly inflight = new Map<string, Promise<MusicIdentityProjection>>();
  private coalesced = 0;
  private peakInflight = 0;

  constructor(
    private readonly gateway: IdentityResolverPort,
    private readonly repository: ProjectionRepository,
    private readonly maxInflight = 32,
  ) {
    if (!Number.isSafeInteger(maxInflight) || maxInflight < 1 || maxInflight > 128) {
      throw new Error("Music projection max inflight must be a bounded integer");
    }
  }

  ensure(proof: string, requestId: string): Promise<MusicIdentityProjection> {
    const fingerprint = fingerprintStrapiProof(proof);
    const existing = this.inflight.get(fingerprint);
    if (existing) {
      this.coalesced += 1;
      return existing;
    }
    if (this.inflight.size >= this.maxInflight) {
      return Promise.reject(new MusicIdentityError(
        "UPSTREAM_UNAVAILABLE", 503, "Music identity is temporarily unavailable.", "retry", true, 1,
      ));
    }
    const operation = this.run(proof, requestId).finally(() => {
      if (this.inflight.get(fingerprint) === operation) this.inflight.delete(fingerprint);
    });
    this.inflight.set(fingerprint, operation);
    this.peakInflight = Math.max(this.peakInflight, this.inflight.size);
    return operation;
  }

  stats(): { inflight: number; peakInflight: number; coalesced: number } {
    return { inflight: this.inflight.size, peakInflight: this.peakInflight, coalesced: this.coalesced };
  }

  private async run(proof: string, requestId: string): Promise<MusicIdentityProjection> {
    const identity = await this.gateway.resolve(proof, requestId);
    const guestSecret = randomBytes(32).toString("base64url");
    const stableSuffix = createHash("sha256").update(identity.userDocumentId).digest("hex").slice(0, 24);
    try {
      return await this.repository.ensureIdentity({
        ...identity,
        internalUsername: `explorer-${stableSuffix}`,
        password: randomBytes(48).toString("base64url"),
        guestUrl: randomBytes(24).toString("base64url"),
        guestCapabilityHash: createHash("sha256").update(guestSecret).digest("hex"),
        operationId: randomUUID(),
        requestId,
      });
    } catch (error) {
      if (error instanceof MusicIdentityError && error.status === 409) {
        this.gateway.clear?.(fingerprintStrapiProof(proof));
      }
      throw error;
    }
  }
}
