/**
 * The ticket-8.4 promotion gate. It resolves recovery evidence for the exact
 * candidate and fails closed. There is no flag that asserts the answer.
 *
 *   npm run platform:recovery-gate -- --manifest <pre-deploy manifest.json> \
 *     --receipt docs/replatform/evidence/recovery-receipt.json \
 *     --candidate-digest sha256:... --candidate-commit <40 hex> --candidate-marker <migration id>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRecoveryEvidence, type RecoveryEvidenceCode } from "../tunes/shared/platformRecoveryContract";

export function parseGateCommand(args: string[]) {
  const allowed = new Set(["--manifest", "--receipt", "--candidate-digest", "--candidate-commit", "--candidate-marker"]);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error("recovery gate arguments rejected");
    const value = args[index += 1];
    if (!value || value.startsWith("--") || values.has(flag)) throw new Error("recovery gate arguments rejected");
    values.set(flag, value);
  }
  const manifest = values.get("--manifest"), receipt = values.get("--receipt");
  const digest = values.get("--candidate-digest"), commit = values.get("--candidate-commit");
  const migrationMarker = values.get("--candidate-marker");
  if (!manifest || !receipt || !digest || !commit || !migrationMarker) throw new Error("recovery gate arguments rejected");
  if (!/^sha256:[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{40}$/.test(commit) || !/^[0-9]{4}_[a-z0-9_]+$/.test(migrationMarker)) {
    throw new Error("recovery gate arguments rejected");
  }
  return { manifest, receipt, candidate: { digest, commit, migrationMarker } };
}

export function evaluateGate(input: Parameters<typeof verifyRecoveryEvidence>[0]):
  { exitCode: 0 } | { exitCode: 1; code: RecoveryEvidenceCode } {
  const outcome = verifyRecoveryEvidence(input);
  return outcome.admitted ? { exitCode: 0 } : { exitCode: 1, code: outcome.code };
}

export function main(argv: string[]): number {
  const command = parseGateCommand(argv);
  const read = (path: string): unknown => {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch { return undefined; }
  };
  const outcome = evaluateGate({ manifest: read(command.manifest), receipt: read(command.receipt), candidate: command.candidate, now: Date.now() });
  if (outcome.exitCode !== 0) {
    process.stderr.write(`recovery evidence refused: ${outcome.code}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify({ recoveryEvidence: "admitted" })}\n`);
  return 0;
}

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "recovery gate failed"}\n`); process.exitCode = 1; }
}
