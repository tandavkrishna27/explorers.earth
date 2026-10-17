import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DEPLOYABLE_MUSIC_MIGRATION_MARKERS,
  EXPECTED_MUSIC_MIGRATION_ID,
  LEGACY_CONTAINMENT_MIGRATION_MARKER,
  musicMigrationMarkerRank,
  type DeployableMusicMigrationMarker,
} from "../../shared/music-migration-contract";

export const CONTAINMENT_MIGRATION_MARKER = LEGACY_CONTAINMENT_MIGRATION_MARKER;
export const CURRENT_MIGRATION_MARKER = EXPECTED_MUSIC_MIGRATION_ID;
export const GATE_KIND = "music-schema-deployment-gate-v2" as const;
export const LEGACY_GATE_KIND = "music-containment-deployment-gate-v1" as const;

export function rollbackCompatibilityFloorMarker(marker: DeployableMusicMigrationMarker): DeployableMusicMigrationMarker {
  // Pre-0031 reprovisioners would regrant counter DML and trigger EXECUTE.
  // This privilege boundary requires the matching executable after migration.
  return marker === "0030_explorers_media_purpose_guard"
    ? "0029_explorers_recommendations"
    : marker === "0029_explorers_recommendations"
    ? "0028_explorers_recovery_proof_retention"
    : marker === "0028_explorers_recovery_proof_retention"
    ? "0027_explorers_lifecycle"
    : marker === "0027_explorers_lifecycle"
    ? "0026_explorers_media_slot_compatibility"
    : marker === "0026_explorers_media_slot_compatibility"
    ? "0025_explorers_media_attachment_guard"
    : marker === "0025_explorers_media_attachment_guard"
    ? "0024_explorers_profile_media"
    : marker === "0024_explorers_profile_media"
    ? "0023_explorers_authorization"
    : marker === "0023_explorers_authorization"
    ? "0022_explorers_identity"
    : marker === "0022_explorers_identity"
    ? "0021_explorers_analytics_receipts"
    : marker === "0021_explorers_analytics_receipts"
    ? "0020_public_snapshot_revision"
    : marker === "0020_public_snapshot_revision"
    ? "0019_queue_visibility_control"
    : marker === "0019_queue_visibility_control"
      ? "0018_transactional_queue_replacement"
    : marker === "0018_transactional_queue_replacement"
      ? "0017_publication_idempotency_key_retirement"
      : marker;
}

export interface ImageCandidate {
  digest: string;
  commit: string;
  migrationMarker: DeployableMusicMigrationMarker;
}

export interface GateAttestation extends ImageCandidate {
  kind: typeof GATE_KIND | typeof LEGACY_GATE_KIND;
  schemaChanged: boolean;
  migrationChecksum?: string;
  signature: string;
}

export interface DeploymentState {
  activeSlot: "blue" | "green";
  active: ImageCandidate;
  secureHistory: ImageCandidate[];
  rollbackFloorDigest: string;
  /** Image provenance that first completed the irreversible current-schema gate. */
  migrationCompatibilityFloorDigest?: string;
  migrationCompatibilityFloorMarker?: DeployableMusicMigrationMarker;
}

export interface DeploymentRuntime {
  pull(image: ImageCandidate): Promise<void>;
  runContainmentGate(image: ImageCandidate): Promise<GateAttestation>;
  startPrivateCandidate(slot: "blue" | "green", image: ImageCandidate): Promise<void>;
  checkReadiness(slot: "blue" | "green", image: ImageCandidate, attestation: GateAttestation): Promise<boolean>;
  promoteAtomically(slot: "blue" | "green", image: ImageCandidate): Promise<void>;
  restoreTraffic(slot: "blue" | "green", image: ImageCandidate): Promise<void>;
  stopCandidate(slot: "blue" | "green"): Promise<void>;
}

function assertImageCandidate(image: ImageCandidate): void {
  if (!/^sha256:[a-f0-9]{64}$/.test(image.digest)) throw new Error("image digest must be immutable sha256");
  if (!/^[a-f0-9]{40}$/.test(image.commit)) throw new Error("image commit must be a full git SHA");
  if (!(DEPLOYABLE_MUSIC_MIGRATION_MARKERS as readonly string[]).includes(image.migrationMarker)) {
    throw new Error(`unsupported migration marker ${image.migrationMarker}`);
  }
}

function canonicalGatePayload(image: ImageCandidate, migrationChecksum?: string): string {
  assertImageCandidate(image);
  const legacy = image.migrationMarker === CONTAINMENT_MIGRATION_MARKER;
  if (!legacy && !/^[a-f0-9]{64}$/.test(migrationChecksum ?? "")) throw new Error("migration checksum is required");
  return [legacy ? LEGACY_GATE_KIND : GATE_KIND, image.digest, image.commit, image.migrationMarker,
    legacy ? "schemaChanged=false" : "schemaChanged=true", migrationChecksum ?? ""].join("\n");
}

export function createGateAttestation(image: ImageCandidate, key: string, migrationChecksum?: string): GateAttestation {
  if (key.length < 32) throw new Error("gate attestation key must contain at least 32 characters");
  const legacy = image.migrationMarker === CONTAINMENT_MIGRATION_MARKER;
  return {
    kind: legacy ? LEGACY_GATE_KIND : GATE_KIND,
    ...image,
    schemaChanged: !legacy,
    ...(legacy ? {} : { migrationChecksum }),
    signature: createHmac("sha256", key).update(canonicalGatePayload(image, migrationChecksum)).digest("hex"),
  };
}

export function verifyGateAttestation(attestation: GateAttestation, expected: ImageCandidate, key: string): boolean {
  try {
    assertImageCandidate(expected);
    const legacy = expected.migrationMarker === CONTAINMENT_MIGRATION_MARKER;
    if (attestation.kind !== (legacy ? LEGACY_GATE_KIND : GATE_KIND) || attestation.schemaChanged !== !legacy
      || attestation.digest !== expected.digest || attestation.commit !== expected.commit
      || attestation.migrationMarker !== expected.migrationMarker) return false;
    if (!legacy && !/^[a-f0-9]{64}$/.test(attestation.migrationChecksum ?? "")) return false;
    const expectedSignature = createGateAttestation(expected, key, attestation.migrationChecksum).signature;
    const actual = Buffer.from(attestation.signature, "hex");
    const wanted = Buffer.from(expectedSignature, "hex");
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  } catch {
    return false;
  }
}

export class DeploymentController {
  private state: DeploymentState;

  constructor(state: DeploymentState, private readonly runtime: DeploymentRuntime, private readonly attestationKey: string) {
    this.state = structuredClone(state);
    assertImageCandidate(this.state.active);
    if (!this.state.secureHistory.some((image) => image.digest === this.state.rollbackFloorDigest)) {
      throw new Error("rollback floor must be a known secure digest");
    }
  }

  snapshot(): DeploymentState {
    return structuredClone(this.state);
  }

  async deploy(candidate: ImageCandidate): Promise<DeploymentState> {
    assertImageCandidate(candidate);
    const previous = structuredClone(this.state);
    const candidateSlot = previous.activeSlot === "blue" ? "green" : "blue";
    let candidateStarted = false;
    let promotionAttempted = false;
    let migrationFloorAdvanced = false;
    const candidateFloorMarker = rollbackCompatibilityFloorMarker(candidate.migrationMarker);
    try {
      await this.runtime.pull(candidate);
      const attestation = await this.runtime.runContainmentGate(candidate);
      if (!verifyGateAttestation(attestation, candidate, this.attestationKey)) {
        throw new Error("gate attestation mismatch");
      }
      const previousFloorImage = previous.secureHistory.find((image) => image.digest === previous.migrationCompatibilityFloorDigest);
      const previousFloorMarker = previous.migrationCompatibilityFloorMarker
        ?? (previousFloorImage ? rollbackCompatibilityFloorMarker(previousFloorImage.migrationMarker) : LEGACY_CONTAINMENT_MIGRATION_MARKER);
      if ((musicMigrationMarkerRank(candidateFloorMarker) ?? -1) > (musicMigrationMarkerRank(previousFloorMarker) ?? -1)) {
        // The schema gate is irreversible even if candidate readiness or
        // promotion later fails. Preserve this floor while old traffic stays
        // serving so no subsequent rollback can start a pre-schema image.
        migrationFloorAdvanced = true;
        this.state = { ...previous, migrationCompatibilityFloorDigest: candidate.digest, migrationCompatibilityFloorMarker: candidateFloorMarker };
      }
      await this.runtime.startPrivateCandidate(candidateSlot, candidate);
      candidateStarted = true;
      if (!await this.runtime.checkReadiness(candidateSlot, candidate, attestation)) {
        throw new Error("candidate readiness failed");
      }
      promotionAttempted = true;
      await this.runtime.promoteAtomically(candidateSlot, candidate);
      this.state = {
        ...previous,
        activeSlot: candidateSlot,
        active: candidate,
        secureHistory: previous.secureHistory.some((image) => image.digest === candidate.digest)
          ? previous.secureHistory
          : [...previous.secureHistory, candidate],
        migrationCompatibilityFloorDigest: migrationFloorAdvanced
          ? candidate.digest
          : previous.migrationCompatibilityFloorDigest,
        migrationCompatibilityFloorMarker: migrationFloorAdvanced
          ? candidateFloorMarker
          : previous.migrationCompatibilityFloorMarker,
      };
      return this.snapshot();
    } catch (error) {
      this.state = migrationFloorAdvanced
        ? { ...previous, migrationCompatibilityFloorDigest: candidate.digest, migrationCompatibilityFloorMarker: candidateFloorMarker }
        : previous;
      if (candidateStarted) {
        if (promotionAttempted) await this.runtime.restoreTraffic(previous.activeSlot, previous.active);
        await this.runtime.stopCandidate(candidateSlot);
      }
      throw error;
    }
  }

  async rollback(targetDigest: string): Promise<DeploymentState> {
    const targetIndex = this.state.secureHistory.findIndex((image) => image.digest === targetDigest);
    if (targetIndex < 0) throw new Error("rollback refused: unknown secure digest");
    const floorIndex = this.state.secureHistory.findIndex((image) => image.digest === this.state.rollbackFloorDigest);
    if (targetIndex < floorIndex) throw new Error("rollback refused: digest is older than rollback floor");
    const floorImage = this.state.secureHistory.find((image) => image.digest === this.state.migrationCompatibilityFloorDigest);
    const floorMarker = this.state.migrationCompatibilityFloorMarker
      ?? (floorImage ? rollbackCompatibilityFloorMarker(floorImage.migrationMarker) : undefined);
    if (floorMarker && (musicMigrationMarkerRank(rollbackCompatibilityFloorMarker(this.state.secureHistory[targetIndex].migrationMarker)) ?? -1)
        < (musicMigrationMarkerRank(floorMarker) ?? -1)) {
      throw new Error("rollback refused: digest is older than schema compatibility floor");
    }
    return this.deploy(this.state.secureHistory[targetIndex]);
  }
}

export function resolveMusicEntryPolicy(input: { killSwitch: boolean; cohortEnabled: boolean; inCohort: boolean }) {
  return {
    newMusicEntryEnabled: !input.killSwitch && (!input.cohortEnabled || input.inCohort),
    legacyMusicEntryEnabled: false,
  } as const;
}

export const MUSIC_COHORT_MAX_IDENTITIES = 100;
const MUSIC_COHORT_DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MUSIC_COHORT_MAX_CONFIGURATION_BYTES = MUSIC_COHORT_MAX_IDENTITIES * 129;

export interface MusicCohortConfiguration {
  enabled: boolean;
  userDocumentIds: ReadonlySet<string>;
}

export function parseMusicCohortConfiguration(environment: NodeJS.ProcessEnv): MusicCohortConfiguration {
  const rawEnabled = environment.MUSIC_COHORT_ENABLED;
  if (rawEnabled !== undefined && rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error("MUSIC_COHORT_ENABLED must be exactly true or false");
  }
  const enabled = rawEnabled === "true";
  if (!enabled) return { enabled: false, userDocumentIds: new Set() };

  const rawIdentities = environment.MUSIC_COHORT_USER_DOCUMENT_IDS ?? "";
  if (Buffer.byteLength(rawIdentities, "utf8") > MUSIC_COHORT_MAX_CONFIGURATION_BYTES) {
    throw new Error(`MUSIC_COHORT_USER_DOCUMENT_IDS must contain at most ${MUSIC_COHORT_MAX_IDENTITIES} document IDs`);
  }
  if (!rawIdentities.trim()) return { enabled: true, userDocumentIds: new Set() };
  const identities = rawIdentities.split(",").map((value) => value.trim());
  if (identities.length > MUSIC_COHORT_MAX_IDENTITIES) {
    throw new Error(`MUSIC_COHORT_USER_DOCUMENT_IDS must contain at most ${MUSIC_COHORT_MAX_IDENTITIES} document IDs`);
  }
  if (identities.some((value) => !MUSIC_COHORT_DOCUMENT_ID.test(value))) {
    throw new Error("MUSIC_COHORT_USER_DOCUMENT_IDS contains an invalid document ID");
  }
  const unique = new Set(identities);
  if (unique.size !== identities.length) {
    throw new Error("MUSIC_COHORT_USER_DOCUMENT_IDS must contain unique document IDs");
  }
  return { enabled: true, userDocumentIds: unique };
}

export function createMusicCohortEntryResolver(input: {
  killSwitch: () => boolean;
  cohort: MusicCohortConfiguration;
  resolveIdentity: (proof: string, requestId: string) => Promise<{ userDocumentId: string }>;
}): (proof: string, requestId: string) => Promise<boolean> {
  return async (proof, requestId) => {
    if (input.killSwitch()) return false;
    if (!input.cohort.enabled) return true;
    if (input.cohort.userDocumentIds.size === 0) return false;
    const identity = await input.resolveIdentity(proof, requestId);
    return resolveMusicEntryPolicy({
      killSwitch: false,
      cohortEnabled: true,
      inCohort: input.cohort.userDocumentIds.has(identity.userDocumentId),
    }).newMusicEntryEnabled;
  };
}

export function livenessStatus() {
  return { live: true as const };
}

export type ReadinessResult = (ImageCandidate & { ready: true }) | (Partial<ImageCandidate> & { ready: false; reason: string });

export async function evaluateReadiness(input: {
  image: ImageCandidate;
  attestation: GateAttestation | undefined;
  attestationKey: string;
  requiredSecrets: Record<string, string | undefined>;
  upstreamUrls: Record<string, string | undefined>;
  databasePing: () => Promise<boolean>;
  migrationState?: () => Promise<{ ready: boolean; currentId?: string; currentChecksum?: string }>;
}): Promise<ReadinessResult> {
  try {
    assertImageCandidate(input.image);
  } catch {
    return { ready: false, reason: "image-metadata-invalid" };
  }
  if (Object.values(input.requiredSecrets).some((value) => !value || value.length < 16)) {
    return { ready: false, reason: "mandatory-secret-missing", ...input.image };
  }
  try {
    for (const value of Object.values(input.upstreamUrls)) {
      if (!value) throw new Error("missing");
      const url = new URL(value);
      if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("unsafe");
    }
  } catch {
    return { ready: false, reason: "upstream-config-invalid", ...input.image };
  }
  if (!await input.databasePing().catch(() => false)) {
    return { ready: false, reason: "database-unreachable", ...input.image };
  }
  if (input.image.migrationMarker === CURRENT_MIGRATION_MARKER) {
    let state: { ready: boolean; currentId?: string; currentChecksum?: string } | undefined;
    try { state = await input.migrationState?.(); }
    catch { state = { ready: false }; }
    if (!state?.ready || state.currentId !== CURRENT_MIGRATION_MARKER
      || state.currentChecksum !== input.attestation?.migrationChecksum) {
      return { ready: false, reason: "migration-state-invalid", ...input.image };
    }
  }
  if (!input.attestation || !verifyGateAttestation(input.attestation, input.image, input.attestationKey)) {
    return { ready: false, reason: "gate-attestation-mismatch", ...input.image };
  }
  return { ready: true, ...input.image };
}

export function auditDeploymentAuthority(files: {
  ciWorkflow: string;
  deployWorkflow: string;
  deployExecutable: string;
  deployEngine: string;
  rootCompose: string;
  tunesCompose: string;
  fixtureCompose: string;
}): string[] {
  const issues: string[] = [];
  const uncomment = (source: string) => source.split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const ciWorkflow = uncomment(files.ciWorkflow);
  const deployWorkflow = uncomment(files.deployWorkflow);
  const deployWrapper = uncomment(files.deployExecutable);
  const deployEngine = uncomment(files.deployEngine);
  const deployExecutable = `${deployWrapper}\n${deployEngine}`;
  const rootCompose = uncomment(files.rootCompose);
  const tunesCompose = uncomment(files.tunesCompose);
  const fixtureCompose = uncomment(files.fixtureCompose);
  const requireText = (source: string, needle: string, issue: string) => {
    if (!source.includes(needle)) issues.push(issue);
  };
  requireText(ciWorkflow, "explorers-tunes", "CI must publish explorers-tunes");
  requireText(ciWorkflow, "docker/build-push-action@", "CI must have one documented image build");
  requireText(ciWorkflow, "anchore/scan-action@", "CI must scan the built image before push");
  requireText(ciWorkflow, "digest:", "CI must propagate the pushed digest");
  if (/explorers-tunes:latest|tags:[^\n]*latest/.test(ciWorkflow)) issues.push("CI must not publish a mutable tag");
  requireText(deployWorkflow, "workflow_call:", "deploy authority must be reusable from CI");
  requireText(deployWorkflow, "tunes/deployment/music-deploy.sh", "workflow must invoke the checked-in deploy executable");
  requireText(deployWrapper, "production-ghcr-v1", "production deploy wrapper must enforce GHCR policy");
  requireText(deployWrapper, 'source "$engine_file"', "production deploy wrapper must invoke the shared engine");
  requireText(deployExecutable, "music-router.yml", "deploy must atomically manage the Music route");
  requireText(deployExecutable, EXPECTED_MUSIC_MIGRATION_ID, "deploy must run the exact schema migration gate");
  requireText(deployExecutable, "/health/ready", "deploy must gate promotion on readiness");
  requireText(deployExecutable, "transaction_current", "deploy must recover through a durable transaction journal");
  for (const forbidden of ["scp-action", "docker compose down", "--build", "build-push-action"]) {
    if (deployWorkflow.includes(forbidden) || deployExecutable.includes(forbidden)) issues.push(`deploy authority contains forbidden operation ${forbidden}`);
  }
  for (const name of ["tunes-blue:", "tunes-green:", "tunes-gate:", "--providers.file.directory=/deployment-routing"]) {
    requireText(rootCompose, name, `root Compose missing ${name}`);
  }
  if (/ghcr\.io\/[^\n]+:(?:latest|\$\{IMAGE_TAG)/.test(rootCompose)) issues.push("root Compose contains a mutable Tunes image");
  if (!/POSTGRES_PASSWORD_FILE:\s*\/run\/secrets\/music-db-migrator/.test(rootCompose)
      || !/\$\{DB_MIGRATOR_PASSWORD_FILE_HOST:\?[^}]+\}:\/run\/secrets\/music-db-migrator:ro/.test(rootCompose)
      || /POSTGRES_PASSWORD:\s|DATABASE_URL:\s*postgres/.test(rootCompose)) {
    issues.push("database credentials must fail closed");
  }
  const dbSection = rootCompose.match(/\n  db:\n([\s\S]*?)(?=\n  [a-zA-Z][\w-]*:\n)/)?.[1] ?? "";
  if (/\n\s+ports:/.test(dbSection)) issues.push("production database must not publish a port");
  requireText(tunesCompose, "status: superseded", "Tunes Compose must be explicitly superseded");
  requireText(tunesCompose, "services: {}", "superseded Tunes Compose must be non-runnable");
  requireText(fixtureCompose, "name: explorers-music-fixture", "music-test Compose must remain disposable authority");
  return issues;
}
