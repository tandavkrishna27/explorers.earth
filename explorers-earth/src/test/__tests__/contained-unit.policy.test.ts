import { EventEmitter, errorMonitor } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  canonicalLoopback,
  createPolicy,
  installGuard,
  normalizeConnectArgs,
} = require('../../../scripts/unit-egress-policy.cjs');

type Address = { address: string; port: number } | string | null;

function expectBlocked(run: () => unknown, metadata?: string) {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toEqual(expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' }));
  if (metadata) expect((caught as Error).message).toContain(metadata);
  return caught as Error & { code: string };
}

function createFakeModules(options: {
  nativeConnect?: (this: unknown, options: Record<string, unknown>, callback?: () => void) => unknown;
  listen?: (this: EventEmitter, ...args: unknown[]) => unknown;
  close?: (this: EventEmitter, ...args: unknown[]) => unknown;
} = {}) {
  const deferred: Array<() => void> = [];
  const deferFailure = vi.fn((callback: () => void) => deferred.push(callback));
  const nativeReturn = { native: true };
  const socketNativeReturn = { socketNative: true };
  const nativeConnect = options.nativeConnect ?? function () { return nativeReturn; };
  const socketConnect = vi.fn(function (this: unknown, connectOptions: Record<string, unknown>, callback?: () => void) {
    return nativeConnect.call(this, connectOptions, callback) ?? socketNativeReturn;
  });
  const netConnect = vi.fn(function (this: unknown, connectOptions: Record<string, unknown>, callback?: () => void) {
    return nativeConnect.call(this, connectOptions, callback);
  });
  const createConnection = vi.fn(function (this: unknown, connectOptions: Record<string, unknown>, callback?: () => void) {
    return nativeConnect.call(this, connectOptions, callback);
  });
  const tlsConnect = vi.fn(function (this: unknown, connectOptions: Record<string, unknown>, callback?: () => void) {
    return nativeConnect.call(this, connectOptions, callback);
  });

  class FakeSocket extends EventEmitter {
    connecting = false;
    destroyed = false;
    closed = false;
    writable = true;
    _handle: unknown = null;
    bufferedWrites: unknown[] = [];

    write(value: unknown) {
      if (!this.connecting || this.destroyed) throw Object.assign(new Error('socket closed'), { code: 'ERR_SOCKET_CLOSED' });
      this.bufferedWrites.push(value);
      return true;
    }
  }
  const destroy = vi.fn(function (this: FakeSocket, error?: Error) {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.connecting = false;
    this.writable = false;
    deferred.push(() => {
      if (error) this.emit('error', error);
      this.closed = true;
      this.emit('close');
    });
    return this;
  });
  const undestroy = vi.fn(function (this: FakeSocket) {
    this.destroyed = false;
    this.closed = false;
    this.writable = true;
  });
  Object.defineProperties(FakeSocket.prototype, {
    connect: { configurable: true, writable: true, value: socketConnect },
    destroy: { configurable: true, writable: true, value: destroy },
    _undestroy: { configurable: true, writable: true, value: undestroy },
  });

  function _tlsError() {}
  class FakeTLSSocket extends FakeSocket {
    constructor() {
      super();
      this.on('error', _tlsError);
    }
  }
  const releaseControl = vi.fn(function (this: FakeTLSSocket) {
    this.off('error', _tlsError);
  });
  Object.defineProperty(FakeTLSSocket.prototype, '_releaseControl', {
    configurable: true,
    writable: true,
    value: releaseControl,
  });

  class FakeServer extends EventEmitter {
    currentAddress: Address = null;
  }
  const listen = vi.fn(options.listen ?? function (this: EventEmitter, ...args: unknown[]) {
    const callback = args.findLast(value => typeof value === 'function') as (() => void) | undefined;
    if (callback) this.once('listening', () => callback.call(this));
    return this;
  });
  const close = vi.fn(options.close ?? function (this: EventEmitter) { return this; });
  Object.defineProperties(FakeServer.prototype, {
    listen: { configurable: true, writable: true, value: listen },
    close: { configurable: true, writable: true, value: close },
    address: { configurable: true, writable: true, value(this: FakeServer) { return this.currentAddress; } },
  });

  const net = {
    Server: FakeServer,
    Socket: FakeSocket,
    connect: netConnect,
    createConnection,
  };
  const tls = { TLSSocket: FakeTLSSocket, connect: tlsConnect };
  const syncBuiltinESMExports = vi.fn();
  const publishBlocked = vi.fn();
  installGuard({ net, tls, syncBuiltinESMExports, publishBlocked, deferFailure });
  return {
    FakeServer,
    FakeSocket,
    FakeTLSSocket,
    close,
    createConnection,
    deferred,
    deferFailure,
    destroy,
    listen,
    nativeReturn,
    net,
    netConnect,
    publishBlocked,
    socketConnect,
    syncBuiltinESMExports,
    tls,
    tlsConnect,
    undestroy,
    releaseControl,
  };
}

async function expectInstalledBlocked(
  fixture: ReturnType<typeof createFakeModules>,
  run: () => InstanceType<ReturnType<typeof createFakeModules>['FakeSocket']>,
  metadata?: string,
) {
  const nativeCounts = [
    fixture.socketConnect.mock.calls.length,
    fixture.netConnect.mock.calls.length,
    fixture.createConnection.mock.calls.length,
    fixture.tlsConnect.mock.calls.length,
  ];
  const diagnosticCount = fixture.publishBlocked.mock.calls.length;
  const order: string[] = [];
  const socket = run();
  let received: (Error & { code?: string }) | undefined;
  socket.once('error', error => { received = error as Error & { code?: string }; order.push('error'); });
  socket.once('close', () => order.push('close'));
  expect(fixture.deferred).toHaveLength(1);
  fixture.deferred.shift()?.();
  expect(received).toBeUndefined();
  expect(order).toEqual([]);
  expect(fixture.deferred).toHaveLength(1);
  fixture.deferred.shift()?.();
  expect(received).toEqual(expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' }));
  if (metadata) expect(received?.message).toContain(metadata);
  expect(order).toEqual(['error', 'close']);
  expect(fixture.deferred).toHaveLength(0);
  expect([
    fixture.socketConnect.mock.calls.length,
    fixture.netConnect.mock.calls.length,
    fixture.createConnection.mock.calls.length,
    fixture.tlsConnect.mock.calls.length,
  ]).toEqual(nativeCounts);
  expect(fixture.publishBlocked.mock.calls.length).toBe(diagnosticCount + 1);
  return { socket, error: received!, order };
}

function authorize(fixture: ReturnType<typeof createFakeModules>, host = '127.0.0.1', port = 45678) {
  const server = new fixture.FakeServer();
  server.currentAddress = { address: host, port };
  server.listen({ host, port });
  server.emit('listening');
  return server;
}

describe('strict target normalization', () => {
  it('denies unowned TCP without invoking the captured native function', () => {
    const original = vi.fn(() => { throw new Error('FAKE_NATIVE_REACHED'); });
    const policy = createPolicy();
    const { target } = normalizeConnectArgs([{ host: '203.0.113.10', port: 443 }]);
    expect(() => { policy.assertAllowed(target); original(); })
      .toThrow(expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' }));
    expect(original).not.toHaveBeenCalled();
  });

  it.each([
    ['documentation IPv4', [{ host: '203.0.113.10', port: 443 }]],
    ['documentation IPv6', [{ host: '2001:db8::1', port: 443 }]],
  ])('blocks remote target: %s', (_name, args) => {
    const original = vi.fn(() => { throw new Error('FAKE_NATIVE_REACHED'); });
    const policy = createPolicy();
    const { target } = normalizeConnectArgs(args);
    expectBlocked(() => { policy.assertAllowed(target); original(); });
    expect(original).not.toHaveBeenCalled();
  });

  it.each([
    ['localhost with custom lookup', 'localhost', 80],
    ['remote hostname with custom lookup', 'music.invalid', 443],
  ])('blocks hostname without lookup: %s', (_name, host, port) => {
    const fakeLookup = vi.fn(() => { throw new Error('FAKE_LOOKUP_REACHED'); });
    const original = vi.fn((options: { lookup?: () => never }) => {
      options.lookup?.();
      throw new Error('FAKE_NATIVE_REACHED');
    });
    const policy = createPolicy();
    const parsed = normalizeConnectArgs([{ host, port, lookup: fakeLookup }]);
    expectBlocked(() => { policy.assertAllowed(parsed.target); original(parsed.options); });
    expect(fakeLookup).not.toHaveBeenCalled();
    expect(original).not.toHaveBeenCalled();
  });

  it.each([
    ['backend port', 5000],
    ['alternate backend port', 5001],
    ['Vite port', 5174],
  ])('blocks unowned loopback endpoint: %s', (_name, port) => {
    const native = vi.fn();
    const policy = createPolicy();
    const { target } = normalizeConnectArgs([{ host: '127.0.0.1', port }]);
    expectBlocked(() => { policy.assertAllowed(target); native(); }, `127.0.0.1:${port}`);
    expect(native).not.toHaveBeenCalled();
  });

  it.each([
    ['abbreviated IPv4', '127.1'],
    ['integer IPv4', '2130706433'],
    ['octal-looking IPv4', '0177.0.0.1'],
    ['zero-padded IPv4', '127.00.0.1'],
    ['out-of-range IPv4', '127.0.0.999'],
    ['scoped IPv6', '::1%lo'],
    ['bracketed IPv6', '[::1]'],
    ['empty host', ''],
  ])('rejects ambiguous loopback spelling: %s', (_name, host) => {
    expect(normalizeConnectArgs([{ host, port: 45678 }]).target).toEqual({ kind: 'blocked', label: 'invalid' });
  });

  it.each([
    ['Unix socket path', ['/tmp/unit.sock'], '/tmp/unit.sock'],
    ['local named pipe', [{ path: '\\\\.\\pipe\\unit' }], '\\\\.\\pipe\\unit'],
    ['remote named pipe', [{ path: '\\\\host\\pipe\\unit' }], '\\\\host\\pipe\\unit'],
  ])('blocks IPC without disclosing path: %s', (_name, args, secretPath) => {
    const policy = createPolicy();
    const { target } = normalizeConnectArgs(args);
    const error = expectBlocked(() => policy.assertAllowed(target), 'ipc');
    expect(target).toEqual({ kind: 'blocked', label: 'ipc' });
    expect(error.message).not.toContain(secretPath);
  });

  it.each([
    ['zero port', [{ host: '127.0.0.1', port: 0 }]],
    ['missing host', [{ port: 45678 }]],
    ['missing port', [{ host: '127.0.0.1' }]],
    ['NaN port', [{ host: '127.0.0.1', port: Number.NaN }]],
    ['fractional port', [{ host: '127.0.0.1', port: 1.5 }]],
    ['negative port', [{ host: '127.0.0.1', port: -1 }]],
    ['too-large port', [{ host: '127.0.0.1', port: 65536 }]],
    ['ambiguous numeric-looking path', ['45678.socket'], 'ipc'],
    ['supplied socket', [{ host: '127.0.0.1', port: 45678, socket: {} }]],
    ['supplied fd', [{ host: '127.0.0.1', port: 45678, fd: 4 }]],
  ])('rejects invalid target: %s', (_name, args, label = 'invalid') => {
    expect(normalizeConnectArgs(args).target).toEqual({ kind: 'blocked', label });
  });

  it('treats a valid TCP endpoint as authoritative and strips an unrelated path', () => {
    const parsed = normalizeConnectArgs([{ host: '127.0.0.1', port: 45678, path: '/graphql?token=synthetic' }]);
    expect(parsed.target).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 45678, key: '127.0.0.1|45678' });
    expect(parsed.options).toEqual({ host: '127.0.0.1', port: 45678 });
    const policy = createPolicy();
    const error = expectBlocked(() => policy.assertAllowed(parsed.target));
    expect(error.message).not.toContain('graphql');
    expect(error.message).not.toContain('synthetic');
  });

  it('uses positional host and port over conflicting option objects', () => {
    const parsed = normalizeConnectArgs([45678, '127.0.0.1', { host: '203.0.113.10', port: 443 }]);
    expect(parsed.target).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 45678, key: '127.0.0.1|45678' });
    expect(parsed.options).toEqual({ host: '127.0.0.1', port: 45678 });
  });

  it('blocks a positional remote endpoint even when a loopback object follows', () => {
    const policy = createPolicy();
    policy.register({}, '127.0.0.1', { address: '127.0.0.1', port: 45678 });
    const parsed = normalizeConnectArgs([443, '203.0.113.10', { host: '127.0.0.1', port: 45678 }]);
    expectBlocked(() => policy.assertAllowed(parsed.target), 'invalid');
  });

  it('recognizes internal normalized args and preserves the callback', () => {
    const callback = vi.fn();
    const parsed = normalizeConnectArgs([[{ host: '127.0.0.1', port: 45678 }, callback]]);
    expect(parsed.target).toEqual({ kind: 'tcp', host: '127.0.0.1', port: 45678, key: '127.0.0.1|45678' });
    expect(parsed.callback).toBe(callback);
  });

  it.each([
    ['IPv4 loopback', '127.0.0.1', '127.0.0.1'],
    ['IPv4-mapped decimal IPv6', '::ffff:127.0.0.1', '127.0.0.1'],
    ['IPv4-mapped hexadecimal IPv6', '::ffff:7f00:1', '127.0.0.1'],
    ['expanded IPv6 loopback', '0:0:0:0:0:0:0:1', '::1'],
  ])('canonicalizes %s', (_name, input, expected) => {
    expect(canonicalLoopback(input)).toBe(expected);
  });
});

describe('endpoint ownership registry', () => {
  it('uses the actual nonzero port returned for a requested ephemeral listener', () => {
    const policy = createPolicy();
    const server = {};
    policy.register(server, '127.0.0.1', { address: '127.0.0.1', port: 45678 });
    expect(() => policy.assertAllowed(normalizeConnectArgs([{ host: '127.0.0.1', port: 45678 }]).target)).not.toThrow();
    expectBlocked(() => policy.assertAllowed(normalizeConnectArgs([{ host: '127.0.0.1', port: 0 }]).target));
  });

  it('grants only the exact canonical host and port', () => {
    const policy = createPolicy();
    policy.register({}, '127.0.0.1', { address: '127.0.0.1', port: 45678 });
    expectBlocked(() => policy.assertAllowed(normalizeConnectArgs([{ host: '127.0.0.2', port: 45678 }]).target));
    expectBlocked(() => policy.assertAllowed(normalizeConnectArgs([{ host: '::1', port: 45678 }]).target));
  });

  it.each([
    ['IPv4-mapped decimal listener', '::ffff:127.0.0.1'],
    ['IPv4-mapped hexadecimal listener', '::ffff:7f00:1'],
  ])('maps %s to the IPv4 ownership key', (_name, address) => {
    const policy = createPolicy();
    policy.register({}, address, { address, port: 45678 });
    expect(() => policy.assertAllowed(normalizeConnectArgs([{ host: '127.0.0.1', port: 45678 }]).target)).not.toThrow();
  });

  it('maps expanded IPv6 loopback to the compressed ownership key', () => {
    const policy = createPolicy();
    policy.register({}, '0:0:0:0:0:0:0:1', { address: '::1', port: 45678 });
    expect(() => policy.assertAllowed(normalizeConnectArgs([{ host: '::1', port: 45678 }]).target)).not.toThrow();
  });

  it.each([
    ['hostname request', 'localhost'],
    ['omitted host request', undefined],
    ['IPv4 wildcard request', '0.0.0.0'],
    ['IPv6 wildcard request', '::'],
    ['remote request', '203.0.113.10'],
  ])('does not grant when requested host is not explicit loopback: %s', (_name, requestedHost) => {
    const policy = createPolicy();
    policy.register({}, requestedHost, { address: '127.0.0.1', port: 45678 });
    expectBlocked(() => policy.assertAllowed(normalizeConnectArgs([{ host: '127.0.0.1', port: 45678 }]).target));
  });

  it('maintains independent server refcounts and makes repeated removal harmless', () => {
    const policy = createPolicy();
    const address = { address: '127.0.0.1', port: 45678 };
    const first = { address: () => address }, second = { address: () => address };
    const target = normalizeConnectArgs([{ host: '127.0.0.1', port: 45678 }]).target;
    policy.register(first, '127.0.0.1', first.address());
    policy.register(second, '127.0.0.1', second.address());
    policy.remove(first);
    policy.remove(first);
    expect(() => policy.assertAllowed(target)).not.toThrow();
    policy.remove(second);
    expectBlocked(() => policy.assertAllowed(target));
  });
});

describe('fake-native guard installation', () => {
  it('registers before the user listening callback can connect', () => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    const callback = vi.fn(() => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
    server.listen({ host: '127.0.0.1', port: 0 }, callback);
    server.emit('listening');
    expect(callback).toHaveBeenCalledOnce();
    expect(fixture.netConnect).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45678 });
  });

  it('grants nothing before listening and grants the actual ephemeral endpoint afterward', async () => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen(0, '127.0.0.1');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
    server.emit('listening');
    expect(() => fixture.net.connect({ host: '127.0.0.1', port: 45678 })).not.toThrow();
  });

  it('does not authorize a failed listen', async () => {
    const fixture = createFakeModules({ listen() { throw new Error('SYNTHETIC_LISTEN_FAILURE'); } });
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    expect(() => server.listen({ host: '127.0.0.1', port: 45678 })).toThrow('SYNTHETIC_LISTEN_FAILURE');
    expect(server.listenerCount('listening')).toBe(0);
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount(errorMonitor)).toBe(0);
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it('clears a pending grant without swallowing an unhandled asynchronous bind error', async () => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen({ host: '127.0.0.1', port: 45678 });
    const failure = new Error('SYNTHETIC_ASYNC_LISTEN_FAILURE');
    expect(() => server.emit('error', failure)).toThrow(failure);
    expect(server.listenerCount(errorMonitor)).toBe(0);
    server.emit('listening');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it('clears a pending grant while a user error handler receives the original error once', async () => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    const userErrorHandler = vi.fn();
    server.once('error', userErrorHandler);
    server.listen({ host: '127.0.0.1', port: 45678 });
    const failure = new Error('SYNTHETIC_HANDLED_BIND_FAILURE');
    expect(() => server.emit('error', failure)).not.toThrow();
    expect(userErrorHandler).toHaveBeenCalledOnce();
    expect(userErrorHandler).toHaveBeenCalledWith(failure);
    expect(server.listenerCount(errorMonitor)).toBe(0);
    server.emit('listening');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it('refuses adopted fd listeners carrying a misleading numeric loopback host', async () => {
    const native = vi.fn(() => { throw new Error('FAKE_NATIVE_REACHED'); });
    const fixture = createFakeModules({ nativeConnect: native });
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen({ fd: 42, host: '127.0.0.1' });
    server.emit('listening');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
    expect(native).not.toHaveBeenCalled();
  });

  it.each([
    ['handle-only options', { handle: {}, host: '127.0.0.1' }],
    ['pipe options', { path: '/tmp/unit.sock', host: '127.0.0.1' }],
    ['fd mixed with a port', { fd: 42, port: 45678, host: '127.0.0.1' }],
    ['handle mixed with a port', { handle: {}, port: 45678, host: '127.0.0.1' }],
    ['path mixed with a port', { path: '/tmp/unit.sock', port: 45678, host: '127.0.0.1' }],
  ])('refuses %s even when it carries misleading TCP fields', async (_name, listenOptions) => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen(listenOptions);
    server.emit('listening');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it('does not stack permanent close listeners across repeated listens', () => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen({ host: '127.0.0.1', port: 45678 });
    server.emit('listening');
    server.listen({ host: '127.0.0.1', port: 45678 });
    server.emit('listening');
    expect(server.listenerCount('close')).toBe(1);
  });

  it('revokes on close invocation and on a close event', async () => {
    const fixture = createFakeModules();
    const first = authorize(fixture);
    first.close();
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));

    const second = authorize(fixture);
    second.emit('close');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it.each([
    ['hostname', { host: 'localhost', port: 45678 }],
    ['omitted host', { port: 45678 }],
    ['wildcard', { host: '0.0.0.0', port: 45678 }],
    ['remote', { host: '203.0.113.10', port: 45678 }],
    ['pipe', { path: '/tmp/unit.sock' }],
  ])('never grants from a %s listener', async (_name, listenOptions) => {
    const fixture = createFakeModules();
    const server = new fixture.FakeServer();
    server.currentAddress = { address: '127.0.0.1', port: 45678 };
    server.listen(listenOptions);
    server.emit('listening');
    await expectInstalledBlocked(fixture, () => fixture.net.connect({ host: '127.0.0.1', port: 45678 }));
  });

  it('patches every entrypoint, syncs ESM aliases, and dispatches exactly the checked target', () => {
    const fixture = createFakeModules();
    authorize(fixture);
    const callback = vi.fn();
    const receiver = { marker: 'receiver' };
    const socket = new fixture.FakeSocket();

    expect(fixture.net.connect.call(receiver, 45678, '127.0.0.1')).toBe(fixture.nativeReturn);
    expect(fixture.net.createConnection({ host: '127.0.0.1', port: 45678 }, callback)).toBe(fixture.nativeReturn);
    expect(socket.connect([{ host: '127.0.0.1', port: 45678 }, callback])).toBe(fixture.nativeReturn);
    expect(fixture.tls.connect({ host: '127.0.0.1', port: 45678, servername: 'music.invalid' }, callback)).toBe(fixture.nativeReturn);

    expect(fixture.syncBuiltinESMExports).toHaveBeenCalledOnce();
    expect(fixture.netConnect.mock.instances[0]).toBe(receiver);
    expect(fixture.netConnect.mock.calls[0]).toEqual([{ host: '127.0.0.1', port: 45678 }]);
    expect(fixture.createConnection).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45678 }, callback);
    expect(fixture.socketConnect).toHaveBeenCalledWith({ host: '127.0.0.1', port: 45678 }, callback);
    expect(fixture.tlsConnect).toHaveBeenCalledWith(
      { host: '127.0.0.1', port: 45678, servername: 'music.invalid' },
      callback,
    );
  });

  it('returns the receiver from a denied Socket.prototype.connect and defers its original block', async () => {
    const fixture = createFakeModules();
    const socket = new fixture.FakeSocket();
    const returned = socket.connect({ host: '127.0.0.1', port: 45678 });
    const order: string[] = [];
    let received: (Error & { code?: string }) | undefined;
    returned.once('error', error => { received = error as Error & { code?: string }; order.push('error'); });
    returned.once('close', () => order.push('close'));
    expect(returned).toBe(socket);
    expect(socket.connecting).toBe(true);
    fixture.deferred.shift()?.();
    expect(received).toBeUndefined();
    fixture.deferred.shift()?.();
    expect(received).toEqual(expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' }));
    expect(received?.message).toContain('127.0.0.1:45678');
    expect(order).toEqual(['error', 'close']);
    expect(fixture.socketConnect).not.toHaveBeenCalled();
  });

  it('returns fresh shape-correct sockets from denied net and TLS factories', async () => {
    const fixture = createFakeModules();
    const first = fixture.net.connect({ host: '127.0.0.1', port: 45678 });
    first.on('error', () => {});
    const second = fixture.net.createConnection({ host: '127.0.0.1', port: 45678 });
    second.on('error', () => {});
    const secure = fixture.tls.connect({ host: '127.0.0.1', port: 45678 });
    secure.on('error', () => {});
    expect(first).toBeInstanceOf(fixture.FakeSocket);
    expect(second).toBeInstanceOf(fixture.FakeSocket);
    expect(secure).toBeInstanceOf(fixture.FakeTLSSocket);
    expect(Object.getPrototypeOf(secure)).toBe(fixture.FakeTLSSocket.prototype);
    expect(first).not.toBe(second);
    expect(fixture.releaseControl).toHaveBeenCalledOnce();
    expect(secure.listeners('error').map(listener => listener.name)).not.toContain('_tlsError');
    while (fixture.deferred.length) fixture.deferred.shift()?.();
    expect(fixture.netConnect).not.toHaveBeenCalled();
    expect(fixture.createConnection).not.toHaveBeenCalled();
    expect(fixture.tlsConnect).not.toHaveBeenCalled();
  });

  it('publishes once before queueing denial and never fires success events or callbacks', async () => {
    const fixture = createFakeModules();
    const callback = vi.fn();
    const eventOrder: string[] = [];
    fixture.publishBlocked.mockImplementation(() => eventOrder.push('diagnostic'));
    fixture.deferFailure.mockImplementation(callbackToQueue => {
      eventOrder.push('queued');
      fixture.deferred.push(callbackToQueue);
    });
    const socket = fixture.net.connect({ host: '127.0.0.1', port: 45678 }, callback);
    const connect = vi.fn();
    const secureConnect = vi.fn();
    const errors: unknown[] = [];
    socket.on('connect', connect);
    socket.on('secureConnect', secureConnect);
    socket.on('error', error => { errors.push(error); eventOrder.push('error'); });
    socket.on('close', () => eventOrder.push('close'));
    expect(eventOrder).toEqual(['diagnostic', 'queued']);
    expect(fixture.publishBlocked).toHaveBeenCalledOnce();
    fixture.deferred.shift()?.();
    expect(errors).toEqual([]);
    fixture.deferred.shift()?.();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' }));
    expect(eventOrder).toEqual(['diagnostic', 'queued', 'error', 'close']);
    expect(connect).not.toHaveBeenCalled();
    expect(secureConnect).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(fixture.netConnect).not.toHaveBeenCalled();
  });

  it('buffers an immediate write while a denied socket is connecting', async () => {
    const fixture = createFakeModules();
    const socket = fixture.net.connect({ host: '127.0.0.1', port: 45678 });
    socket.on('error', () => {});
    expect(() => socket.write('synthetic')).not.toThrow();
    expect(socket.bufferedWrites).toEqual(['synthetic']);
    while (fixture.deferred.length) fixture.deferred.shift()?.();
    expect(fixture.netConnect).not.toHaveBeenCalled();
  });

  it('delivers denial to Undici-like immediate and HTTP-like next-turn listeners', () => {
    const fixture = createFakeModules();
    const immediate = fixture.net.connect({ host: '127.0.0.1', port: 45678 });
    const immediateErrors: unknown[] = [];
    immediate.on('error', error => immediateErrors.push(error));
    fixture.deferred.shift()?.();
    expect(immediateErrors).toEqual([]);
    fixture.deferred.shift()?.();
    expect(immediateErrors).toEqual([expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' })]);

    const nextTurn = fixture.net.connect({ host: '127.0.0.1', port: 45678 });
    const nextTurnErrors: unknown[] = [];
    fixture.deferFailure(() => nextTurn.on('error', error => nextTurnErrors.push(error)));
    fixture.deferred.shift()?.();
    expect(nextTurnErrors).toEqual([]);
    fixture.deferred.shift()?.();
    fixture.deferred.shift()?.();
    expect(nextTurnErrors).toEqual([expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' })]);
  });

  it('ordinary cancellation before denial starts no native connection or success event', () => {
    const fixture = createFakeModules();
    const callback = vi.fn();
    const socket = fixture.net.connect({ host: '127.0.0.1', port: 45678 }, callback);
    const success = vi.fn();
    const error = vi.fn();
    socket.on('connect', success);
    socket.on('error', error);
    socket.destroy();
    while (fixture.deferred.length) fixture.deferred.shift()?.();
    expect(error).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(fixture.netConnect).not.toHaveBeenCalled();
  });

  it('resets a fully closed receiver for one new denied connect sequence', async () => {
    const fixture = createFakeModules();
    const socket = new fixture.FakeSocket();
    socket.destroy();
    fixture.deferred.shift()?.();
    expect(socket.closed).toBe(true);
    fixture.undestroy.mockClear();
    const result = await expectInstalledBlocked(
      fixture,
      () => socket.connect({ host: '127.0.0.1', port: 45678 }),
    );
    expect(result.socket).toBe(socket);
    expect(fixture.undestroy).toHaveBeenCalledOnce();
    expect(result.order).toEqual(['error', 'close']);
    expect(fixture.socketConnect).not.toHaveBeenCalled();
  });

  it('uses captured reset and destroy lifecycle methods instead of receiver overrides', () => {
    const fixture = createFakeModules();
    const socket = new fixture.FakeSocket();
    Reflect.apply(fixture.destroy, socket, []);
    fixture.deferred.shift()?.();
    const overriddenUndestroy = vi.fn(() => { throw new Error('OVERRIDDEN_UNDESTROY_REACHED'); });
    const overriddenDestroy = vi.fn(() => { throw new Error('OVERRIDDEN_DESTROY_REACHED'); });
    Object.defineProperties(socket, {
      _undestroy: { configurable: true, value: overriddenUndestroy },
      destroy: { configurable: true, value: overriddenDestroy },
    });
    const errors: unknown[] = [];
    socket.connect({ host: '127.0.0.1', port: 45678 }).on('error', error => errors.push(error));
    while (fixture.deferred.length) fixture.deferred.shift()?.();
    expect(overriddenUndestroy).not.toHaveBeenCalled();
    expect(overriddenDestroy).not.toHaveBeenCalled();
    expect(errors).toEqual([expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' })]);
  });

  it('does not reopen or authorize an already adopted receiver on denial', async () => {
    const fixture = createFakeModules();
    const socket = new fixture.FakeSocket();
    socket._handle = { adopted: true };
    socket.connecting = false;
    const returned = socket.connect({ host: '127.0.0.1', port: 45678 });
    const errors: unknown[] = [];
    returned.on('error', error => errors.push(error));
    expect(returned).toBe(socket);
    expect(socket.connecting).toBe(false);
    expect(fixture.undestroy).not.toHaveBeenCalled();
    expect(fixture.socketConnect).not.toHaveBeenCalled();
    fixture.deferred.shift()?.();
    fixture.deferred.shift()?.();
    expect(errors).toEqual([expect.objectContaining({ code: 'TEST_EGRESS_BLOCKED' })]);
  });

  it('blocks before fake lookup/native invocation and publishes only a safe target', async () => {
    const fakeLookup = vi.fn(() => { throw new Error('FAKE_LOOKUP_REACHED'); });
    const native = vi.fn(function (options: Record<string, unknown>) {
      (options.lookup as (() => never) | undefined)?.();
      throw new Error('FAKE_NATIVE_REACHED');
    });
    const fixture = createFakeModules({ nativeConnect: native });
    await expectInstalledBlocked(
      fixture,
      () => fixture.net.connect({ host: 'localhost', port: 80, lookup: fakeLookup }),
      'invalid',
    );
    expect(native).not.toHaveBeenCalled();
    expect(fakeLookup).not.toHaveBeenCalled();
    expect(fixture.publishBlocked).toHaveBeenCalledWith({
      code: 'TEST_EGRESS_BLOCKED',
      target: { kind: 'blocked', label: 'invalid' },
    });
  });

  it('does not disclose an IPC path in its error or diagnostic event', async () => {
    const fixture = createFakeModules();
    const path = '\\\\.\\pipe\\synthetic-secret';
    const { error } = await expectInstalledBlocked(fixture, () => fixture.net.connect({ path }), 'ipc');
    expect(error.message).not.toContain(path);
    expect(JSON.stringify(fixture.publishBlocked.mock.calls)).not.toContain(path);
  });

  it('proves the fake-native fixture detects a pass-through installer', () => {
    const native = vi.fn(() => { throw new Error('FAKE_NATIVE_REACHED'); });
    const fakeNet = { connect: native };
    const installPassThrough = (net: typeof fakeNet) => {
      const captured = net.connect;
      net.connect = function (...args: unknown[]) { return Reflect.apply(captured, this, args); };
    };
    installPassThrough(fakeNet);
    expect(() => fakeNet.connect({ host: '203.0.113.10', port: 443 })).toThrow('FAKE_NATIVE_REACHED');
    expect(native).toHaveBeenCalledOnce();
  });
});

describe('real disconnected socket denial lifecycle', () => {
  const probe = resolve(projectRootForProbe(), 'scripts/contained-unit-socket-error-probe.cjs');
  const diagnostic = `${JSON.stringify({
    code: 'TEST_EGRESS_BLOCKED', host: '127.0.0.1', port: 45678,
  })}\n`;

  function projectRootForProbe() {
    return resolve(import.meta.dirname, '../../..');
  }

  function runMode(mode: string) {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    return spawnSync(process.execPath, [probe, mode], {
      cwd: projectRootForProbe(),
      env,
      encoding: 'utf8',
      timeout: 5_000,
      maxBuffer: 16_384,
      windowsHide: true,
    });
  }

  it.each(['net-handled', 'tls-handled', 'net-reused-closed'])(
    'completes handled mode %s with one diagnostic and no native call',
    mode => {
      const result = runMode(mode);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(diagnostic);
      expect(result.stderr).toBe('');
    },
  );

  it.each(['net-unhandled', 'tls-unhandled'])(
    'exits naturally from a later unhandled denied socket error in mode %s',
    mode => {
      const result = runMode(mode);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe(diagnostic);
      expect(result.stderr.includes('TEST_EGRESS_BLOCKED')).toBe(true);
    },
  );

  it('rejects a synchronous scheduler throw as unhandled-error evidence', () => {
    const result = runMode('net-unhandled-sync-control');
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(73);
    expect(result.status).not.toBe(1);
    expect(result.stdout).toBe(diagnostic);
  });

  it.each([
    ['net-unhandled-queued-assert-control', 73],
    ['tls-unhandled-queued-assert-control', 73],
    ['net-unhandled-queued-native-control', 74],
    ['tls-unhandled-queued-native-control', 74],
  ])('rejects %s even after the denied error has been queued', (mode, expectedStatus) => {
    const result = runMode(String(mode));
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(expectedStatus);
    expect(result.status).not.toBe(1);
    expect(result.stdout).toBe(diagnostic);
    expect(result.stderr).toBe('');
  });
});
