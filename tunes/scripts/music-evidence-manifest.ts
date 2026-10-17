import { createHash, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

interface EvidenceManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

function fail(message: string): never {
  throw new Error(message);
}

function portableRelativePath(root: string, path: string): string {
  const value = relative(root, path).split(sep).join("/");
  if (!value || value.startsWith("../") || value.includes("\t") || /[\r\n\0]/.test(value)) {
    fail("evidence path is not canonically serializable");
  }
  return value;
}

export function collectMusicEvidenceManifest(rootInput: string): EvidenceManifestEntry[] {
  const root = resolve(rootInput);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("evidence root must be a regular directory");
  const entries: EvidenceManifestEntry[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = resolve(directory, name);
      const observed = lstatSync(path);
      if (observed.isSymbolicLink()) fail("evidence tree cannot contain symbolic links");
      if (observed.isDirectory()) {
        walk(path);
        continue;
      }
      if (!observed.isFile()) fail("evidence tree can contain only regular files and directories");
      const bytes = statSync(path).size;
      entries.push({
        path: portableRelativePath(root, path),
        bytes,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      });
    }
  };
  walk(root);
  return entries.sort((left, right) => Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8")));
}

export function serializeMusicEvidenceManifest(entries: readonly EvidenceManifestEntry[]): string {
  return entries.map((entry) => `${entry.path}\t${entry.bytes}\t${entry.sha256}`).join("\n");
}

export function musicEvidenceManifestDigest(serialized: string): string {
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

function canonicalManifest(root: string): { serialized: string; files: number; sha256: string } {
  const entries = collectMusicEvidenceManifest(root);
  const serialized = serializeMusicEvidenceManifest(entries);
  return { serialized, files: entries.length, sha256: musicEvidenceManifestDigest(serialized) };
}

function requireManifestOutsideEvidenceRoot(rootInput: string, manifestInput: string): { root: string; manifest: string } {
  const root = resolve(rootInput);
  const manifest = resolve(manifestInput);
  const relationship = relative(root, manifest);
  if (!relationship.startsWith(`..${sep}`) && relationship !== "..") {
    fail("manifest must remain outside the evidence root");
  }
  return { root, manifest };
}

function writeCanonicalManifest(rootInput: string, manifestInput: string): { files: number; sha256: string } {
  const { root, manifest } = requireManifestOutsideEvidenceRoot(rootInput, manifestInput);
  const canonical = canonicalManifest(root);
  mkdirSync(dirname(manifest), { recursive: true, mode: 0o700 });
  const temporary = `${manifest}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, canonical.serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
    chmodSync(temporary, 0o600);
    renameSync(temporary, manifest);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { files: canonical.files, sha256: canonical.sha256 };
}

function verifyCanonicalManifest(rootInput: string, manifestInput: string): { files: number; sha256: string } {
  const { root, manifest } = requireManifestOutsideEvidenceRoot(rootInput, manifestInput);
  const observedStat = lstatSync(manifest);
  if (!observedStat.isFile() || observedStat.isSymbolicLink()) fail("evidence manifest must be a regular file");
  const observed = readFileSync(manifest);
  const canonical = canonicalManifest(root);
  const expected = Buffer.from(canonical.serialized, "utf8");
  if (observed.length !== expected.length || !timingSafeEqual(observed, expected)) {
    fail("evidence manifest verification failed");
  }
  return { files: canonical.files, sha256: canonical.sha256 };
}

function main(): void {
  const [operation, root, manifest, ...extra] = process.argv.slice(2);
  if (extra.length || !root || !manifest || (operation !== "create" && operation !== "verify")) {
    fail("usage: music-evidence-manifest <create|verify> <evidence-root> <manifest-file>");
  }
  const result = operation === "create"
    ? writeCanonicalManifest(root, manifest)
    : verifyCanonicalManifest(root, manifest);
  process.stdout.write(`${JSON.stringify({ schemaVersion: "music-evidence-manifest/v1", ...result })}\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown failure";
  process.stderr.write(`music evidence manifest error: ${message}\n`);
  process.exitCode = 1;
}
