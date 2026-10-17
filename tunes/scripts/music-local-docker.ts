import path from 'node:path';
import { LOCAL_MUSIC_TARGET as target, parseLocalMusicManifest, type LocalMusicManifest } from '../server/config/music-local-profile';
export type RunDocker = (args: string[], input?: string) => Promise<{ stdout: string; exitCode: number }>;
export interface LocalResourceInspection {
  endpoint: string;
  containerId?: string;
  volumeCreatedAt?: string;
  running: boolean;
}
export function localDockerLabels(manifest: LocalMusicManifest): Record<string, string> {
  return { 'com.explorers.project': 'explorers.earth', 'com.explorers.purpose': 'local-music',
    'com.explorers.instance': manifest.instanceId, 'com.explorers.owner': manifest.ownerId };
}
function refuse(): never { throw new Error('LOCAL_MUSIC_DOCKER_REFUSED'); }
export async function dockerOutput(run: RunDocker, args: string[]): Promise<string> {
  try { const result = await run(args); if (result.exitCode !== 0) refuse(); return result.stdout.trim(); }
  catch { return refuse(); }
}
export function assertLocalDockerEndpoint(endpoint: string): void {
  if (!['npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine', 'unix:///var/run/docker.sock'].includes(endpoint)
    && !/^unix:\/\/\/run\/user\/\d+\/docker\.sock$/.test(endpoint)) refuse();
}
export async function resolveLocalDockerEndpoint(run: RunDocker): Promise<string> {
  const context = await dockerOutput(run, ['context', 'show']);
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(context)) refuse();
  let endpoint: unknown;
  try { endpoint = JSON.parse(await dockerOutput(run, ['context', 'inspect', context, '--format', '{{json .Endpoints.docker.Host}}'])); }
  catch { return refuse(); }
  if (typeof endpoint !== 'string') refuse();
  assertLocalDockerEndpoint(endpoint);
  return endpoint;
}
export async function resolveLocalPostgresImage(run: RunDocker, endpoint: string): Promise<string> {
  assertLocalDockerEndpoint(endpoint);
  const id = await dockerOutput(run, ['--host', endpoint, 'image', 'inspect', '--format', '{{.Id}}', 'postgres:15-alpine']);
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) refuse();
  return id;
}
function sameMount(source: unknown, expected: string): boolean {
  if (typeof source !== 'string') return false;
  let normalized = source;
  if (process.platform === 'win32') normalized = source.replace(/^\/(?:run\/desktop\/mnt\/host|host_mnt)\/([a-z])\//i, '$1:/');
  return path.relative(path.resolve(normalized), expected) === '';
}
function portsMatch(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const map = value as Record<string, Array<{ HostIp: string; HostPort: string }>>;
  return Object.keys(map).length === 1 && Array.isArray(map['5432/tcp']) && map['5432/tcp'].length === 1
    && map['5432/tcp'][0].HostIp === '127.0.0.1' && map['5432/tcp'][0].HostPort === '55433';
}
/** No absence is inferred from a failed inspect: successful enumeration is mandatory. */
export async function inspectLocalMusicResources(manifest: LocalMusicManifest, run: RunDocker, pinnedEndpoint?: string): Promise<LocalResourceInspection> {
  parseLocalMusicManifest(manifest);
  const endpoint = pinnedEndpoint ?? await resolveLocalDockerEndpoint(run);
  assertLocalDockerEndpoint(endpoint);
  const read = (args: string[]) => dockerOutput(run, ['--host', endpoint, ...args]);
  try {
    const containers = (await read(['ps', '-a', '--no-trunc', '--format', '{{json .}}'])).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const volumes = (await read(['volume', 'ls', '--format', '{{json .}}'])).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
    const labels = localDockerLabels(manifest);
    const matches = (value: Record<string, string> | undefined) => value && Object.entries(labels).every(([name, expected]) => value[name] === expected);
    let volumeCreatedAt: string | undefined;
    if (volumes.some((entry) => entry.Name === target.volumeName)) {
      const volume = JSON.parse(await read(['volume', 'inspect', '--format', '{{json .}}', target.volumeName]));
      if (volume.Name !== target.volumeName || volume.Driver !== 'local' || volume.Scope !== 'local'
        || (volume.Options && Object.keys(volume.Options).length) || !matches(volume.Labels)
        || typeof volume.CreatedAt !== 'string' || !Number.isFinite(Date.parse(volume.CreatedAt))) refuse();
      volumeCreatedAt = volume.CreatedAt;
    }
    let containerId: string | undefined;
    let running = false;
    if (containers.some((entry) => entry.Names === target.containerName)) {
      const container = JSON.parse(await read(['inspect', '--type', 'container', '--format', '{{json .}}', target.containerName]));
      const env: string[] = container.Config?.Env ?? [];
      const postgresEnv = env.filter((entry) => /^POSTGRES_/.test(entry)).sort();
      const expectedEnv = [`POSTGRES_DB=${target.databaseName}`, 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin'].sort();
      const mounts: Array<Record<string, unknown>> = container.Mounts ?? [];
      const data = mounts.find((mount) => mount.Destination === '/var/lib/postgresql/data');
      const admin = mounts.find((mount) => mount.Destination === '/run/secrets/db-admin');
      running = container.State?.Running === true;
      if (!volumeCreatedAt || !/^[a-f0-9]{64}$/.test(container.Id) || container.Name !== `/${target.containerName}`
        || container.Image !== manifest.imageId || container.Config?.Image !== manifest.imageId || !matches(container.Config?.Labels)
        || JSON.stringify(container.Config?.Entrypoint) !== '["docker-entrypoint.sh"]' || JSON.stringify(container.Config?.Cmd) !== '["postgres"]'
        || JSON.stringify(env.filter((entry) => /^PGDATA=/.test(entry))) !== '["PGDATA=/var/lib/postgresql/data"]'
        || JSON.stringify(postgresEnv) !== JSON.stringify(expectedEnv)
        || container.HostConfig?.NetworkMode !== 'bridge' || container.HostConfig?.Privileged !== false
        || container.HostConfig?.PublishAllPorts !== false || !portsMatch(container.HostConfig?.PortBindings)
        || (running && !portsMatch(container.NetworkSettings?.Ports)) || mounts.length !== 2
        || data?.Type !== 'volume' || data.Name !== target.volumeName || data.RW !== true
        || admin?.Type !== 'bind' || admin.RW !== false || !sameMount(admin.Source, path.join(manifest.stateDirectory, 'db-admin'))) refuse();
      containerId = container.Id;
    }
    return { endpoint, containerId, volumeCreatedAt, running };
  } catch { return refuse(); }
}
