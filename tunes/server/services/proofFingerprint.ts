import { createHash } from "node:crypto";

/**
 * A bare SHA-256 over an upstream identity proof, used so a proof can be compared and
 * logged without the proof itself being retained.
 *
 * Moved out of `strapiIdentityGateway.ts` for ticket 8.1a: the canonical startup closure
 * imported it, which put a Strapi-named file inside the closure for no reason beyond the
 * filename. The name is deliberately unchanged here - renaming it is 8.3's mechanical
 * pass, and mixing a five-caller rename into this move would obscure that nothing
 * behavioural changed.
 */
export function fingerprintStrapiProof(proof: string): string {
  return createHash("sha256").update(proof, "utf8").digest("hex");
}
