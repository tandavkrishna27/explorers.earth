import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

// Default config = UNIT tests only (DB-free, the reliable `npm test` gate).
// Integration tests (*.integration.test.ts) need Postgres and run via
// `npm run test:integration` against vitest.integration.config.ts.
export default defineConfig({
  // Unit tests must not load checkout credentials from environment files.
  envDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      // Mirror tsconfig paths: "@shared/*" -> "./shared/*"
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./server/test/setup.ts'],
    // Exclude integration tests from the default run so `npm test` never needs a DB.
    exclude: [...configDefaults.exclude, '**/*.integration.test.ts', '**/account-recovery.test.ts', '**/*.real-tool.test.ts'],
  },
});
