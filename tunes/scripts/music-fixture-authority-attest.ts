import path from "node:path";
import { pathToFileURL } from "node:url";
import { attestRetiredFixtureMusicAuthority } from "./music-fixture-secret.ts";

interface FixtureAuthorityAttestationIo {
  arguments: string[];
  repositoryRoot: string;
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}

export function runFixtureAuthorityAttestation(input: FixtureAuthorityAttestationIo): number {
  if (!Array.isArray(input.arguments) || input.arguments.length !== 0) {
    input.stderr("Fixture authority attestation refused; invoke the fixed repository command with no arguments.\n");
    return 2;
  }
  try {
    const attestation = attestRetiredFixtureMusicAuthority(input.repositoryRoot);
    input.stdout(`${JSON.stringify(attestation)}\n`);
    return 0;
  } catch {
    input.stderr("Fixture authority attestation refused; state is not bootstrap-safe.\n");
    return 1;
  }
}

function main(): number {
  return runFixtureAuthorityAttestation({
    arguments: process.argv.slice(2),
    repositoryRoot: path.resolve(import.meta.dirname, "../.."),
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  });
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main();
}
