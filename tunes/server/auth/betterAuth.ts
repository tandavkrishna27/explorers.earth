import { betterAuth, APIError, createAuthMiddleware, drizzleAdapter } from "#auth-runtime";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as authSchema from "../../shared/authSchema";
import { createRecoveryOAuthHooks } from "./recoveryCallback";

type Environment = Record<string, string | undefined>;

export interface ExplorersAuthConfig {
  baseURL: string;
  googleCallbackURL: string;
  trustedOrigins: [string];
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
}

export function resolveExplorersAuthConfig(environment: Environment): ExplorersAuthConfig {
  const raw = environment.EXPLORERS_PUBLIC_ORIGIN;
  if (!raw || raw !== raw.trim()) throw new Error("EXPLORERS_PUBLIC_ORIGIN must be an exact origin");
  let origin: URL;
  try { origin = new URL(raw); }
  catch { throw new Error("EXPLORERS_PUBLIC_ORIGIN must be an exact origin"); }
  const local = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if (!((origin.protocol === "https:" && !local) || (origin.protocol === "http:" && local))
      || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash
      || origin.origin !== raw || raw.endsWith("/")) {
    throw new Error("EXPLORERS_PUBLIC_ORIGIN must be a configured HTTPS origin or local HTTP origin");
  }
  const secret = environment.EXPLORERS_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("EXPLORERS_AUTH_SECRET is required");
  const googleClientId = environment.GOOGLE_CLIENT_ID;
  const googleClientSecret = environment.GOOGLE_CLIENT_SECRET;
  if (!googleClientId || !googleClientSecret) throw new Error("Google OAuth client configuration is required");
  return {
    baseURL: raw,
    googleCallbackURL: `${raw}/api/auth/callback/google`,
    trustedOrigins: [raw],
    secret,
    googleClientId,
    googleClientSecret,
  };
}

export function isAllowedAuthReturnUrl(value: string, config: Pick<ExplorersAuthConfig, "baseURL">): boolean {
  if (!value || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, `${config.baseURL}/`);
    return parsed.origin === config.baseURL && !parsed.pathname.startsWith("/api/auth/")
      && !parsed.username && !parsed.password;
  } catch { return false; }
}

export function createExplorersAuth(pool: Pool, config: ExplorersAuthConfig) {
  const database = drizzle(pool, { schema: authSchema });
  const recoveryHooks = createRecoveryOAuthHooks(pool, config);
  return betterAuth({
    baseURL: config.baseURL,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins,
    secret: config.secret,
    database: drizzleAdapter(database, { provider: "pg", schema: authSchema }),
    user: { modelName: "auth_user" },
    session: { modelName: "auth_session" },
    account: {
      modelName: "auth_account",
      accountLinking: { disableImplicitLinking: true },
    },
    verification: { modelName: "auth_verification" },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
    },
    hooks: {
      before: createAuthMiddleware(async (context) => {
        if (context.path !== "/sign-in/social") return;
        const body = context.body as { callbackURL?: unknown; errorCallbackURL?: unknown; newUserCallbackURL?: unknown } | undefined;
        for (const candidate of [body?.callbackURL, body?.errorCallbackURL, body?.newUserCallbackURL]) {
          if (candidate !== undefined && (typeof candidate !== "string" || !isAllowedAuthReturnUrl(candidate, config))) {
            throw new APIError("FORBIDDEN", { message: "Auth return URL is not allowed" });
          }
        }
        await recoveryHooks.before(context);
      }),
      after: recoveryHooks.after,
    },
  });
}

export type ExplorersAuth = ReturnType<typeof createExplorersAuth>;
