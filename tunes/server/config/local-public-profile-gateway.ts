import path from "node:path";

const LOOPBACK_HOST = "127.0.0.1";
const STRAPI_ORIGIN = "https://api.localqr.earth";
const LOCAL_BROWSER_ORIGINS = Object.freeze(["http://localhost:5174", "http://127.0.0.1:5174"]);

export type LocalPublicProfileGatewayConfig = {
  host: "127.0.0.1";
  port: number;
  origin: "https://api.localqr.earth";
  tokenFile: string;
  allowedOrigins: readonly string[];
};

function fail(): never {
  throw new Error("LOCAL_PUBLIC_PROFILE_GATEWAY_REFUSED");
}

function isCanonicalWindowsFile(value: unknown): value is string {
  if (typeof value !== "string" || !path.win32.isAbsolute(value) || value.startsWith("\\\\")) return false;
  if (path.win32.resolve(value) !== value || /[\u0000-\u001f\u007f]/.test(value)) return false;
  return !value.slice(path.win32.parse(value).root.length).includes(":");
}

export function resolveLocalPublicProfileGatewayConfig(input: Record<string, unknown>): LocalPublicProfileGatewayConfig {
  if (input.host !== LOOPBACK_HOST || input.origin !== STRAPI_ORIGIN) fail();
  if (!Number.isInteger(input.port) || (input.port as number) < 1024 || (input.port as number) > 65535) fail();
  if (!isCanonicalWindowsFile(input.tokenFile)) fail();
  const allowedOrigins = input.allowedOrigins;
  if (!Array.isArray(allowedOrigins)
      || allowedOrigins.length !== LOCAL_BROWSER_ORIGINS.length
      || new Set(allowedOrigins).size !== LOCAL_BROWSER_ORIGINS.length
      || LOCAL_BROWSER_ORIGINS.some((origin) => !allowedOrigins.includes(origin))) fail();
  return {
    host: LOOPBACK_HOST,
    port: input.port as number,
    origin: STRAPI_ORIGIN,
    tokenFile: input.tokenFile,
    allowedOrigins: Object.freeze([...LOCAL_BROWSER_ORIGINS]),
  };
}
