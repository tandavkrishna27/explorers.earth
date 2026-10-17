import { readFile, lstat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FAILURE = "Publication authority verification failed.";
const MAX_ENVIRONMENT_BYTES = 64 * 1024;
const MAX_AUTHORITY_BYTES = 4 * 1024;
const PUBLICATION_RESPONSE_RETENTION_MS = 86_400_000;
const PUBLICATION_CONTAINER_DIRECTORY = "/run/secrets/music-publication-response";
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fail() {
  throw new Error(FAILURE);
}

function parseEnvironment(source) {
  if (Buffer.byteLength(source, "utf8") > MAX_ENVIRONMENT_BYTES || source.includes("\0")) fail();
  const values = new Map();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail();
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || values.has(key)) fail();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function required(environment, name) {
  const value = environment.get(name);
  if (!value) fail();
  return value;
}

function hostPath(environmentPath, value) {
  return isAbsolute(value) ? value : resolve(dirname(environmentPath), value);
}

function configuredPreviousPublicationPath(publicationDirectory, configuredPath, kid, deadline, now) {
  const parsedDeadline = Date.parse(deadline);
  if (!KEY_ID_PATTERN.test(kid) || !UTC_MILLISECOND_PATTERN.test(deadline)
      || !Number.isFinite(parsedDeadline) || new Date(parsedDeadline).toISOString() !== deadline
      || parsedDeadline <= now || parsedDeadline > now + PUBLICATION_RESPONSE_RETENTION_MS
      || configuredPath.includes("\\") || !posix.isAbsolute(configuredPath)
      || posix.normalize(configuredPath) !== configuredPath) fail();
  const relative = posix.relative(PUBLICATION_CONTAINER_DIRECTORY, configuredPath);
  if (!relative || relative === ".." || relative.startsWith("../") || posix.isAbsolute(relative)) fail();
  return join(publicationDirectory, ...relative.split("/"));
}

async function authorityFile(path) {
  const metadata = await lstat(path, { bigint: true });
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1n || metadata.size > BigInt(MAX_AUTHORITY_BYTES)) fail();
  if (process.platform !== "win32") {
    const mode = Number(metadata.mode & 0o777n);
    if (mode !== 0o600 && mode !== 0o400) fail();
    if (typeof process.geteuid === "function" && metadata.uid !== BigInt(process.geteuid())) fail();
  }
  const value = await readFile(path, { flag: constants.O_RDONLY });
  const normalized = value.at(-1) === 0x0a
    ? value.subarray(0, value.at(-2) === 0x0d ? value.length - 2 : value.length - 1)
    : value;
  if (!normalized.length || normalized.includes(0)) fail();
  return { identity: `${metadata.dev}:${metadata.ino}`, value: Buffer.from(normalized) };
}

function publicationMaterial(authority) {
  const encoded = authority.value.toString("ascii");
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) fail();
  const decoded = Buffer.from(encoded, "base64url");
  if (decoded.length !== 32 || decoded.toString("base64url") !== encoded) fail();
  return { ...authority, decoded };
}

function aliases(publication, candidate) {
  return publication.identity === candidate.identity
    || publication.value.equals(candidate.value)
    || publication.decoded.equals(candidate.value);
}

export async function verifyPublicationAuthority(environmentFile, deploymentHmacFile, dependencies = {}) {
  try {
    if (!environmentFile || !deploymentHmacFile) fail();
    const environmentPath = resolve(environmentFile);
    const environment = parseEnvironment(await readFile(environmentPath, "utf8"));
    const now = (dependencies.now ?? Date.now)();
    if (!Number.isSafeInteger(now)) fail();
    const publicationCurrentKid = required(environment, "MUSIC_PUBLICATION_RESPONSE_CURRENT_KID");
    const tokenCurrentKid = required(environment, "MUSIC_TOKEN_CURRENT_KID");
    const tokenPreviousKid = environment.get("MUSIC_TOKEN_PREVIOUS_KID");
    if (!KEY_ID_PATTERN.test(publicationCurrentKid) || !KEY_ID_PATTERN.test(tokenCurrentKid)
        || (tokenPreviousKid && !KEY_ID_PATTERN.test(tokenPreviousKid))
        || publicationCurrentKid === tokenCurrentKid || publicationCurrentKid === tokenPreviousKid) fail();
    const publicationDirectory = hostPath(environmentPath, required(environment, "MUSIC_PUBLICATION_RESPONSE_KEY_DIRECTORY_HOST"));
    const publications = [publicationMaterial(await authorityFile(join(publicationDirectory, "current")))];
    const publicIdAuthority = publicationMaterial(await authorityFile(join(publicationDirectory, "public-id")));
    const previousPublicationFields = [
      environment.get("MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KID"),
      environment.get("MUSIC_PUBLICATION_RESPONSE_PREVIOUS_KEY_FILE"),
      environment.get("MUSIC_PUBLICATION_RESPONSE_PREVIOUS_ACCEPT_UNTIL"),
    ];
    if (previousPublicationFields.some(Boolean)) {
      if (!previousPublicationFields.every(Boolean)) fail();
      if (previousPublicationFields[0] === publicationCurrentKid
          || previousPublicationFields[0] === tokenCurrentKid
          || previousPublicationFields[0] === tokenPreviousKid) fail();
      publications.push(publicationMaterial(await authorityFile(configuredPreviousPublicationPath(
        publicationDirectory,
        previousPublicationFields[1],
        previousPublicationFields[0],
        previousPublicationFields[2],
        now,
      ))));
    }

    const tokenDirectory = hostPath(environmentPath, required(environment, "MUSIC_TOKEN_SECRET_DIRECTORY_HOST"));
    const filePaths = [
      join(tokenDirectory, "current"),
      hostPath(environmentPath, required(environment, "DB_RUNTIME_PASSWORD_FILE_HOST")),
      hostPath(environmentPath, required(environment, "DB_MIGRATOR_PASSWORD_FILE_HOST")),
      hostPath(environmentPath, required(environment, "STRAPI_LIFECYCLE_PROOF_TOKEN_FILE_HOST")),
      hostPath(environmentPath, required(environment, "STRAPI_RECONCILIATION_TOKEN_FILE_HOST")),
      resolve(deploymentHmacFile),
    ];
    const previousTokenFields = [
      environment.get("MUSIC_TOKEN_PREVIOUS_KID"),
      environment.get("MUSIC_TOKEN_PREVIOUS_SECRET_FILE"),
      environment.get("MUSIC_TOKEN_PREVIOUS_ACCEPT_UNTIL"),
    ];
    if (previousTokenFields.some(Boolean)) {
      if (!previousTokenFields.every(Boolean)) fail();
      filePaths.push(join(tokenDirectory, "previous"));
    }
    const fileAuthorities = await Promise.all(filePaths.map(authorityFile));
    const inlineAuthorities = [
      "SESSION_SECRET",
      "COOKIE_SECRET",
      "STRAPI_ACCESS_TOKEN",
      "STRAPI_JWT_SECRET",
      "MUSIC_GATE_ATTESTATION_KEY",
    ].map((name) => Buffer.from(required(environment, name), "utf8"));
    for (const name of ["MUSIC_SIGNING_KEY_CURRENT_SECRET", "MUSIC_SIGNING_KEY_PREVIOUS_SECRET", "STRAPI_API_KEY"]) {
      const value = environment.get(name);
      if (value) inlineAuthorities.push(Buffer.from(value, "utf8"));
    }

    const applicationKeyAuthorities = [...publications, publicIdAuthority];
    for (let index = 0; index < applicationKeyAuthorities.length; index += 1) {
      const authority = applicationKeyAuthorities[index];
      for (let other = 0; other < applicationKeyAuthorities.length; other += 1) {
        if (other !== index && aliases(authority, applicationKeyAuthorities[other])) fail();
      }
      for (const candidate of fileAuthorities) if (aliases(authority, candidate)) fail();
      for (const value of inlineAuthorities) {
        if (authority.value.equals(value) || authority.decoded.equals(value)) fail();
      }
    }
  } catch {
    fail();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  verifyPublicationAuthority(process.argv[2], process.argv[3]).catch(() => {
    process.stderr.write(`${FAILURE}\n`);
    process.exitCode = 1;
  });
}
