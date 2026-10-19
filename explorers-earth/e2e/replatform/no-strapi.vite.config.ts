import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const webPort = Number(process.env.PROFILE_E2E_WEB_PORT);
const apiPort = Number(process.env.PROFILE_E2E_API_PORT);
if (!Number.isInteger(webPort) || !Number.isInteger(apiPort) ||
    webPort < 1024 || apiPort < 1024 || webPort === apiPort ||
    process.env.PROFILE_E2E_LOCAL_AUTHORITY !== 'owned-disposable-pg15') {
  throw new Error('No-Strapi browser fixture requires exact local authority');
}
const origin = `http://127.0.0.1:${webPort}`;
/** Must equal POISON_ORIGIN in no-strapi-monitor.ts. `.invalid` never resolves (RFC 6761). */
const poison = 'https://strapi.poison.invalid';
export default defineConfig({
  envDir: false,
  envPrefix: 'NO_STRAPI_E2E_NEVER_EXPOSE_AMBIENT_',
  define: {
    // Strapi-only destinations: poisoned.
    'import.meta.env.VITE_API_URL': JSON.stringify(`${poison}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${poison}/api`),
    // Shared with canonical (publicProfileGatewayClient.ts): the real origin, as in profile.vite.config.ts.
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    // Instagram falls back to localhost:5000 (ImageCropper.tsx); same-origin reaches canonical's 410 tombstone.
    'import.meta.env.VITE_INSTAGRAM_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('fixture-google-maps-key'),
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [react()],
  resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('../setup/maps-fixture.tsx', import.meta.url)) } },
  server: {
    host: '127.0.0.1', port: webPort, strictPort: true, hmr: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
