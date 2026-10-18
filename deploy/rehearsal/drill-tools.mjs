// Small helpers for rehearse.sh's backup stage.
//
//   node drill-tools.mjs receipt-path        a fresh receipt directory the restore drill accepts
//   node drill-tools.mjs timings <receipt>   the drill's phases and the total recovery time
//   tsx  drill-tools.mjs gate <local manifest> <receipt>...
//        what the deploy gate (verifyRecoveryEvidence) says about this backup, relabelled
//        as a prod backup (the gate admits nothing else), with each receipt. Run from tunes/.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [command, ...args] = process.argv.slice(2);

if (command === "receipt-path") {
  console.log(join(tmpdir(), `platform-restore-drill-rehearsal-${randomBytes(4).toString("hex")}`));
} else if (command === "timings") {
  const receipt = JSON.parse(readFileSync(args[0], "utf8"));
  const total = receipt.phases.reduce((sum, phase) => sum + phase.milliseconds, 0);
  for (const phase of receipt.phases) console.log(`${phase.phase.padEnd(22)} ${String(phase.milliseconds).padStart(7)} ms`);
  console.log(`${"total".padEnd(22)} ${String(total).padStart(7)} ms`);
  console.log(`result ${receipt.result}; marker ${receipt.migrationMarker}; cleanup ${receipt.cleanup}`);
  if (receipt.result !== "passed") process.exitCode = 1;
} else if (command === "gate") {
  const { verifyRecoveryEvidence } = await import(pathToFileURL(resolve("shared/platformRecoveryContract.ts")).href);
  const [manifestPath, ...receipts] = args;
  const local = JSON.parse(readFileSync(manifestPath, "utf8"));
  const prod = JSON.parse(JSON.stringify(local).replaceAll("local/backups/", "prod/backups/"));
  prod.environment = "prod";
  const candidate = { digest: local.imageDigest, commit: local.sourceCommit, migrationMarker: local.migrationMarker };
  console.log(`backup at ${local.migrationMarker}`);
  for (const path of receipts) {
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    const outcome = verifyRecoveryEvidence({ manifest: prod, receipt, candidate, now: Date.now() });
    console.log(`receipt drilled at ${receipt.migrationMarker} (${path.replace(/.*[\\/](docs|platform-restore-drill)/, "$1")}) -> ${JSON.stringify(outcome)}`);
  }
} else {
  console.error("usage: drill-tools.mjs receipt-path | timings <receipt.json> | gate <manifest> <receipt>...");
  process.exitCode = 2;
}
