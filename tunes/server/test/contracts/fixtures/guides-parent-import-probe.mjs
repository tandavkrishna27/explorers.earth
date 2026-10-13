import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../../../', import.meta.url)).replace(/[\\/]$/, '');
const require = createRequire(path.join(root, 'tunes/package.json'));
const compiler = fs.realpathSync(path.join(root, 'tunes/node_modules/tsx/node_modules/@esbuild/win32-x64/esbuild.exe'));
assert.equal(require('./node_modules/tsx/node_modules/esbuild/package.json').version, '0.25.12');
assert.equal(require('./node_modules/tsx/package.json').version, '4.21.0');
for (const [file, hash] of [
  ['client-BQVF1NaW.mjs', '334ad3dbfaf820eeb08dd2fa40750c8316e6f8a61311bdf99defd3c361fbece4'],
  ['get-pipe-path-BHW2eJdv.mjs', '307483caa22c2406677b4bd513bf602b4de3986f3e23eac7724e99c0d7ddc8d6'],
  ['temporary-directory-CwHp0_NW.mjs', 'e0771b7d9b216d438ff2ade7494a7a3ac6202c66cb752f2cd99bffb3d78226fe'],
]) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'tunes/node_modules/tsx/dist', file))).digest('hex'), hash);
assert.equal(createHash('sha256').update(fs.readFileSync(compiler)).digest('hex'), 'cae1bbc86f4df800b01d99e28aea0a154b02243de6797e98f48a9b88a64a7be0');
const { g: getPipePath } = await import(pathToFileURL(path.join(root, 'tunes/node_modules/tsx/dist/get-pipe-path-BHW2eJdv.mjs')).href);
const toolPipe = getPipePath(process.ppid);
let deniedAttempts = 0, applicationAttempts = 0, toolCalls = 0, toolIpcDenied = 0, toolInitialization = true;
const deny = () => { deniedAttempts++; applicationAttempts++; throw Error('application import effect'); };
const spawn = cp.spawn;
cp.spawn = (exe, args, options) => {
  if (fs.realpathSync(exe) === compiler && JSON.stringify(args) === JSON.stringify(['--service=0.25.12', '--ping']) && options?.shell !== true) {
    if (toolCalls !== 0) return deny();
    toolCalls++;
    return spawn(exe, args, options);
  }
  return deny();
};
for (const key of ['spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[key] = deny;
for (const object of [fs, fsp]) for (const key of ['mkdir', 'mkdirSync', 'mkdtemp', 'mkdtempSync', 'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'rename', 'renameSync', 'rm', 'rmSync', 'rmdir', 'rmdirSync', 'unlink', 'unlinkSync', 'truncate', 'truncateSync', 'chmod', 'chmodSync', 'chown', 'chownSync', 'link', 'linkSync', 'symlink', 'symlinkSync', 'copyFile', 'copyFileSync', 'write', 'writeSync', 'createWriteStream']) if (key in object) object[key] = deny;
for (const [object, key] of [[fs, 'open'], [fs, 'openSync'], [fsp, 'open']]) {
  const open = object[key]; object[key] = (...args) => { const flags = args[1]; if (flags !== undefined && flags !== 'r' && flags !== 'rs' && flags !== 0) return deny(); return open.apply(object, args); };
}
net.Server.prototype.listen = deny; net.connect = deny; tls.connect = deny;
dgram.Socket.prototype.bind = deny; dgram.Socket.prototype.send = deny;
http.request = deny; http.get = deny; https.request = deny; https.get = deny; globalThis.fetch = deny;
// tsx's pinned API initialization attempts its original parent's private pipe.
// The connection remains denied; its exact attempted shape is separately counted.
net.createConnection = (...args) => {
  if (toolInitialization && args.length === 2 && args[0] === toolPipe && typeof args[1] === 'function') {
    deniedAttempts++; toolIpcDenied++; throw Error('tool IPC denied');
  }
  return deny();
};
const pg = require('pg'); for (const type of [pg.Pool, pg.Client]) { type.prototype.connect = deny; type.prototype.query = deny; }
syncBuiltinESMExports();
const apiURL = pathToFileURL(path.join(root, 'tunes/node_modules/tsx/dist/esm/api/index.mjs')).href;
const parentURL = pathToFileURL(path.join(root, 'scripts/replatform-e2e.mjs')).href;
const { tsImport } = await import(apiURL); assert.equal(typeof tsImport, 'function');
assert.equal(deniedAttempts, 1); assert.equal(toolIpcDenied, 1); assert.equal(applicationAttempts, 0);
toolInitialization = false;
const targetURL = pathToFileURL(path.join(root, 'tunes/scripts/guides-parent-supervision.ts')).href;
const module = await tsImport(targetURL, { parentURL, tsconfig: false });
assert.deepEqual(Object.keys(module), ['createGuidesParentSupervisor','extractGuidesSupervisorDiagnostic','extractGuidesSupervisorNativeFailure']); assert.equal(typeof module.createGuidesParentSupervisor, 'function'); assert.equal(typeof module.extractGuidesSupervisorDiagnostic,'function');
assert.equal(deniedAttempts, 1); assert.equal(toolIpcDenied, 1); assert.equal(applicationAttempts, 0); assert.ok(toolCalls <= 1);
console.log(JSON.stringify({ ok: true, target: 'supervision', applicationResourceCalls: 0, toolIpcDenied: 1 }));
