const UNSAFE_TRUST_PROXY_VALUES = new Set([
  "true",
  "*",
  "0.0.0.0/0",
  "::/0",
]);

export function resolveTrustProxySetting(value: string | undefined): string[] {
  const entries = value
    ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
    : ["loopback", "linklocal", "uniquelocal"];
  if (
    entries.length === 0 ||
    entries.some((entry) => UNSAFE_TRUST_PROXY_VALUES.has(entry.toLowerCase()))
  ) {
    throw new Error("unsafe TRUST_PROXY_CIDRS setting");
  }
  return entries;
}

export function shouldLogRequestBody(path: string): boolean {
  return path !== "/api/explorers/analytics/events";
}
