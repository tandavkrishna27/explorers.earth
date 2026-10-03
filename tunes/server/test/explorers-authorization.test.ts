import { describe, expect, it } from "vitest";
import { authorizeOperation, AuthorizationError } from "../application/authorization";
import type { Actor } from "../application/actor";
import { createCanonicalMusicPrincipalResolver } from "../music/canonicalMusicPrincipal";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const web: Actor = { userId: "user-1", accountId, role: "owner", credential: { kind: "web-session", sessionId: "session-1", sessionVersion: 1 } };
const oauth: Actor = { ...web, credential: { kind: "oauth", grantId: "grant-1", scopes: ["profile:read"] } };

function authority(status: string = "active", member = true, sessionVersion = 1) {
  return { query: async (sql: string) => ({ rows: sql.includes("FROM auth_session")
    ? [{ valid: true }]
    : member ? [{ status, role: "owner", session_version: String(sessionVersion), blocked_at: null }] : [] }) };
}

describe("current account authorization", () => {
  it("permits the current owner and only the exact account", async () => {
    await expect(authorizeOperation(authority(), web, "profile:read", accountId)).resolves.toBeUndefined();
    await expect(authorizeOperation(authority(), web, "profile:read", otherId)).rejects.toMatchObject({ status: 404 });
  });
  it("denies removed membership, suspended/deleting accounts and stale generations", async () => {
    await expect(authorizeOperation(authority("active", false), web, "profile:read", accountId)).rejects.toMatchObject({ status: 404 });
    await expect(authorizeOperation(authority("suspended"), web, "profile:read", accountId)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeOperation(authority("pending_deletion"), web, "profile:read", accountId)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeOperation(authority("active", true, 2), web, "profile:read", accountId)).rejects.toMatchObject({ status: 401 });
  });
  it("requires an OAuth operation scope even for the current owner", async () => {
    await expect(authorizeOperation(authority(), oauth, "profile:write", accountId)).rejects.toMatchObject({ status: 403 });
    await expect(authorizeOperation(authority(), oauth, "profile:read", accountId)).resolves.toBeUndefined();
  });
  it("resolves Music's numeric owner only through the actor's canonical account", async () => {
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const db = { query: async (sql: string, values: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes("FROM account_music_identity")) return { rows: values[0] === accountId ? [{ music_user_id: 17 }] : [] };
      if (sql.includes("FROM auth_session")) return { rows: [{ valid: true }] };
      return { rows: [{ status: "active", role: "owner", session_version: "1", blocked_at: null }] };
    } };
    const resolveCanonicalMusicPrincipal = createCanonicalMusicPrincipalResolver(db);
    await expect(resolveCanonicalMusicPrincipal(web)).resolves.toEqual({ musicUserId: 17, accountId, userId: "user-1", sessionVersion: 1 });
    expect(queries.at(-1)?.values).toEqual([accountId]);
    await expect(resolveCanonicalMusicPrincipal({ ...web, accountId: otherId })).rejects.toMatchObject({ status: 404 });
  });
});
