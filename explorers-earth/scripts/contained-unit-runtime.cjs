'use strict';

const { fork, spawn } = require('node:child_process');
const { rm } = require('node:fs/promises');
const path = require('node:path');
const assertNet = require('node:net');

const capturedAssertConnect = assertNet.connect;
const capturedAssertDestroy = assertNet.Socket.prototype.destroy;
const capturedSetTimeout = globalThis.setTimeout;
const capturedClearTimeout = globalThis.clearTimeout;

const owners = new WeakMap();
const canaryRecords = new WeakMap();

function contractError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bounded(promise, ms, code = 'CONTAINMENT_CONTRACT_TIMEOUT') {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(contractError(code)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stateFor(owner) {
  const state = owners.get(owner);
  if (!state) throw contractError('CONTAINMENT_CONTRACT_OWNER_INVALID');
  return state;
}

function childRecord(child, role) {
  let closeResult;
  const closed = new Promise(resolve => {
    child.once('close', (status, signal) => {
      closeResult = { status, signal };
      resolve(closeResult);
    });
  });
  return {
    child,
    role,
    closed,
    get closeResult() { return closeResult; },
    termination: undefined,
  };
}

function runTaskkill(pid, force) {
  return new Promise(resolve => {
    let helper;
    try {
      helper = spawn('taskkill.exe', [force ? '/F' : '', '/T', '/PID', String(pid)].filter(Boolean), {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      resolve();
      return;
    }
    helper.once('error', () => resolve());
    helper.once('close', () => resolve());
  });
}

async function signalOwnedTree(record, force) {
  if (record.closeResult) return;
  const pid = record.child.pid;
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    await bounded(runTaskkill(pid, force), 1_000).catch(() => {});
    return;
  }
  try {
    record.child.kill(force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    // The close confirmation below is authoritative.
  }
}

function terminateOwnedRecord(record) {
  if (record.termination) return record.termination;
  record.termination = (async () => {
    if (record.closeResult) return record.closeResult;
    await signalOwnedTree(record, false);
    const graceful = await Promise.race([
      record.closed.then(result => ({ complete: true, result })),
      delay(1_000).then(() => ({ complete: false })),
    ]);
    if (graceful.complete) return graceful.result;
    await signalOwnedTree(record, true);
    try {
      return await bounded(record.closed, 2_000);
    } catch {
      const pid = record.child.pid;
      throw contractError(`CONTAINMENT_CONTRACT_UNRESOLVED_PID_${Number.isInteger(pid) ? pid : 'UNKNOWN'}`);
    }
  })();
  return record.termination;
}

function validRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) return false;
  const parsed = path.parse(path.resolve(root));
  return path.resolve(root) !== parsed.root;
}

function createCleanupOwner() {
  const state = {
    closed: false,
    children: new Set(),
    roots: new Set(),
    canaries: new Set(),
    operations: new Set(),
    inFlight: undefined,
    success: undefined,
  };
  const owner = {
    trackChild(child, role = 'probe') {
      if (state.closed) throw contractError('CONTAINMENT_CONTRACT_CANCELLED');
      if (!child || typeof child.once !== 'function') {
        throw contractError('CONTAINMENT_CONTRACT_CHILD_INVALID');
      }
      const record = childRecord(child, role);
      state.children.add(record);
      return record;
    },
    trackRoot(root) {
      if (state.closed) throw contractError('CONTAINMENT_CONTRACT_CANCELLED');
      if (!validRoot(root)) throw contractError('CONTAINMENT_CONTRACT_ROOT_INVALID');
      state.roots.add(path.resolve(root));
    },
    trackCanary(canary) {
      if (state.closed) throw contractError('CONTAINMENT_CONTRACT_CANCELLED');
      if (!canaryRecords.has(canary)) throw contractError('CONTAINMENT_CONTRACT_CANARY_INVALID');
      state.canaries.add(canary);
    },
    dispose() {
      if (state.success) return state.success;
      if (state.inFlight) return state.inFlight;
      state.closed = true;
      state.inFlight = disposeAttempt(state).then(() => {
        state.success = Promise.resolve();
        state.inFlight = state.success;
      }, error => {
        state.inFlight = undefined;
        throw error;
      });
      return state.inFlight;
    },
  };
  owners.set(owner, state);
  return owner;
}

async function disposeAttempt(state) {
  const failures = [];
  for (const operation of [...state.operations]) operation.cancel();

  const probeRecords = [...state.children].filter(record => record.role !== 'canary');
  const probeResults = await Promise.allSettled(probeRecords.map(terminateOwnedRecord));
  for (let index = 0; index < probeRecords.length; index += 1) {
    if (probeResults[index].status === 'fulfilled') state.children.delete(probeRecords[index]);
    else failures.push(probeResults[index].reason);
  }

  const readyRecords = new Set([...state.canaries].map(canary => canaryRecords.get(canary)));
  const pendingCanaries = [...state.children]
    .filter(record => record.role === 'canary' && !readyRecords.has(record));
  const pendingResults = await Promise.allSettled(pendingCanaries.map(terminateOwnedRecord));
  for (let index = 0; index < pendingCanaries.length; index += 1) {
    if (pendingResults[index].status === 'fulfilled') state.children.delete(pendingCanaries[index]);
    else failures.push(pendingResults[index].reason);
  }

  const canaries = [...state.canaries];
  const canaryResults = await Promise.allSettled(canaries.map(async canary => {
    const record = canaryRecords.get(canary);
    try {
      await canary.close();
    } catch (error) {
      await terminateOwnedRecord(record);
      throw error;
    }
  }));
  for (let index = 0; index < canaries.length; index += 1) {
    const canary = canaries[index];
    const record = canaryRecords.get(canary);
    if (canaryResults[index].status === 'fulfilled') {
      state.canaries.delete(canary);
      state.children.delete(record);
    } else {
      if (record.closeResult) {
        state.canaries.delete(canary);
        state.children.delete(record);
      }
      failures.push(canaryResults[index].reason);
    }
  }

  for (const record of [...state.children]) {
    if (record.closeResult) state.children.delete(record);
  }
  if (state.children.size) {
    failures.push(contractError('CONTAINMENT_CONTRACT_CHILD_CLEANUP_FAILED'));
  } else {
    const roots = [...state.roots];
    const rootResults = await Promise.allSettled(roots.map(root => bounded(
      rm(root, { recursive: true, force: true, maxRetries: 0 }),
      2_000,
    )));
    for (let index = 0; index < roots.length; index += 1) {
      if (rootResults[index].status === 'fulfilled') state.roots.delete(roots[index]);
      else failures.push(rootResults[index].reason);
    }
  }

  if (failures.length) throw failures[0];
}

function runOwnedChild(owner, invocation, limits) {
  const state = stateFor(owner);
  if (state.closed) return Promise.reject(contractError('CONTAINMENT_CONTRACT_CANCELLED'));
  if (!invocation || typeof invocation.executable !== 'string' || !Array.isArray(invocation.args)
    || !invocation.options || !limits || !Number.isFinite(limits.totalMs)
    || limits.totalMs <= 0 || !Number.isInteger(limits.stdoutBytes) || limits.stdoutBytes < 0
    || !Number.isInteger(limits.stderrBytes) || limits.stderrBytes < 0) {
    return Promise.reject(contractError('CONTAINMENT_CONTRACT_INVOCATION_INVALID'));
  }

  let child;
  try {
    child = spawn(invocation.executable, invocation.args, {
      ...invocation.options,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
  } catch {
    return Promise.reject(contractError('CONTAINMENT_CONTRACT_CHILD_ERROR'));
  }
  const record = owner.trackChild(child, 'probe');

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let stdoutSize = 0;
    let stderrSize = 0;
    let ready = false;
    let completing = false;
    let totalTimer;
    let startupTimer;

    const operation = {
      cancel: () => fail('CONTAINMENT_CONTRACT_CANCELLED'),
    };
    state.operations.add(operation);

    const clear = () => {
      if (totalTimer) clearTimeout(totalTimer);
      if (startupTimer) clearTimeout(startupTimer);
      state.operations.delete(operation);
    };
    const fail = code => {
      if (completing) return;
      completing = true;
      clear();
      terminateOwnedRecord(record).then(
        () => reject(contractError(code)),
        cleanupError => reject(cleanupError),
      );
    };
    const capture = (stream, cap, append) => {
      stream.on('data', chunk => {
        if (completing) return;
        const buffer = Buffer.from(chunk);
        append(buffer.toString('utf8'), buffer.length);
        if ((stream === child.stdout ? stdoutSize : stderrSize) > cap) {
          fail('CONTAINMENT_CONTRACT_OUTPUT_LIMIT');
        }
      });
    };
    capture(child.stdout, limits.stdoutBytes, (text, bytes) => {
      stdout += text;
      stdoutSize += bytes;
    });
    capture(child.stderr, limits.stderrBytes, (text, bytes) => {
      stderr += text;
      stderrSize += bytes;
    });
    child.on('message', message => {
      if (!completing && message && message.type === 'ready') {
        ready = true;
        if (startupTimer) clearTimeout(startupTimer);
        startupTimer = undefined;
      }
    });
    child.once('error', () => fail('CONTAINMENT_CONTRACT_CHILD_ERROR'));
    child.once('close', (status, signal) => {
      if (completing) return;
      completing = true;
      clear();
      resolve({ status, signal, stdout, stderr, ready });
    });
    totalTimer = setTimeout(() => fail('CONTAINMENT_CONTRACT_TIMEOUT'), limits.totalMs);
    if (limits.startupMs !== undefined) {
      if (!Number.isFinite(limits.startupMs) || limits.startupMs <= 0
        || limits.startupMs > limits.totalMs) {
        fail('CONTAINMENT_CONTRACT_INVOCATION_INVALID');
        return;
      }
      startupTimer = setTimeout(() => fail('CONTAINMENT_CONTRACT_TIMEOUT'), limits.startupMs);
    }
  });
}

function validateEndpoint(message, child) {
  return message && message.host === '127.0.0.1'
    && Number.isInteger(message.port) && message.port >= 1 && message.port <= 65535
    && Number.isInteger(message.pid) && message.pid === child.pid;
}

function startCanary(owner) {
  const state = stateFor(owner);
  if (state.closed) return Promise.reject(contractError('CONTAINMENT_CONTRACT_CANCELLED'));
  const canaryPath = path.resolve(__dirname, 'contained-unit-canary.cjs');
  let child;
  try {
    child = fork(canaryPath, [], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    });
  } catch {
    return Promise.reject(contractError('CONTAINMENT_CONTRACT_CANARY_START_FAILED'));
  }
  const record = owner.trackChild(child, 'canary');
  let stderrBytes = 0;
  child.stderr.on('data', chunk => { stderrBytes += Buffer.byteLength(chunk); });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finishError('CONTAINMENT_CONTRACT_TIMEOUT'), 5_000);
    const cleanup = () => {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    const finishError = code => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(contractError(code));
    };
    const onError = () => finishError('CONTAINMENT_CONTRACT_CANARY_START_FAILED');
    const onExit = () => finishError('CONTAINMENT_CONTRACT_CANARY_START_FAILED');
    const onMessage = message => {
      if (stderrBytes > 4_096) {
        finishError('CONTAINMENT_CONTRACT_OUTPUT_LIMIT');
        return;
      }
      if (!validateEndpoint(message, child)) {
        finishError('CONTAINMENT_CONTRACT_CANARY_START_FAILED');
        return;
      }
      settled = true;
      cleanup();
      const endpoint = Object.freeze({ host: '127.0.0.1', port: message.port, pid: message.pid });
      const handle = createCanaryHandle(endpoint, child, record);
      canaryRecords.set(handle, record);
      try {
        owner.trackCanary(handle);
      } catch (error) {
        reject(error);
        return;
      }
      resolve(handle);
    };
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function createCanaryHandle(endpoint, child, record) {
  let exchangeQueue = Promise.resolve();
  let closePromise;
  const exchange = (message, timeoutMs) => {
    const run = () => new Promise((resolve, reject) => {
      if (record.closeResult || !child.connected) {
        reject(contractError('CONTAINMENT_CONTRACT_CANARY_UNAVAILABLE'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => finishError('CONTAINMENT_CONTRACT_TIMEOUT'), timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
        child.off('error', onError);
      };
      const finishError = code => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(contractError(code));
      };
      const onExit = () => finishError('CONTAINMENT_CONTRACT_CANARY_UNAVAILABLE');
      const onError = () => finishError('CONTAINMENT_CONTRACT_CANARY_UNAVAILABLE');
      const onMessage = response => {
        if (!response || !Number.isInteger(response.connections) || response.connections < 0) {
          finishError('CONTAINMENT_CONTRACT_CANARY_RESPONSE_INVALID');
          return;
        }
        settled = true;
        cleanup();
        resolve(response.connections);
      };
      child.on('message', onMessage);
      child.once('exit', onExit);
      child.once('error', onError);
      try {
        child.send(message, error => {
          if (error) finishError('CONTAINMENT_CONTRACT_CANARY_UNAVAILABLE');
        });
      } catch {
        finishError('CONTAINMENT_CONTRACT_CANARY_UNAVAILABLE');
      }
    });
    const result = exchangeQueue.then(run);
    exchangeQueue = result.catch(() => {});
    return result;
  };
  const handle = {
    endpoint,
    readConnections() {
      return exchange('snapshot', 1_000);
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        const started = Date.now();
        const connections = await exchange('close', 3_000);
        const remaining = Math.max(1, 3_000 - (Date.now() - started));
        const result = await bounded(record.closed, remaining);
        if (result.signal !== null || result.status !== 0) {
          throw contractError('CONTAINMENT_CONTRACT_CANARY_CLOSE_FAILED');
        }
        return connections;
      })();
      return closePromise;
    },
  };
  return handle;
}

function assertBlocked(endpoint, dependencies = {}) {
  if (endpoint.host !== '127.0.0.1' || !Number.isInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535)
    throw new Error('Invalid local canary');
  const connect = dependencies.connect ?? ((options) => Reflect.apply(capturedAssertConnect, assertNet, [options]));
  const destroy = dependencies.destroy
    ?? ((socket) => Reflect.apply(capturedAssertDestroy, socket, []));
  const setDeadline = dependencies.setDeadline
    ?? ((callback, milliseconds) => Reflect.apply(capturedSetTimeout, globalThis, [callback, milliseconds]));
  const clearDeadline = dependencies.clearDeadline
    ?? (handle => Reflect.apply(capturedClearTimeout, globalThis, [handle]));
  return new Promise((resolve, reject) => {
    let socket;
    let deadline;
    let settled = false;
    const fail = message => new Error(message);
    const cleanup = () => {
      if (deadline !== undefined) clearDeadline(deadline);
      if (!socket) return;
      socket.off('error', onError);
      socket.off('connect', onConnect);
      socket.off('close', onClose);
      if (socket.destroyed !== true) destroy(socket);
    };
    const settle = (error, code) => {
      if (settled) return;
      settled = true;
      try { cleanup(); }
      catch { reject(fail('Containment probe cleanup failed')); return; }
      if (error) reject(error); else resolve(code);
    };
    const onError = error => {
      if (error?.code === 'TEST_EGRESS_BLOCKED') settle(null, 'TEST_EGRESS_BLOCKED');
      else settle(fail('Containment probe returned an unexpected error'));
    };
    const onConnect = () => settle(fail('Containment guard is absent or allowed an unowned endpoint'));
    const onClose = () => settle(fail('Containment probe closed without a block'));
    try {
      socket = connect({ host: endpoint.host, port: endpoint.port });
      if (!socket || typeof socket.once !== 'function' || typeof socket.off !== 'function') {
        settle(fail('Containment probe returned an unexpected error'));
        return;
      }
      socket.once('error', onError);
      socket.once('connect', onConnect);
      socket.once('close', onClose);
      deadline = setDeadline(
        () => settle(fail('Containment probe exceeded its local deadline')),
        2_000,
      );
    } catch {
      settle(fail('Containment probe returned an unexpected error'));
    }
  });
}

module.exports = { createCleanupOwner, startCanary, runOwnedChild, assertBlocked };
