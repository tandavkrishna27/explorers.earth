import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseRelease, parseReadiness, parseStrictJson, ReleaseContractError, verifyRelease } from './platform-release-contract';

export async function readManifestFile(path: string): Promise<string> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > 65536) throw new ReleaseContractError('MANIFEST_FILE_INVALID');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 65536 || stat.ino !== before.ino || stat.dev !== before.dev) throw new ReleaseContractError('MANIFEST_FILE_INVALID');
    const bytes = Buffer.alloc(65537); let offset = 0;
    while (offset < bytes.length) { const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, null); if (!bytesRead) break; offset += bytesRead; }
    if (offset > 65536) throw new ReleaseContractError('JSON_SIZE_LIMIT');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)); return text;
  } finally { await handle.close(); }
}
export async function runReleaseCli(args: string[], read: (path: string) => Promise<string> = readManifestFile): Promise<{exitCode: number; stdout: string; stderr: string}> {
  try {
    const command = args[0];
    if (!['inspect','verify'].includes(command) || args.length % 2 !== 1) throw new ReleaseContractError('CLI_ARGUMENTS_INVALID');
    const flags: Record<string, string> = {};
    const allowed = command === 'inspect' ? ['--manifest'] : ['--manifest','--readiness','--environment'];
    for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(flags,args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new ReleaseContractError('CLI_ARGUMENTS_INVALID'); flags[args[i]] = args[i + 1]; }
    if (allowed.some(f => !flags[f]) || command === 'verify' && !['qa','production'].includes(flags['--environment'])) throw new ReleaseContractError('CLI_ARGUMENTS_INVALID');
    const manifest = parseRelease(parseStrictJson(await read(flags['--manifest'])));
    if (command === 'inspect') return { exitCode: 0, stdout: 'STRUCTURALLY_VALID_UNQUALIFIED\n', stderr: '' };
    const readiness = parseReadiness(parseStrictJson(await read(flags['--readiness'])));
    if (readiness.environment !== flags['--environment']) throw new ReleaseContractError('ENVIRONMENT_MISMATCH');
    verifyRelease(manifest, readiness);
  } catch (error) { return { exitCode: 1, stdout: '', stderr: (error instanceof ReleaseContractError ? error.code : 'MANIFEST_READ_FAILED') + '\n' }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runReleaseCli(process.argv.slice(2)).then(result => { process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exitCode = result.exitCode; });
}
