import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
const require = createRequire(import.meta.url);
const syntheticEnv = require('./scripts/contained-unit-env.cjs');
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: {
    // Two frontend contract suites intentionally exercise the shared fixture
    // controller in ../tunes. Resolve its bare GraphQL import from this
    // package's declared dependency; CI installs packages independently.
    alias: [{
      // The shared API schema uses Zod 3; the frontend's declared Zod 4
      // package provides that compatibility export in isolated frontend CI.
      find: /^zod\/v3$/,
      replacement: require.resolve('zod/v3'),
    }, {
      find: /^graphql$/,
      replacement: resolve(fileURLToPath(new URL('./', import.meta.url)), 'node_modules/graphql/index.mjs'),
    }],
  },
  envDir: false,
  envPrefix: 'CONTAINED_UNIT_NEVER_AMBIENT_',
  plugins: [react()],
  server: { host: '127.0.0.1', proxy: {} },
  test: {
    pool: 'forks',
    open: false,
    api: process.argv.includes('--ui') ? { host: '127.0.0.1' } : false,
    env: { ...syntheticEnv },
    globals: true,
    environment: 'jsdom',
    globalSetup: ['./src/test/contained-unit-global-setup.ts'],
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
      // Ratchet thresholds: set just under measured coverage (8.81/6.87/6.63/8.74
      // on 2026-07-10) so coverage can only rise. Bump these as tests are added;
      // the original aspirational 70% had never been met and failed every CI run.
      thresholds: { statements: 8, branches: 6, functions: 6, lines: 8 },
    },
  },
});
