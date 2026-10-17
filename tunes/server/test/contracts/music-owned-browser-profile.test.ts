import { describe, it, expect } from 'vitest';
import { assertOwnedBrowserMusicProfile, activateOwnedBrowserMusicRuntime, hasValidatedOwnedBrowserMusicRuntime, validateOwnedBrowserMusicProfile, readOwnedBrowserMusicSecretSnapshot, type ValidatedOwnedBrowserMusicProfile } from '../../config/music-owned-browser-profile';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, realpathSync, linkSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { startMusicServer } from '../../config/music-startup';
// GitHub's windows-latest TEMP contains an 8.3 short-name component, so os.tmpdir() is not
// its own realpath there. Both the secret-file inspector
// (secure-music-secret-file.ts:227-228) and assertCanonicalLocalPath
// (music-local-state.ts:77-84) require realpath identity for the path and its ancestors, so
// a bare tmpdir() made all 24 cases in this lane refuse for a reason that is not a product
// defect. Canonicalize once, as music-cli-contract-authority.test.ts:22 already does.
// REFINED after a CI probe: realpathSync does NOT expand 8.3 short names, so the LEAF of
// tmpdir() reports canonical on the runner (probe output: tmpdir and its realpath both
// C:\Users\RUNNER~1\AppData\Local\Temp).
// assertCanonicalLocalPath checks identity at EVERY ancestor, and that is where
// C:\Users\RUNNER~1 fails. RUNNER_TEMP (D:\a\_temp) has no
// short-name component, so it is preferred where present.
const temporaryRoot = realpathSync(process.env.RUNNER_TEMP ?? tmpdir());
describe('owned browser Music opaque admission', () => {
  it('rejects plain serialized and cloned profiles before production loading', async () => {
    const plain = { kind: 'owned-browser-music/v1' } as ValidatedOwnedBrowserMusicProfile;
    for (const forged of [plain, JSON.parse(JSON.stringify(plain)), structuredClone(plain), Object.freeze({ ...plain })]) {
      await expect(assertOwnedBrowserMusicProfile(forged, process.env)).rejects.toThrow('authority rejected');
      await expect(startMusicServer(process.env, { apiOnly: true }, forged)).rejects.toThrow('authority rejected');
    }
  });
  it('rejects foreign environment objects and activation without custody', async () => {
    const forged = { kind: 'owned-browser-music/v1' } as ValidatedOwnedBrowserMusicProfile;
    await expect(assertOwnedBrowserMusicProfile(forged, { ...process.env })).rejects.toThrow();
    expect(() => activateOwnedBrowserMusicRuntime(forged, process.env, 'postgresql://127.0.0.1/forged')).toThrow();
    expect(hasValidatedOwnedBrowserMusicRuntime(process.env)).toBe(false);
  });
  it('refuses resolver runtime host port and pool substitution on owned path', async () => {
    const forged = { kind: 'owned-browser-music/v1' } as ValidatedOwnedBrowserMusicProfile;
    for (const options of [{ apiOnly: false }, { apiOnly: true, host: '0.0.0.0' }, { apiOnly: true, port: 5000 }, { apiOnly: true, loadRuntime: async () => { throw new Error('must never execute'); } }])
      await expect(startMusicServer(process.env, options, forged)).rejects.toThrow('unmodified production composition');
  });
  // Harness budget, not a product relaxation. Spawns five real powershell.exe children (one
  // create-directory plus one create-file per marker case): 2285ms measured in isolation, observed
  // at ~6.0s against the 5000ms default under full-sweep load. This was the only case in this file
  // without an explicit budget; 60000ms matches the five sibling budgets below and keeps a genuine
  // hang failing.
  it('rejects malformed duplicate oversized and excessively nested private markers without resource admission', { timeout: 60_000 }, async () => {
    const directory = join(temporaryRoot, `explorers-music-e2e-${randomBytes(16).toString('hex')}`);
    const helper = resolve(import.meta.dirname, '../../../scripts/music-local-private-files.ps1');
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'create-directory', directory], { stdio: 'ignore', windowsHide: true });
    else mkdirSync(directory, { mode: 0o700 });
    try {
      const cases = ['{', '{"version":1,"version":1}', 'x'.repeat(65537), JSON.stringify({ nested: Array.from({ length: 20 }).reduce(value => ({ nested: value }), {} as any) })];
      for (let index = 0; index < cases.length; index++) {
        const marker = join(directory, `marker-${index}`);
        if (process.platform === 'win32' && cases[index].length <= 65536) execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'create-file', marker], { input: cases[index], stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
        else writeFileSync(marker, cases[index], { mode: 0o600, flag: 'wx' });
        await expect(validateOwnedBrowserMusicProfile(process.env, marker, 'a'.repeat(64))).rejects.toThrow();
        expect(hasValidatedOwnedBrowserMusicRuntime(process.env)).toBe(false);
      }
    } finally { if (realpathSync(directory) !== resolve(directory) || dirname(directory) !== temporaryRoot) throw new Error('Owned contract cleanup escaped'); rmSync(directory, { recursive: true, force: true }); }
  });
  it('rejects capability syntax and escaped marker paths before reading authority', async () => {
    await expect(validateOwnedBrowserMusicProfile(process.env, 'foreign.json', 'bad')).rejects.toThrow('authority rejected');
    await expect(validateOwnedBrowserMusicProfile(process.env, join(temporaryRoot, 'foreign.json'), 'a'.repeat(64))).rejects.toThrow();
    expect(hasValidatedOwnedBrowserMusicRuntime(process.env)).toBe(false);
  });
});

describe('owned Music real private-secret vector custody', () => {
  async function files(run: (paths: string[], values: string[]) => Promise<void>) {
    const directory = join(temporaryRoot, `explorers-music-e2e-${randomBytes(16).toString('hex')}`);
    const helper = resolve(import.meta.dirname, '../../../scripts/music-local-private-files.ps1');
    const create = (path: string, value: string) => {
      if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'create-file', path], { input: value, windowsHide: true, timeout: 10000, stdio: ['pipe', 'ignore', 'ignore'] });
      else writeFileSync(path, value, { mode: 0o600, flag: 'wx' });
    };
    if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'create-directory', directory], { windowsHide: true, timeout: 10000, stdio: 'ignore' });
    else mkdirSync(directory, { mode: 0o700 });
    try {
      const paths = ['capability', 'runtime-password', 'migrator-password', 'token-secret'].map(name => join(directory, name));
      const values = paths.map(() => randomBytes(32).toString('hex'));
      paths.forEach((path, index) => create(path, values[index]));
      await run(paths, values);
    } finally {
      if (realpathSync(directory) !== resolve(directory) || dirname(directory) !== temporaryRoot) throw new Error('Owned contract cleanup escaped');
      rmSync(directory, { recursive: true, force: true });
    }
  }
  it('returns frozen distinct path identity and digest evidence without issuing authority', async () => files(async paths => {
    const vector = await readOwnedBrowserMusicSecretSnapshot(paths);
    expect(Object.isFrozen(vector)).toBe(true);
    expect(vector.every(Object.isFrozen)).toBe(true);
    expect(new Set(vector.map(item => item.identity)).size).toBe(4);
    expect(new Set(vector.map(item => item.digest)).size).toBe(4);
    await expect(readOwnedBrowserMusicSecretSnapshot(paths, vector)).resolves.toEqual(vector);
    expect(hasValidatedOwnedBrowserMusicRuntime(process.env)).toBe(false);
  }), 60000);
  for (let left = 0; left < 4; left++) for (let right = left + 1; right < 4; right++) {
    it(`rejects equal material pair ${left}/${right} initially and against retained custody`, async () => files(async (paths, values) => {
      const retained = await readOwnedBrowserMusicSecretSnapshot(paths);
      writeFileSync(paths[right], values[left]);
      await expect(readOwnedBrowserMusicSecretSnapshot(paths)).rejects.toThrow();
      await expect(readOwnedBrowserMusicSecretSnapshot(paths, retained)).rejects.toThrow();
    }), 60000);
  }
  for (let index = 0; index < 4; index++) {
    it(`rejects same-inode digest change for authority ${index}`, async () => files(async paths => {
      const retained = await readOwnedBrowserMusicSecretSnapshot(paths);
      writeFileSync(paths[index], randomBytes(32).toString('hex'));
      await expect(readOwnedBrowserMusicSecretSnapshot(paths, retained)).rejects.toThrow('authority rejected');
    }), 60000);
    it(`rejects unchanged-content replacement inode for authority ${index}`, async () => files(async (paths, values) => {
      const retained = await readOwnedBrowserMusicSecretSnapshot(paths);
      // Keep original inode alive to prevent filesystem inode recycling.
      renameSync(paths[index], `${paths[index]}.original`);
      const helper = resolve(import.meta.dirname, '../../../scripts/music-local-private-files.ps1');
      if (process.platform === 'win32') execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'create-file', paths[index]], { input: values[index], windowsHide: true, timeout: 10000, stdio: ['pipe', 'ignore', 'ignore'] });
      else writeFileSync(paths[index], values[index], { mode: 0o600, flag: 'wx' });
      await expect(readOwnedBrowserMusicSecretSnapshot(paths, retained)).rejects.toThrow('authority rejected');
    }), 60000);
  }
  it('rejects duplicate paths and actual hardlinks introduced after the retained vector', async () => files(async paths => {
    const retained = await readOwnedBrowserMusicSecretSnapshot(paths);
    await expect(readOwnedBrowserMusicSecretSnapshot([paths[0], paths[0], paths[2], paths[3]])).rejects.toThrow();
    unlinkSync(paths[1]); linkSync(paths[0], paths[1]);
    await expect(readOwnedBrowserMusicSecretSnapshot(paths, retained)).rejects.toThrow();
  }), 60000);
});
