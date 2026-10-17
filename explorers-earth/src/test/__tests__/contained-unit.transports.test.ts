import { createRequire } from 'node:module';
import { channel } from 'node:diagnostics_channel';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, expect, inject, it, vi } from 'vitest';

type Canary = { host: '127.0.0.1'; port: number; pid: number };
type CanaryHandle = {
  endpoint: Canary;
  readConnections(): Promise<number>;
  close(): Promise<number>;
};
type CleanupOwner = {
  trackChild(child: import('node:child_process').ChildProcess, role?: 'probe' | 'canary'): void;
  trackRoot(root: string): void;
  trackCanary(canary: CanaryHandle): void;
  dispose(): Promise<void>;
};
type ChildResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  ready: boolean;
};

const require = createRequire(import.meta.url);
const runtime = require('../../../scripts/contained-unit-runtime.cjs') as {
  createCleanupOwner(): CleanupOwner;
  startCanary(owner: CleanupOwner): Promise<CanaryHandle>;
  runOwnedChild(owner: CleanupOwner, invocation: {
    executable: string;
    args: string[];
    options: import('node:child_process').SpawnOptions;
  }, limits: {
    totalMs: number;
    startupMs?: number;
    stdoutBytes: number;
    stderrBytes: number;
  }): Promise<ChildResult>;
  assertBlocked(endpoint: Pick<Canary, 'host' | 'port'>, dependencies?: {
    connect(options: { host: '127.0.0.1'; port: number }): EventEmitter & { destroyed?: boolean };
    destroy(socket: EventEmitter & { destroyed?: boolean }): void;
    setDeadline(callback: () => void, milliseconds: 2_000): unknown;
    clearDeadline(handle: unknown): void;
  }): Promise<'TEST_EGRESS_BLOCKED'>;
};
const launcher = require('../../../scripts/run-contained-vitest.cjs') as {
  buildChildEnv(inherited: NodeJS.ProcessEnv, guard: string): NodeJS.ProcessEnv;
};
const { default: axios } = await vi.importActual<typeof import('axios')>('axios');
const {
  ApolloClient,
  HttpLink,
  InMemoryCache,
  gql,
} = await vi.importActual<typeof import('@apollo/client')>('@apollo/client');
const { createCleanupOwner, startCanary, runOwnedChild, assertBlocked } = runtime;
const boundary = channel('explorers.contained-unit.blocked');
const projectRoot = resolve(import.meta.dirname, '../../..');
const guardPath = resolve(projectRoot, 'scripts/test-unit-egress-guard.cjs');
const probePath = resolve(projectRoot, 'scripts/contained-unit-probe.cjs');
const proxyProbePath = resolve(projectRoot, 'scripts/contained-unit-proxy-probe.cjs');

const pendingOwners = new Set<CleanupOwner>();
function newOwner() {
  const owner = createCleanupOwner();
  pendingOwners.add(owner);
  return owner;
}
async function release(owner: CleanupOwner) {
  await owner.dispose();
  pendingOwners.delete(owner);
}
async function cleanupPending() {
  const results = await Promise.allSettled([...pendingOwners].map(release));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new Error('Containment contract cleanup failed');
}
afterEach(cleanupPending, 12_000);
afterAll(cleanupPending, 12_000);

function timeoutFailure(): Error & { code: string } {
  return Object.assign(new Error('Containment operation exceeded its local deadline'), {
    code: 'CONTAINMENT_CONTRACT_TIMEOUT',
  });
}

async function within<T>(operation: Promise<T>, timeoutMs = 2_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutFailure()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorCodes(value: unknown): Set<string> {
  const codes = new Set<string>();
  const seen = new Set<object>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    const record = candidate as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof record.code === 'string') codes.add(record.code);
    visit(record.cause);
    if (Array.isArray(record.errors)) record.errors.forEach(visit);
  };
  visit(value);
  return codes;
}

function errorNames(value: unknown): Set<string> {
  const names = new Set<string>();
  const seen = new Set<object>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    const record = candidate as { name?: unknown; cause?: unknown; errors?: unknown };
    if (typeof record.name === 'string') names.add(record.name);
    visit(record.cause);
    if (Array.isArray(record.errors)) record.errors.forEach(visit);
  };
  visit(value);
  return names;
}

type BlockEvent = {
  code: string;
  target: { kind: string; host?: string; port?: number; key?: string };
};

async function expectAdapterBlocked(
  operation: () => unknown,
  options: { errorEvent?: boolean; preservesCode?: boolean } = { preservesCode: true },
) {
  const events: BlockEvent[] = [];
  const onBlock = (value: unknown) => events.push(value as BlockEvent);
  boundary.subscribe(onBlock);
  try {
    let failure: unknown;
    try {
      await within(Promise.resolve().then(operation));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    expect(errorCodes(failure)).not.toContain('CONTAINMENT_CONTRACT_TIMEOUT');
    expect(errorCodes(failure)).not.toContain('ABORT_ERR');
    expect(errorNames(failure)).not.toContain('AbortError');
    expect(errorNames(failure)).not.toContain('TimeoutError');
    if (options.errorEvent) expect(failure).toBeInstanceOf(Event);
    if (options.preservesCode !== false) {
      expect(errorCodes(failure)).toContain('TEST_EGRESS_BLOCKED');
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event => event.code === 'TEST_EGRESS_BLOCKED')).toBe(true);
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['code', 'target']);
      expect(Object.keys(event.target).sort()).toEqual(['host', 'key', 'kind', 'port']);
      expect(event.target.kind).toBe('tcp');
    }
    const diagnostics = JSON.stringify(events);
    expect(diagnostics).not.toContain('/probe');
    expect(diagnostics).not.toContain('synthetic');
    expect(diagnostics).not.toContain('authorization');
  } finally {
    boundary.unsubscribe(onBlock);
  }
}

function origin() {
  return `http://127.0.0.1:${inject('containedCanary').endpoint.port}`;
}

class FakeAssertSocket extends EventEmitter {
  destroyed = false;
}

function createAssertBlockedFixture() {
  const socket = new FakeAssertSocket();
  const deadline = { callback: undefined as (() => void) | undefined };
  const handle = {};
  const connect = vi.fn(() => socket);
  const destroy = vi.fn((candidate: FakeAssertSocket) => { candidate.destroyed = true; });
  const setDeadline = vi.fn((callback: () => void, milliseconds: 2_000) => {
    expect(milliseconds).toBe(2_000);
    deadline.callback = callback;
    return handle;
  });
  const clearDeadline = vi.fn();
  const dependencies = { connect, destroy, setDeadline, clearDeadline };
  const verifyCleanup = () => {
    expect(clearDeadline).toHaveBeenCalledOnce();
    expect(clearDeadline).toHaveBeenCalledWith(handle);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
    expect(destroy).toHaveBeenCalledOnce();
    expect(socket.destroyed).toBe(true);
  };
  return { socket, deadline, dependencies, verifyCleanup };
}

it('assertBlocked returns a Promise and observes the scheduled exact block before cleanup', async () => {
  const fixture = createAssertBlockedFixture();
  const pending = assertBlocked(inject('containedCanary').endpoint, fixture.dependencies);
  expect(pending).toBeInstanceOf(Promise);
  let settled = false;
  void pending.finally(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(fixture.socket.listenerCount('error')).toBe(1);
  fixture.socket.emit('error', Object.assign(new Error('TEST_EGRESS_BLOCKED 127.0.0.1'), {
    code: 'TEST_EGRESS_BLOCKED',
  }));
  await expect(pending).resolves.toBe('TEST_EGRESS_BLOCKED');
  fixture.verifyCleanup();
});

it.each([
  ['connect', (fixture: ReturnType<typeof createAssertBlockedFixture>) => fixture.socket.emit('connect'),
    'Containment guard is absent or allowed an unowned endpoint'],
  ['other error', (fixture: ReturnType<typeof createAssertBlockedFixture>) => fixture.socket.emit(
    'error', Object.assign(new Error('synthetic'), { code: 'SYNTHETIC_OTHER' }),
  ), 'Containment probe returned an unexpected error'],
  ['unexplained close', (fixture: ReturnType<typeof createAssertBlockedFixture>) => fixture.socket.emit('close'),
    'Containment probe closed without a block'],
  ['deadline', (fixture: ReturnType<typeof createAssertBlockedFixture>) => fixture.deadline.callback?.(),
    'Containment probe exceeded its local deadline'],
])('assertBlocked rejects %s and removes every helper resource', async (_name, trigger, message) => {
  const fixture = createAssertBlockedFixture();
  const pending = assertBlocked(inject('containedCanary').endpoint, fixture.dependencies);
  expect(pending).toBeInstanceOf(Promise);
  trigger(fixture);
  await expect(pending).rejects.toThrow(message);
  fixture.verifyCleanup();
});

it('inherits the guard in a normal Node descendant', async () => {
  const owner = newOwner();
  try {
    const result = await runOwnedChild(owner, {
      executable: process.execPath,
      args: [probePath, String(inject('containedCanary').endpoint.port)],
      options: {
        cwd: projectRoot,
        env: { ...process.env },
        shell: false,
        windowsHide: true,
      },
    }, { totalMs: 5_000, stdoutBytes: 4_096, stderrBytes: 16_384 });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.ready).toBe(false);
    expect(result.stderr).toBe('');
    const record = JSON.parse(result.stdout) as { pid: number; code: string };
    expect(record.pid).not.toBe(process.pid);
    expect(record.pid).not.toBe(inject('containedCanary').controllerPid);
    expect(record.code).toBe('TEST_EGRESS_BLOCKED');
  } finally {
    await release(owner);
  }
}, 15_000);

it('detects an absent preload using only an owned disposable canary', async () => {
  const owner = newOwner();
  try {
    const canary = await startCanary(owner);
    const env = launcher.buildChildEnv(process.env, guardPath);
    delete env.NODE_OPTIONS;
    const result = await runOwnedChild(owner, {
      executable: process.execPath,
      args: [probePath, String(canary.endpoint.port)],
      options: { cwd: projectRoot, env, shell: false, windowsHide: true },
    }, { totalMs: 5_000, stdoutBytes: 4_096, stderrBytes: 16_384 });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(1);
    expect(result.ready).toBe(false);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('LOCAL_PROBE_FAILED\n');
    await canary.close();
  } finally {
    await release(owner);
  }
}, 25_000);

it('blocks native fetch POST', async () => {
  await expectAdapterBlocked(() => fetch(`${origin()}/probe`, {
    method: 'POST', body: 'synthetic', signal: AbortSignal.timeout(2_000),
  }));
}, 10_000);

it('blocks native fetch HTTPS before TLS handshake', async () => {
  await expectAdapterBlocked(() => fetch(`${origin().replace('http:', 'https:')}/probe`, {
    signal: AbortSignal.timeout(2_000),
  }));
}, 10_000);

it('blocks Axios Node HTTP adapter', async () => {
  await expectAdapterBlocked(() => axios.post(`${origin()}/probe`, 'synthetic', {
    adapter: 'http', proxy: false, timeout: 2_000,
  }));
}, 10_000);

it('blocks Axios actual jsdom XHR adapter', async () => {
  expect(globalThis.XMLHttpRequest).toBeDefined();
  await expectAdapterBlocked(() => axios.post(`${origin()}/probe`, 'synthetic', {
    adapter: 'xhr', timeout: 2_000,
  }), { preservesCode: false });
}, 10_000);

it('blocks direct jsdom XHR', async () => {
  let xhr: XMLHttpRequest | undefined;
  try {
    await expectAdapterBlocked(() => new Promise((resolveRequest, rejectRequest) => {
      xhr = new XMLHttpRequest();
      xhr.open('POST', `${origin()}/probe`);
      xhr.onerror = rejectRequest;
      xhr.onload = resolveRequest;
      xhr.timeout = 2_000;
      xhr.ontimeout = rejectRequest;
      xhr.send('synthetic');
    }), { errorEvent: true, preservesCode: false });
  } finally {
    xhr?.abort();
  }
}, 10_000);

it('blocks Node HTTP', async () => {
  let request: http.ClientRequest | undefined;
  try {
    await expectAdapterBlocked(() => new Promise((resolveRequest, rejectRequest) => {
      try {
        request = http.request(new URL(`${origin()}/probe`), { method: 'POST' }, resolveRequest);
        request.on('error', rejectRequest);
        request.end('synthetic');
      } catch (error) {
        rejectRequest(error);
      }
    }));
  } finally {
    request?.destroy();
  }
}, 10_000);

it('blocks Node HTTPS before TLS handshake', async () => {
  let request: http.ClientRequest | undefined;
  try {
    await expectAdapterBlocked(() => new Promise((resolveRequest, rejectRequest) => {
      try {
        request = https.request(new URL(`${origin().replace('http:', 'https:')}/probe`), {
          method: 'POST',
        }, resolveRequest);
        request.on('error', rejectRequest);
        request.end('synthetic');
      } catch (error) {
        rejectRequest(error);
      }
    }));
  } finally {
    request?.destroy();
  }
}, 10_000);

it('blocks TLS positional connect', async () => {
  let socket: tls.TLSSocket | undefined;
  try {
    await expectAdapterBlocked(() => new Promise((resolveSocket, rejectSocket) => {
      try {
        socket = tls.connect(inject('containedCanary').endpoint.port, '127.0.0.1', {
          rejectUnauthorized: true,
        }, resolveSocket);
        socket.on('error', rejectSocket);
      } catch (error) {
        rejectSocket(error);
      }
    }));
  } finally {
    socket?.destroy();
  }
}, 10_000);

it('blocks Apollo actual HTTP link', async () => {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri: `${origin()}/graphql`, fetch }),
  });
  try {
    await expectAdapterBlocked(() => client.query({
      query: gql`query ContainmentProbe { probe }`,
      fetchPolicy: 'no-cache',
    }));
  } finally {
    client.stop();
  }
}, 10_000);

it('blocks actual WebSocket', async () => {
  let socket: WebSocket | undefined;
  try {
    await expectAdapterBlocked(() => new Promise((resolveSocket, rejectSocket) => {
      socket = new WebSocket(`${origin().replace('http:', 'ws:')}/ws`);
      socket.onopen = resolveSocket;
      socket.onerror = rejectSocket;
    }), { errorEvent: true, preservesCode: false });
  } finally {
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
}, 10_000);

it('restored Vitest mocks do not remove the guard', async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await expect(assertBlocked(inject('containedCanary').endpoint)).resolves.toBe('TEST_EGRESS_BLOCKED');
}, 10_000);

type CapturedRequest = { method: string; url: string; body: string };

async function closeServer(server: http.Server) {
  if (!server.listening) return;
  await within(new Promise<void>((resolveClose, rejectClose) => {
    server.close(error => error ? rejectClose(error) : resolveClose());
  }));
}

async function requestOwned(url: string, method: 'GET' | 'POST', body = '') {
  let request: http.ClientRequest | undefined;
  try {
    return await within(new Promise<string>((resolveRequest, rejectRequest) => {
      request = http.request(url, { method }, response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolveRequest(Buffer.concat(chunks).toString('utf8')));
      });
      request.on('error', rejectRequest);
      request.end(body);
    }));
  } finally {
    request?.destroy();
  }
}

async function listen(server: http.Server, host: '127.0.0.1' | '::1') {
  await within(new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => { server.off('listening', onListen); rejectListen(error); };
    const onListen = () => { server.off('error', onError); resolveListen(); };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(0, host);
  }));
}

it('allows GET and POST to an owned IPv4 listener', async () => {
  const captured: CapturedRequest[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      captured.push({
        method: request.method || '',
        url: request.url || '',
        body: Buffer.concat(chunks).toString('utf8'),
      });
      response.end(request.method === 'POST' ? 'post-ok' : 'get-ok');
    });
  });
  try {
    await listen(server, '127.0.0.1');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Owned listener has no TCP address');
    const ownedOrigin = `http://127.0.0.1:${address.port}`;
    expect(await requestOwned(`${ownedOrigin}/get`, 'GET')).toBe('get-ok');
    expect(await requestOwned(`${ownedOrigin}/post`, 'POST', 'owned-synthetic')).toBe('post-ok');
    expect(captured).toEqual([
      { method: 'GET', url: '/get', body: '' },
      { method: 'POST', url: '/post', body: 'owned-synthetic' },
    ]);
  } finally {
    await closeServer(server);
  }
}, 10_000);

it('allows a request to an owned IPv6 listener when IPv6 is available', async () => {
  const server = http.createServer((_request, response) => response.end('ipv6-ok'));
  try {
    try {
      await listen(server, '::1');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EAFNOSUPPORT' || code === 'EADDRNOTAVAIL') return;
      throw error;
    }
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Owned IPv6 listener has no address');
    expect(await requestOwned(`http://[::1]:${address.port}/ipv6`, 'GET')).toBe('ipv6-ok');
  } finally {
    await closeServer(server);
  }
}, 10_000);

it('blocks default Vite forwarding in a disposable strict Node child', async () => {
  const owner = newOwner();
  try {
    const root = await mkdtemp(join(tmpdir(), 'contained-proxy-'));
    owner.trackRoot(root);
    const canary = await startCanary(owner);
    const result = await runOwnedChild(owner, {
      executable: process.execPath,
      args: [
        '--unhandled-rejections=strict',
        proxyProbePath,
        root,
        String(canary.endpoint.port),
      ],
      options: {
        cwd: projectRoot,
        env: { ...process.env },
        shell: false,
        windowsHide: true,
      },
    }, {
      totalMs: 12_000,
      startupMs: 9_000,
      stdoutBytes: 4_096,
      stderrBytes: 16_384,
    });
    expect(result.ready).toBe(true);
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${JSON.stringify({
      code: 'TEST_EGRESS_BLOCKED',
      host: '127.0.0.1',
      port: canary.endpoint.port,
    })}\n`);
    expect(result.stderr).toBe('');
    expect(await canary.readConnections()).toBe(0);
    expect(await canary.close()).toBe(0);
  } finally {
    await release(owner);
  }
}, 30_000);
