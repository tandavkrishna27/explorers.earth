import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, expect, it, vi } from 'vitest';

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

const require = createRequire(import.meta.url);
const { createCleanupOwner, runOwnedChild } = require('../../../scripts/contained-unit-runtime.cjs') as {
  createCleanupOwner(): CleanupOwner;
  runOwnedChild(owner: CleanupOwner, invocation: {
    executable: string;
    args: string[];
    options: import('node:child_process').SpawnOptions;
  }, limits: {
    totalMs: number;
    stdoutBytes: number;
    stderrBytes: number;
  }): Promise<{
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    ready: boolean;
  }>;
};
const { buildInvocation } = require('../../../scripts/run-contained-vitest.cjs') as {
  buildInvocation(args: string[], inherited: NodeJS.ProcessEnv, paths: {
    root: string;
    vitest: string;
    config: string;
    guard: string;
  }): {
    executable: string;
    args: string[];
    options: import('node:child_process').SpawnOptions;
  };
};

const SYNTHETIC_ENV = {
  VITE_API_URL: 'http://127.0.0.1:9/graphql',
  VITE_REST_API_URL: 'http://127.0.0.1:9/api',
  VITE_PAYMENT_API_URL: 'http://127.0.0.1:9',
  VITE_INSTAGRAM_API_URL: 'http://127.0.0.1:9',
  VITE_PUBLIC_PROFILE_GATEWAY_URL: 'http://127.0.0.1:9',
  VITE_LOCAL_TUNES_API_URL: 'https://music.invalid',
  VITE_BASE_URL: 'https://app.invalid',
  VITE_PUBLIC_ACCESS_TOKEN: '',
  VITE_GOOGLE_MAPS_API_KEY: '',
  VITE_GOOGLE_CUSTOM_SEARCH_API_KEY: '',
  VITE_GOOGLE_CUSTOM_SEARCH_ENGINE_ID: '',
  VITE_GOOGLE_SEARCH_API_KEY: '',
  VITE_GOOGLE_SEARCH_ENGINE_ID: '',
  VITE_GOOGLE_BOOKS_API_KEY: '',
  VITE_TMDB_API_KEY: '',
  VITE_TMDB_ACCESS_TOKEN: '',
  VITE_RAZORPAY_KEY_ID_DEV: '',
  VITE_RAZORPAY_KEY_ID_PROD: '',
  VITE_TURNSTILE_SITE_KEY: '',
  VITE_GA_MEASUREMENT_ID: '',
} as const;

const projectRoot = resolve(import.meta.dirname, '../../..');
const cacheRoot = resolve(projectRoot, 'node_modules/.cache');
const vitestPath = resolve(projectRoot, 'node_modules/vitest/vitest.mjs');
const guardPath = resolve(projectRoot, 'scripts/test-unit-egress-guard.cjs');
const canonicalConfigPath = resolve(projectRoot, 'vitest.config.ts');
const setupPath = resolve(projectRoot, 'src/test/setup.ts');
const globalSetupPath = resolve(projectRoot, 'src/test/contained-unit-global-setup.ts');
const fixtureName = 'never imports synthetic env-file or ambient sentinels';
const envFileSentinel = ['VITE', 'ENV_FILE_SENTINEL'].join('_');
const inheritedSentinel = ['VITE', 'INHERITED_SENTINEL'].join('_');

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

it('exposes only the synthetic matrix and restores per-test env stubs', () => {
  const actualKeys = Object.keys(import.meta.env).filter(key => /^VITE_/i.test(key)).sort();
  expect(actualKeys).toEqual(Object.keys(SYNTHETIC_ENV).sort());
  for (const [key, value] of Object.entries(SYNTHETIC_ENV)) {
    expect(import.meta.env[key]).toBe(value);
  }
  vi.stubEnv('VITE_API_URL', 'https://override.invalid');
  expect(import.meta.env.VITE_API_URL).toBe('https://override.invalid');
  vi.unstubAllEnvs();
  expect(import.meta.env.VITE_API_URL).toBe('http://127.0.0.1:9/graphql');
});

type Variation = 'green' | 'ambient-red' | 'env-file-red';

async function writeFixture(root: string, variation: Variation) {
  const sourceRoot = join(root, 'src');
  await mkdir(sourceRoot);
  const reportPath = join(root, 'result.json');
  const configPath = join(root, 'vitest.config.ts');
  const testPath = join(sourceRoot, 'env.test.ts');
  await writeFile(join(root, '.env.local'),
    `${envFileSentinel}=must-not-load\nCONTAINED_UNIT_NEVER_AMBIENT_SENTINEL=must-not-load\n`,
    'utf8');
  const envDir = variation === 'env-file-red' ? JSON.stringify(root) : 'false';
  const configSource = [
    `import canonical from ${JSON.stringify(pathToFileURL(canonicalConfigPath).href)};`,
    'export default {',
    '  ...canonical,',
    `  root: ${JSON.stringify(root)},`,
    `  envDir: ${envDir},`,
    '  test: {',
    '    ...canonical.test,',
    `    setupFiles: [${JSON.stringify(setupPath)}],`,
    `    globalSetup: [${JSON.stringify(globalSetupPath)}],`,
    '  },',
    '};',
    '',
  ].join('\n');
  await writeFile(configPath, configSource, 'utf8');
  const testSource = [
    "import { expect, it, vi } from 'vitest';",
    `const expected = ${JSON.stringify(SYNTHETIC_ENV)};`,
    `it(${JSON.stringify(fixtureName)}, () => {`,
    `  expect(process.env.${inheritedSentinel}, 'AMBIENT_SENTINEL_EXPOSED').toBeUndefined();`,
    "  expect(process.env.ViTe_Inherited_Sentinel, 'AMBIENT_SENTINEL_EXPOSED').toBeUndefined();",
    "  expect(import.meta.env.CONTAINED_UNIT_NEVER_AMBIENT_SENTINEL, 'ENV_FILE_SENTINEL_EXPOSED').toBeUndefined();",
    `  expect(import.meta.env.${envFileSentinel}).toBeUndefined();`,
    `  expect(import.meta.env.${inheritedSentinel}).toBeUndefined();`,
    '  expect(import.meta.env.ViTe_Inherited_Sentinel).toBeUndefined();',
    "  const actual = Object.fromEntries(Object.entries(import.meta.env).filter(([key]) => /^VITE_/i.test(key)));",
    '  expect(actual).toEqual(expected);',
    "  vi.stubEnv('VITE_API_URL', 'https://override.invalid');",
    "  expect(import.meta.env.VITE_API_URL).toBe('https://override.invalid');",
    '  vi.unstubAllEnvs();',
    "  expect(import.meta.env.VITE_API_URL).toBe('http://127.0.0.1:9/graphql');",
    '});',
    '',
  ].join('\n');
  await writeFile(testPath, testSource, 'utf8');
  return { configPath, reportPath };
}

type JsonAssertion = { status: string; title: string; failureMessages: string[] };
type JsonReport = {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: Array<{
    status: string;
    message: string;
    assertionResults: JsonAssertion[];
  }>;
};

async function readReport(reportPath: string): Promise<JsonReport> {
  const details = await stat(reportPath);
  if (details.size > 131_072) throw new Error('Containment fixture report exceeded its limit');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    throw new Error('Containment fixture report is malformed');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Containment fixture report is malformed');
  return parsed as JsonReport;
}

function assertSingleFixture(report: JsonReport) {
  expect(report.numTotalTests).toBe(1);
  expect(report.numPendingTests).toBe(0);
  expect(report.numTodoTests).toBe(0);
  expect(report.testResults).toHaveLength(1);
  expect(report.testResults[0].assertionResults).toHaveLength(1);
  expect(report.testResults[0].assertionResults[0].title).toBe(fixtureName);
}

async function runVariation(owner: CleanupOwner, variation: Variation) {
  await mkdir(cacheRoot, { recursive: true });
  const root = await mkdtemp(join(cacheRoot, 'contained-env-'));
  owner.trackRoot(root);
  const { configPath, reportPath } = await writeFixture(root, variation);
  const inherited = {
    ...process.env,
    [inheritedSentinel]: 'must-not-inherit',
    ViTe_Inherited_Sentinel: 'must-not-inherit-mixed-case',
  };
  const invocation = buildInvocation([
    'run',
    'src/env.test.ts',
    '--reporter=json',
    `--outputFile=${reportPath}`,
  ], inherited, {
    root,
    vitest: vitestPath,
    config: configPath,
    guard: guardPath,
  });
  if (variation === 'ambient-red') {
    const env = invocation.options.env as NodeJS.ProcessEnv;
    env[inheritedSentinel] = 'must-not-inherit';
    env.ViTe_Inherited_Sentinel = 'must-not-inherit-mixed-case';
  }
  const result = await runOwnedChild(owner, invocation, {
    totalMs: 30_000,
    stdoutBytes: 131_072,
    stderrBytes: 131_072,
  });
  expect(result.signal).toBeNull();
  expect(result.ready).toBe(false);
  const report = await readReport(reportPath);
  assertSingleFixture(report);
  return { result, report, assertion: report.testResults[0].assertionResults[0] };
}

it('GREEN isolates synthetic env files and mixed-case inherited sentinels', async () => {
  const owner = newOwner();
  try {
    const { result, report, assertion } = await runVariation(owner, 'green');
    expect(result.status).toBe(0);
    expect(report.success).toBe(true);
    expect(report.numPassedTests).toBe(1);
    expect(report.numFailedTests).toBe(0);
    expect(report.testResults[0].status).toBe('passed');
    expect(report.testResults[0].message).toBe('');
    expect(assertion.status).toBe('passed');
    expect(assertion.failureMessages).toEqual([]);
  } finally {
    await release(owner);
  }
}, 45_000);

it('RED detects retained mixed-case ambient sentinels', async () => {
  const owner = newOwner();
  try {
    const { result, report, assertion } = await runVariation(owner, 'ambient-red');
    expect(result.status).toBe(1);
    expect(report.success).toBe(false);
    expect(report.numPassedTests).toBe(0);
    expect(report.numFailedTests).toBe(1);
    expect(report.testResults[0].status).toBe('failed');
    expect(assertion.status).toBe('failed');
    expect(assertion.failureMessages).toHaveLength(1);
    expect(assertion.failureMessages[0]).toContain('AMBIENT_SENTINEL_EXPOSED');
    expect(assertion.failureMessages[0]).not.toContain('ENV_FILE_SENTINEL_EXPOSED');
  } finally {
    await release(owner);
  }
}, 45_000);

it('RED detects loading the synthetic env file', async () => {
  const owner = newOwner();
  try {
    const { result, report, assertion } = await runVariation(owner, 'env-file-red');
    expect(result.status).toBe(1);
    expect(report.success).toBe(false);
    expect(report.numPassedTests).toBe(0);
    expect(report.numFailedTests).toBe(1);
    expect(report.testResults[0].status).toBe('failed');
    expect(assertion.status).toBe('failed');
    expect(assertion.failureMessages).toHaveLength(1);
    expect(assertion.failureMessages[0]).toContain('ENV_FILE_SENTINEL_EXPOSED');
    expect(assertion.failureMessages[0]).not.toContain('AMBIENT_SENTINEL_EXPOSED');
  } finally {
    await release(owner);
  }
}, 45_000);
