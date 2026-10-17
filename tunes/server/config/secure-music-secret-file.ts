import { createHash, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve } from "node:path";

const DEFAULT_MAX_SECRET_FILE_BYTES = 256;
const ABSOLUTE_MAX_SECRET_FILE_BYTES = 512;

export interface SecureMusicSecretFileSystem {
  lstat(path: string): Promise<BigIntStats>;
  open(path: string, flags: number): Promise<FileHandle>;
  realpath?(path: string): Promise<string>;
}

export type WindowsSecretSecurityInspection = (paths: readonly string[]) => string;

export interface SecureMusicSecretFileOptions {
  mode: "live" | "fixture";
  /** Explicit subprocess authority for isolated launchers; omitted preserves existing callers. */
  childEnvironment?: NodeJS.ProcessEnv;
  fileSystem?: SecureMusicSecretFileSystem;
  platform?: NodeJS.Platform;
  effectiveUserId?: number;
  requireDistinctValues?: boolean;
  expectedAuthorityValues?: readonly (string | undefined)[];
  /** The default remains 256; callers must opt in to the bounded 512-byte reader-token allowance. */
  maxBytes?: number;
  windowsSecurityInspection?: WindowsSecretSecurityInspection;
}

export interface SecureMusicSecretAuthorityEvidence {
  nativeDev: string;
  nativeIno: string;
  digest: string;
}

export interface SecureMusicReconciliationAuthorities {
  reconciliationToken: string;
  evidence: {
    reconciliation: SecureMusicSecretAuthorityEvidence;
    lifecycleProof: SecureMusicSecretAuthorityEvidence;
    access: SecureMusicSecretAuthorityEvidence;
  };
}

const defaultFileSystem: SecureMusicSecretFileSystem = {
  lstat: (path) => lstat(path, { bigint: true }),
  open: (path, flags) => open(path, flags),
  realpath,
};

export async function readSecureMusicSecretFile(
  path: string,
  options: SecureMusicSecretFileOptions,
): Promise<string> {
  return readSecureMusicSecretFileWithDistinctAuthorities(path, [], options);
}

interface OpenedSecureMusicSecretFile {
  path: string;
  handle: FileHandle;
  opened: BigIntStats;
  ancestorPaths: string[];
  ancestorBefore: BigIntStats[];
}

export async function readSecureMusicSecretFileWithDistinctAuthorities(
  path: string,
  authorityPaths: readonly string[],
  options: SecureMusicSecretFileOptions,
): Promise<string> {
  return (await readSecureMusicSecretAuthorityBundle(path, authorityPaths, options)).values[0] ?? invalidSecretFile();
}

export async function readSecureMusicReconciliationAuthorities(
  paths: {
    reconciliationTokenFile: string;
    lifecycleProofTokenFile: string;
    accessTokenFile: string;
  },
  actualAccessToken: string,
  options: SecureMusicSecretFileOptions,
): Promise<SecureMusicReconciliationAuthorities> {
  const bundle = await readSecureMusicSecretAuthorityBundle(
    paths.reconciliationTokenFile,
    [paths.lifecycleProofTokenFile, paths.accessTokenFile],
    {
      ...options,
      requireDistinctValues: true,
      expectedAuthorityValues: [undefined, undefined, actualAccessToken],
    },
  );
  const [reconciliation, lifecycleProof, access] = bundle.evidence;
  if (!reconciliation || !lifecycleProof || !access || !bundle.values[0]
      || bundle.values.some((value) => value.length < 16 || value.length > DEFAULT_MAX_SECRET_FILE_BYTES)) {
    return invalidSecretFile();
  }
  return {
    reconciliationToken: bundle.values[0],
    evidence: { reconciliation, lifecycleProof, access },
  };
}

async function readSecureMusicSecretAuthorityBundle(
  path: string,
  authorityPaths: readonly string[],
  options: SecureMusicSecretFileOptions,
): Promise<{ values: string[]; evidence: SecureMusicSecretAuthorityEvidence[] }> {
  const openedFiles: OpenedSecureMusicSecretFile[] = [];
  const buffers: Buffer[] = [];
  try {
    const maxBytes = resolveMaxSecretFileBytes(options);
    const fileSystem = options.fileSystem ?? defaultFileSystem;
    for (const candidate of [path, ...authorityPaths]) {
      openedFiles.push(await openSecureMusicSecretFile(candidate, options, fileSystem));
    }
    const nativeIdentities = openedFiles.map(({ opened }) => `${opened.dev}:${opened.ino}`);
    if (new Set(nativeIdentities).size !== nativeIdentities.length) return invalidSecretFile();
    const windowsSecurityBefore = inspectWindowsSecretSecurities(openedFiles, options);

    const values: string[] = [];
    const evidence: SecureMusicSecretAuthorityEvidence[] = [];
    for (const opened of openedFiles) {
      const buffer = Buffer.alloc(maxBytes + 1);
      buffers.push(buffer);
      const { bytesRead } = await opened.handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maxBytes || bytesRead !== Number(opened.opened.size)) return invalidSecretFile();
      const raw = buffer.subarray(0, bytesRead).toString("ascii");
      if (!/^[A-Za-z0-9_-]+\n?$/.test(raw)) return invalidSecretFile();
      const value = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
      if (!value || Buffer.byteLength(value, "ascii") !== value.length) return invalidSecretFile();
      values.push(value);
      evidence.push({
        nativeDev: String(opened.opened.dev),
        nativeIno: String(opened.opened.ino),
        digest: createHash("sha256").update(value).digest("hex"),
      });
    }
    for (const opened of openedFiles) await revalidateSecureMusicSecretFile(opened, options, fileSystem);
    const windowsSecurityAfter = inspectWindowsSecretSecurities(openedFiles, options);
    if (windowsSecurityBefore !== windowsSecurityAfter) return invalidSecretFile();
    if (options.requireDistinctValues) {
      for (let left = 0; left < values.length; left += 1) {
        for (let right = left + 1; right < values.length; right += 1) {
          if (sameSecretValue(values[left]!, values[right]!)) return invalidSecretFile();
        }
      }
    }
    if (options.expectedAuthorityValues) {
      if (options.expectedAuthorityValues.length !== values.length) return invalidSecretFile();
      for (let index = 0; index < values.length; index += 1) {
        const expected = options.expectedAuthorityValues[index];
        if (expected !== undefined && !sameSecretValue(values[index]!, expected)) return invalidSecretFile();
      }
    }
    return { values, evidence };
  } catch {
    return invalidSecretFile();
  } finally {
    for (const buffer of buffers) buffer.fill(0);
    await Promise.all(openedFiles.map(({ handle }) => handle.close().catch(() => undefined)));
  }
}

function inspectWindowsSecretSecurities(
  openedFiles: readonly OpenedSecureMusicSecretFile[],
  options: SecureMusicSecretFileOptions,
): string {
  if (options.mode !== "live" || (options.platform ?? process.platform) !== "win32") return "not-required";
  const expected = new Map<string, BigIntStats>();
  for (const opened of openedFiles) {
    const immediateParentIndex = opened.ancestorPaths.length - 1;
    const immediateParentPath = opened.ancestorPaths[immediateParentIndex];
    const immediateParentMetadata = opened.ancestorBefore[immediateParentIndex];
    if (!immediateParentPath || !immediateParentMetadata) return invalidSecretFile();
    expected.set(immediateParentPath, immediateParentMetadata);
    expected.set(opened.path, opened.opened);
  }
  const paths = Array.from(expected.keys());
  const helper = resolve(import.meta.dirname, "../../scripts/windows-write-through.ps1");
  const output = options.windowsSecurityInspection
    ? options.windowsSecurityInspection(paths)
    : execFileSync("powershell.exe", [
        // -ExecutionPolicy Bypass: a Restricted policy refuses a -File script before its
        // first line, so this returns EMPTY output and the line-count check below then
        // reports the secret file as insecure -- a refusal that is really "the inspector
        // never ran". Reproduced both directions locally. No inspection is relaxed.
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", helper, "inspect-security", ...paths,
      ], {
        encoding: "utf8",
        windowsHide: true,
        ...(options.childEnvironment ? { env: options.childEnvironment } : {}),
      });
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== paths.length) return invalidSecretFile();
  const normalized: string[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    const security = JSON.parse(lines[index]!) as Record<string, unknown>;
    const metadata = expected.get(paths[index]!);
    if (!metadata || typeof security.nativeDev !== "string" || typeof security.nativeIno !== "string"
        || !/^\d+$/.test(security.nativeDev) || !/^\d+$/.test(security.nativeIno)
        || BigInt(security.nativeDev) !== metadata.dev || BigInt(security.nativeIno) !== metadata.ino
        || security.ownerMatchesEffectiveUser !== true
        || security.unsafeWritePrincipalCount !== 0) {
      return invalidSecretFile();
    }
    normalized.push(JSON.stringify(security));
  }
  return normalized.join("\n");
}

function sameSecretValue(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

async function openSecureMusicSecretFile(
  path: string,
  options: SecureMusicSecretFileOptions,
  fileSystem: SecureMusicSecretFileSystem,
): Promise<OpenedSecureMusicSecretFile> {
  if (!path || path.length > 512 || path.includes("\0") || !isAbsolute(path)) return invalidSecretFile();
  const ancestorPaths = ancestors(path);
  const ancestorBefore = await Promise.all(ancestorPaths.map(async (ancestor) => {
    const stat = await fileSystem.lstat(ancestor);
    validateDirectoryMetadata(stat);
    return stat;
  }));
  const canonicalBefore = await (fileSystem.realpath ?? defaultFileSystem.realpath!)(path);
  if (!sameResolvedPath(canonicalBefore, path, options.platform ?? process.platform)) return invalidSecretFile();
  const before = await fileSystem.lstat(path);
  validateMetadata(before, options);
  const noFollow = options.platform === "win32" || process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const handle = await fileSystem.open(path, constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat({ bigint: true });
    validateMetadata(opened, options);
    if (!sameMetadata(before, opened)) return invalidSecretFile();
    return { path, handle, opened, ancestorPaths, ancestorBefore };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

async function revalidateSecureMusicSecretFile(
  openedFile: OpenedSecureMusicSecretFile,
  options: SecureMusicSecretFileOptions,
  fileSystem: SecureMusicSecretFileSystem,
): Promise<void> {
  const afterRead = await openedFile.handle.stat({ bigint: true });
  const afterPath = await fileSystem.lstat(openedFile.path);
  const ancestorAfter = await Promise.all(openedFile.ancestorPaths.map(async (ancestor) => {
    const stat = await fileSystem.lstat(ancestor);
    validateDirectoryMetadata(stat);
    return stat;
  }));
  const canonicalAfter = await (fileSystem.realpath ?? defaultFileSystem.realpath!)(openedFile.path);
  validateMetadata(afterRead, options);
  validateMetadata(afterPath, options);
  if (!sameMetadata(openedFile.opened, afterRead)
      || !sameMetadata(openedFile.opened, afterPath)
      || !sameResolvedPath(canonicalAfter, openedFile.path, options.platform ?? process.platform)
      || openedFile.ancestorBefore.some((stat, index) => !sameDirectoryIdentity(stat, ancestorAfter[index]))) {
    return invalidSecretFile();
  }
}

function ancestors(path: string): string[] {
  const root = parse(path).root;
  const result: string[] = [];
  let current = dirname(path);
  while (true) {
    result.push(current);
    if (current === root) break;
    const parent = dirname(current);
    if (parent === current) return invalidSecretFile();
    current = parent;
  }
  return result.reverse();
}

function validateDirectoryMetadata(stat: BigIntStats): void {
  if (!stat.isDirectory() || stat.isSymbolicLink()) invalidSecretFile();
}

function sameDirectoryIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid;
}

function sameResolvedPath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalize = (value: string) => resolve(value).replace(/^\\\\\?\\/, "");
  const leftResolved = normalize(left);
  const rightResolved = normalize(right);
  return platform === "win32" ? leftResolved.toLowerCase() === rightResolved.toLowerCase() : leftResolved === rightResolved;
}

function validateMetadata(stat: BigIntStats, options: SecureMusicSecretFileOptions): void {
  const maxBytes = resolveMaxSecretFileBytes(options);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1)
      || stat.size < BigInt(1) || stat.size > BigInt(maxBytes)) {
    invalidSecretFile();
  }
  if (options.mode !== "live") return;
  if ((options.platform ?? process.platform) === "win32") return;
  if ((stat.mode & BigInt(0o077)) !== BigInt(0)) invalidSecretFile();
  const effectiveUserId = options.effectiveUserId ?? process.geteuid?.();
  if (stat.uid !== BigInt(0) && (effectiveUserId === undefined || stat.uid !== BigInt(effectiveUserId))) {
    invalidSecretFile();
  }
}

function resolveMaxSecretFileBytes(options: SecureMusicSecretFileOptions): number {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SECRET_FILE_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 16 || maxBytes > ABSOLUTE_MAX_SECRET_FILE_BYTES) invalidSecretFile();
  return maxBytes;
}

function sameMetadata(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function invalidSecretFile(): never {
  throw new Error("Music token secret file is insecure or invalid");
}
