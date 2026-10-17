import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { APIError, addOAuthServerContext, createAuthMiddleware, deleteSessionCookie, getOAuthState } from "#auth-runtime";
import { issueRecoveryProof } from "./recoveryProof";
import type { ExplorersAuthConfig } from "./betterAuth";

export const recoveryIntentCookie = "explorers_recovery_intent";
export const recoveryProofCookie = "explorers_recovery_proof";
const intentLifetimeMs = 5 * 60_000;

export function recoveryCookieOptions(config: ExplorersAuthConfig) {
  return { httpOnly: true, secure: config.baseURL.startsWith("https:"), sameSite: "lax" as const, path: "/" };
}

export function recoveryProofCookieOptions(config: ExplorersAuthConfig) {
  return { ...recoveryCookieOptions(config), path: "/api/explorers/v1/recovery" };
}

export function createRecoveryIntent(secret: string, now = Date.now()): string {
  const payload = `${randomBytes(20).toString("base64url")}.${now}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readRecoveryIntent(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value) return null;
  const match = /^([A-Za-z0-9_-]{27})\.(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const issuedAt = Number(match[2]);
  if (issuedAt > now || now - issuedAt > intentLifetimeMs) return null;
  const expected = createHmac("sha256", secret).update(`${match[1]}.${match[2]}`).digest();
  const actual = Buffer.from(match[3], "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? match[1] : null;
}

export function createRecoveryOAuthHooks(pool: Pool, config: ExplorersAuthConfig) {
  return {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/social") return;
      const raw = ctx.getCookie(recoveryIntentCookie);
      if (!raw) return;
      const intentId = readRecoveryIntent(raw, config.secret);
      if (!intentId || (ctx.body as { provider?: unknown } | undefined)?.provider !== "google") {
        throw new APIError("FORBIDDEN", { message: "Recovery intent is invalid" });
      }
      await addOAuthServerContext({ explorersRecoveryIntent: intentId });
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/callback/:id" || ctx.params?.id !== "google") return;
      const state = await getOAuthState();
      const stateIntent = state?.serverContext?.explorersRecoveryIntent;
      const raw = ctx.getCookie(recoveryIntentCookie);
      if (!stateIntent && !raw) return;

      const pending = ctx.context.newSession;
      if (pending) {
        // Pinned Better Auth 1.7.6 removes any earlier positive Set-Cookie headers.
        deleteSessionCookie(ctx, true);
        ctx.context.setNewSession(null);
      }
      ctx.setCookie(recoveryIntentCookie, "", { ...recoveryCookieOptions(config), maxAge: 0 });
      ctx.setCookie(recoveryProofCookie, "", { ...recoveryProofCookieOptions(config), maxAge: 0 });
      const cookieIntent = readRecoveryIntent(raw ?? undefined, config.secret);
      if (!pending || !cookieIntent || stateIntent !== cookieIntent) {
        if (pending) await ctx.context.internalAdapter.deleteSession(pending.session.token);
        if (pending) throw ctx.redirect(`${config.baseURL}/reactivate-confirm?error=recovery_unavailable`);
        return;
      }

      try {
        const provider = await pool.query<{ account_id: string }>(
          "SELECT account_id FROM auth_account WHERE user_id=$1 AND provider_id='google' LIMIT 2", [pending.user.id],
        );
        if (provider.rows.length !== 1) throw new Error("Exactly one verified Google subject is required");
        const proof = await issueRecoveryProof(pool, {
          userId: pending.user.id,
          subject: provider.rows[0].account_id,
          sessionId: pending.session.id,
        });
        ctx.setCookie(recoveryProofCookie, proof.token, {
          ...recoveryProofCookieOptions(config), maxAge: 300,
        });
      } catch {
        await ctx.context.internalAdapter.deleteSession(pending.session.token).catch(() => undefined);
        throw ctx.redirect(`${config.baseURL}/reactivate-confirm?error=recovery_unavailable`);
      }
    }),
  };
}
