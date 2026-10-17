import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.EXPLORERS_LIVE_OAUTH_API_PORT);
if (process.env.EXPLORERS_LIVE_OAUTH_AUTHORITY !== 'owned-disposable-pg15'
  || !Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) {
  throw new Error('Live OAuth Vite requires the guarded local runner');
}
const origin = 'http://localhost:5175';
export default defineConfig({
  envDir: false,
  envPrefix: 'EXPLORERS_LIVE_OAUTH_NEVER_EXPOSE_AMBIENT_',
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [react()],
  server: {
    host: 'localhost', port: 5175, strictPort: true, hmr: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
