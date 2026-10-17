import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectMusicPublicCanary, evaluateMusicPublicCanary } from "../server/observability/musicPublicCanary";

const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  process.stderr.write("Usage: npm run music:public-canary -- <sanitized-jsonl-path>\n");
  process.exit(2);
}
const events = readFileSync(resolve(input), "utf8").split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return JSON.parse(line); } catch { throw new Error(`Invalid JSONL record ${index + 1}`); }
});
const measurements = collectMusicPublicCanary(events);
const result = evaluateMusicPublicCanary(measurements);
process.stdout.write(`${JSON.stringify({ version: "music-public-canary/v1", measurements, ...result }, (_key, value) =>
  typeof value === "number" && !Number.isFinite(value) ? "missing" : value)}\n`);
process.exitCode = result.action === "promote" ? 0 : result.action === "contain" ? 1 : 2;
