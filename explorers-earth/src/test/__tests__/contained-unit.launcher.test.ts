import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfigFromFile } from 'vite';

const require = createRequire(import.meta.url);
const {
  buildChildEnv,
  buildInvocation,
  runContainedVitest,
  validateArgs,
} = require('../../../scripts/run-contained-vitest.cjs');
const syntheticEnv = require('../../../scripts/contained-unit-env.cjs');
const root = process.cwd();

async function loadCanonicalConfig(argv: string[]) {
  const saved = [...process.argv];
  try {
    process.argv = [saved[0], saved[1], ...argv];
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'test' },
      path.join(root, 'vitest.config.ts'),
      root,
    );
    if (!loaded) throw new Error('Canonical config did not load');
    return loaded.config;
  } finally {
    process.argv = saved;
  }
}

const expectedEnv = {
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
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('synthetic environment and canonical config', () => {
  it('exports the complete immutable synthetic matrix', () => {
    expect(syntheticEnv).toEqual(expectedEnv);
    expect(Object.isFrozen(syntheticEnv)).toBe(true);
  });

  it('keeps only runtime allowlist keys and installs exactly one quoted preload', () => {
    expect(buildChildEnv({
      VITE_API_URL: 'sentinel',
      vite_token: 'sentinel',
      ViTe_Mixed: 'sentinel',
      HTTP_PROXY: 'sentinel',
      HTTPS_PROXY: 'sentinel',
      ALL_PROXY: 'sentinel',
      NODE_OPTIONS: '--require=unreviewed',
      NODE_PATH: 'sentinel',
      AWS_SECRET_ACCESS_KEY: 'sentinel',
      SystemRoot: 'C:/Windows',
      Path: 'C:/node',
    }, 'C:/test folder/guard.cjs')).toEqual({
      SYSTEMROOT: 'C:/Windows',
      PATH: 'C:/node',
      NODE_ENV: 'test',
      NODE_OPTIONS: '--require="C:/test folder/guard.cjs"',
    });
  });

  it('rejects preload paths with shell-significant quote or line characters', () => {
    expect(() => buildChildEnv({}, 'C:/bad"path/guard.cjs')).toThrow('Unsupported preload path');
    expect(() => buildChildEnv({}, 'C:/bad\npath/guard.cjs')).toThrow('Unsupported preload path');
  });

  it('uses no Vitest API listener for ordinary invocations', async () => {
    const config = await loadCanonicalConfig(['run']);
    expect(path.resolve(config.root as string)).toBe(root);
    expect(config).toEqual(expect.objectContaining({
      envDir: false,
      envPrefix: 'CONTAINED_UNIT_NEVER_AMBIENT_',
      server: { host: '127.0.0.1', proxy: {} },
    }));
    expect(config.test).toEqual(expect.objectContaining({
      pool: 'forks',
      open: false,
      api: false,
      env: expectedEnv,
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules', 'dist', 'e2e'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/test/**', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}',
          'src/main.tsx', 'src/vite-env.d.ts',
        ],
        thresholds: { statements: 8, branches: 6, functions: 6, lines: 8 },
      },
    }));
  });

  it('binds the optional UI API to loopback only for the exact --ui switch', async () => {
    const uiConfig = await loadCanonicalConfig(['--ui']);
    expect(uiConfig.test?.api).toEqual({ host: '127.0.0.1' });
    const nonUiConfig = await loadCanonicalConfig(['--ui=false']);
    expect(nonUiConfig.test?.api).toBe(false);
  });

  it('keeps production config isolated from all test configuration', async () => {
    const productionConfig = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8');
    const unitConfig = await fs.readFile(path.join(root, 'vitest.config.ts'), 'utf8');
    expect(productionConfig).not.toMatch(/\btest\s*:/);
    expect(unitConfig).not.toContain("'./vite.config'");
    expect(unitConfig).not.toContain("'./vite.config.ts'");
    expect(unitConfig).not.toMatch(/\bloadEnv\s*\(/);
  });

  it('covers every VITE identifier used by application and existing test TypeScript', async () => {
    const discovered = new Set<string>();
    async function scan(directory: string) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) await scan(absolute);
        else if (/\.(?:ts|tsx)$/.test(entry.name)
          && !/^contained-unit\.(?:policy|launcher)\.test\.ts$/.test(entry.name)) {
          const source = await fs.readFile(absolute, 'utf8');
          for (const match of source.matchAll(/\bVITE_[A-Z0-9_]+\b/g)) {
            if (match[0] === 'VITE_IGDB_CLIENT_SECRET') {
              expect(path.relative(root, absolute).split('\\').join('/')).toBe('src/features/music/__tests__/replatformLocalVite.test.ts');
              expect(source).toContain('expect(config.env.VITE_IGDB_CLIENT_SECRET).toBeUndefined()');
              expect(source).not.toContain('import.meta.env.VITE_IGDB_CLIENT_SECRET');
              continue;
            }
            discovered.add(match[0]);
          }
        }
      }
    }
    await scan(path.join(root, 'src'));
    expect([...discovered].sort()).toEqual(Object.keys(expectedEnv).sort());
  });
});

describe('closed argument grammar', () => {
  it('accepts the supported switches and preserves repeated values in order', () => {
    const args = [
      'run', '--watch', '--ui', '--coverage',
      'src/example.test.ts', 'src\\other.test.ts',
      '-t', 'literal name', '--testNamePattern=joined=value',
      '--reporter', 'verbose', '--reporter=tap-flat',
      '--outputFile', 'reports/unit.json', '--outputFile=reports/second.json',
      '--maxWorkers', '2', '--maxWorkers=3',
      '--coverage.enabled=true', '--coverage.provider', 'v8',
      '--coverage.reporter=json-summary', '--coverage.all=false',
      '--coverage.include=src/features/one.ts', '--coverage.include', 'src/features/two.ts',
      '--coverage.thresholds.perFile=true', '--coverage.thresholds.lines=100',
      '--coverage.thresholds.branches', '0', '--coverage.thresholds.functions=99.5',
      '--coverage.thresholds.statements', '8',
    ];
    expect(validateArgs(args)).toEqual(args);
  });

  it.each([
    ['argument terminator', '--'],
    ['positional non-source', 'other.test.ts'],
    ['parent source segment', 'src/../secret.test.ts'],
    ['short config', '-c'],
    ['joined short config', '-cother.ts'],
    ['config', '--config'],
    ['config equals', '--config=other.ts'],
    ['config loader', '--configLoader=native'],
    ['root', '--root=.'],
    ['dir', '--dir=src'],
    ['project', '--project=unit'],
    ['workspace', '--workspace=unit.ts'],
    ['pool', '--pool=threads'],
    ['nested pool', '--poolOptions.threads.singleThread=true'],
    ['browser', '--browser'],
    ['nested browser', '--browser.enabled=true'],
    ['environment', '--environment=node'],
    ['setup files', '--setupFiles=setup.ts'],
    ['global setup', '--globalSetup=setup.ts'],
    ['environment injection', '--env.API_TOKEN=secret'],
    ['exec argv', '--execArgv=--require=other.cjs'],
    ['mode', '--mode=production'],
    ['api', '--api=0.0.0.0'],
    ['open', '--open'],
    ['inspect', '--inspect'],
    ['inspect bracket', '--inspect-brk'],
    ['unknown', '--unknown=synthetic-secret'],
    ['unsupported provider', '--coverage.provider=istanbul'],
    ['unsupported reporter', '--reporter=custom'],
    ['invalid boolean', '--coverage.all=yes'],
    ['out-of-range threshold', '--coverage.thresholds.lines=101'],
    ['negative threshold', '--coverage.thresholds.lines=-1'],
    ['parent coverage include', '--coverage.include=src/../secret.ts'],
    ['absolute coverage include', '--coverage.include=C:/src/file.ts'],
    ['zero worker count', '--maxWorkers=0'],
    ['missing name literal', '--testNamePattern'],
  ])('rejects %s without reflecting its value', (_name, arg) => {
    let caught: Error | undefined;
    try { validateArgs([arg]); } catch (error) { caught = error as Error; }
    expect(caught?.message).toBe('Unsupported contained Vitest argument');
    expect(caught?.message).not.toContain('synthetic-secret');
  });

  it('rejects protected options supplied as a separate name/value pair', () => {
    expect(() => validateArgs(['--pool', 'threads'])).toThrow('Unsupported contained Vitest argument');
    expect(() => validateArgs(['--config', 'other.ts'])).toThrow('Unsupported contained Vitest argument');
  });

  it.each([
    ['config loader value', ['--configLoader', 'native']],
    ['root value', ['--root', '.']],
    ['directory value', ['--dir', 'src']],
    ['project value', ['--project', 'unit']],
    ['workspace value', ['--workspace', 'unit.ts']],
    ['browser value', ['--browser', 'chromium']],
    ['environment value', ['--environment', 'node']],
    ['setup value', ['--setupFiles', 'setup.ts']],
    ['global setup value', ['--globalSetup', 'setup.ts']],
    ['environment injection value', ['--env', 'TOKEN=synthetic']],
    ['exec argv value', ['--execArgv', '--require=other.cjs']],
    ['mode value', ['--mode', 'production']],
    ['API value', ['--api', '0.0.0.0']],
    ['open value', ['--open', 'true']],
    ['inspect value', ['--inspect', '127.0.0.1:9229']],
    ['nested environment', ['--env.VITE_API_URL=synthetic']],
    ['nested exec argv', ['--execArgv.0=--require=other.cjs']],
    ['nested browser options', ['--browser.instances.0.browser=chromium']],
    ['nested pool options', ['--poolOptions.forks.execArgv.0=--inspect']],
  ])('rejects protected separate and nested form: %s', (_name, argv) => {
    let caught: Error | undefined;
    try { validateArgs(argv); } catch (error) { caught = error as Error; }
    expect(caught?.message).toBe('Unsupported contained Vitest argument');
  });
});

describe('launcher and package entrypoints', () => {
  it('builds a direct Node invocation with one canonical config and quoted guard', () => {
    const paths = {
      root: 'C:\\repo with spaces',
      vitest: 'C:\\repo with spaces\\node_modules\\vitest\\vitest.mjs',
      config: 'C:\\repo with spaces\\vitest.config.ts',
      guard: 'C:\\repo with spaces\\scripts\\test-unit-egress-guard.cjs',
    };
    expect(buildInvocation(['run', 'src/example.test.ts'], { Path: 'C:/node' }, paths)).toEqual({
      executable: process.execPath,
      args: [paths.vitest, 'run', 'src/example.test.ts', '--config', paths.config],
      options: {
        cwd: paths.root,
        env: {
          PATH: 'C:/node',
          NODE_ENV: 'test',
          NODE_OPTIONS: '--require="C:/repo with spaces/scripts/test-unit-egress-guard.cjs"',
        },
        stdio: 'inherit',
        windowsHide: true,
      },
    });
  });

  it('routes every unit package script through the contained launcher', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(manifest.scripts).toEqual(expect.objectContaining({
      test: 'node scripts/run-contained-vitest.cjs',
      'test:unit': 'node scripts/run-contained-vitest.cjs run',
      'test:watch': 'node scripts/run-contained-vitest.cjs --watch',
      'test:coverage': 'node scripts/run-contained-vitest.cjs run --coverage',
      'test:ui': 'node scripts/run-contained-vitest.cjs --ui',
      'test:containment': 'node scripts/run-contained-vitest.cjs run src/test/__tests__/contained-unit.',
    }));
    const unitScripts = ['test', 'test:unit', 'test:watch', 'test:coverage', 'test:ui', 'test:containment', 'test:music-critical-coverage'];
    for (const name of unitScripts) {
      const script = manifest.scripts[name] as string;
      expect(script.startsWith('node scripts/run-contained-vitest.cjs')).toBe(true);
      expect(() => validateArgs(script.split(/\s+/).slice(2))).not.toThrow();
    }
    expect(Object.values(manifest.scripts).filter(value => typeof value === 'string' && /^vitest(?:\s|$)/.test(value))).toEqual([]);
  });

  it('rewrites only the leading music-critical Vitest entrypoint', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    expect(manifest.scripts['test:music-critical-coverage']).toBe(
      'node scripts/run-contained-vitest.cjs run src/features/music/__tests__/musicEntitlementContract.test.ts src/features/music/__tests__/musicIdentityCoordinator.test.ts src/features/music/__tests__/musicPublicationCommandRegistry.test.ts src/features/music/__tests__/musicSessionBoundary.browser-channel.test.ts src/features/music/__tests__/musicSessionBoundary.node.test.ts src/features/music/__tests__/musicSessionBoundary.test.ts src/features/music/__tests__/musicState.test.ts src/features/music/__tests__/musicWorkspaceClient.test.ts src/features/music/__tests__/musicQueueClient.test.ts src/features/music/__tests__/musicSearchClient.test.ts src/features/music/__tests__/publicMusicClient.test.ts src/services/__tests__/accountLifecycleService.test.ts src/features/Settings/components/AccountDeletionLifecyclePanel.test.tsx src/lib/__tests__/musicCredentialStore.test.ts src/lib/__tests__/localTunesApiClient.test.ts src/lib/__tests__/music-critical-client-coverage.test.ts --coverage.enabled=true --coverage.provider=v8 --coverage.reporter=text --coverage.all=true --coverage.include=src/features/music/musicEntitlementContract.ts --coverage.include=src/features/music/musicIdentityCoordinator.ts --coverage.include=src/features/music/musicPublicationCommandRegistry.ts --coverage.include=src/features/music/musicSessionBoundary.ts --coverage.include=src/features/music/musicState.ts --coverage.include=src/features/music/musicWorkspaceClient.ts --coverage.include=src/features/music/musicQueueClient.ts --coverage.include=src/features/music/musicSearchClient.ts --coverage.include=src/features/music/publicMusicClient.ts --coverage.include=src/services/accountLifecycleService.ts --coverage.include=src/features/Settings/components/AccountDeletionLifecyclePanel.tsx --coverage.include=src/lib/musicCredentialStore.ts --coverage.include=src/lib/localTunesApiClient.ts --coverage.thresholds.perFile=true --coverage.thresholds.lines=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.statements=100',
    );
  });

  it.each([0, 1, 7])('preserves numeric child exit status %s', (code) => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const runtime = new EventEmitter() as EventEmitter & {
      env: Record<string, string>;
      execPath: string;
      exitCode?: number;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      stderr: { write: ReturnType<typeof vi.fn> };
    };
    Object.assign(runtime, {
      env: {}, execPath: process.execPath, kill: vi.fn(), pid: 42, stderr: { write: vi.fn() },
    });
    const spawn = vi.fn(() => child);
    runContainedVitest(['run'], {}, { process: runtime, spawn, paths: {
      root: 'C:/repo', vitest: 'C:/repo/vitest.mjs', config: 'C:/repo/vitest.config.ts', guard: 'C:/repo/guard.cjs',
    } });
    child.emit('exit', code, null);
    expect(runtime.exitCode).toBe(code);
    expect(runtime.kill).not.toHaveBeenCalled();
  });

  it('forwards a runtime signal once and re-signals itself after child exit', () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const runtime = new EventEmitter() as EventEmitter & {
      env: Record<string, string>;
      execPath: string;
      exitCode?: number;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      stderr: { write: ReturnType<typeof vi.fn> };
    };
    Object.assign(runtime, {
      env: {}, execPath: process.execPath, kill: vi.fn(), pid: 42, stderr: { write: vi.fn() },
    });
    runContainedVitest(['run'], {}, { process: runtime, spawn: vi.fn(() => child), paths: {
      root: 'C:/repo', vitest: 'C:/repo/vitest.mjs', config: 'C:/repo/vitest.config.ts', guard: 'C:/repo/guard.cjs',
    } });
    runtime.emit('SIGTERM');
    runtime.emit('SIGTERM');
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', null, 'SIGTERM');
    expect(runtime.listenerCount('SIGTERM')).toBe(0);
    expect(runtime.kill).toHaveBeenCalledWith(42, 'SIGTERM');
  });

  it('reports a fixed startup failure without reflecting spawn details', () => {
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const runtime = new EventEmitter() as EventEmitter & {
      env: Record<string, string>;
      execPath: string;
      exitCode?: number;
      kill: ReturnType<typeof vi.fn>;
      pid: number;
      stderr: { write: ReturnType<typeof vi.fn> };
    };
    Object.assign(runtime, {
      env: {}, execPath: process.execPath, kill: vi.fn(), pid: 42, stderr: { write: vi.fn() },
    });
    runContainedVitest(['run'], {}, { process: runtime, spawn: vi.fn(() => child), paths: {
      root: 'C:/repo', vitest: 'C:/repo/vitest.mjs', config: 'C:/repo/vitest.config.ts', guard: 'C:/repo/guard.cjs',
    } });
    child.emit('error', new Error('synthetic secret detail'));
    expect(runtime.exitCode).toBe(1);
    expect(runtime.stderr.write).toHaveBeenCalledWith('Contained Vitest could not start\n');
  });
});
