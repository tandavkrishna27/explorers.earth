import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export default defineConfig({
  envDir: false,
  envPrefix: [],
  plugins: [react()],
  resolve: { alias: [{ find: /^zod\/v3$/, replacement: require.resolve('zod/v3') }] },
  build: { emptyOutDir: true },
});
