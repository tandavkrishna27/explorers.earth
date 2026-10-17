import { describe, expect, it, vi } from "vitest";
import { MusicIdentityRepository } from "../repositories/musicIdentityRepository";

function clientForOperation(operation?: Record<string, unknown>) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (/FROM music_credential_revocation_operations/.test(sql)) return { rows: operation ? [operation] : [], rowCount: operation ? 1 : 0 };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { client, queries };
}

describe("Music credential repository primitives", () => {
  it("requires a caller-visible cryptographic operation ID before any revocation transaction", async () => {
    const fixture = clientForOperation();
    const repository = new MusicIdentityRepository({ query: vi.fn(), connect: async () => fixture.client } as never);
    await expect(repository.revokeAllCredentials({
      musicUserId: 41,
      expectedSessionVersion: 1,
      reason: "logout_all",
    } as never)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    await expect(repository.revokeAllCredentials({
      operationId: "predictable-operation",
      musicUserId: 41,
      expectedSessionVersion: 1,
      reason: "credential_compromise",
    } as never)).rejects.toMatchObject({ code: "REQUEST_INVALID" });
    expect(fixture.queries).toEqual([]);
  });

  it("accepts only an exact durable operation replay and performs no second user mutation", async () => {
    const fixture = clientForOperation({
      operation_id: "10000000-0000-4000-8000-000000000001",
      music_user_id: 41,
      strapi_user_document_id: "subject-41",
      strapi_account_document_id: "account-41",
      reason: "logout_all",
      expected_session_version: 3,
      result_session_version: 4,
      operation_state: "completed",
    });
    const repository = new MusicIdentityRepository({ query: vi.fn(), connect: async () => fixture.client } as never);
    await expect(repository.revokeAllCredentials({
      operationId: "10000000-0000-4000-8000-000000000001",
      musicUserId: 41,
      expectedSessionVersion: 3,
      reason: "logout_all",
    })).resolves.toMatchObject({ operationState: "completed", resultSessionVersion: 4 });
    expect(fixture.queries.some(({ sql }) => /UPDATE users SET session_version/.test(sql))).toBe(false);

    const mismatch = new MusicIdentityRepository({ query: vi.fn(), connect: async () => fixture.client } as never);
    await expect(mismatch.revokeAllCredentials({
      operationId: "10000000-0000-4000-8000-000000000001",
      musicUserId: 41,
      expectedSessionVersion: 3,
      reason: "credential_compromise",
    })).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
  });

  it("resolves user and Account tombstones in the same local truth query", async () => {
    const query = vi.fn(async () => ({ rows: [{
      id: 41,
      strapi_user_document_id: "subject-41",
      strapi_account_document_id: "account-41",
      identity_status: "active",
      session_version: 3,
      tombstoned: true,
    }] }));
    const repository = new MusicIdentityRepository({ query } as never);
    await expect(repository.resolveCredentialSubject("subject-41")).resolves.toEqual({
      identity: {
        id: 41,
        strapiUserDocumentId: "subject-41",
        strapiAccountDocumentId: "account-41",
        identityStatus: "active",
        sessionVersion: 3,
      },
      tombstoned: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("music_identity_tombstones");
    expect(query.mock.calls[0][0]).toContain("strapi_account_document_id");
  });

  it("normalizes a concurrent cross-resource operation UUID collision to the typed conflict", async () => {
    const operationId = "10000000-0000-4000-8000-000000000009";
    const client = {
      query: vi.fn(async (sql: string) => {
        if (/FROM music_credential_revocation_operations/.test(sql)) return { rows: [], rowCount: 0 };
        if (/FROM users WHERE id=\$1 FOR UPDATE/.test(sql)) return { rows: [{
          id: 42,
          strapi_user_document_id: "subject-42",
          strapi_account_document_id: "account-42",
          identity_status: "active",
          session_version: 3,
          tombstoned: false,
        }], rowCount: 1 };
        if (/INSERT INTO music_credential_revocation_operations/.test(sql)) {
          throw Object.assign(new Error("duplicate key value exposes raw database detail"), {
            code: "23505",
            constraint: "music_credential_revocation_operations_pkey",
          });
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const repository = new MusicIdentityRepository({ query: vi.fn(), connect: async () => client } as never);
    const failure = repository.revokeAllCredentials({
      operationId,
      musicUserId: 42,
      expectedSessionVersion: 3,
      reason: "logout_all",
    });
    await expect(failure).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    await expect(failure.catch((error) => error)).resolves.not.toMatchObject({ code: "23505" });
  });

});
