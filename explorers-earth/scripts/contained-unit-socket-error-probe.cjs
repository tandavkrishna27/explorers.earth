'use strict';

const nativeNet = require('node:net');
const nativeTls = require('node:tls');
const { writeSync } = require('node:fs');
const { installGuard } = require('./unit-egress-policy.cjs');

const mode = process.argv[2];
const modes = new Set([
  'net-handled',
  'net-unhandled',
  'tls-handled',
  'tls-unhandled',
  'net-reused-closed',
  'net-unhandled-sync-control',
  'net-unhandled-queued-assert-control',
  'tls-unhandled-queued-assert-control',
  'net-unhandled-queued-native-control',
  'tls-unhandled-queued-native-control',
]);
if (!modes.has(mode)) process.exit(71);

const host = '127.0.0.1';
const port = 45678;
const target = { host, port };
const originalDestroy = nativeNet.Socket.prototype.destroy;
const originalUndestroy = nativeNet.Socket.prototype._undestroy;
const originalReleaseControl = nativeTls.TLSSocket.prototype._releaseControl;
if (typeof originalUndestroy !== 'function' || typeof originalReleaseControl !== 'function') process.exit(72);

let nativeCalls = 0;
function fakeSocketConnect() { nativeCalls += 1; return this; }
function fakeFactory() { nativeCalls += 1; return new nativeNet.Socket(); }
function fakeTlsFactory() { nativeCalls += 1; return new nativeTls.TLSSocket(); }
nativeNet.Socket.prototype.connect = fakeSocketConnect;

const guardedNet = {
  Server: nativeNet.Server,
  Socket: nativeNet.Socket,
  connect: fakeFactory,
  createConnection: fakeFactory,
};
const guardedTls = {
  TLSSocket: nativeTls.TLSSocket,
  connect: fakeTlsFactory,
};
const deferFailure = mode === 'net-unhandled-sync-control'
  ? () => { throw new Error('SYNTHETIC_SYNC_CONTROL'); }
  : callback => process.nextTick(callback);

installGuard({
  net: guardedNet,
  tls: guardedTls,
  syncBuiltinESMExports() {},
  publishBlocked(event) {
    if (event?.code !== 'TEST_EGRESS_BLOCKED'
      || event.target?.kind !== 'tcp'
      || event.target.host !== host
      || event.target.port !== port
      || event.target.key !== `${host}|${port}`) process.exit(75);
    writeSync(1, `${JSON.stringify({ code: 'TEST_EGRESS_BLOCKED', host, port })}\n`);
  },
  deferFailure,
});

function nativeStatus() {
  if (nativeCalls !== 0) {
    process.exit(74);
  }
  return true;
}

function createDeniedSocket(selectedMode) {
  if (selectedMode.startsWith('tls-')) return guardedTls.connect(target);
  return guardedNet.connect(target);
}

function validateReturned(socket, selectedMode) {
  if (selectedMode.startsWith('tls-')) {
    if (!(socket instanceof nativeTls.TLSSocket) || socket.listeners('error').length !== 0) {
      throw new Error('TLS_RETURN_INVALID');
    }
  } else if (!(socket instanceof nativeNet.Socket)) {
    throw new Error('NET_RETURN_INVALID');
  }
  if (socket.connecting !== true) throw new Error('CONNECTING_STATE_INVALID');
}

function beginUnhandled() {
  try {
    const socket = createDeniedSocket(mode);
    if (mode.endsWith('-queued-assert-control')) throw new Error('SYNTHETIC_IMMEDIATE_ASSERTION');
    if (mode.endsWith('-queued-native-control')) Reflect.apply(fakeSocketConnect, socket, []);
    validateReturned(socket, mode);
    if (!nativeStatus()) return;
  } catch {
    process.exit(nativeCalls === 0 ? 73 : 74);
  }
}

async function observeHandled(socket, expectedIdentity) {
  if (socket !== expectedIdentity) throw new Error('RETURN_IDENTITY_INVALID');
  const order = [];
  let received;
  let success = false;
  socket.once('connect', () => { success = true; });
  socket.once('secureConnect', () => { success = true; });
  socket.once('error', error => { received = error; order.push('error'); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SOCKET_EVENT_DEADLINE')), 2_000);
    socket.once('close', () => { clearTimeout(timer); order.push('close'); resolve(); });
  });
  if (!received || received.code !== 'TEST_EGRESS_BLOCKED'
    || order.join(',') !== 'error,close' || success || !nativeStatus()) {
    throw new Error('HANDLED_LIFECYCLE_INVALID');
  }
}

async function runHandled() {
  if (mode === 'net-reused-closed') {
    const receiver = new nativeNet.Socket();
    await new Promise(resolve => {
      receiver.once('close', resolve);
      Reflect.apply(originalDestroy, receiver, []);
    });
    const returned = receiver.connect(target);
    validateReturned(returned, mode);
    await observeHandled(returned, receiver);
    return;
  }
  const socket = createDeniedSocket(mode);
  validateReturned(socket, mode);
  await observeHandled(socket, socket);
}

if (mode.includes('-unhandled')) {
  beginUnhandled();
} else {
  runHandled().catch(() => { process.exitCode = nativeCalls === 0 ? 75 : 74; });
}
