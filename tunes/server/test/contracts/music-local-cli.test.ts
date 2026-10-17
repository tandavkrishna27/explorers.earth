import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import * as cli from '../../../scripts/music-local';
import { LOCAL_MUSIC_TARGET as target, type LocalMusicManifest } from '../../config/music-local-profile';
const appData = path.resolve('../virtual-appdata');
const worktreeRoot = path.resolve('../virtual-worktree');
const stateDirectory = path.join(appData, 'ExplorersMusicLocal', 'test-one');
const manifestPath = path.join(stateDirectory, 'manifest.json');
const manifest: LocalMusicManifest = { version: 1, instanceId: '12345678-1234-4234-8234-123456789abc', ownerId: '1000', imageId: `sha256:${'a'.repeat(64)}`, worktreeRoot, stateDirectory, cohortUserDocumentIds: [] };
function harness(existing = false) {
  const files = new Map<string, string>(); const calls: string[][] = []; const writes: string[] = [];
  const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
  let volume: Record<string, unknown> | undefined; let container: Record<string, any> | undefined;
  const secrets = Object.values(target.secretFiles);
  if (existing) {
    files.set(manifestPath, JSON.stringify(manifest));
    files.set(stateDirectory, 'directory');
    secrets.forEach((name, index) => files.set(path.join(stateDirectory, name), `${String.fromCharCode(65 + index).repeat(43)}`));
  }
  const deps: cli.LocalMusicDependencies = {
    worktreeRoot, environment: {}, osIdentity: async () => ({ ownerId: '1000', localAppData: appData }),
    io: { exists: async (file) => files.has(file), canonical: async () => {}, privatePath: async () => {},
      readJson: async (file) => JSON.parse(files.get(file)!), readSecret: async (file) => { if (!files.has(file)) throw new Error('missing'); return files.get(file)!; },
      createDirectory: async (file) => { if (files.has(file)) throw new Error('exists'); writes.push(file); files.set(file, 'directory'); },
      createFile: async (file, value) => { if (files.has(file)) throw new Error('exists'); writes.push(file); files.set(file, value); },
    },
    portAvailable: async () => true,
    runDocker: async (args) => {
      calls.push(args);
      if (args[0] === 'context') return { stdout: args[1] === 'show' ? 'desktop-linux' : JSON.stringify(endpoint), exitCode: 0 };
      expect(args.slice(0, 2)).toEqual(['--host', endpoint]);
      const cmd = args.slice(2); let out = '';
      if (cmd[0] === 'image') out = manifest.imageId;
      else if (cmd[0] === 'ps') out = container ? JSON.stringify({ ID: container.Id, Names: target.containerName }) : '';
      else if (cmd[0] === 'volume' && cmd[1] === 'ls') out = volume ? JSON.stringify({ Name: target.volumeName }) : '';
      else if (cmd[0] === 'volume' && cmd[1] === 'create') {
        const labels = Object.fromEntries(cmd.flatMap((arg, index) => arg === '--label' ? [cmd[index + 1].split('=')] : []));
        volume = { Name: target.volumeName, Labels: labels, Driver: 'local', Scope: 'local', Options: null, CreatedAt: '2026-08-30T00:00:00Z' }; out = target.volumeName;
      } else if (cmd[0] === 'volume') out = JSON.stringify(volume);
      else if (cmd[0] === 'create') {
        const labels = Object.fromEntries(cmd.flatMap((arg, index) => arg === '--label' ? [cmd[index + 1].split('=')] : []));
        container = { Id: 'b'.repeat(64), Name: `/${target.containerName}`, Image: manifest.imageId,
          Config: { Image: manifest.imageId, Labels: labels, Entrypoint: ['docker-entrypoint.sh'], Cmd: ['postgres'], Env: [`POSTGRES_DB=${target.databaseName}`, 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin', 'PGDATA=/var/lib/postgresql/data'] },
          HostConfig: { NetworkMode: 'bridge', Privileged: false, PublishAllPorts: false, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55433' }] } },
          Mounts: [{ Type: 'volume', Name: target.volumeName, Destination: '/var/lib/postgresql/data', RW: true }, { Type: 'bind', Source: path.join(stateDirectory, 'db-admin'), Destination: '/run/secrets/db-admin', RW: false }],
          NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55433' }] } }, State: { Running: false } }; out = container.Id;
      } else if (cmd[0] === 'start') { container!.State.Running = true; out = container!.Id; }
      else if (cmd[0] === 'inspect') out = JSON.stringify(container);
      else throw new Error(`unexpected ${cmd[0]}`);
      return { stdout: out, exitCode: 0 };
    },
    provisionDatabase: async (_manifest, _secrets, requireOwned) => { await requireOwned(); calls.push(['DATABASE_ACTIVE']); return { ready: true }; },
    checkDatabase: async (_manifest, _secret, requireOwned) => { await requireOwned(); calls.push(['DATABASE_READ']); return { ready: true }; },
  };
  return { deps, files, writes, calls, setContainer: (value: Record<string, any>) => { container = value; } };
}
describe('explicit local CLI grammar', () => {
  it.each([[], ['check'], ['check','--manifest'], ['check','--manifest','a','--apply'], ['provision','--manifest','a','--apply','--apply'], ['provision','--manifest','a','--unknown'], ['check','--manifest','a','--manifest','b'], ['start'], ['start','--manifest'], ['start','--manifest','a','--apply'], ['start','--manifest','a','--enable-cohort','--enable-cohort']].map((args) => ({ args })))('refuses invalid arguments $args', ({ args }) => {
    expect(() => cli.parseLocalMusicArguments(args)).toThrow(/^LOCAL_MUSIC_ARGUMENTS$/);
  });
  it('accepts check, explicit apply provisioning, and explicit local start admission', () => {
    expect(cli.parseLocalMusicArguments(['check','--manifest',manifestPath])).toEqual({ command: 'check', manifestPath, apply: false });
    expect(cli.parseLocalMusicArguments(['provision','--manifest',manifestPath,'--apply'])).toEqual({ command: 'provision', manifestPath, apply: true });
    expect(cli.parseLocalMusicArguments(['start','--manifest',manifestPath])).toEqual({ command: 'start', manifestPath, enableCohort: false });
    expect(cli.parseLocalMusicArguments(['start','--manifest',manifestPath,'--enable-cohort'])).toEqual({ command: 'start', manifestPath, enableCohort: true });
  });
});
describe('local start signal cleanup', () => {
  it('uses one guarded shutdown and sets a deterministic failure exit status', async () => {
    const handlers = new Map<string, () => void>();
    const runtime = {
      exitCode: undefined as number | undefined,
      once: (signal: string, handler: () => void) => { handlers.set(signal, handler); return runtime; },
    };
    let rejectShutdown!: (error: Error) => void;
    const shutdown = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectShutdown = reject; }));
    const stop = cli.installLocalMusicSignalShutdown(shutdown, runtime);
    handlers.get('SIGINT')?.();
    handlers.get('SIGTERM')?.();
    expect(shutdown).toHaveBeenCalledTimes(1);
    rejectShutdown(new Error('private shutdown detail'));
    await stop();
    expect(runtime.exitCode).toBe(1);
  });
});
describe('guarded local orchestration', () => {
  it('without apply never writes or invokes active database work', async () => {
    const h = harness();
    expect(await cli.provisionLocalMusic(manifestPath, { apply: false }, h.deps)).toMatchObject({ ready: false, phase: 'manifest-missing' });
    expect(h.writes).toEqual([]); expect(h.calls).toEqual([]);
  });
  it.each(['path', 'foreign', 'docker', 'port'])('refuses unsafe %s before writes or DB', async (kind) => {
    const h = harness(kind === 'foreign');
    if (kind === 'foreign') h.files.set(manifestPath, JSON.stringify({ ...manifest, worktreeRoot: path.resolve('../foreign') }));
    if (kind === 'docker') h.deps.runDocker = async () => ({ stdout: 'SENTINEL_SECRET', exitCode: 1 });
    if (kind === 'port') h.deps.portAvailable = async () => false;
    const result = await cli.provisionLocalMusic(kind === 'path' ? path.join(worktreeRoot, 'manifest.json') : manifestPath, { apply: true }, h.deps);
    expect(result.ready).toBe(false); expect(result.error).toBe('refused');
    expect(h.writes).toEqual([]); expect(h.calls.flat()).not.toContain('DATABASE_ACTIVE');
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
  });
  it('existing missing secret never rotates or invokes the DB', async () => {
    const h = harness(true); h.files.delete(path.join(stateDirectory, 'db-runtime'));
    const result = await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    expect(result).toMatchObject({ ready: false, phase: 'secrets-missing', missing: ['db-runtime'] });
    expect(h.writes).toEqual([]); expect(h.calls.flat()).not.toContain('DATABASE_ACTIVE');
  });
  it('provisions only absent resources, keeps secrets out of Docker args/status, and records exact receipt', async () => {
    const h = harness();
    const result = await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    expect(result).toMatchObject({ databaseReady: true, ready: false, phase: 'identity-missing', missing: ['STRAPI_LIFECYCLE_PROOF_TOKEN_FILE'] });
    const saved = JSON.parse(h.files.get(manifestPath)!);
    expect(saved.instanceId).toMatch(/^[a-f0-9-]{36}$/); expect(saved.instanceId).not.toBe(manifest.instanceId);
    expect(JSON.parse(h.files.get(path.join(stateDirectory, 'resource-identity.json'))!)).toMatchObject({ containerId: 'b'.repeat(64), endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' });
    for (const filename of Object.values(target.secretFiles)) { const secret = h.files.get(path.join(stateDirectory, filename))!; expect(JSON.stringify(h.calls) + JSON.stringify(result)).not.toContain(secret); }
    expect(h.calls.flat()).not.toEqual(expect.arrayContaining(['rm', 'pull', 'down', '--volumes']));
  });
  it('read-only check and repeated provision retain state and use the existing resource receipt', async () => {
    const h = harness(); await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    const before = h.writes.length; h.calls.length = 0;
    await cli.checkLocalMusic(manifestPath, h.deps);
    expect(h.writes.length).toBe(before); expect(h.calls).toContainEqual(['DATABASE_READ']); expect(h.calls).not.toContainEqual(['DATABASE_ACTIVE']);
    h.calls.length = 0;
    await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    expect(h.writes.length).toBe(before); expect(h.calls.flat()).not.toContain('create'); expect(h.calls).toContainEqual(['DATABASE_ACTIVE']);
  });
  it('retains resources on interrupted database phase and reports only sanitized phase', async () => {
    const h = harness(); h.deps.provisionDatabase = async () => { throw new Error('SENTINEL_PASSWORD pg query'); };
    const result = await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    expect(result).toMatchObject({ phase: 'database', ready: false, error: 'refused' });
    expect(h.files.has(path.join(stateDirectory, 'resource-identity.json'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('SENTINEL'); expect(h.calls.flat()).not.toContain('rm');
  });
  it('rejects changed receipt identity before database access', async () => {
    const h = harness(); await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    const receiptFile = path.join(stateDirectory, 'resource-identity.json');
    const receipt = JSON.parse(h.files.get(receiptFile)!); receipt.containerId = 'f'.repeat(64); h.files.set(receiptFile, JSON.stringify(receipt)); h.calls.length = 0;
    expect(await cli.checkLocalMusic(manifestPath, h.deps)).toMatchObject({ ready: false, error: 'refused' });
    expect(h.calls.flat()).not.toContain('DATABASE_READ');
  });
  it('will not adopt same-labelled resources whose identity receipt was lost', async () => {
    const h = harness(); await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    h.files.delete(path.join(stateDirectory, 'resource-identity.json')); h.calls.length = 0;
    const writes = h.writes.length;
    expect(await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps)).toMatchObject({ phase: 'docker', error: 'refused' });
    expect(h.writes.length).toBe(writes); expect(h.calls.flat()).not.toContain('DATABASE_ACTIVE'); expect(h.calls.flat()).not.toContain('create');
  });
  it('rejects lifecycle proof authority aliasing a local password before database calls', async () => {
    const h = harness(); await cli.provisionLocalMusic(manifestPath, { apply: true }, h.deps);
    const saved = JSON.parse(h.files.get(manifestPath)!); saved.lifecycleProofFile = path.join(stateDirectory, 'db-admin'); h.files.set(manifestPath, JSON.stringify(saved)); h.calls.length = 0;
    expect(await cli.checkLocalMusic(manifestPath, h.deps)).toMatchObject({ ready: false, error: 'refused' });
    expect(h.calls.flat()).not.toContain('DATABASE_READ');
  });
});
