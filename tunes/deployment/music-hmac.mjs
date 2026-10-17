import { createHmac } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";

const keyPath = process.argv[2];
if (!keyPath || process.argv.length !== 3) throw new Error("usage: music-hmac.mjs <protected-key-path>");
const keyStat = lstatSync(keyPath);
if (!keyStat.isFile() || keyStat.isSymbolicLink()) throw new Error("HMAC key must be a regular file");
const key = readFileSync(keyPath);
if (key.length < 32 || key.length > 4096 || key.includes(10) || key.includes(13)) throw new Error("HMAC key is invalid");

const mac = createHmac("sha256", key);
let payloadBytes = 0;
for await (const chunk of process.stdin) {
  payloadBytes += chunk.length;
  if (payloadBytes > 16_384) throw new Error("HMAC payload is too large");
  mac.update(chunk);
}
process.stdout.write(`${mac.digest("hex")}\n`);
