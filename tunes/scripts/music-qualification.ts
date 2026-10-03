import {
  requireExactFileManifest,
  unionFileEvidence,
  type Counts,
  type MusicVitestEvidence,
} from "./music-vitest-evidence.ts";
import { MUSIC_UAT_DATABASE_TEST_FILES } from "./music-vitest-evidence.ts";

export type MusicQualificationLaneName = "fast" | "pr" | "nightly" | "release";

export const MUSIC_INTEGRATION_FILES = [
  "server/test/account-recovery.test.ts",
  "server/test/explorers-lifecycle.integration.test.ts",
  "server/test/explorers-media.integration.test.ts",
  "server/test/explorers-profile.integration.test.ts",
  "server/test/explorers-recovery-callback.integration.test.ts",
  "server/test/explorers-recovery.integration.test.ts",
  "server/test/google-sync.integration.test.ts",
  "server/test/load/music-load-http-postgres.integration.test.ts",
  "server/test/load/music-load-postgres.integration.test.ts",
  "server/test/migrations/music-migration.integration.test.ts",
  "server/test/migrations/music-runtime.integration.test.ts",
  "server/test/music-credential.integration.test.ts",
  "server/test/music-domain-repository.integration.test.ts",
  "server/test/music-e2e-identity-count-adapter.integration.test.ts",
  "server/test/music-e2e-initial-capture.integration.test.ts",
  "server/test/music-e2e-state-restore.integration.test.ts",
  "server/test/music-identity-projection.integration.test.ts",
  "server/test/music-identity-repository-coverage.integration.test.ts",
  "server/test/music-publication-operation.integration.test.ts",
  "server/test/music-runtime-role.integration.test.ts",
  "server/test/musicLifecycle.integration.test.ts",
  "server/test/musicReconciler.integration.test.ts",
  "server/test/reconciliationRepository.integration.test.ts",
  "server/test/user-leak.integration.test.ts",
] as const;

export const MUSIC_DEPLOYMENT_FILES = [
  "server/test/deployment/music-command-plan.test.ts",
  "server/test/deployment/music-deploy-executable.test.ts",
  "server/test/deployment/music-deploy-workflow-security.test.ts",
  "server/test/deployment/music-deployment-files.test.ts",
  "server/test/deployment/music-deployment.test.ts",
  "server/test/deployment/music-health-routes.test.ts",
  "server/test/deployment/music-docker-release-authority.test.ts",
  "server/test/deployment/music-production-policy.test.ts",
  "server/test/deployment/music-publication-authority-verifier.test.ts",
  "server/test/deployment/music-readiness.test.ts",
  "server/test/deployment/registration-compat-process.test.ts",
  "server/test/deployment/registration-compat-traefik.real-tool.test.ts",
] as const;

export const MUSIC_DEFAULT_DEPLOYMENT_FILES = MUSIC_DEPLOYMENT_FILES.slice(0, 11);

export const MUSIC_REAL_TOOL_FILES = [
  "server/test/contracts/music-compose-safety.real-tool.test.ts",
  "server/test/contracts/music-production-compose.real-tool.test.ts",
  "server/test/music-startup-bootstrap.real-tool.test.ts",
  "server/test/contracts/music-clean-bootstrap.real-tool.test.ts",
  "server/test/deployment/registration-compat-traefik.real-tool.test.ts",
] as const;

export type QualificationStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";
export type SourceEvidence = {
  commitBefore: string; commitAfter: string; cleanBefore: boolean; cleanAfter: boolean;
  rootLockSha256: string; sourceRoot: string;
};
export type JsonArtifact = { path: string; sha256: string };
export type QualificationOutcome = {
  started: boolean; nativeExit: number | null; nativeSignal: string | null;
  timedOut: boolean; interrupted: boolean;
  prerequisite?: "missing-external-authorization" | "missing-image-or-cache" | "missing-buildkit-isolation" | "unsupported-platform";
  validationError?: string;
  source: SourceEvidence;
  cleanup: "verified" | "failed" | "unknown" | "not-needed";
  json?: JsonArtifact; testEvidence?: MusicVitestEvidence;
  uatRunId?: string;
};

export function qualificationStatus(outcome: QualificationOutcome, requiresJson: boolean): QualificationStatus {
  if (outcome.validationError || outcome.timedOut || outcome.interrupted
      || outcome.cleanup === "failed" || outcome.cleanup === "unknown") return "FAIL";
  if (!outcome.started) {
    if (outcome.nativeExit !== null || outcome.nativeSignal !== null || outcome.json || outcome.testEvidence) return "FAIL";
    return outcome.prerequisite === "unsupported-platform" ? "NOT RUN"
      : outcome.prerequisite ? "BLOCKED" : "NOT RUN";
  }
  if (outcome.prerequisite || outcome.nativeExit !== 0 || outcome.nativeSignal !== null) return "FAIL";
  if (!/^[a-f0-9]{40}$/.test(outcome.source.commitBefore)
      || outcome.source.commitBefore !== outcome.source.commitAfter
      || !outcome.source.cleanBefore || !outcome.source.cleanAfter
      || !/^[a-f0-9]{64}$/.test(outcome.source.rootLockSha256)) return "FAIL";
  if (requiresJson && (!outcome.json || !outcome.testEvidence?.finalized || !outcome.testEvidence.success)) return "FAIL";
  return "PASS";
}

export function aggregateStatuses(values: QualificationStatus[]): QualificationStatus {
  return values.includes("FAIL") ? "FAIL" : values.includes("BLOCKED") ? "BLOCKED"
    : values.length === 0 || values.includes("NOT RUN") ? "NOT RUN" : "PASS";
}

export const MUSIC_QUALIFICATION_REQUIREMENTS = [
  "portable-harness",
  "critical-coverage",
  "postgres-migrations",
  "postgres-repositories",
  "postgres-concurrency",
  "lifecycle",
  "reconciliation",
  "owner-predicates",
  "rest-security",
  "graphql-security",
  "socket-security",
  "google-e2e",
  "email-e2e",
  "account-edge-cases",
  "refresh-rename-sharing",
  "lifecycle-outage-e2e",
  "axe-viewports",
  "keyboard-viewports",
  "load-first-ensures",
  "load-cached-owner",
  "load-invalid-token",
  "load-single-flight",
  "load-db-pool",
  "load-sockets",
  "load-guest-limits",
  "strapi-db-outage",
  "malformed-upstream",
  "deadlock-partial-transaction",
  "truncated-pagination",
  "duplicate-reconciliation",
  "credential-rotation-stale-token",
  "browser-exit",
  "migration-readiness-failure",
  "rollback-exact-digest",
  "kill-switch-secure-floor",
  "bounded-telemetry",
  "secret-free-evidence",
  "timing-evidence",
  "fixture-drift",
  "compatibility-route",
  "typed-recovery",
] as const;

export type MusicQualificationRequirement = typeof MUSIC_QUALIFICATION_REQUIREMENTS[number];

export interface MusicQualificationFailureRecovery {
  owner: "identity" | "database" | "reconciliation" | "browser" | "release";
  code: string;
  publicCode: boolean;
  recovery: string;
  userVisible: string;
}

export const MUSIC_QUALIFICATION_FAILURE_RECOVERY = {
  "strapi-outage": { owner: "identity", code: "UPSTREAM_UNAVAILABLE", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "database-outage": { owner: "database", code: "DATABASE_UNAVAILABLE", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "malformed-identity": { owner: "identity", code: "UPSTREAM_MALFORMED", publicCode: true, recovery: "contact_support", userVisible: "We could not finish setting up Music." },
  "malformed-entitlement": { owner: "identity", code: "UPSTREAM_MALFORMED", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "database-deadlock": { owner: "database", code: "DATABASE_UNAVAILABLE", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "partial-transaction": { owner: "database", code: "DATABASE_UNAVAILABLE", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "truncated-pagination": { owner: "reconciliation", code: "SOURCE_TRUNCATED", publicCode: false, recovery: "abort_and_review", userVisible: "Music remains unchanged." },
  "duplicate-reconciliation": { owner: "reconciliation", code: "SOURCE_DUPLICATE", publicCode: false, recovery: "abort_and_review", userVisible: "Music remains unchanged." },
  "credential-rotation": { owner: "identity", code: "TOKEN_INVALID", publicCode: true, recovery: "authenticate", userVisible: "Sign in again to continue with Music." },
  "stale-token": { owner: "identity", code: "TOKEN_REVOKED", publicCode: true, recovery: "authenticate", userVisible: "Sign in again to continue with Music." },
  "browser-exit": { owner: "browser", code: "IDENTITY_PENDING_DELETION", publicCode: true, recovery: "check_status", userVisible: "Account deletion is in progress." },
  "migration-failure": { owner: "release", code: "MIGRATION_FAILED", publicCode: false, recovery: "rollback_secure_image", userVisible: "Music remains on the previous version." },
  "readiness-failure": { owner: "release", code: "READINESS_FAILED", publicCode: false, recovery: "rollback_secure_image", userVisible: "Music remains on the previous version." },
  "rollback-exact-digest": { owner: "release", code: "ROLLBACK_TARGET_INVALID", publicCode: false, recovery: "abort_and_review", userVisible: "Music remains on the current safe version." },
  "kill-switch": { owner: "release", code: "ENTRY_DISABLED", publicCode: true, recovery: "retry", userVisible: "Music is temporarily unavailable." },
  "secure-rollback-floor": { owner: "release", code: "ROLLBACK_FLOOR_VIOLATION", publicCode: false, recovery: "abort_and_review", userVisible: "Music remains on the current safe version." },
} satisfies Record<string, MusicQualificationFailureRecovery>;

export interface MusicQualificationTask {
  id: string;
  title: string;
  npmArgs: string[];
  requirements: MusicQualificationRequirement[];
  nativeReleaseMode?: "rehearsal";
  authority?: "default" | "real-tool" | "c10-postgres" | "uat-postgres" | "existing";
  testEvidenceSource?: { kind: "vitest-json" | "uat-envelope"; expectedFiles?: readonly string[] };
}

export function requireExactContainerAbsent(result: {
  error?: unknown;
  status: number | null;
  signal?: string | null;
  stdout: string;
  stderr: string;
}, containerId: string): void {
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error("exact container ID required");
  const accepted = [
    "Error: No such container: " + containerId,
    "Error response from daemon: No such container: " + containerId,
  ];
  if (result.error || result.signal || result.status !== 1
    || !["", "[]"].includes(result.stdout.trim())
    || !accepted.includes(result.stderr.trim())) throw new Error("container absence not proven");
}

export function preferredQualificationPort(taskId: string): number {
  let hash = 2_166_136_261;
  for (const character of taskId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return 56_000 + (hash % 4_001);
}

export function qualificationTaskEnvironment(taskId: string): Record<string, string> {
  if (taskId === "fixture-fullstack-browser") {
    return { PLAYWRIGHT_EXTERNAL_BASE_URL: "http://127.0.0.1:55173" };
  }
  if (!["postgres-integration", "tunes-repository-coverage", "tunes-identity-repository-coverage", "load-postgres", "chaos-postgres", "real-docker-evidence"].includes(taskId)) return {};
  return {
    MUSIC_C3_POSTGRES_TEST: "1",
    MUSIC_C4_POSTGRES_TEST: "1",
    MUSIC_C5_POSTGRES_TEST: "1",
    MUSIC_C6_POSTGRES_TEST: "1",
    MUSIC_C7_POSTGRES_TEST: "1",
    MUSIC_C8_POSTGRES_TEST: "1",
    MUSIC_C9_PUBLICATION_POSTGRES_TEST: "1",
    MUSIC_C10_POSTGRES_TEST: "1",
  };
}

const FIXTURE_ENVIRONMENT_TASK_IDS = new Set([
  "postgres-integration",
  "tunes-repository-coverage",
  "tunes-identity-repository-coverage",
  "load-postgres",
  "chaos-postgres",
  "real-docker-evidence",
]);

const STANDALONE_POSTGRES_TASK_IDS = new Set([
  "postgres-integration",
  "tunes-repository-coverage",
  "tunes-identity-repository-coverage",
  "load-postgres",
  "chaos-postgres",
]);

export function qualificationTaskUsesFixtureEnvironment(taskId: string): boolean {
  return FIXTURE_ENVIRONMENT_TASK_IDS.has(taskId);
}

export function qualificationTaskUsesStandalonePostgres(taskId: string): boolean {
  return STANDALONE_POSTGRES_TASK_IDS.has(taskId);
}

const task = (
  id: string,
  title: string,
  npmArgs: string[],
  requirements: MusicQualificationRequirement[],
  metadata: Pick<MusicQualificationTask, "authority" | "testEvidenceSource"> = { authority: "existing" },
): MusicQualificationTask => ({ id, title, npmArgs, requirements, authority: "existing", ...metadata });

export const MUSIC_QUALIFICATION_TASKS = {
  "music-types-scoped": task("music-types-scoped", "Music scoped TypeScript", ["run", "music:types:scoped"], ["portable-harness"]),
  "tunes-unit": task("tunes-unit", "Tunes affected unit suite", [
    "test", "--prefix", "tunes", "--", "server/test/contracts/music-qualification-lanes.test.ts",
    "server/test/contracts/music-release-evidence.test.ts", "server/test/security/music-security-qualification.test.ts",
    "server/test/integration/music-chaos-qualification.test.ts", "server/test/load/music-load-qualification.test.ts",
    "server/test/music-identity-route.test.ts", "server/test/music-socket-server.test.ts",
  ], ["typed-recovery"]),
  "tunes-full-unit": task("tunes-full-unit", "Tunes full non-release unit suite", [
    "test", "--prefix", "tunes", "--", "--exclude", "server/test/deployment/**",
    "--exclude", "server/test/contracts/music-cli-contract.test.ts", "--maxWorkers=2", "--testTimeout=15000",
  ], ["typed-recovery"]),
  "isolated-cli-contract": task("isolated-cli-contract", "Isolated exact-commit Music CLI contract", [
    "exec", "--silent", "--prefix", "tunes", "--", "tsx", "tunes/scripts/music-isolated-cli-contract.ts",
  ], ["portable-harness", "secret-free-evidence"]),
  "explorer-music-unit": task("explorer-music-unit", "Explorer Music unit suite", [
    "run", "test:unit", "--prefix", "explorers-earth", "--", "src/features/music", "src/components/__tests__/MusicDashboard.test.tsx",
    "src/pages/__tests__/MusicPage.test.tsx", "src/pages/__tests__/PublicMusic.test.tsx",
    "src/services/__tests__/accountLifecycleService.test.ts",
  ], ["refresh-rename-sharing", "lifecycle"]),
  "explorer-full-unit": task("explorer-full-unit", "Explorer full unit suite", [
    "run", "test:unit", "--prefix", "explorers-earth",
  ], ["refresh-rename-sharing", "lifecycle"]),
  "music-types-baseline": task("music-types-baseline", "Music TypeScript baseline", ["run", "music:types:baseline"], ["timing-evidence"]),
  "tunes-critical-coverage": task("tunes-critical-coverage", "Tunes critical-module coverage", [
    "run", "test:music-critical-coverage", "--prefix", "tunes", "--", "--maxWorkers=1", "--fileParallelism=false", "--testTimeout=30000",
  ], ["critical-coverage"]),
  "tunes-repository-coverage": task("tunes-repository-coverage", "Tunes PostgreSQL repository coverage", ["run", "test:music-c8:repository-coverage", "--prefix", "tunes", "--", "--maxWorkers=1", "--fileParallelism=false"], ["critical-coverage", "postgres-repositories"], { authority: "c10-postgres", testEvidenceSource: { kind: "vitest-json", expectedFiles: ["server/test/musicReconciler.integration.test.ts", "server/test/reconciliationRepository.integration.test.ts"] } }),
  "tunes-identity-repository-coverage": task("tunes-identity-repository-coverage", "Tunes identity PostgreSQL repository coverage", ["run", "test:music-c45:repository-coverage", "--prefix", "tunes", "--", "--maxWorkers=1", "--fileParallelism=false"], ["critical-coverage", "postgres-repositories"], { authority: "c10-postgres", testEvidenceSource: { kind: "vitest-json", expectedFiles: [
    "server/test/migrations/music-migration.integration.test.ts", "server/test/music-identity-projection.integration.test.ts",
    "server/test/music-credential.integration.test.ts", "server/test/music-domain-repository.integration.test.ts",
    "server/test/musicLifecycle.integration.test.ts", "server/test/musicReconciler.integration.test.ts",
    "server/test/music-publication-operation.integration.test.ts", "server/test/music-runtime-role.integration.test.ts",
    "server/test/music-identity-repository-coverage.integration.test.ts",
  ] } }),
  "explorer-critical-coverage": task("explorer-critical-coverage", "Explorer critical-module coverage", ["run", "test:music-critical-coverage", "--prefix", "explorers-earth"], ["critical-coverage"]),
  "security-matrices": task("security-matrices", "REST, GraphQL, and socket security matrices", [
    "test", "--prefix", "tunes", "--", "server/test/contracts/music-authorization-matrix.test.ts",
    "server/test/security/music-security-qualification.test.ts",
    "server/test/music-surface-policy.test.ts", "server/test/music-surface-routes.test.ts",
    "server/test/music-identity-route.test.ts", "server/test/music-socket-server.test.ts",
  ], ["rest-security", "graphql-security", "socket-security", "owner-predicates", "bounded-telemetry", "secret-free-evidence"]),
  "postgres-integration": task("postgres-integration", "Real PostgreSQL integration", [
    "run", "test:integration", "--prefix", "tunes", "--",
    "server/test/migrations/music-migration.integration.test.ts",
    "server/test/migrations/music-runtime.integration.test.ts",
    "server/test/google-sync.integration.test.ts",
    "server/test/user-leak.integration.test.ts",
    "server/test/music-credential.integration.test.ts",
    "server/test/music-domain-repository.integration.test.ts",
    "server/test/music-identity-projection.integration.test.ts",
    "server/test/music-publication-operation.integration.test.ts",
    "server/test/music-runtime-role.integration.test.ts",
    "server/test/musicLifecycle.integration.test.ts",
    "server/test/musicReconciler.integration.test.ts",
    "server/test/reconciliationRepository.integration.test.ts",
    "server/test/load/music-load-postgres.integration.test.ts",
    "--maxWorkers=1", "--fileParallelism=false",
  ], [
    "postgres-migrations", "postgres-repositories", "postgres-concurrency", "lifecycle", "reconciliation", "owner-predicates",
  ], { authority: "c10-postgres", testEvidenceSource: { kind: "vitest-json", expectedFiles: [
    "server/test/migrations/music-migration.integration.test.ts", "server/test/migrations/music-runtime.integration.test.ts",
    "server/test/google-sync.integration.test.ts", "server/test/user-leak.integration.test.ts",
    "server/test/music-credential.integration.test.ts", "server/test/music-domain-repository.integration.test.ts",
    "server/test/music-identity-projection.integration.test.ts", "server/test/music-publication-operation.integration.test.ts",
    "server/test/music-runtime-role.integration.test.ts", "server/test/musicLifecycle.integration.test.ts",
    "server/test/musicReconciler.integration.test.ts", "server/test/reconciliationRepository.integration.test.ts",
    "server/test/load/music-load-postgres.integration.test.ts",
  ] } }),
  "browser-smoke": task("browser-smoke", "Music browser smoke", [
    "run", "test:e2e", "--prefix", "explorers-earth", "--", "music.spec.ts", "account-lifecycle.spec.ts", "--project=chromium", "--retries=0",
  ], ["refresh-rename-sharing", "lifecycle-outage-e2e", "browser-exit"]),
  "fullstack-browser": task("fullstack-browser", "Google and email full-stack Music journeys", [
    "run", "test:e2e", "--prefix", "explorers-earth", "--", "music-fullstack.spec.ts", "music-auth-triggers.spec.ts", "--project=chromium", "--retries=0",
  ], ["google-e2e", "email-e2e", "account-edge-cases", "refresh-rename-sharing", "lifecycle-outage-e2e"]),
  "accessibility-browser": task("accessibility-browser", "Music axe and keyboard journeys", [
    "run", "test:e2e", "--prefix", "explorers-earth", "--", "music-accessibility.spec.ts", "--project=chromium", "--retries=0",
  ], ["axe-viewports", "keyboard-viewports", "secret-free-evidence"]),
  "fixture-fullstack-browser": task("fixture-fullstack-browser", "Real five-service Music browser identity journey", [
    "run", "test:e2e", "--prefix", "explorers-earth", "--", "music-fixture-fullstack.spec.ts", "--project=chromium", "--retries=0",
  ], ["email-e2e", "postgres-repositories", "owner-predicates", "secret-free-evidence"]),
  "load-unit": task("load-unit", "Music identity, owner, token, socket, and guest load", [
    "test", "--prefix", "tunes", "--", "server/test/load/music-load-qualification.test.ts",
    "server/test/music-identity-route.test.ts", "server/test/music-socket-server.test.ts", "--disableConsoleIntercept",
  ], ["load-first-ensures", "load-cached-owner", "load-invalid-token", "load-single-flight", "load-sockets", "load-guest-limits", "timing-evidence"]),
  "load-postgres": task("load-postgres", "Music PostgreSQL pool load", [
    "run", "test:integration", "--prefix", "tunes", "--",
    "server/test/load/music-load-http-postgres.integration.test.ts", "--disableConsoleIntercept", "--pool=threads",
    "--maxWorkers=1", "--fileParallelism=false",
  ], ["load-db-pool", "postgres-concurrency", "timing-evidence"], { authority: "c10-postgres", testEvidenceSource: { kind: "vitest-json", expectedFiles: ["server/test/load/music-load-http-postgres.integration.test.ts"] } }),
  "chaos-unit": task("chaos-unit", "Music upstream and credential chaos", [
    "test", "--prefix", "tunes", "--", "server/test/integration/music-chaos-qualification.test.ts",
    "server/test/music-identity-gateway.test.ts", "server/test/music-token-service.test.ts", "server/test/music-reconciler.test.ts",
  ], ["strapi-db-outage", "malformed-upstream", "truncated-pagination", "duplicate-reconciliation", "credential-rotation-stale-token", "typed-recovery"]),
  "chaos-postgres": task("chaos-postgres", "Music PostgreSQL transaction chaos", [
    "run", "test:integration", "--prefix", "tunes", "--", "server/test/migrations/music-migration.integration.test.ts",
    "server/test/musicLifecycle.integration.test.ts", "server/test/musicReconciler.integration.test.ts",
    "--maxWorkers=1", "--fileParallelism=false",
  ], ["strapi-db-outage", "deadlock-partial-transaction", "duplicate-reconciliation", "migration-readiness-failure"]),
  "fixture-drift": task("fixture-drift", "Fixture and documentation drift contracts", [
    "test", "--prefix", "tunes", "--", "server/test/contracts/music-fixture-services.test.ts",
    "server/test/contracts/music-fixture-probe.test.ts", "server/test/contracts/music-openapi-contract.test.ts",
    "server/test/contracts/music-authorization-matrix.test.ts", "server/test/contracts/music-release-evidence.test.ts",
  ], ["fixture-drift", "compatibility-route", "secret-free-evidence"]),
  "release-rehearsal": task("release-rehearsal", "Immutable image, readiness, rollback, and kill-switch rehearsal", [
    "test", "--prefix", "tunes", "--",
    "server/test/deployment/music-command-plan.test.ts",
    "server/test/deployment/music-deploy-executable.test.ts",
    "server/test/deployment/music-deploy-workflow-security.test.ts",
    "server/test/deployment/music-deployment-files.test.ts",
    "server/test/deployment/music-deployment.test.ts",
    "server/test/deployment/music-health-routes.test.ts",
    "server/test/deployment/music-docker-release-authority.test.ts",
    "server/test/deployment/music-production-policy.test.ts",
    "server/test/deployment/music-publication-authority-verifier.test.ts",
    "server/test/deployment/music-readiness.test.ts",
    "server/test/deployment/registration-compat-process.test.ts",
    "--maxWorkers=1", "--fileParallelism=false",
  ], ["migration-readiness-failure", "rollback-exact-digest", "kill-switch-secure-floor", "compatibility-route", "typed-recovery"], { authority: "default", testEvidenceSource: { kind: "vitest-json", expectedFiles: MUSIC_DEFAULT_DEPLOYMENT_FILES } }),
  "default-backend-gate": task("default-backend-gate", "Complete two-worker default Tunes gate",
    ["test", "--prefix", "tunes", "--", "--maxWorkers=2"], ["portable-harness", "typed-recovery"],
    { authority: "default", testEvidenceSource: { kind: "vitest-json" } }),
  "real-tool-contracts": task("real-tool-contracts", "Serial genuine real-tool contracts",
    ["run", "test:real-tool", "--prefix", "tunes", "--"], ["portable-harness", "secret-free-evidence"],
    { authority: "real-tool", testEvidenceSource: { kind: "vitest-json", expectedFiles: MUSIC_REAL_TOOL_FILES } }),
  "uat-postgres-integration": task("uat-postgres-integration", "Owned disposable PG15 UAT",
    ["run", "music:test:uat-database", "--", "--ack", "TASK4_FIXTURE_OWNED_DISPOSABLE_PG15"],
    ["postgres-migrations", "postgres-repositories", "postgres-concurrency"],
    { authority: "uat-postgres", testEvidenceSource: { kind: "uat-envelope", expectedFiles: MUSIC_UAT_DATABASE_TEST_FILES } }),
  "real-docker-evidence": task("real-docker-evidence", "Disposable real-Docker fixture identity and recovery evidence", [
    "exec", "--silent", "--prefix", "tunes", "--", "tsx", "tunes/scripts/music-fixture-runtime.ts",
  ], ["portable-harness", "postgres-repositories", "owner-predicates", "strapi-db-outage", "secret-free-evidence"]),
  "real-docker-release": {
    ...task("real-docker-release", "Shared-engine local-registry migration, rollback, and floor rehearsal", [], [
      "migration-readiness-failure", "rollback-exact-digest", "kill-switch-secure-floor", "compatibility-route", "typed-recovery", "secret-free-evidence",
    ]),
    nativeReleaseMode: "rehearsal",
  },
  "interrupt-resume": task("interrupt-resume", "Owned child interrupt cleanup and bounded resume", [
    "exec", "--silent", "--prefix", "tunes", "--", "tsx", "tunes/scripts/music-interrupt-rehearsal.ts",
  ], ["portable-harness", "timing-evidence", "typed-recovery"]),
} satisfies Record<string, MusicQualificationTask>;

export interface MusicQualificationStage {
  id: string;
  parallel: boolean;
  taskIds: Array<keyof typeof MUSIC_QUALIFICATION_TASKS>;
}

export interface MusicQualificationLane {
  budgetMs: number;
  inherits: MusicQualificationLaneName[];
  stages: MusicQualificationStage[];
}

export const MUSIC_QUALIFICATION_LANES: Record<MusicQualificationLaneName, MusicQualificationLane> = {
  fast: {
    budgetMs: 3 * 60_000,
    inherits: [],
    stages: [{ id: "fast", parallel: true, taskIds: ["music-types-scoped", "tunes-unit", "explorer-music-unit"] }],
  },
  pr: {
    budgetMs: 15 * 60_000,
    inherits: ["fast"],
    stages: [
      { id: "pr-critical-coverage", parallel: false, taskIds: ["tunes-critical-coverage", "explorer-critical-coverage"] },
      { id: "pr-static", parallel: true, taskIds: ["music-types-baseline", "tunes-full-unit", "explorer-full-unit", "security-matrices"] },
      { id: "pr-isolated-authority", parallel: false, taskIds: ["isolated-cli-contract"] },
      { id: "pr-postgres", parallel: false, taskIds: ["postgres-integration"] },
      { id: "pr-postgres-coverage", parallel: false, taskIds: ["tunes-repository-coverage", "tunes-identity-repository-coverage"] },
      { id: "pr-browser", parallel: false, taskIds: ["browser-smoke"] },
    ],
  },
  nightly: {
    budgetMs: 45 * 60_000,
    inherits: ["pr"],
    stages: [
      { id: "nightly-browser", parallel: true, taskIds: ["fullstack-browser", "accessibility-browser"] },
      { id: "nightly-fixture-browser", parallel: false, taskIds: ["fixture-fullstack-browser"] },
      { id: "nightly-unit", parallel: true, taskIds: ["load-unit", "chaos-unit"] },
      { id: "nightly-postgres", parallel: false, taskIds: ["load-postgres", "chaos-postgres"] },
      { id: "nightly-recovery", parallel: false, taskIds: ["interrupt-resume"] },
      { id: "nightly-drift", parallel: false, taskIds: ["fixture-drift"] },
    ],
  },
  release: {
    budgetMs: 60 * 60_000,
    inherits: ["pr"],
    stages: [
      { id: "release-evidence", parallel: false, taskIds: ["fixture-drift"] },
      { id: "release-real-fixture", parallel: false, taskIds: ["fixture-fullstack-browser", "real-docker-evidence", "interrupt-resume"] },
      { id: "release-recovery", parallel: false, taskIds: ["release-rehearsal", "real-docker-release"] },
      { id: "release-backend-default", parallel: false, taskIds: ["default-backend-gate"] },
      { id: "release-backend-real-tool", parallel: false, taskIds: ["real-tool-contracts"] },
      { id: "release-backend-postgres", parallel: false, taskIds: ["load-postgres", "uat-postgres-integration"] },
    ],
  },
};

export function qualificationStageConcurrency(
  laneName: MusicQualificationLaneName,
  stage: MusicQualificationStage,
  platform: NodeJS.Platform = process.platform,
): number {
  if (!stage.parallel) return 1;
  if (laneName === "nightly" || laneName === "release") {
    return platform === "win32" ? 1 : Math.min(2, stage.taskIds.length);
  }
  return stage.taskIds.length;
}

export interface MusicQualificationExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifact: string;
  timedOut?: boolean;
  outcome?: QualificationOutcome;
}

export interface MusicQualificationTaskEvidence {
  id: string;
  title: string;
  originalStatus: "success" | "failure" | "timeout" | "blocked" | "not-run";
  diagnosticStatus?: "success" | "failure" | "timeout" | "blocked" | "not-run";
  qualificationStatus: QualificationStatus;
  outcome?: QualificationOutcome;
  attempts: 1 | 2;
  durationMs: number;
  artifacts: string[];
  loadMeasurements?: MusicQualificationLoadMeasurement[];
  operationalMeasurements?: MusicQualificationOperationalMeasurement[];
}

function statusFor(item: MusicQualificationTaskEvidence | undefined): QualificationStatus {
  if (!item) return "NOT RUN";
  if (item.qualificationStatus === "FAIL") return "FAIL";
  if (!item.outcome) return "FAIL";
  return qualificationStatus(item.outcome, true);
}

function requiredUnion(items: Array<MusicQualificationTaskEvidence | undefined>, expected: readonly string[]) {
  const status = aggregateStatuses(items.map(statusFor));
  if (status !== "PASS") return { status, expectedFiles: expected, duplicates: [] as string[] };
  try {
    const groups = items.map((item) => {
      if (!item?.outcome?.testEvidence) throw new Error("started task missing finalized evidence");
      return item.outcome.testEvidence;
    });
    const union = unionFileEvidence(groups, expected);
    return { status: "PASS" as const, expectedFiles: expected, ...union };
  } catch {
    return { status: "FAIL" as const, expectedFiles: expected, duplicates: [] as string[] };
  }
}

export function completeBackendFromTasks(tasks: MusicQualificationTaskEvidence[]) {
  const byId = new Map(tasks.map((taskEvidence) => [taskEvidence.id, taskEvidence]));
  const get = (id: string) => byId.get(id);
  const statusOf = (id: string): QualificationStatus => statusFor(get(id));
  const defaultStatus = statusOf("default-backend-gate");
  let realTool = statusOf("real-tool-contracts");
  const integration = requiredUnion([
    get("postgres-integration"), get("load-postgres"),
    get("tunes-identity-repository-coverage"), get("uat-postgres-integration"),
  ], MUSIC_INTEGRATION_FILES);
  let traefik = get("real-tool-contracts");
  if (realTool === "PASS" && traefik?.outcome?.testEvidence) {
    try {
      const full = traefik.outcome.testEvidence;
      requireExactFileManifest(full, MUSIC_REAL_TOOL_FILES);
      const files = full.files.filter((file) => file.file === MUSIC_DEPLOYMENT_FILES[11]);
      const assertions: Counts = { selected: 0, passed: 0, failed: 0, skipped: 0, todo: 0 };
      for (const file of files) for (const key of Object.keys(assertions) as Array<keyof Counts>) {
        assertions[key] += file.assertions[key];
      }
      const projected: MusicVitestEvidence = {
        ...full,
        files,
        assertions,
        fileCounts: { selected: files.length, passed: files.length, failed: 0, skipped: 0 },
      };
      requireExactFileManifest(projected, [MUSIC_DEPLOYMENT_FILES[11]]);
      traefik = { ...traefik, outcome: { ...traefik.outcome, testEvidence: projected } };
    } catch {
      realTool = "FAIL";
      traefik = traefik ? { ...traefik, qualificationStatus: "FAIL" } : traefik;
    }
  }
  const deployment = requiredUnion([get("release-rehearsal"), traefik], MUSIC_DEPLOYMENT_FILES);
  const postgres = integration.status;
  return {
    status: aggregateStatuses([defaultStatus, realTool, postgres, deployment.status]),
    default: defaultStatus,
    realTool,
    postgres,
    deployment,
    integration,
  };
}

export interface MusicQualificationLoadMeasurement {
  schemaVersion: "music-load/v1";
  metric: "ensure" | "owner" | "postgres-pool" | "socket-owner-guest" | "telemetry-labels";
  [key: string]: string | number;
}

export interface MusicQualificationOperationalMeasurement {
  schemaVersion: "music-operation/v1";
  metric: "interrupt-resume" | "real-docker-release";
  [key: string]: string | number | boolean;
}

export interface MusicQualificationReport {
  schemaVersion: "music-qualification/v1";
  lane: MusicQualificationLaneName;
  status: "success" | "failure" | "blocked" | "not-run";
  authority?: MusicQualificationAuthority;
  failureCodes: Array<"QUALIFICATION_TASK_FAILED" | "QUALIFICATION_TASK_TIMEOUT" | "QUALIFICATION_BUDGET_EXCEEDED" | "QUALIFICATION_MEASUREMENT_FAILED" | "QUALIFICATION_EVIDENCE_FAILED">;
  timing: {
    budgetMs: number;
    wallClockMs: number;
    taskP50Ms: number;
    taskP95Ms: number;
    laneSamples: number;
    laneP50Ms: number;
    laneP95Ms: number;
  };
  tasks: MusicQualificationTaskEvidence[];
  telemetry: {
    taskStatus: { success: number; failure: number; timeout: number; blocked: number; "not-run": number };
    flakyDiagnosticReruns: number;
  };
  measurements?: MusicQualificationMeasurements;
  measurementIssues?: string[];
  evidenceArtifact?: string;
}

export interface MusicQualificationCommandMeasurement {
  status: "success" | "failure" | "blocked";
  durationMs: number;
}

export interface MusicQualificationMeasurements {
  bootstrap?: MusicQualificationCommandMeasurement;
  doctor?: MusicQualificationCommandMeasurement;
  smoke?: MusicQualificationCommandMeasurement;
  coldFirstGreenMs?: number;
  warmFirstGreenMs?: number;
  fixtureAgeMs: number;
  interruptCleanup: "verified" | "failed" | "not-run";
  resume: "verified" | "failed" | "not-run";
  documentationContractFailures: number;
  compatibilityRouteUsage?: number;
  telemetryCardinality: "bounded" | "failed" | "not-run";
  load: MusicQualificationLoadMeasurement[];
  operations: MusicQualificationOperationalMeasurement[];
}

export interface MusicQualificationAuthority {
  commit: string;
  environmentFingerprint: string;
}

export function qualificationReportMatchesAuthority(
  candidate: { status?: string; authority?: Partial<MusicQualificationAuthority> },
  authority: MusicQualificationAuthority,
): boolean {
  return candidate.status === "success"
    && candidate.authority?.commit === authority.commit
    && candidate.authority?.environmentFingerprint === authority.environmentFingerprint;
}

export interface MusicQualificationRunOptions {
  artifactDirectory: string;
  priorLaneWallClockMs?: number[];
  measurements?: MusicQualificationMeasurements;
  authority?: MusicQualificationAuthority;
  execute: (
    task: MusicQualificationTask,
    context: { attempt: 1 | 2; remainingBudgetMs: number; artifactDirectory: string },
  ) => Promise<MusicQualificationExecutionResult>;
  /** Deprecated: the CLI owns the sole final report write after measurements. */
  writeReport?: (report: MusicQualificationReport) => Promise<string>;
}

export async function finalizeMusicQualificationReport(
  report: MusicQualificationReport,
  measurements: MusicQualificationMeasurements,
  writeReport: (report: MusicQualificationReport) => Promise<string>,
): Promise<MusicQualificationReport> {
  attachMusicQualificationMeasurements(report, measurements);
  report.evidenceArtifact = await writeReport(report);
  return report;
}

function validDuration(value: number | undefined, maximumMs: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximumMs;
}

export function attachMusicQualificationMeasurements(
  report: MusicQualificationReport,
  measurements: MusicQualificationMeasurements,
): void {
  report.measurements = measurements;
  if (report.lane !== "nightly" && report.lane !== "release") return;
  const issues: string[] = [];
  if (measurements.telemetryCardinality !== "bounded") issues.push("telemetry-not-bounded");
  if (measurements.documentationContractFailures !== 0) issues.push("documentation-contract-failure");
  if (measurements.interruptCleanup !== "verified") issues.push("interrupt-cleanup-not-verified");
  if (measurements.resume !== "verified") issues.push("resume-not-verified");
  if (report.lane === "release") {
    if (measurements.bootstrap?.status !== "success") issues.push("bootstrap-not-successful");
    if (measurements.doctor?.status !== "success") issues.push("doctor-not-successful");
    if (measurements.smoke?.status !== "success") issues.push("smoke-not-successful");
    if (!validDuration(measurements.coldFirstGreenMs, 10 * 60_000)) issues.push("cold-first-green-missing-or-over-budget");
    if (!validDuration(measurements.warmFirstGreenMs, 5 * 60_000)) issues.push("warm-first-green-missing-or-over-budget");
    if (measurements.compatibilityRouteUsage !== 0) issues.push("compatibility-route-usage-not-zero");
    if (!measurements.operations.some(({ metric }) => metric === "real-docker-release")) {
      issues.push("real-docker-release-missing");
    }
  }
  if (issues.length === 0) {
    delete report.measurementIssues;
    return;
  }
  report.measurementIssues = issues;
  if (!report.failureCodes.includes("QUALIFICATION_MEASUREMENT_FAILED")) {
    report.failureCodes.push("QUALIFICATION_MEASUREMENT_FAILED");
  }
  report.status = "failure";
}

export function stagesForLane(name: MusicQualificationLaneName): MusicQualificationStage[] {
  const lane = MUSIC_QUALIFICATION_LANES[name];
  return [...lane.inherits.flatMap(stagesForLane), ...lane.stages];
}

function executionStatus(result: MusicQualificationExecutionResult): "success" | "failure" | "timeout" {
  if (result.timedOut) return "timeout";
  return result.exitCode === 0 ? "success" : "failure";
}

const loadMeasurementFields: Record<MusicQualificationLoadMeasurement["metric"], readonly string[]> = {
  ensure: ["firstEnsure50Ms", "firstEnsureP50Ms", "firstEnsureP95Ms", "cachedCalls", "cachedP50Ms", "cachedP95Ms", "strapiCalls"],
  owner: ["ownerCalls", "ownerP50Ms", "ownerP95Ms", "strapiCalls", "invalidTokensRejected"],
  "postgres-pool": ["concurrentQueries", "poolMax", "p50Ms", "p95Ms"],
  "socket-owner-guest": ["ownerConnections", "guestConnections", "admittedConnections", "admissionP50Ms", "admissionP95Ms",
    "acceptedGuestRequests", "rateLimitedGuestRequests", "ownerGuestRequestDeliveries", "guestRequestP50Ms", "guestRequestP95Ms",
    "ownerPlayerStateEvents", "guestPlayerStateDeliveries", "playerStateP50Ms", "playerStateP95Ms"],
  "telemetry-labels": ["events", "distinctMetricKeySets", "maxMetricKeys", "forbiddenMetricKeys", "labelValueCardinality", "metricKeySet"],
};

export function parseMusicQualificationLoadMeasurements(output: string): MusicQualificationLoadMeasurement[] {
  const measurements: MusicQualificationLoadMeasurement[] = [];
  for (const line of output.split(/\r?\n/).map((value) => value.trim())) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const candidate = JSON.parse(line) as Record<string, unknown>;
      if (candidate.schemaVersion !== "music-load/v1" || typeof candidate.metric !== "string"
          || !(candidate.metric in loadMeasurementFields)) continue;
      const metric = candidate.metric as MusicQualificationLoadMeasurement["metric"];
      const measurement: MusicQualificationLoadMeasurement = { schemaVersion: "music-load/v1", metric };
      for (const field of loadMeasurementFields[metric]) {
        const value = candidate[field];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) measurement[field] = value;
        else if (field === "metricKeySet" && typeof value === "string" && value.length <= 256) measurement[field] = value;
      }
      measurements.push(measurement);
    } catch {
      // Only exact one-line bounded load envelopes are promoted into the report.
    }
  }
  return measurements;
}

export function qualificationTelemetryIsBounded(measurements: MusicQualificationLoadMeasurement[]): boolean {
  const latest = (metric: MusicQualificationLoadMeasurement["metric"]) =>
    [...measurements].reverse().find((measurement) => measurement.metric === metric);
  const value = (measurement: MusicQualificationLoadMeasurement | undefined, field: string) =>
    typeof measurement?.[field] === "number" ? measurement[field] as number : Number.NaN;
  const ensure = latest("ensure");
  const owner = latest("owner");
  const postgres = latest("postgres-pool");
  const socket = latest("socket-owner-guest");
  const telemetry = latest("telemetry-labels");
  return value(ensure, "firstEnsure50Ms") < 1_000
    && value(ensure, "firstEnsureP50Ms") <= value(ensure, "firstEnsureP95Ms")
    && value(ensure, "firstEnsureP95Ms") < 1_000
    && value(ensure, "cachedCalls") === 200
    && value(ensure, "cachedP50Ms") <= value(ensure, "cachedP95Ms")
    && value(ensure, "cachedP95Ms") < 100
    && value(ensure, "strapiCalls") === 2
    && value(owner, "ownerCalls") === 200
    && value(owner, "ownerP50Ms") <= value(owner, "ownerP95Ms")
    && value(owner, "ownerP95Ms") < 500
    && value(owner, "strapiCalls") === 0
    && value(owner, "invalidTokensRejected") === 200
    && value(postgres, "concurrentQueries") === 50
    && value(postgres, "poolMax") <= 4
    && value(postgres, "p50Ms") <= value(postgres, "p95Ms")
    && value(postgres, "p95Ms") < 2_000
    && value(socket, "ownerConnections") === 12
    && value(socket, "guestConnections") === 24
    && value(socket, "admittedConnections") === 36
    && value(socket, "acceptedGuestRequests") === 16
    && value(socket, "rateLimitedGuestRequests") === 8
    && value(socket, "ownerGuestRequestDeliveries") === 192
    && value(socket, "ownerPlayerStateEvents") === 12
    && value(socket, "guestPlayerStateDeliveries") === 288
    && value(socket, "admissionP50Ms") <= value(socket, "admissionP95Ms")
    && value(socket, "admissionP95Ms") < 4_000
    && value(socket, "guestRequestP50Ms") <= value(socket, "guestRequestP95Ms")
    && value(socket, "guestRequestP95Ms") < 4_000
    && value(socket, "playerStateP50Ms") <= value(socket, "playerStateP95Ms")
    && value(socket, "playerStateP95Ms") < 4_000
    && value(telemetry, "events") >= 250
    && value(telemetry, "distinctMetricKeySets") === 1
    && value(telemetry, "maxMetricKeys") === 8
    && value(telemetry, "forbiddenMetricKeys") === 0
    && value(telemetry, "labelValueCardinality") <= 16
    && telemetry?.metricKeySet === "cache,circuit,conflict,latencyMs,outcome,retryCount,singleFlight,upstreamCallCount";
}

export function parseMusicQualificationOperationalMeasurements(output: string): MusicQualificationOperationalMeasurement[] {
  const measurements: MusicQualificationOperationalMeasurement[] = [];
  for (const line of output.split(/\r?\n/).map((value) => value.trim())) {
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const candidate = JSON.parse(line) as Record<string, unknown>;
      if (candidate.schemaVersion !== "music-operation/v1") continue;
      if (candidate.metric === "interrupt-resume"
          && candidate.interruptCleanup === "verified" && candidate.resume === "verified") {
        measurements.push({
          schemaVersion: "music-operation/v1",
          metric: "interrupt-resume",
          interruptCleanup: "verified",
          resume: "verified",
        });
      }
      if (candidate.metric === "real-docker-release"
          && typeof candidate.compatibilityRouteUsage === "number" && candidate.compatibilityRouteUsage >= 0
          && ["migrationFailureObserved", "readinessFailureObserved", "rollbackRestored", "unknownRollbackRefused",
            "preFloorRollbackRefused", "killSwitchVerified"].every((field) => candidate[field] === true)) {
        measurements.push({
          schemaVersion: "music-operation/v1",
          metric: "real-docker-release",
          compatibilityRouteUsage: candidate.compatibilityRouteUsage,
          migrationFailureObserved: true,
          readinessFailureObserved: true,
          rollbackRestored: true,
          unknownRollbackRefused: true,
          preFloorRollbackRefused: true,
          killSwitchVerified: true,
        });
      }
    } catch {
      // Unstructured output is retained only in the redacted task artifact.
    }
  }
  return measurements;
}

export function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * quantile) - 1));
  return ordered[index]!;
}

export function sanitizeQualificationText(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/)[^:@/\s]+:[^@/\s]+@/gi, "$1[REDACTED]@")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(password|secret|token|api[_-]?key|authorization|credential)\b\s*[:=]\s*[^\s,}]+/gi, "$1=[REDACTED]");
}

export async function runMusicQualificationLane(
  laneName: MusicQualificationLaneName,
  options: MusicQualificationRunOptions,
): Promise<MusicQualificationReport> {
  const lane = MUSIC_QUALIFICATION_LANES[laneName];
  const evidence: MusicQualificationTaskEvidence[] = [];
  const seen = new Set<string>();
  let wallClockMs = 0;
  const selectedStages = stagesForLane(laneName);

  const runTask = async (taskId: keyof typeof MUSIC_QUALIFICATION_TASKS): Promise<MusicQualificationTaskEvidence> => {
    const selected = MUSIC_QUALIFICATION_TASKS[taskId];
    const original = await options.execute(selected, {
      attempt: 1,
      remainingBudgetMs: Math.max(0, lane.budgetMs - wallClockMs),
      artifactDirectory: options.artifactDirectory,
    });
    const canonical = original.outcome
      ? qualificationStatus(original.outcome, Boolean(selected.testEvidenceSource))
      : selected.testEvidenceSource ? "FAIL"
      : original.timedOut || original.exitCode !== 0 ? "FAIL" : "PASS";
    const originalStatus = original.timedOut ? "timeout"
      : canonical === "PASS" ? "success" : canonical === "FAIL" ? "failure"
      : canonical === "BLOCKED" ? "blocked" : "not-run";
    const artifacts = [original.artifact];
    let diagnostic: MusicQualificationExecutionResult | undefined;
    const mayRetry = !selected.testEvidenceSource && originalStatus === "failure";
    if (mayRetry) {
      diagnostic = await options.execute(selected, {
        attempt: 2,
        remainingBudgetMs: Math.max(0, lane.budgetMs - wallClockMs - original.durationMs),
        artifactDirectory: options.artifactDirectory,
      });
      artifacts.push(diagnostic.artifact);
    }
    const loadMeasurements = parseMusicQualificationLoadMeasurements(original.stdout);
    const operationalMeasurements = parseMusicQualificationOperationalMeasurements(original.stdout);
    return {
      id: selected.id,
      title: selected.title,
      originalStatus,
      qualificationStatus: canonical,
      outcome: original.outcome,
      diagnosticStatus: diagnostic ? executionStatus(diagnostic) : undefined,
      attempts: diagnostic ? 2 : 1,
      durationMs: original.durationMs + (diagnostic?.durationMs ?? 0),
      artifacts,
      ...(loadMeasurements.length ? { loadMeasurements } : {}),
      ...(operationalMeasurements.length ? { operationalMeasurements } : {}),
    };
  };

  for (const stage of selectedStages) {
    const pending = stage.taskIds.filter((id) => !seen.has(id));
    pending.forEach((id) => seen.add(id));
    if (pending.length === 0) continue;
    const stageEvidence: MusicQualificationTaskEvidence[] = [];
    const concurrency = qualificationStageConcurrency(laneName, stage);
    let stageDurationMs = 0;
    for (let index = 0; index < pending.length; index += concurrency) {
      const batch = await Promise.all(pending.slice(index, index + concurrency).map(runTask));
      stageEvidence.push(...batch);
      stageDurationMs += Math.max(...batch.map(({ durationMs }) => durationMs));
    }
    evidence.push(...stageEvidence);
    wallClockMs += stageDurationMs;
    if (wallClockMs > lane.budgetMs) break;
  }

  const executedIds = new Set(evidence.map(({ id }) => id));
  const scheduledTaskIds: Array<keyof typeof MUSIC_QUALIFICATION_TASKS> = Array.from(
    new Set<keyof typeof MUSIC_QUALIFICATION_TASKS>(selectedStages.flatMap(({ taskIds }) => taskIds)),
  );
  for (const taskId of scheduledTaskIds) {
    if (executedIds.has(taskId)) continue;
    const selected = MUSIC_QUALIFICATION_TASKS[taskId];
    evidence.push({
      id: selected.id,
      title: selected.title,
      originalStatus: "not-run",
      qualificationStatus: "NOT RUN",
      attempts: 1,
      durationMs: 0,
      artifacts: [],
      outcome: {
        started: false,
        nativeExit: null,
        nativeSignal: null,
        timedOut: false,
        interrupted: false,
        source: { commitBefore: "", commitAfter: "", cleanBefore: false, cleanAfter: false, rootLockSha256: "", sourceRoot: "" },
        cleanup: "not-needed",
      },
    });
  }

  const failureCodes = new Set<MusicQualificationReport["failureCodes"][number]>();
  for (const item of evidence) {
    if (item.originalStatus === "failure") failureCodes.add("QUALIFICATION_TASK_FAILED");
    if (item.originalStatus === "timeout") failureCodes.add("QUALIFICATION_TASK_TIMEOUT");
  }
  if (wallClockMs > lane.budgetMs) failureCodes.add("QUALIFICATION_BUDGET_EXCEEDED");
  if (evidence.some((item) => item.qualificationStatus === "FAIL" && item.outcome?.validationError)) {
    failureCodes.add("QUALIFICATION_EVIDENCE_FAILED");
  }
  const canonicalStatus = aggregateStatuses(evidence.map(({ qualificationStatus }) => qualificationStatus));
  const durations = evidence.map(({ durationMs }) => durationMs);
  const laneDurations = [...(options.priorLaneWallClockMs ?? []), wallClockMs];
  const report: MusicQualificationReport = {
    schemaVersion: "music-qualification/v1",
    lane: laneName,
    status: failureCodes.size > 0 || canonicalStatus === "FAIL" ? "failure"
      : canonicalStatus === "BLOCKED" ? "blocked" : canonicalStatus === "NOT RUN" ? "not-run" : "success",
    ...(options.authority ? { authority: options.authority } : {}),
    failureCodes: Array.from(failureCodes),
    timing: {
      budgetMs: lane.budgetMs,
      wallClockMs,
      taskP50Ms: percentile(durations, 0.5),
      taskP95Ms: percentile(durations, 0.95),
      laneSamples: laneDurations.length,
      laneP50Ms: percentile(laneDurations, 0.5),
      laneP95Ms: percentile(laneDurations, 0.95),
    },
    tasks: evidence,
    telemetry: {
      taskStatus: {
        success: evidence.filter(({ originalStatus }) => originalStatus === "success").length,
        failure: evidence.filter(({ originalStatus }) => originalStatus === "failure").length,
        timeout: evidence.filter(({ originalStatus }) => originalStatus === "timeout").length,
        blocked: evidence.filter(({ originalStatus }) => originalStatus === "blocked").length,
        "not-run": evidence.filter(({ originalStatus }) => originalStatus === "not-run").length,
      },
      flakyDiagnosticReruns: evidence.filter(({ originalStatus, diagnosticStatus }) => originalStatus === "failure" && diagnosticStatus === "success").length,
    },
    measurements: options.measurements,
  };
  return report;
}
