import { describe, expect, it, vi } from 'vitest';
import { link, mkdtemp, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as state from '../../../scripts/music-local-state';
import { defaultLocalMusicDependencies } from '../../../scripts/music-local';
// GitHub's windows-latest TEMP contains an 8.3 short-name component, so os.tmpdir() is not
// its own realpath there. Both the secret-file inspector
// (secure-music-secret-file.ts:227-228) and assertCanonicalLocalPath
// (music-local-state.ts:77-84) require realpath identity for the path and its ancestors, so
// a bare tmpdir() made all 24 cases in this lane refuse for a reason that is not a product
// defect. Canonicalize once, as music-cli-contract-authority.test.ts:22 already does.
const temporaryRoot = realpathSync(tmpdir());
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

function validUnpackagedEvidence(): Record<string, unknown> {
  return {
    ownerId: 'S-1-5-21-111-222-333-1001',
    localAppData: 'C:\\Users\\generated\\AppData\\Local',
    unredirectedLocalAppData: 'C:\\Users\\generated\\AppData\\Local',
    authority: 'current-token',
    canonical: true,
    reparseFree: true,
    ownerVerified: true,
    ancestryVerified: true,
  };
}
function validPackagedEvidence(): Record<string, unknown> {
  return {
    ownerId: 'S-1-5-21-111-222-333-1001',
    localAppData: 'C:\\Users\\generated\\AppData\\Local\\Packages\\Generated.App_abc123def4567\\LocalCache\\Local',
    unredirectedLocalAppData: 'C:\\Users\\generated\\AppData\\Local',
    authority: 'packaged-ancestor',
    packageFamily: 'Generated.App_abc123def4567',
    canonical: true,
    reparseFree: true,
    ownerVerified: true,
    packageIdentityVerified: true,
    ancestryVerified: true,
  };
}
function withoutEvidenceField(evidence: Record<string, unknown>, field: string): Record<string, unknown> {
  const mutated = { ...evidence };
  delete mutated[field];
  return mutated;
}

describe('private local state policy', () => {
  it('drops preload and every ambient app secret from child environments', () => {
    expect(state.localMusicOsEnvironment({ PATH: 'safe', SystemRoot: 'C:\\Windows', NODE_OPTIONS: '--require bad', DATABASE_URL: 'SECRET', STRAPI_ACCESS_TOKEN: 'SECRET', VITE_TOKEN: 'SECRET', DOTENV_CONFIG_PATH: 'bad' }))
      .toEqual({ PATH: 'safe', SystemRoot: 'C:\\Windows' });
  });
  it.each(['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'DOCKER_CONFIG'])('rejects Docker override %s', (key) => {
    expect(() => state.assertNoDockerOverrides({ [key]: 'override' })).toThrow(/^LOCAL_MUSIC_/);
  });
  it('accepts only a canonical manifest child under the OS app data root', () => {
    const root = path.resolve('os-app-data');
    expect(state.validateLocalManifestPath(path.join(root, 'ExplorersMusicLocal', 'uat-one', 'manifest.json'), root)).toBe(path.join(root, 'ExplorersMusicLocal', 'uat-one'));
    for (const bad of [path.join(root, 'manifest.json'), path.join(root, 'ExplorersMusicLocal', 'manifest.json'), path.join(root, 'ExplorersMusicLocal', 'uat-one', 'other.json'), 'relative.json', path.join(root, 'ExplorersMusicLocal', 'unsafe:ads', 'manifest.json'), path.join(`${root},target=/etc`, 'ExplorersMusicLocal', 'safe', 'manifest.json')]) {
      expect(() => state.validateLocalManifestPath(bad, root)).toThrow(/^LOCAL_MUSIC_/);
    }
  });
  it('refuses comma-delimited mount syntax even in the OS application data parent', () => {
    const root = path.resolve('os,unsafe');
    expect(() => state.validateLocalManifestPath(path.join(root, 'ExplorersMusicLocal', 'safe', 'manifest.json'), root)).toThrow(/^LOCAL_MUSIC_/);
  });
  it('accepts complete canonical unpackaged Windows root evidence', () => {
    expect(state.resolveLocalMusicOsIdentityEvidence(validUnpackagedEvidence())).toEqual({
      ownerId: 'S-1-5-21-111-222-333-1001',
      localAppData: 'C:\\Users\\generated\\AppData\\Local',
    });
  });
  it('accepts only OS-verified packaged filter targets bound to the package family', () => {
    expect(state.resolveLocalMusicOsIdentityEvidence(validPackagedEvidence())).toEqual({
      ownerId: 'S-1-5-21-111-222-333-1001',
      localAppData: 'C:\\Users\\generated\\AppData\\Local\\Packages\\Generated.App_abc123def4567\\LocalCache\\Local',
    });
  });
  it.each([
    ['missing authority', withoutEvidenceField(validUnpackagedEvidence(), 'authority')],
    ['malformed authority', { ...validUnpackagedEvidence(), authority: 'caller-environment' }],
    ['missing canonical evidence', withoutEvidenceField(validUnpackagedEvidence(), 'canonical')],
    ['missing ancestry evidence', withoutEvidenceField(validUnpackagedEvidence(), 'ancestryVerified')],
    ['unpackaged alias', { ...validUnpackagedEvidence(), localAppData: 'C:\\Users\\generated\\AppData\\Local\\alias' }],
    ['malformed packaged path', { ...validPackagedEvidence(), unredirectedLocalAppData: 'C:\\Users\\generated\\AppData\\Local\\.' }],
    ['package escape', { ...validPackagedEvidence(), localAppData: 'C:\\Users\\generated\\AppData\\escape' }],
    ['package-family mismatch', { ...validPackagedEvidence(), localAppData: 'C:\\Users\\generated\\AppData\\Local\\Packages\\Other.App_abc123def4567\\LocalCache\\Local' }],
    ['malformed package family', { ...validPackagedEvidence(), packageFamily: 'Generated.App_abc123def4567\\.' }],
    ['missing package identity', withoutEvidenceField(validPackagedEvidence(), 'packageIdentityVerified')],
    ['reparse target', { ...validPackagedEvidence(), reparseFree: false }],
    ['unverified owner', { ...validUnpackagedEvidence(), ownerVerified: false }],
  ])('fails closed for %s root evidence', (_name, evidence) => {
    expect(() => state.resolveLocalMusicOsIdentityEvidence(evidence)).toThrow('LOCAL_MUSIC_OS_IDENTITY');
  });
});
describe.skipIf(process.platform !== 'win32')('real Windows private-file helper (temp sentinels only)', () => {
  it('resolves the same canonical OS root despite caller environment spoofing', async () => {
    const baseline = await state.localMusicOsIdentity();
    vi.stubEnv('LOCALAPPDATA', 'C:\\hostile\\spoofed-local-app-data');
    vi.stubEnv('USERPROFILE', 'C:\\hostile\\spoofed-user-profile');
    try {
      await expect(state.localMusicOsIdentity()).resolves.toEqual(baseline);
    } finally {
      vi.unstubAllEnvs();
    }
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
  it('provides a read-only host root probe with sanitized metadata only', async () => {
    const helper = path.resolve(import.meta.dirname, '../../../scripts/music-local-private-files.ps1');
    const result = await state.runLocalProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', helper, 'identity-probe']);
    expect(result.exitCode).toBe(0);
    const probe = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(probe).toEqual({ ok: true, authority: expect.stringMatching(/^(current-token|packaged-ancestor)$/), canonical: true, reparseFree: true, ownerVerified: true, packageIdentityVerified: expect.any(Boolean), ancestryVerified: true });
    expect(result.stdout).not.toMatch(/S-1-|[A-Z]:\\|packageFamily|localAppData/i);
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
  it('reads protected JSON metadata and rejects a hardlinked receipt without exposing its content', async () => {
    const temp = await mkdtemp(path.join(temporaryRoot, 'music-private-json-'));
    try {
      const dir = path.join(temp, 'private'); await state.createLocalPrivateDirectory(dir);
      const file = path.join(dir, 'receipt.json');
      await state.createLocalPrivateFile(file, JSON.stringify({ marker: 'generated-json-sentinel' }));
      await expect(defaultLocalMusicDependencies.io.readJson(file)).resolves.toEqual({ marker: 'generated-json-sentinel' });
      await link(file, path.join(dir, 'alias.json'));
      await expect(defaultLocalMusicDependencies.io.readJson(file)).rejects.toThrow(/^LOCAL_MUSIC_/);
    } finally { await rm(temp, { recursive: true, force: true }); }
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
  it('creates exclusive owner-only state, verifies secure reader, never overwrites a secret', async () => {
    const temp = await mkdtemp(path.join(temporaryRoot, 'music-private-acl-'));
    const dir = path.join(temp, 'private');
    try {
      await state.createLocalPrivateDirectory(dir);
      const file = path.join(dir, 'sentinel');
      await state.createLocalPrivateFile(file, 'generated_test_sentinel_1234567890');
      await expect(state.readLocalPrivateSecret(file)).resolves.toBe('generated_test_sentinel_1234567890');
      const integrityCalls = vi.mocked(execFileSync).mock.calls.filter((call) => (call[1] as string[])?.some((arg) => arg.endsWith('windows-write-through.ps1')));
      expect(integrityCalls.length).toBeGreaterThan(0);
      for (const call of integrityCalls) {
        const options = call[2] as { env?: NodeJS.ProcessEnv };
        expect(options.env).toEqual(state.localMusicOsEnvironment(process.env));
        expect(options.env?.DATABASE_URL).toBeUndefined();
        expect(options.env?.MUSIC_TOKEN_CURRENT_SECRET).toBeUndefined();
      }
      await expect(state.createLocalPrivateFile(file, 'replacement')).rejects.toThrow(/^LOCAL_MUSIC_/);
      expect(await readFile(file, 'utf8')).toBe('generated_test_sentinel_1234567890');
      await expect(state.createLocalPrivateDirectory(dir)).rejects.toThrow(/^LOCAL_MUSIC_/);
    } finally { await rm(temp, { recursive: true, force: true }); }
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
  it('permits a bounded 512-character server-only reader token without relaxing default secret limits', async () => {
    const temp = await mkdtemp(path.join(temporaryRoot, 'music-private-reader-token-'));
    const dir = path.join(temp, 'private');
    try {
      await state.createLocalPrivateDirectory(dir);
      const file = path.join(dir, 'reader-token');
      const token = 'a'.repeat(512);
      await state.createLocalPrivateFile(file, token);
      await expect(state.readLocalPrivateSecret(file)).rejects.toThrow(/^LOCAL_MUSIC_/);
      await expect(state.readLocalPrivateSecret(file, { maxBytes: 512 })).resolves.toBe(token);
    } finally { await rm(temp, { recursive: true, force: true }); }
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
  it.each(['file', 'parent', 'inherited'])('rejects broad read authority on %s', async (kind) => {
    const temp = await mkdtemp(path.join(temporaryRoot, 'music-private-acl-'));
    const dir = path.join(temp, 'private');
    try {
      await state.createLocalPrivateDirectory(dir);
      const file = path.join(dir, 'sentinel');
      await state.createLocalPrivateFile(file, 'generated_test_sentinel_1234567890');
      const candidate = kind === 'parent' ? dir : file;
      const literal = candidate.replaceAll("'", "''");
      const operation = kind === 'inherited' ? '$acl.SetAccessRuleProtection($false,$true)' : "$rule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]'S-1-1-0','Read','Allow'); $acl.AddAccessRule($rule)";
      const api = kind === 'parent' ? 'Directory' : 'File';
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; $acl=[System.IO.${api}]::GetAccessControl('${literal}'); ${operation}; [System.IO.${api}]::SetAccessControl('${literal}',$acl)`], { windowsHide: true, env: state.localMusicOsEnvironment(process.env), stdio: 'pipe' });
      await expect(state.readLocalPrivateSecret(file)).rejects.toThrow(/^LOCAL_MUSIC_/);
    } finally { await rm(temp, { recursive: true, force: true }); }
  // 120s, deliberately ABOVE runLocalProcess's own 30s child kill
  // (music-local-state.ts:24). With both at 30000 the two deadlines raced, so a slow
  // child could never surface as its own assertion -- it always presented as an opaque
  // vitest timeout. The script's bound is unchanged; only the observation window grows.
  }, 120000);
});
