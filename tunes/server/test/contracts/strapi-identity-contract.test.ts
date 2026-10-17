import { describe, expect, it } from "vitest";
import { validateStrapiFixture } from "../../../scripts/music-cli.ts";

const validIdentity = {
  user: {
    documentId: "fixture-user-document-id",
    username: "fixture-explorer",
    email: "fixture-explorer@example.invalid",
    provider: "local" as const,
    confirmed: true,
    blocked: false,
    is_subscribed: false,
    accounts: [
      {
        documentId: "fixture-account-document-id",
        Account_Name: "Fixture Explorer",
        Account_Type: "Personal",
        mobile_number: "+10000000000",
        localtunes_integrated: "No" as const,
      },
    ],
  },
};

describe("Strapi identity fixture contract", () => {
  it("rejects a current-user response without its immutable documentId", () => {
    // Production break caught: provisioning could key a Music identity from a
    // mutable username or Strapi numeric id instead of the v5 documentId.
    expect(() =>
      validateStrapiFixture(
        {
          schemaVersion: "strapi-identity-fixture/v1",
          fixtureVersion: "1",
          identities: [{ user: { ...validIdentity.user, documentId: "" } }],
          pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
          serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
        },
        { mode: "fixture" },
      ),
    ).toThrow("identity[0].user.documentId is required");
  });

  it("rejects a current-user response without lifecycle and entitlement fields", () => {
    // Production break caught: a partial Strapi response could provision a
    // blocked person or infer premium entitlement from an absent field.
    expect(() =>
      validateStrapiFixture(
        {
          schemaVersion: "strapi-identity-fixture/v1",
          fixtureVersion: "1",
          identities: [{ user: { ...validIdentity.user, blocked: undefined } }],
          pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
          serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
        },
        { mode: "fixture" },
      ),
    ).toThrow("identity[0].user.blocked must be boolean");
  });

  it("rejects an Account whose persisted Music enrollment field drifts", () => {
    // Production break caught: truthy or renamed enrollment values could be
    // mistaken for the repository's persisted Yes/No semantics.
    const account = { ...validIdentity.user.accounts[0], localtunes_integrated: true };
    expect(() =>
      validateStrapiFixture(
        {
          schemaVersion: "strapi-identity-fixture/v1",
          fixtureVersion: "1",
          identities: [{ user: { ...validIdentity.user, accounts: [account] } }],
          pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
          serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
        } as never,
        { mode: "fixture" },
      ),
    ).toThrow("localtunes_integrated must be Yes or No");
  });

  it("rejects semantically impossible pagination", () => {
    // Production break caught: a syntactically complete but impossible page
    // envelope could make reconciliation treat a truncated capture as complete.
    expect(() =>
      validateStrapiFixture(
        {
          schemaVersion: "strapi-identity-fixture/v1",
          fixtureVersion: "1",
          identities: [validIdentity],
          pagination: { page: 2, pageCount: 1, pageSize: 100, total: 1 },
          serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
        },
        { mode: "fixture" },
      ),
    ).toThrow("pagination metadata is inconsistent");
  });

  it("rejects ambiguous completed Accounts because the repository has no selection field", () => {
    // Production break caught: accounts[0] is unordered, so provisioning could
    // bind a person to the wrong immutable Account context.
    const secondAccount = { ...validIdentity.user.accounts[0], documentId: "fixture-account-document-id-2" };
    expect(() =>
      validateStrapiFixture(
        {
          schemaVersion: "strapi-identity-fixture/v1",
          fixtureVersion: "1",
          identities: [{ user: { ...validIdentity.user, accounts: [...validIdentity.user.accounts, secondAccount] } }],
          pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
          serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
        },
        { mode: "fixture" },
      ),
    ).toThrow("identity[0] has ambiguous completed Accounts");
  });

  it("rejects schema drift, incomplete pagination, and write-capable service tokens", () => {
    const base = {
      fixtureVersion: "1",
      identities: [validIdentity],
      pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
      serviceToken: { operations: ["GET /api/users/me", "GET /api/accounts"] },
    };
    expect(() => validateStrapiFixture({ ...base, schemaVersion: "strapi-identity-fixture/v0" } as never, { mode: "fixture" })).toThrow("unsupported fixture schema");
    expect(() => validateStrapiFixture({ ...base, schemaVersion: "strapi-identity-fixture/v1", pagination: { page: 1, pageCount: 1, pageSize: 100 } }, { mode: "fixture" })).toThrow("pagination metadata is truncated");
    expect(() => validateStrapiFixture({ ...base, schemaVersion: "strapi-identity-fixture/v1", serviceToken: { operations: ["DELETE /api/users/1"] } }, { mode: "fixture" })).toThrow("service token operation must be read-only");
  });

  it("rejects a read-only service token with operations beyond the exact fixture allowlist", () => {
    const fixture = {
      schemaVersion: "strapi-identity-fixture/v1" as const,
      fixtureVersion: "1",
      identities: [validIdentity],
      reconciliation: {
        schemaVersion: "strapi-music-reconciliation/v1",
        sourceSnapshot: "fixture-snapshot",
        sourceChecksum: "a".repeat(64),
      },
      pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
      serviceToken: {
        operations: [
          "GET /api/users/me",
          "GET /api/accounts",
          "GET /api/music-identities",
          "POST /graphql query:MusicIdentityAbsence",
          "GET /api/admin/users",
        ],
      },
    };
    expect(() => validateStrapiFixture(fixture, { mode: "fixture" }))
      .toThrow("service token operations must match the exact fixture allowlist");
  });

  it("requires a complete, internally exact reconciliation source fixture", () => {
    const base = {
      schemaVersion: "strapi-identity-fixture/v1" as const,
      fixtureVersion: "1",
      identities: [validIdentity],
      reconciliation: {
        schemaVersion: "strapi-music-reconciliation/v1",
        sourceSnapshot: "fixture-snapshot",
        sourceChecksum: "a".repeat(64),
      },
      pagination: { page: 1, pageCount: 1, pageSize: 100, total: 1 },
      serviceToken: { operations: [
        "GET /api/users/me",
        "GET /api/accounts",
        "GET /api/music-identities",
        "POST /graphql query:MusicIdentityAbsence",
      ] },
    };
    expect(() => validateStrapiFixture({ ...base, reconciliation: undefined }, { mode: "fixture" }))
      .toThrow("reconciliation fixture metadata is required");
    expect(() => validateStrapiFixture({ ...base, pagination: { ...base.pagination, total: 2 } }, { mode: "fixture" }))
      .toThrow("pagination metadata is inconsistent");
  });

  it("requires explicit read-only credentials before live validation", () => {
    expect(() =>
      validateStrapiFixture(
        { schemaVersion: "strapi-identity-fixture/v1", fixtureVersion: "1", identities: [validIdentity] },
        { mode: "live" },
      ),
    ).toThrow("LIVE_STRAPI_READ_ONLY_CREDENTIAL is required");
  });
});
