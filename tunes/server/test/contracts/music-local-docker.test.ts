import { describe, expect, it } from 'vitest';
import path from 'node:path';
import * as local from '../../../scripts/music-local-docker';
import { LOCAL_MUSIC_TARGET as target, type LocalMusicManifest } from '../../config/music-local-profile';

const manifest: LocalMusicManifest = {
  version: 1, instanceId: '12345678-1234-4234-8234-123456789abc', ownerId: '1000',
  imageId: `sha256:${'a'.repeat(64)}`, worktreeRoot: path.resolve('worktree'),
  stateDirectory: path.resolve('../private-state'), cohortUserDocumentIds: [],
};
const endpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine';
function fixture() {
  const labels = { 'com.explorers.project': 'explorers.earth', 'com.explorers.purpose': 'local-music',
    'com.explorers.instance': manifest.instanceId, 'com.explorers.owner': manifest.ownerId };
  const volume = { Name: target.volumeName, Driver: 'local', Scope: 'local', Options: null, Labels: labels, CreatedAt: '2026-08-30T00:00:00Z' };
  const container = { Id: 'b'.repeat(64), Name: `/${target.containerName}`, Image: manifest.imageId,
    Config: { Image: manifest.imageId, Labels: labels, Entrypoint: ['docker-entrypoint.sh'], Cmd: ['postgres'], Env: [`POSTGRES_DB=${target.databaseName}`, 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin', 'PGDATA=/var/lib/postgresql/data'] },
    HostConfig: { NetworkMode: 'bridge', Privileged: false, PublishAllPorts: false, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55433' }] } },
    Mounts: [{ Type: 'volume', Name: target.volumeName, Destination: '/var/lib/postgresql/data', RW: true },
      { Type: 'bind', Source: path.join(manifest.stateDirectory, 'db-admin'), Destination: '/run/secrets/db-admin', RW: false }],
    NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55433' }] } }, State: { Running: true } };
  return { volume, container };
}
function docker(data = fixture(), overrides: { absent?: boolean; fail?: boolean; remote?: boolean } = {}) {
  const calls: string[][] = [];
  const run: local.RunDocker = async (args) => {
    calls.push(args);
    if (overrides.fail) return { stdout: 'SENTINEL_PRIVATE_ERROR', exitCode: 1 };
    let value: unknown;
    if (args[0] === 'context' && args[1] === 'show') value = 'desktop-linux';
    else if (args[0] === 'context') value = JSON.stringify(overrides.remote ? 'tcp://remote:2376' : endpoint);
    else {
      expect(args.slice(0, 2)).toEqual(['--host', endpoint]);
      const command = args.slice(2);
      if (command[0] === 'ps') value = overrides.absent ? '' : JSON.stringify({ ID: data.container.Id, Names: target.containerName });
      else if (command[0] === 'volume' && command[1] === 'ls') value = overrides.absent ? '' : JSON.stringify({ Name: target.volumeName });
      else if (command[0] === 'volume') value = JSON.stringify(data.volume);
      else if (command[0] === 'image') value = manifest.imageId;
      else if (command[0] === 'inspect') value = JSON.stringify(data.container);
      else throw new Error(`unexpected command ${command[0]}`);
    }
    return { stdout: String(value), exitCode: 0 };
  };
  return { run, calls };
}
describe('local Docker ownership', () => {
  it('recognizes only exact owned resources and pins all operational reads', async () => {
    const fake = docker();
    expect(await local.inspectLocalMusicResources(manifest, fake.run)).toMatchObject({ endpoint, containerId: 'b'.repeat(64), volumeCreatedAt: '2026-08-30T00:00:00Z', running: true });
  });
  it('proves absence through successful enumeration, without create or pull', async () => {
    const fake = docker(fixture(), { absent: true });
    expect(await local.inspectLocalMusicResources(manifest, fake.run)).toMatchObject({ containerId: undefined, volumeCreatedAt: undefined, running: false });
    expect(fake.calls.flat()).not.toEqual(expect.arrayContaining(['create', 'run', 'pull', 'rm']));
  });
  it.each(['fail', 'remote'] as const)('rejects %s before operational access', async (key) => {
    const fake = docker(fixture(), { [key]: true });
    await expect(local.inspectLocalMusicResources(manifest, fake.run)).rejects.toThrow(/^LOCAL_MUSIC_/);
    expect(fake.calls.every((args) => args[0] === 'context')).toBe(true);
  });
  it.each(['labels', 'volumeLabels', 'image', 'mount', 'port', 'secretEnv', 'privileged', 'extraMount', 'command', 'pgdata'])(
    'refuses mismatching %s without mutation', async (kind) => {
      const data = fixture();
      if (kind === 'labels') data.container.Config.Labels = { ...data.container.Config.Labels, 'com.explorers.owner': '999' };
      if (kind === 'volumeLabels') data.volume.Labels = { ...data.volume.Labels, 'com.explorers.instance': 'foreign' };
      if (kind === 'image') data.container.Image = `sha256:${'f'.repeat(64)}`;
      if (kind === 'mount') data.container.Mounts[1].RW = true;
      if (kind === 'port') data.container.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0';
      if (kind === 'secretEnv') data.container.Config.Env.push('POSTGRES_PASSWORD=SENTINEL');
      if (kind === 'privileged') data.container.HostConfig.Privileged = true;
      if (kind === 'extraMount') data.container.Mounts.push({ ...data.container.Mounts[1], Destination: '/etc' });
      if (kind === 'command') data.container.Config.Cmd = ['foreign-server'];
      if (kind === 'pgdata') data.container.Config.Env.push('PGDATA=/foreign');
      const fake = docker(data);
      await expect(local.inspectLocalMusicResources(manifest, fake.run)).rejects.toThrow(/^LOCAL_MUSIC_/);
      expect(fake.calls.flat()).not.toEqual(expect.arrayContaining(['create', 'start', 'rm']));
    });
});
