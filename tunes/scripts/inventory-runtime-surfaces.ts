import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { decisionForRoute, type MusicSurfaceDecision } from "../server/policies/musicSurfacePolicy";
import { RETIRED_MUSIC_ROUTE_RULES, type RetiredMusicRouteRule } from "../server/policies/musicRetirementPolicy";

export interface RouteSurface { method: string; path: string; classification: string; ownerSource: string; policy: string; lifecycle: string; source: string; line: number; }
interface EventSurface { direction: "receive" | "emit"; event: string; classification: string; policy: string; ownerSource: string; lifecycle: string; source: string; line: number; }
interface JobSurface { kind: "setInterval" | "setTimeout"; lifecycle: string; source: string; line: number; }
interface RetiredSurface {
  family: string;
  disposition: "canonical-replacement" | "typed-410-boundary" | "canonical-replacement-or-typed-410";
  reason: string;
}
export interface RuntimeSurfaceInventory { schemaVersion: "music-runtime-surface-inventory/v1"; retiredSurfaces: RetiredSurface[]; retirementMatchers: RetiredMusicRouteRule[]; routes: RouteSurface[]; events: EventSurface[]; jobs: JobSurface[]; }

const RETIRED_SURFACES: RetiredSurface[] = [
  { family: "legacy-browser-identity", disposition: "typed-410-boundary", reason: "Browser-selected identity bridges cannot establish Music ownership." },
  { family: "graphql-service-proxy", disposition: "typed-410-boundary", reason: "Unrestricted service-token GraphQL authority is prohibited." },
  { family: "legacy-admin", disposition: "typed-410-boundary", reason: "No internal Music admin principal exists." },
  { family: "swagger", disposition: "canonical-replacement", reason: "A minimal typed OpenAPI document describes only live canonical endpoints." },
  { family: "legacy-mixed-auth-owner-handlers", disposition: "canonical-replacement-or-typed-410", reason: "C5 owner routes replace product-required operations; the remainder retire fail-closed." },
  { family: "request", disposition: "canonical-replacement", reason: "Guest requests use the capability-only REST/socket allowlist." },
  { family: "queue", disposition: "canonical-replacement", reason: "Owner queue read/update/delete operations use principal-predicated SQL." },
  { family: "playlist", disposition: "canonical-replacement", reason: "Saved and active playlists use principal-predicated canonical routes." },
  { family: "settings", disposition: "canonical-replacement-or-typed-410", reason: "Playlist visibility is canonical; legacy identity/system settings retire." },
  { family: "device", disposition: "typed-410-boundary", reason: "Device-session authority remains outside the local Music principal." },
  { family: "analytics", disposition: "typed-410-boundary", reason: "Legacy mixed-auth analytics lacks a local scoped repository." },
  { family: "subscription", disposition: "typed-410-boundary", reason: "Caller-target subscription handlers are prohibited; entitlement is server-derived." },
  { family: "youtube", disposition: "canonical-replacement-or-typed-410", reason: "Typed C5 read-only search/video lookup remains; every broad or mutating sibling retires." },
  { family: "playback", disposition: "canonical-replacement", reason: "Playback state changes require C5 and owner-predicated queue SQL." },
  { family: "venue", disposition: "typed-410-boundary", reason: "Venue identity mutations remain authoritative in Explorer identity." },
  { family: "public", disposition: "canonical-replacement", reason: "Explicit publication and hashed capability reads replace implicit guest URLs." },
  { family: "admin", disposition: "typed-410-boundary", reason: "No internal Music admin principal exists." },
  { family: "payment", disposition: "typed-410-boundary", reason: "Legacy caller-target payment mutations cannot derive server authority safely." },
  { family: "scrape", disposition: "typed-410-boundary", reason: "Unrestricted scrape and image proxy operations are not Music owner functions." },
  { family: "instagram", disposition: "typed-410-boundary", reason: "The legacy mixed-auth upstream proxy is not an approved Music surface." },
  { family: "gemini", disposition: "typed-410-boundary", reason: "The legacy paid upstream proxy has no approved server-derived operation." },
];

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    if (name === "node_modules" || name === "test" || name === "__tests__") return [];
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function literal(node: ts.Node | undefined): string | undefined {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function policyFor(text: string): string {
  const policies = ["requireAnyAuth", "requireAuth", "passport.authenticate", "authenticateToken", "csrf", "Limiter", "rateLimit"].filter((name) => text.includes(name));
  return policies.length ? policies.join("+") : "none";
}

function classificationFor(method: string, path: string, priorClassification: string, source: string): string {
  const decision = decisionForRoute({ method, path, classification: priorClassification, source });
  const classifications: Record<MusicSurfaceDecision, string> = {
    public: "public",
    "strapi-identity": "strapi-identity-boundary",
    owner: "local-music-owner",
    "paid-owner": "paid-local-music-owner",
    guest: "guest-capability",
    "native-session": "native-session",
    tombstone: "tombstone",
    "admin-tombstone": "admin-tombstone",
    "owner-or-guest": "c5-or-guest-handshake",
    unclassified: "unclassified",
    "explorers-auth": "canonical-explorers-auth",
    "explorers-owner": "canonical-explorers-owner",
    "explorers-recovery": "canonical-explorers-recovery",
  };
  return classifications[decision];
}

function ownerFor(path: string, classification: string): string {
  if(path==='/api/explorers/analytics/events')return classification==='public'?'consent+live-canonical-public-target':'historical-strapi-bearer-owner-until-7.2';
  if(path==='/api/explorers/analytics/summary')return 'verified-Actor+analytics:read+current-session-lifecycle';
  if (path === "/api/explorers/v1/media/:id/content" && classification === "public") return "owner-or-visible-public-profile-attachment";
  if (path === "/api/explorers/analytics/music-account/:accountDocumentId/events") return "active-local-binding-from-account-descriptor";
  if (path === "/api/music/identity/ensure") return "authoritative-strapi-user+selected-account";
  if (path.startsWith("/api/music/identity/lifecycle/")) return "authoritative-strapi-user+stored-account-binding";
  if (classification === "local-music-owner" || classification === "paid-local-music-owner") return "req.musicPrincipal.musicUserId";
  if (classification === "guest-capability") return path === "/api/playlist/:guestUrl"
      || path === "/api/playlist/:guestUrl/requests"
      || path === "/api/explorers/analytics/music/:publicSlug/events"
    ? "hashed-guest-capability-or-explicit-publication"
    : "hashed-guest-capability";
  if (classification === "admin-tombstone" || classification === "tombstone") return "none-fail-closed";
  if (classification === "native-session") return "native-session-only";
  if (classification === "canonical-explorers-owner") return "verified-google-session+active-initial-account-binding";
  if (classification === "canonical-explorers-auth") return "better-auth-session-or-provider-flow";
  if (classification === "canonical-explorers-recovery") {
    if (path === "/api/explorers/v1/recovery/start") return "trusted-origin+signed-short-lived-recovery-intent";
    // /recovery/status is read-only observation and is deliberately NOT single-use: ticket
    // 2.4 package L0 requires it to report a completed recovery and a terminal deletion,
    // neither of which is observable while the proof must be unconsumed. It stays bound to
    // the same Google-issued proof and to its original five-minute expiry, and writes
    // nothing. The transition route below keeps the single-use gate.
    if (path === "/api/explorers/v1/recovery/status") return "google-bound-recovery-proof-within-expiry-read-only";
    return "single-use-google-bound-recovery-proof";
  }
  return "none";
}

export function assertNoUnclassifiedSensitiveSurfaces(routes: RouteSurface[]): void {
  for (const route of routes) {
    if (["unclassified", "handler-authorization-unknown", "owner-handler-review-required", "admin-handler-review-required", "service-token-proxy"].includes(route.classification)) {
      throw new Error(`unclassified sensitive surface ${route.method} ${route.path}`);
    }
  }
}

function lifecycleFor(path: string, method: string): string {
  if (path.includes("reactivat")) return "reactivate";
  if (path.endsWith("/lifecycle/suspend")) return "suspend";
  if (path.includes("block") || path.includes("deactiv")) return "block-or-deactivate";
  if (method === "DELETE") return "delete";
  return "request";
}

export function inventoryRuntimeSurfaces(repositoryRoot: string): RuntimeSurfaceInventory {
  const serverRoot = resolve(repositoryRoot, "tunes", "server");
  const routes: RouteSurface[] = [];
  const events: EventSurface[] = [];
  const jobs: JobSurface[] = [];
  for (const file of files(serverRoot)) {
    const sourceText = readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const source = relative(repositoryRoot, file).replace(/\\/g, "/");
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        if (ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text.toLowerCase();
          const target = node.expression.expression.getText(sourceFile);
          const path = literal(node.arguments[0]);
          if (["get", "head", "post", "put", "patch", "delete", "use", "all"].includes(method) && path?.startsWith("/")) {
            const middleware = node.arguments.slice(1, -1).map((argument) => argument.getText(sourceFile)).join(" ");
            const routePolicy = policyFor(middleware);
            const legacyClassification = routePolicy !== "none" ? "authenticated" : "handler-authorization-unknown";
            const classification = classificationFor(method.toUpperCase(), path, legacyClassification, source);
            let policy = routePolicy;
            if (classification === "public") policy = path === "/api/explorers/v1/media/:id/content"
              ? "ready-media+owner-or-live-public-profile-or-book-recommendation-attachment" : "explicit-public-contract";
            else if (path === "/{*musicRetiredPath}") policy = "normalized-executable-retirement-matcher";
            else if (classification === "local-music-owner") policy = "c5-principal+local-lifecycle+owner-sql";
            else if (classification === "paid-local-music-owner") policy = "c5-principal+local-lifecycle+fresh-entitlement+owner-sql";
            else if (classification === "guest-capability") policy = "hashed-capability+guest-allowlist";
            else if (classification.endsWith("tombstone")) policy = "fail-closed-tombstone";
            else if (classification === "strapi-identity-boundary") policy = path === "/api/music/identity/ensure"
              ? "c5-mint-boundary"
              : "authoritative-strapi-bearer+immutable-binding+lifecycle-state";
            else if (classification === "native-session") policy = "standalone-native-only";
            else if (classification === "canonical-explorers-auth") policy = "better-auth-handler+trusted-origin-for-mutations";
            else if (classification === "canonical-explorers-owner") policy = "better-auth-session+google-provider+active-initial-account-binding";
            else if (classification === "canonical-explorers-recovery") policy = path === "/api/explorers/v1/recovery/start"
              ? "trusted-origin+signed-short-lived-recovery-intent" : "google-bound-five-minute-proof+origin-on-mutation";
            routes.push({ method: method.toUpperCase(), path, classification, ownerSource: ownerFor(path, classification), policy, lifecycle: lifecycleFor(path, method.toUpperCase()), source, line });
          }
          const event = literal(node.arguments[0]);
          if ((method === "on" || method === "emit") && event && /^(?:io|socket|recipient|this\.io)/.test(target)) {
            const direction = method === "on" ? "receive" : "emit";
            const classification = direction === "emit" ? "socket-response"
              : event === "connection" ? "c5-or-guest-handshake"
                : event === "player_state" ? "local-music-owner-event"
                  : event === "guest_request" ? "guest-capability-event"
                    : event === "disconnect" ? "socket-lifecycle" : "tombstone-event";
            const policy = direction === "receive" ? "sender-event-time-recheck+role-allowlist" : "socket-response";
            events.push({ direction, event, classification, policy, ownerSource: event === "guest_request" ? "hashed-guest-capability" : "socket.musicPrincipal", lifecycle: event === "disconnect" ? "disconnect" : "event", source, line });
          }
        } else if (ts.isIdentifier(node.expression)) {
          if (node.expression.text === "setInterval" || node.expression.text === "setTimeout") {
            jobs.push({ kind: node.expression.text, lifecycle: source.includes("reactivation-service") ? "reactivation-token-cleanup" : "scheduled-callback", source, line });
          } else if (node.expression.text === "emitToAuthorizedRecipients") {
            const event = literal(node.arguments[2]);
            if (event) events.push({
              direction: "emit",
              event,
              classification: "socket-recipient-revalidated",
              policy: "recipient-lifecycle+capability-recheck-before-delivery",
              ownerSource: event === "guest_request" ? "recipient.socket.musicPrincipal" : "recipient.hashed-guest-capability",
              lifecycle: "event",
              source,
              line,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  const compare = (left: { source: string; line: number }, right: { source: string; line: number }) => left.source.localeCompare(right.source) || left.line - right.line;
  assertNoUnclassifiedSensitiveSurfaces(routes);
  return {
    schemaVersion: "music-runtime-surface-inventory/v1",
    retiredSurfaces: RETIRED_SURFACES,
    retirementMatchers: [...RETIRED_MUSIC_ROUTE_RULES],
    routes: routes.sort(compare),
    events: events.sort(compare),
    jobs: jobs.sort(compare),
  };
}

export function writeRuntimeSurfaceInventory(repositoryRoot: string): string {
  const target = resolve(repositoryRoot, "docs", "architecture", "music-runtime-surface-inventory.json");
  writeFileSync(target, `${JSON.stringify(inventoryRuntimeSurfaces(repositoryRoot), null, 2)}\n`);
  return target;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("/scripts/inventory-runtime-surfaces.ts") && process.argv.includes("--write")) {
  writeRuntimeSurfaceInventory(resolve(import.meta.dirname, "../.."));
}
