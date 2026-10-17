'use strict';

const { errorMonitor } = require('node:events');
const { isIP } = require('node:net');

function canonicalLoopback(host) {
  if (typeof host !== 'string' || host.includes('%')) return null;
  if (isIP(host) === 4) return host.startsWith('127.') ? host : null;
  if (isIP(host) !== 6) return null;
  const normalized = new URL(`http://[${host}]/`).hostname.slice(1, -1).toLowerCase();
  if (normalized === '::1') return '::1';
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (!mapped) return null;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  const ipv4 = `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
  return ipv4.startsWith('127.') ? ipv4 : null;
}

function portNumber(value) {
  if (typeof value === 'string' && !/^[1-9][0-9]*$/.test(value)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function normalizeConnectArgs(raw) {
  const args = Array.isArray(raw[0]) ? raw[0] : raw;
  const callback = args.findLast(value => typeof value === 'function');
  let options = {};
  for (const arg of args) {
    if (arg && typeof arg === 'object' && !Array.isArray(arg)) Object.assign(options, arg);
  }
  if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^[0-9]+$/.test(args[0]))) {
    options.port = args[0];
    if (typeof args[1] === 'string') options.host = args[1];
  } else if (typeof args[0] === 'string') {
    return { target: { kind: 'blocked', label: 'ipc' }, options: {}, callback };
  }
  const port = portNumber(options.port);
  if (!port) {
    return {
      target: { kind: 'blocked', label: options.path ? 'ipc' : 'invalid' }, options: {}, callback,
    };
  }
  const host = canonicalLoopback(options.host);
  if (!host) return { target: { kind: 'blocked', label: 'invalid' }, options: {}, callback };
  delete options.path;
  if (options.socket || options.fd !== undefined) {
    return { target: { kind: 'blocked', label: 'invalid' }, options: {}, callback };
  }
  options = { ...options, host, port };
  return { target: { kind: 'tcp', host, port, key: `${host}|${port}` }, options, callback };
}

function blocked(target) {
  const metadata = target.kind === 'tcp' ? `${target.host}:${target.port}` : target.label;
  const error = new Error(`TEST_EGRESS_BLOCKED ${metadata}`);
  error.code = 'TEST_EGRESS_BLOCKED';
  return error;
}

function createPolicy() {
  const servers = new Map(), endpoints = new Map();
  function remove(server) {
    const key = servers.get(server);
    if (!key) return;
    servers.delete(server);
    const count = endpoints.get(key) - 1;
    if (count) endpoints.set(key, count); else endpoints.delete(key);
  }
  return {
    remove,
    register(server, requestedHost, address) {
      remove(server);
      const requested = canonicalLoopback(requestedHost);
      if (!requested || !address || typeof address === 'string') return;
      const host = canonicalLoopback(address.address), port = portNumber(address.port);
      if (host !== requested || !port) return;
      const key = `${host}|${port}`;
      servers.set(server, key);
      endpoints.set(key, (endpoints.get(key) || 0) + 1);
    },
    assertAllowed(target) {
      if (target.kind !== 'tcp' || !endpoints.has(target.key)) throw blocked(target);
    },
  };
}

function requestedTcpHost(args) {
  if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const options = args[0];
    if (options.fd !== undefined || options.handle !== undefined || options.path !== undefined) return null;
    if (typeof options.port !== 'number' || !Number.isInteger(options.port)
      || options.port < 0 || options.port > 65535) return null;
    return canonicalLoopback(options.host);
  }
  if (typeof args[0] !== 'number' || !Number.isInteger(args[0])
    || args[0] < 0 || args[0] > 65535) return null;
  return canonicalLoopback(args[1]);
}

function installGuard({ net, tls, syncBuiltinESMExports, publishBlocked, deferFailure }) {
  const policy = createPolicy();
  const originalListen = net.Server.prototype.listen;
  const originalClose = net.Server.prototype.close;
  const CapturedSocket = net.Socket;
  const CapturedTLSSocket = tls.TLSSocket;
  const originalSocketConnect = CapturedSocket?.prototype.connect;
  const originalNetConnect = net.connect;
  const originalCreateConnection = net.createConnection;
  const originalTlsConnect = tls.connect;
  const capturedDestroy = CapturedSocket?.prototype.destroy;
  const capturedUndestroy = CapturedSocket?.prototype._undestroy;
  const capturedReleaseControl = CapturedTLSSocket?.prototype._releaseControl;
  if (typeof deferFailure !== 'function') throw new Error('CONTAINMENT_SOCKET_DEFER_UNAVAILABLE');
  if (typeof CapturedSocket !== 'function' || typeof capturedDestroy !== 'function'
    || typeof capturedUndestroy !== 'function') {
    throw new Error('CONTAINMENT_SOCKET_LIFECYCLE_UNAVAILABLE');
  }
  if (typeof CapturedTLSSocket !== 'function' || typeof capturedReleaseControl !== 'function') {
    throw new Error('CONTAINMENT_TLS_LIFECYCLE_UNAVAILABLE');
  }
  const observedServers = new WeakSet();
  net.Server.prototype.listen = function (...args) {
    const requestedHost = requestedTcpHost(args);
    if (!observedServers.has(this)) {
      observedServers.add(this);
      this.on('close', () => policy.remove(this));
    }
    const clear = () => { this.off('listening', register); this.off(errorMonitor, clear); };
    const register = () => { clear(); policy.register(this, requestedHost, this.address()); };
    this.prependOnceListener('listening', register);
    this.once(errorMonitor, clear);
    try { return Reflect.apply(originalListen, this, args); }
    catch (error) { clear(); throw error; }
  };
  net.Server.prototype.close = function (...args) {
    policy.remove(this);
    return Reflect.apply(originalClose, this, args);
  };
  function denialError(parsed) {
    try { policy.assertAllowed(parsed.target); }
    catch (error) {
      if (error?.code === 'TEST_EGRESS_BLOCKED') return error;
      throw error;
    }
    return null;
  }

  function dispatch(original, receiver, parsed) {
    return Reflect.apply(original, receiver,
      parsed.callback ? [parsed.options, parsed.callback] : [parsed.options]);
  }

  function denied(socket, parsed, successEvent, error) {
    publishBlocked({ code: 'TEST_EGRESS_BLOCKED', target: parsed.target });
    const disconnected = socket._handle == null;
    if (disconnected && socket.destroyed === true && socket.closed === true) {
      Reflect.apply(capturedUndestroy, socket, []);
    }
    if (disconnected) socket.connecting = true;
    if (parsed.callback) socket.once(successEvent, parsed.callback);
    deferFailure(() => Reflect.apply(capturedDestroy, socket, [error]));
    return socket;
  }

  net.Socket.prototype.connect = function (...args) {
    const parsed = normalizeConnectArgs(args);
    const error = denialError(parsed);
    return error ? denied(this, parsed, 'connect', error) : dispatch(originalSocketConnect, this, parsed);
  };
  net.connect = function (...args) {
    const parsed = normalizeConnectArgs(args);
    const error = denialError(parsed);
    return error
      ? denied(new CapturedSocket(), parsed, 'connect', error)
      : dispatch(originalNetConnect, this, parsed);
  };
  net.createConnection = function (...args) {
    const parsed = normalizeConnectArgs(args);
    const error = denialError(parsed);
    return error
      ? denied(new CapturedSocket(), parsed, 'connect', error)
      : dispatch(originalCreateConnection, this, parsed);
  };
  tls.connect = function (...args) {
    const parsed = normalizeConnectArgs(args);
    const error = denialError(parsed);
    if (!error) return dispatch(originalTlsConnect, this, parsed);
    const socket = new CapturedTLSSocket();
    Reflect.apply(capturedReleaseControl, socket, []);
    return denied(socket, parsed, 'secureConnect', error);
  };
  syncBuiltinESMExports();
}

module.exports = { canonicalLoopback, normalizeConnectArgs, createPolicy, installGuard };
