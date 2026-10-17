import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.GENERAL_E2E_PORT ?? 55241);
const origin = `http://127.0.0.1:${port}`;
const useRealMapsPackage = process.env.GENERAL_E2E_REAL_MAPS === 'true';

export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  envDir: false,
  envPrefix: 'GENERAL_E2E_NEVER_EXPOSE_AMBIENT_',
  cacheDir: `node_modules/.vite-general-e2e-${port}`,
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('fixture-google-maps-key'),
    'import.meta.env.VITE_GOOGLE_BOOKS_API_KEY': JSON.stringify('fixture-google-books-key'),
    'import.meta.env.VITE_TMDB_API_KEY': JSON.stringify('fixture-tmdb-key'),
    // Ticket 4.2:38 requires that VITE_IGDB_CLIENT_SECRET usage disappear from runtime
    // browser code *and build inputs*. These two were the last build-input declarations
    // anywhere in the repository, and an empty value does not satisfy the obligation - a
    // declared browser build input for a provider client secret is the thing forbidden,
    // whatever it is set to. Nothing reads them: `games.spec.ts` mocks the Twitch/IGDB
    // endpoints at the network level instead. Guarded by `igdbBuildInput.test.ts`.
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify('fixture-public-token'),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify('fixture-full-token'),
  },
  plugins: [
    {
      name: 'general-e2e-remove-remote-font-imports',
      enforce: 'pre',
      transformIndexHtml(html) {
        return html
          .replace(/<script\b[^>]+src=['"]https:\/\/[^>]+><\/script>/gi, '')
          .replace(/<link\b[^>]+href=['"]https:\/\/[^>]+>/gi, '');
      },
      transform(code, id) {
        if (!/\.(?:css|html)$/.test(id)) return null;
        return code.replace(/^@import\s+url\(['"]https:\/\/fonts\.googleapis\.com\/.*$/gm, '');
      },
    },
    {
      name: 'general-e2e-local-music-identity-fixture',
      configureServer(server) {
        server.middlewares.use('/__localtunes/api/music/identity/ensure', (request, response, next) => {
          if (request.method !== 'POST') return next();
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json');
          response.end('{}');
        });
      },
    },
    react(),
  ],
  resolve: useRealMapsPackage ? undefined : {
    alias: {
      '@vis.gl/react-google-maps': fileURLToPath(new URL('./setup/maps-fixture.tsx', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
    hmr: false,
    proxy: {},
  },
});
