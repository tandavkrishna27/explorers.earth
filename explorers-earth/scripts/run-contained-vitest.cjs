'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const runtimeKeys = new Set([
  'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'PATH',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'COLORTERM', 'NO_COLOR', 'FORCE_COLOR', 'CI',
]);
const reporterValues = new Set([
  'default', 'verbose', 'dot', 'json', 'junit', 'tap', 'tap-flat', 'hanging-process',
]);
const coverageReporterValues = new Set(['text', 'lcov', 'html', 'json', 'json-summary']);
const booleanValues = new Set(['true', 'false']);
const genericArgumentError = 'Unsupported contained Vitest argument';

function buildChildEnv(inherited, guard) {
  const env = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (/^VITE_/i.test(key) || value === undefined) continue;
    const upper = key.toUpperCase();
    if (runtimeKeys.has(upper)) env[upper] = value;
  }
  env.NODE_ENV = 'test';
  const preload = guard.replaceAll('\\', '/');
  if (/["\r\n]/.test(preload)) throw new Error('Unsupported preload path');
  env.NODE_OPTIONS = `--require="${preload}"`;
  return env;
}

function unsupported() {
  throw new Error(genericArgumentError);
}

function hasParentSegment(value) {
  return value.split(/[\\/]/).includes('..');
}

function isSourcePath(value) {
  return /^src[\\/]/.test(value) && !hasParentSegment(value);
}

function isThreshold(value) {
  if (!/^(?:\d{1,2}(?:\.\d+)?|100(?:\.0+)?)$/.test(value)) return false;
  const number = Number(value);
  return number >= 0 && number <= 100;
}

function validateArgs(args) {
  if (!Array.isArray(args)) unsupported();
  const validated = [];
  const takeValue = (index, inline) => {
    if (inline !== undefined) {
      if (!inline) unsupported();
      return { value: inline, next: index };
    }
    const value = args[index + 1];
    if (typeof value !== 'string' || !value || value.startsWith('-')) unsupported();
    return { value, next: index + 1 };
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (typeof arg !== 'string' || !arg) unsupported();
    if (arg === 'run' || arg === '--watch' || arg === '--ui' || arg === '--coverage') {
      validated.push(arg);
      continue;
    }
    if (isSourcePath(arg)) {
      validated.push(arg);
      continue;
    }

    const [name, ...rest] = arg.split('=');
    const inline = rest.length ? rest.join('=') : undefined;
    if (name === '-t' || name === '--testNamePattern') {
      const taken = takeValue(index, inline);
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--reporter') {
      const taken = takeValue(index, inline);
      if (!reporterValues.has(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--outputFile') {
      const taken = takeValue(index, inline);
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--maxWorkers') {
      const taken = takeValue(index, inline);
      if (!/^[1-9][0-9]*$/.test(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--coverage.enabled' || name === '--coverage.all'
      || name === '--coverage.thresholds.perFile') {
      const taken = takeValue(index, inline);
      if (!booleanValues.has(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--coverage.provider') {
      const taken = takeValue(index, inline);
      if (taken.value !== 'v8') unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--coverage.reporter') {
      const taken = takeValue(index, inline);
      if (!coverageReporterValues.has(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--coverage.include') {
      const taken = takeValue(index, inline);
      if (!isSourcePath(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    if (name === '--coverage.thresholds.lines' || name === '--coverage.thresholds.branches'
      || name === '--coverage.thresholds.functions' || name === '--coverage.thresholds.statements') {
      const taken = takeValue(index, inline);
      if (!isThreshold(taken.value)) unsupported();
      validated.push(arg);
      if (inline === undefined) validated.push(taken.value);
      index = taken.next;
      continue;
    }
    unsupported();
  }
  return validated;
}

function defaultPaths() {
  const root = path.resolve(__dirname, '..');
  return {
    root,
    vitest: path.resolve(root, 'node_modules', 'vitest', 'vitest.mjs'),
    config: path.resolve(root, 'vitest.config.ts'),
    guard: path.resolve(root, 'scripts', 'test-unit-egress-guard.cjs'),
  };
}

function buildInvocation(args, inherited, paths = defaultPaths()) {
  return {
    executable: process.execPath,
    args: [paths.vitest, ...validateArgs(args), '--config', paths.config],
    options: {
      cwd: paths.root,
      env: buildChildEnv(inherited, paths.guard),
      stdio: 'inherit',
      windowsHide: true,
    },
  };
}

function runContainedVitest(args, inherited, dependencies = {}) {
  const runtime = dependencies.process ?? process;
  const spawnChild = dependencies.spawn ?? spawn;
  let invocation;
  try {
    invocation = buildInvocation(args, inherited, dependencies.paths);
  } catch (error) {
    runtime.stderr.write(`${error instanceof Error ? error.message : genericArgumentError}\n`);
    runtime.exitCode = 1;
    return undefined;
  }

  const child = spawnChild(invocation.executable, invocation.args, invocation.options);
  const forwarded = new Set();
  const forward = signal => {
    if (forwarded.has(signal)) return;
    forwarded.add(signal);
    child.kill(signal);
  };
  const onSigint = () => forward('SIGINT');
  const onSigterm = () => forward('SIGTERM');
  const cleanup = () => {
    runtime.off('SIGINT', onSigint);
    runtime.off('SIGTERM', onSigterm);
  };
  runtime.on('SIGINT', onSigint);
  runtime.on('SIGTERM', onSigterm);
  child.once('error', () => {
    cleanup();
    runtime.stderr.write('Contained Vitest could not start\n');
    runtime.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    if (typeof code === 'number') runtime.exitCode = code;
    else if (signal) runtime.kill(runtime.pid, signal);
    else runtime.exitCode = 1;
  });
  return child;
}

module.exports = { buildChildEnv, buildInvocation, runContainedVitest, validateArgs };

if (require.main === module) {
  runContainedVitest(process.argv.slice(2), process.env);
}
