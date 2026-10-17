import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

export function sanitizeMusicCliText(value: string, exactSensitiveValues: readonly string[] = []): string {
  const exactRedacted = Array.from(new Set(exactSensitiveValues.filter((candidate) => candidate.length >= 8)))
    .sort((left, right) => right.length - left.length)
    .reduce((output, candidate) => output.split(candidate).join("[REDACTED]"), value);
  const redactAssignment = (match: string, key: string): string => isSensitiveMusicAuthorityKey(key)
    ? `${key}=[REDACTED]`
    : match;
  const redactArgument = (match: string, flag: string): string => isSensitiveMusicAuthorityKey(flag.replace(/^-+/, ""))
    ? `${flag} [REDACTED]`
    : match;
  return exactRedacted
    .split(root).join("<repository-root>")
    .split(root.replaceAll("\\", "/")).join("<repository-root>")
    .replace(/[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"',}]+/gi, "<developer-home>")
    .replace(/\/(?:home|Users)\/[^/\s"',}]+/g, "<developer-home>")
    .replace(/(postgres(?:ql)?:\/\/)[^:@/\s]+:[^@/\s]+@/gi, "$1[REDACTED]@")
    .replace(/\b([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,\]}]+)/g, redactAssignment)
    .replace(/\b([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(?:"[^"]*"|'[^']*'|[^\s,\]}]+)/g, redactAssignment)
    .replace(/(--?[A-Za-z][A-Za-z0-9_-]*)\s+(?:"[^"]*"|'[^']*'|[^\s,\]}]+)/g, redactArgument)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]");
}

export function isSensitiveMusicAuthorityKey(key: string): boolean {
  const segments = key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return segments.some((segment) => [
    "password", "passwords", "secret", "secrets", "token", "tokens", "authorization",
    "credential", "credentials", "private", "signing", "encryption", "key", "keys",
  ].includes(segment));
}

export function musicSensitiveEnvironmentValues(environment: Record<string, string>): string[] {
  return Object.entries(environment)
    .filter(([key, value]) => isSensitiveMusicAuthorityKey(key) && value.length >= 8)
    .map(([, value]) => value);
}

export function redactStructuredData(value: unknown, exactSensitiveValues: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactStructuredData(entry, exactSensitiveValues));
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => {
      const safeNumericTelemetry = [
        "invalidTokensRejected", "distinctMetricKeySets", "maxMetricKeys", "forbiddenMetricKeys",
      ].includes(key) && typeof nested === "number" && Number.isFinite(nested) && nested >= 0;
      const safeMetricKeySet = key === "metricKeySet"
        && nested === "cache,circuit,conflict,latencyMs,outcome,retryCount,singleFlight,upstreamCallCount";
      return [
        key,
        isSensitiveMusicAuthorityKey(key) && !safeNumericTelemetry && !safeMetricKeySet
          ? "[REDACTED]"
          : redactStructuredData(nested, exactSensitiveValues),
      ];
    }),
  );
  return typeof value === "string" ? sanitizeMusicCliText(value, exactSensitiveValues) : value;
}
