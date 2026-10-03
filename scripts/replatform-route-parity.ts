type RouteProbe = { path: string; status: number; field: string; value: string | boolean | "nonempty" };

const CURRENT_TUNES_ROUTES: RouteProbe[] = [
  { path: "/api/check", status: 401, field: "authenticated", value: false },
  { path: "/api/csrf-token", status: 200, field: "token", value: "nonempty" },
  { path: "/api/user/reactivate", status: 400, field: "error", value: "Token is required" },
  { path: "/api/explorers/analytics/events", status: 400, field: "message", value: "Invalid analytics scope" },
  { path: "/api/music-fixture/readiness", status: 200, field: "status", value: "ready" },
];

export async function verifyPlatformIngress(origin: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  let checked = 0;
  for (const probe of CURRENT_TUNES_ROUTES) {
    const response = await fetchImpl(`${origin}${probe.path}`, { signal: AbortSignal.timeout(5000) });
    if (response.status !== probe.status) throw new Error(`fixture ingress mismatch: ${probe.path}`);
    const body = await response.json() as Record<string, unknown>;
    const field = body[probe.field];
    if (probe.value === "nonempty" ? typeof field !== "string" || !field.length : field !== probe.value) {
      throw new Error(`fixture handler mismatch: ${probe.path}`);
    }
    checked++;
  }
  const strapi = await fetchImpl(`${origin}/api/users/me`, { signal: AbortSignal.timeout(5000) });
  const strapiBody = await strapi.json() as Record<string, unknown>;
  if (strapi.status !== 403 || strapiBody.error !== "fixture identity authority denied") throw new Error("fixture Strapi boundary mismatch");
  checked++;
  return checked;
}
