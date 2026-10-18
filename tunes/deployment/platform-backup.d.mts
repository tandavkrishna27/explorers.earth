// Types for platform-backup.mjs, which stays dependency-free JavaScript because it
// runs on the host with nothing but Node. Imported by the restore drill, the local
// fixture and the contract tests.
import type { SpawnSyncOptions } from "node:child_process";

export type RunCommand = (file: string, args: string[], options?: SpawnSyncOptions & { encoding?: string }) => any;
export interface Command { file: string; args: string[] }
export interface TarEntry { name: string; bytes: Buffer; mode?: number; uid?: number; gid?: number; mtime?: number }
export interface ReadTarEntry { name: string; bytes: Buffer; mode: number; uid: number; gid: number }
export interface MediaInventoryRow { media_id?: string; object_key: string; bytes: number; sha256: string; version: string | null }
export interface RetentionEntry { key: string; completedAt: string; reason: string }

export const AWS_CLI_IMAGE: string;
export const AGE_BASE_IMAGE: string;
export const AGE_PACKAGE: string;
export const AGE_IMAGE: string;
export const DEFAULT_COMPOSE_PROJECT: string;
export const SECRET_FILE_VARIABLES: readonly string[];
export const ROW_COUNT_QUERY: string;
export const JOURNAL_HEAD_QUERY: string;
export const MEDIA_INVENTORY_QUERY: string;
export const RETENTION: { scheduledDays: number; preDeployDays: number; monthlyCount: number };

export class BackupRefusal extends Error {}

export function parseEnvFile(text: string): Map<string, string>;
export function assertAgeRecipient(recipient: string | undefined): string;
export function parseBackupCommand(args: string[]): {
  environment: "prod" | "local"; reason: "scheduled" | "pre-deploy" | "manual"; prune: boolean;
  candidateDigest?: string; candidateCommit?: string; outputManifest?: string;
};
export function preflight(root: string, environment: "prod" | "local"): { root: string; values: Map<string, string> };
export const runCommand: RunCommand;
export function findPostgresContainer(project: string, run?: RunCommand): string;
export function buildDumpCommand(input: { values: Map<string, string>; containerId: string; snapshot: string }): Command;
export function buildGlobalsCommand(input: { values: Map<string, string>; containerId: string }): Command;
export function assertDumpIsRestorable(bytes: Buffer): true;
export class SnapshotSession {
  constructor(containerId: string, values: Map<string, string>);
  query(sql: string): Promise<string>;
  close(): Promise<void>;
}
export function buildConfigurationEntries(input: { root: string; values: Map<string, string> }): Array<{ path: string; name: string }>;
export function readHostEntries(entries: Array<{ path: string; name: string }>): TarEntry[];
export function writeTar(path: string, entries: TarEntry[]): string;
export function readTar(bytes: Buffer): ReadTarEntry[];
export function sha256Hex(bytes: Buffer | string): string;
export function parseMediaInventory(text: string, environment: string): MediaInventoryRow[];
export function awsEnvironment(values: Map<string, string>): NodeJS.ProcessEnv;
export function backupMediaKey(sourceKey: string, destinationPrefix: string): string;
export function buildMediaCopyCommand(input: { bucket: string; sourceKey: string; destinationPrefix: string }): Command & { destinationKey: string };
export function assertMediaInventoryComplete(inventory: ReadonlyArray<{ object_key: string }>, outcome: { copied: string[]; failed: string[] }): true;
export function ensureAgeImage(run?: RunCommand): void;
export function buildEncryptCommand(input: { recipient: string; directory: string; inputName: string; outputName: string }): Command;
export function buildDecryptCommand(input: { identityPath: string; directory: string; inputName: string; outputName: string }): Command;
export function buildUploadCommand(input: { bucket: string; localPath: string; key: string }): Command;
export function buildManifest<T extends { members?: Array<{ name: string }> }>(input: T): T & { version: "explorers-platform-backup/v1"; complete: true };
export function writeJson(path: string, value: unknown): string;
export function runIdentifier(): string;
export function runFolderName(startedAt: Date, reason: string, runId: string): string;
export function parseRunFolder(name: string): { completedAt: string; reason: string } | undefined;
export function planRetention<T extends RetentionEntry>(runs: T[], options: { now: number }): { keep: T[]; delete: T[] };
export function applyRetention(plan: { delete: RetentionEntry[]; keep: RetentionEntry[] }, options: { remove: (prefix: string) => void }):
  { pruned: number; gate?: "BACKUP_DELETE_PERMISSION_UNAVAILABLE" };
export function resolveRunningImage(project: string, run?: RunCommand): { digest: string; commit: string };
export function main(argv: string[], options?: { run?: RunCommand; now?: () => Date }): Promise<unknown>;
