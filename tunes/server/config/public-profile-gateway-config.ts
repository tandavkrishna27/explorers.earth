type Environment = Record<string, string | undefined>;

export type PublicProfileGatewayConfig = { enabled: false } | { enabled: true; token: string };

/**
 * This boundary deliberately reads a server runtime secret only. It must never
 * be represented by a Vite variable or forwarded to Explorers clients.
 */
export function resolvePublicProfileGatewayConfig(environment: Environment): PublicProfileGatewayConfig {
  const enabled = environment.EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED === "true";
  if (!enabled) return { enabled: false };
  if (environment.MUSIC_MODE !== "live") throw new Error("EXPLORERS_PUBLIC_PROFILE_GATEWAY_ENABLED requires live mode");
  const token = environment.STRAPI_PUBLIC_PROFILE_READ_TOKEN?.trim();
  if (!token || token.length < 16 || token.length > 512 || /\s/.test(token)) {
    throw new Error("STRAPI_PUBLIC_PROFILE_READ_TOKEN is required for the public profile gateway");
  }
  const origins = (environment.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim());
  if (!origins.includes("https://explorers.earth")) {
    throw new Error("ALLOWED_ORIGINS must include https://explorers.earth for the public profile gateway");
  }
  return { enabled: true, token };
}
