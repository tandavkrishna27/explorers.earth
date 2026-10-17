/**
 * The resolved upstream identity DTO, and the port a consumer needs to obtain one.
 *
 * Moved out of `strapiIdentityGateway.ts` for ticket 8.1a, which requires that no
 * Strapi-named module sit inside the canonical startup closure. Two services reached the
 * gateway file for types alone - `musicProjectionService` via
 * `Pick<StrapiIdentityGateway, "resolve">` and `musicLifecycleService` via its own local
 * port - so the dependency was already structural, not on the class. Naming the port here
 * makes that explicit: the consumers declare what they need and the gateway satisfies it,
 * rather than the consumers reaching into the implementation for its shape.
 *
 * The `import type` edges those services used are erased by TypeScript, so this changes
 * nothing at runtime. It is still worth removing rather than exempting from the scan: the
 * retired-dependency walk deliberately does not distinguish type-only imports, because a
 * type edge is still a reason the file cannot be deleted, and deletability is what the
 * Strapi retirement is actually tracking.
 *
 * `ResolvedStrapiIdentity` keeps its name. Renaming is ticket 8.3's mechanical pass.
 */
export interface ResolvedStrapiIdentity {
  userDocumentId: string;
  accountDocumentId: string;
  username: string;
  email: string;
  provider: "local" | "google";
  accountName: string;
  accountType: string;
  accountMobile: string;
}

/**
 * What a consumer of resolved identities requires. `clear` is optional because only the
 * caching implementation has anything to clear; this mirrors the
 * `Partial<Pick<...,"clear">>` the projection service previously spelled out inline.
 */
export interface IdentityResolverPort {
  resolve(proof: string, requestId: string): Promise<ResolvedStrapiIdentity>;
  clear?(fingerprint?: string): void;
}
