import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createExplorersAuth, type ExplorersAuthConfig } from "../../auth/betterAuth";

const config: ExplorersAuthConfig = {
  baseURL: "http://localhost:5000", googleCallbackURL: "http://localhost:5000/api/auth/callback/google",
  trustedOrigins: ["http://localhost:5000"], secret: "apps-fixture-test-secret-32-characters",
  googleClientId: "fixture-client", googleClientSecret: "fixture-secret",
};

function factory(fixture = false) {
  const query = vi.fn(() => { throw new Error("Real PostgreSQL is prohibited in this contract"); });
  const pool = { query } as unknown as Pool;
  return { auth: createExplorersAuth(pool, config, fixture ? { appsReadOnlySessionFixture: true } : undefined), query };
}

describe("bounded Apps read session fixture", () => {
  it("changes only the fixture session options and preserves normal factory behavior", () => {
    const normal = factory().auth.options;
    const fixture = factory(true).auth.options;
    expect(normal.session).toEqual({ modelName: "auth_session" });
    expect(fixture.session).toEqual({ modelName: "auth_session", deferSessionRefresh: true, cookieCache: { enabled: false } });
    const { session: _normalSession, database: _normalDb, hooks: _normalHooks, ...normalRest } = normal;
    const { session: _fixtureSession, database: _fixtureDb, hooks: _fixtureHooks, ...fixtureRest } = fixture;
    expect(fixtureRest).toEqual(normalRest);
  });

  // The real factory, direct API, Better Call cookie verifier and installed
  // get-session implementation run unchanged. Only the internal persistence
  // boundary is closed over a known session; every adapter write is a spy.
  async function sessionRead(fixture: boolean, expired: boolean, finalizerGate?: Promise<void>, onFinalizer?: () => void) {
    const { auth, query } = factory(fixture);
    const context = await auth.$context;
    const now = Date.now();
    const session = {
      id: "fixture-session", token: "fixture-token", userId: "fixture-user",
      expiresAt: new Date(now + (expired ? -1000 : 1000)),
      createdAt: new Date(now - 7 * 86400_000), updatedAt: new Date(now - 2 * 86400_000),
      ipAddress: null, userAgent: null,
    };
    const user = { id: "fixture-user", name: "Fixture", email: "fixture@example.invalid", emailVerified: true,
      image: null, createdAt: new Date(now), updatedAt: new Date(now) };
    const writes: string[] = [];
    const findSession = vi.fn(() => Promise.resolve({ session, user }).finally(async () => {
      onFinalizer?.();
      await finalizerGate;
    }));
    const updateSession = vi.fn(async () => { writes.push("update"); return session; });
    const deleteSession = vi.fn(async () => { writes.push("delete"); });
    context.internalAdapter = new Proxy({ findSession, updateSession, deleteSession }, {
      get(target, property) {
        if (property in target) return target[property as keyof typeof target];
        throw new Error(`Unclassified adapter operation: ${String(property)}`);
      },
    }) as unknown as typeof context.internalAdapter;
    const signature = createHmac("sha256", config.secret).update(session.token).digest("base64");
    const headers = new Headers({ cookie: `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${signature}`)}` });
    // Omitting method intentionally checks the installed direct API's GET default.
    const result = await auth.api.getSession({ headers, returnHeaders: true });
    expect(findSession).toHaveBeenCalledExactlyOnceWith(session.token);
    expect(query).not.toHaveBeenCalled();
    return { result, writes, updateSession, deleteSession };
  }

  it("returns a near-refresh GET session without database writes or cache cookies", async () => {
    const { result, writes } = await sessionRead(true, false);
    expect(result.response).toMatchObject({ session: { id: "fixture-session" }, needsRefresh: true });
    expect(writes).toEqual([]);
    expect(result.headers.get("set-cookie")).toBeNull();
  });

  it("returns null for an expired GET without deleting the database session", async () => {
    const { result, writes } = await sessionRead(true, true);
    expect(result.response).toBeNull();
    expect(writes).toEqual([]);
    // Expired-session cookie clearing remains the installed runtime behavior.
    expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps ordinary GET refresh writes", async () => {
    const { writes } = await sessionRead(false, false);
    expect(writes).toEqual(["update"]);
  });

  it("keeps ordinary expired GET deletion", async () => {
    const { writes } = await sessionRead(false, true);
    expect(writes).toEqual(["delete"]);
  });

  it("awaits the complete original adapter promise including a held finalizer", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const finalizerEntered = new Promise<void>((resolve) => { entered = resolve; });
    let settled = false;
    const originalRead = sessionRead(true, false, gate, entered).finally(() => { settled = true; });
    try {
      await finalizerEntered;
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      release();
    }
    const { result, writes } = await originalRead;
    expect(settled).toBe(true);
    expect(result.response).toMatchObject({ session: { id: "fixture-session" } });
    expect(writes).toEqual([]);
  });
});
