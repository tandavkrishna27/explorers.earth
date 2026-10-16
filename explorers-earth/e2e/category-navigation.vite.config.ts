import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export function containedConfig(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  return defineConfig({
    root: fileURLToPath(new URL('../', import.meta.url)), envDir: false,
    envPrefix: 'CATEGORY_FIXTURE_NEVER_EXPOSE_AMBIENT_', cacheDir: `node_modules/.vite-category-${port}`,
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
      'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
      'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
      'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
      'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('true'),
      'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
      'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
      'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
    },
    resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('./setup/maps-fixture.tsx', import.meta.url)) } },
    // Preserve real index.html, including its bootstrap. Fonts/vendors below are
    // intercepted with inert responses by the context guard; never forwarded.
    plugins: [react()],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, proxy: {},
      headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.clarity.ms; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://zupimages.net https://placehold.co https://flagcdn.com https://images.unsplash.com https://www.transparenttextures.com; font-src 'self' data:; connect-src 'self' https://music-fixture.test; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'" },
    },
  });
}
export default containedConfig(Number(process.env.CATEGORY_FIXTURE_PORT ?? 55178));
