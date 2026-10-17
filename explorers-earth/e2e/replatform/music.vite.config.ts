import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const ports = ['MUSIC_E2E_WEB_PORT', 'MUSIC_E2E_CANONICAL_PORT', 'MUSIC_E2E_MUSIC_PORT'].map(key => Number(process.env[key]));
if (ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535) || new Set(ports).size !== 3 || process.env.MUSIC_E2E_LOCAL_AUTHORITY !== 'owned-disposable-pg15')
  throw new Error('Music browser requires distinct allocated loopback ports and owned authority');
const [webPort, canonicalPort, musicPort] = ports;
const origin = `http://127.0.0.1:${webPort}`;
// Retained development clients normalize an HTTPS logical authority, then resolve
// every Music request to /__localtunes and every socket to /__localtunes/ws.
// This hostname is never resolved: both transports terminate at the owned proxy.
export default defineConfig({
  envDir: false,
  envPrefix: 'MUSIC_E2E_NEVER_EXPOSE_AMBIENT_',
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('fixture-google-maps-key'),
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [react()],
  resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('../setup/maps-fixture.tsx', import.meta.url)) } },
  server: {
    host: '127.0.0.1', port: webPort, strictPort: true, hmr: false,
    proxy: {
      '/__localtunes': { target: `http://127.0.0.1:${musicPort}`, changeOrigin: false, ws: true, rewrite: path => path.replace(/^\/__localtunes/, '') },
      '/api': { target: `http://127.0.0.1:${canonicalPort}`, changeOrigin: false },
    },
  },
});
