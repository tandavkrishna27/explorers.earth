import { spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readSecureMusicSecretFile } from '../server/config/secure-music-secret-file';

export function localMusicOsEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'APPDATA']);
  return Object.fromEntries(Object.entries(env).filter(([name, value]) => value !== undefined && allowed.has(name.toUpperCase())));
}
export function assertNoDockerOverrides(env: NodeJS.ProcessEnv): void {
  if (Object.entries(env).some(([key, value]) => value !== undefined && /^DOCKER_/i.test(key))) throw new Error('LOCAL_MUSIC_DOCKER_OVERRIDE');
}
export function validateLocalManifestPath(file: string, root: string): string {
  const base = path.join(root, 'ExplorersMusicLocal');
  const parts = path.relative(base, file).split(path.sep);
  if (!path.isAbsolute(file) || path.resolve(file) !== file || file.startsWith('\\\\') || /[,\x00-\x1f\x7f]/.test(file)
    || parts.length !== 2 || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(parts[0]) || parts[1] !== 'manifest.json') throw new Error('LOCAL_MUSIC_STATE_PATH');
  return path.dirname(file);
}
export async function runLocalProcess(executable: string, args: string[], input?: string): Promise<{ stdout: string; exitCode: number; stderr: string }> {
  return await new Promise((resolve) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, env: localMusicOsEnvironment(process.env), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let overflow = false;
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on('data', (data: Buffer) => { if (stdout.length + data.length > 1024 * 1024) { overflow = true; stdout = ''; child.kill(); } else if (!overflow) stdout += data.toString('utf8'); });
    // External stderr may contain credentials or raw system errors. Never retain it.
    // MUSIC_LOCAL_STATE_STDERR is an explicit, opt-in diagnostic escape hatch: unset -- the
    // default, and every production path -- behaves exactly as before and the stream is drained
    // without ever being read. It exists because this Windows failure has now been chased through
    // three layers of discarded detail (a JSON SyntaxError, then `exited 1`, then
    // `exited 1: no reason supplied`) and the remaining fact lives only on stderr. It is set on
    // the Windows CI leg alone, whose only secret-bearing input is a synthetic fixture, and the
    // capture is capped at 4 KiB so a hostile child cannot flood the log.
    let stderr = '';
    if (process.env.MUSIC_LOCAL_STATE_STDERR === '1') child.stderr.on('data', (data: Buffer) => { if (stderr.length < 4096) stderr += data.toString('utf8'); });
    else child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); resolve({ stdout: '', exitCode: 1, stderr }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout: overflow ? '' : stdout, exitCode: overflow ? 1 : code ?? 1, stderr }); });
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}
export interface LocalOsIdentity { ownerId: string; localAppData: string }
export interface LocalOsIdentityEvidence extends LocalOsIdentity {
  unredirectedLocalAppData: string;
  authority: 'current-token' | 'packaged-ancestor';
  packageFamily?: string;
  canonical: true;
  reparseFree: true;
  ownerVerified: true;
  ancestryVerified: true;
  packageIdentityVerified?: true;
}
function isSafeWindowsAbsolutePath(value: unknown): value is string {
  if (typeof value !== 'string' || !path.win32.isAbsolute(value) || path.win32.resolve(value) !== value || value.startsWith('\\\\')
    || /[,\x00-\x1f\x7f]/.test(value)) return false;
  return !value.slice(path.win32.parse(value).root.length).includes(':');
}
export function resolveLocalMusicOsIdentityEvidence(value: unknown): LocalOsIdentity {
  const evidence = value as Partial<LocalOsIdentityEvidence> | null;
  if (!evidence || typeof evidence.ownerId !== 'string' || !/^S-1-\d+(?:-\d+)+$/.test(evidence.ownerId)
    || !isSafeWindowsAbsolutePath(evidence.localAppData) || !isSafeWindowsAbsolutePath(evidence.unredirectedLocalAppData)
    || evidence.canonical !== true || evidence.reparseFree !== true || evidence.ownerVerified !== true || evidence.ancestryVerified !== true) throw new Error('LOCAL_MUSIC_OS_IDENTITY');
  if (evidence.authority === 'current-token') {
    if (evidence.localAppData.toLowerCase() !== evidence.unredirectedLocalAppData.toLowerCase() || evidence.packageFamily !== undefined
      || evidence.packageIdentityVerified !== undefined) throw new Error('LOCAL_MUSIC_OS_IDENTITY');
  } else if (evidence.authority === 'packaged-ancestor') {
    if (typeof evidence.packageFamily !== 'string' || !/^[A-Za-z0-9.-]{1,50}_[A-Za-z0-9]{13}$/.test(evidence.packageFamily)
      || evidence.packageIdentityVerified !== true) throw new Error('LOCAL_MUSIC_OS_IDENTITY');
    const expected = path.win32.join(evidence.unredirectedLocalAppData, 'Packages', evidence.packageFamily, 'LocalCache', 'Local');
    if (evidence.localAppData.toLowerCase() !== expected.toLowerCase()) throw new Error('LOCAL_MUSIC_OS_IDENTITY');
  } else throw new Error('LOCAL_MUSIC_OS_IDENTITY');
  return { ownerId: evidence.ownerId, localAppData: evidence.localAppData };
}
async function privateHelper(operation: string, file?: string, input?: string): Promise<Record<string, unknown>> {
  if (process.platform !== 'win32') throw new Error('LOCAL_MUSIC_PLATFORM_UNSUPPORTED');
  // -ExecutionPolicy Bypass is required because this is the only PowerShell entry point in
  // the repo invoked as `-File <script.ps1>`; the others use -Command or -EncodedCommand,
  // which script-file execution policy does not gate. A Restricted policy blocks the file
  // before its first line, so the script's own try/catch never runs: stderr carries the
  // refusal (and is deliberately discarded), stdout is EMPTY and the exit status is 1.
  // That is exactly what CI reported at every stage of this diagnosis -- first as a JSON
  // SyntaxError, then `exited 1`, then `exited 1: no reason supplied`. Bypass changes no
  // assertion in the helper; every ACL, ancestry and path check it makes is untouched.
  const helper = path.resolve(import.meta.dirname, 'music-local-private-files.ps1');
  const result = await runLocalProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, operation, ...(file ? [file] : [])], input);
  // Check the exit status BEFORE parsing. Parsing first turned every helper failure into a
  // generic `SyntaxError: Unexpected end of JSON input` -- which is exactly what CI reported
  // once the cause was attached -- and discarded the exit code, the one fact that separates a
  // killed child from a helper that refused. Operation name and exit code are metadata, not
  // credentials; the child's stdout and stderr are still never surfaced.
  try {
    if (result.exitCode !== 0) {
      // The helper writes {ok:false,reason} to stdout AND exits non-zero, so read the reason
      // before refusing. Checking the status first was right -- it stopped a helper failure
      // reading as a JSON SyntaxError -- but on its own it then hid the reason, which is the
      // fact worth having.
      let reason = 'no reason supplied';
      try { const reported: unknown = JSON.parse(result.stdout); if (reported && typeof reported === 'object' && typeof (reported as { reason?: unknown }).reason === 'string') reason = (reported as { reason: string }).reason; } catch { /* stdout was not JSON; the exit status below is all we have. */ }
      // The stderr tail appears only when MUSIC_LOCAL_STATE_STDERR=1 was set deliberately;
      // otherwise it is empty and this message is byte-identical to before.
      throw new Error(`helper '${operation}' exited ${result.exitCode}: ${reason}${result.stderr ? ` | stderr: ${result.stderr.trim()}` : ''}`);
    }
    if (!result.stdout) throw new Error(`helper '${operation}' produced no output`);
    const value = JSON.parse(result.stdout);
    if (value.ok !== true) throw new Error(`helper '${operation}' did not report ok: ${typeof value.reason === 'string' ? value.reason : 'no reason supplied'}`);
    return value;
  }
  catch (cause) { throw new Error('LOCAL_MUSIC_PRIVATE_FILE_REFUSED', { cause }); }
}
export async function localMusicOsIdentity(): Promise<LocalOsIdentity> {
  const result = await privateHelper('identity');
  return resolveLocalMusicOsIdentityEvidence(result);
}
export async function assertCanonicalLocalPath(file: string): Promise<void> {
  if (!path.isAbsolute(file) || path.resolve(file) !== file || file.startsWith('\\\\') || /[:]/.test(file.slice(path.parse(file).root.length))) throw new Error('LOCAL_MUSIC_STATE_PATH');
  for (let candidate = file; ; candidate = path.dirname(candidate)) {
    const stat = await lstat(candidate);
    if (stat.isSymbolicLink() || path.relative(await realpath(candidate), candidate) !== '') throw new Error('LOCAL_MUSIC_STATE_PATH');
    if (candidate === path.dirname(candidate)) break;
  }
}
export async function createLocalPrivateDirectory(file: string): Promise<void> {
  await assertCanonicalLocalPath(path.dirname(file));
  await privateHelper('create-directory', file);
}
export async function createLocalPrivateFile(file: string, value: string): Promise<void> {
  await assertCanonicalLocalPath(path.dirname(file));
  await privateHelper('create-file', file, value);
}
export async function assertLocalPrivatePath(file: string): Promise<void> {
  await assertCanonicalLocalPath(file);
  await privateHelper('inspect', file);
}
export async function readLocalPrivateSecret(file: string, options: { maxBytes?: number } = {}): Promise<string> {
  try {
    await assertLocalPrivatePath(path.dirname(file));
    await assertLocalPrivatePath(file);
    const secret = await readSecureMusicSecretFile(file, { mode: 'live', childEnvironment: localMusicOsEnvironment(process.env), ...options });
    await assertLocalPrivatePath(file);
    await assertLocalPrivatePath(path.dirname(file));
    return secret;
  } catch (cause) { throw new Error('LOCAL_MUSIC_PRIVATE_FILE_REFUSED', { cause }); }
}
