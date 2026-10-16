import {readFileSync,realpathSync} from 'node:fs';
import {basename,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const webPort = Number(process.env.MOVIES_E2E_WEB_PORT);
const apiPort = Number(process.env.MOVIES_E2E_API_PORT);
if (!Number.isInteger(webPort) || !Number.isInteger(apiPort) ||
    webPort < 1024 || apiPort < 1024 || webPort === apiPort ||
    process.env.MOVIES_E2E_LOCAL_AUTHORITY !== 'owned-disposable-pg15') {
  throw new Error('Movies browser fixture requires exact local authority');
}
const origin = `http://127.0.0.1:${webPort}`;
export default defineConfig({
  envDir: false,
  envPrefix: 'MOVIES_E2E_NEVER_EXPOSE_AMBIENT_',
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify('https://legacy-rest.invalid/api'),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
    'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify('https://music-fixture.test'),
    'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('false'),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
    'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify('fixture-google-maps-key'),
    'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
    'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
  },
  plugins: [...(process.env.MOVIES_E2E_DIAGNOSTIC_OVERLAY?[{name:'owned-owner-diagnostic',enforce:'pre' as const,transform(_code:string,id:string){const overlay=realpathSync(process.env.MOVIES_E2E_DIAGNOSTIC_OVERLAY!);if(basename(overlay)!=='owner-diagnostic-overlay.ts'||!basename(dirname(overlay)).startsWith('explorers-movies-e2e-')||dirname(dirname(overlay))!==realpathSync(tmpdir()))throw Error('Unowned diagnostic overlay');if(id.replaceAll('\\','/').endsWith('/src/features/Movies/api/moviesClient.ts'))return {code:readFileSync(overlay,'utf8'),map:null};}}]:[]),react()],
  resolve: { alias: { 'zod/v3':require.resolve('zod/v3'), '@vis.gl/react-google-maps': fileURLToPath(new URL('../setup/maps-fixture.tsx', import.meta.url)) } },
  preview:{host:'127.0.0.1',port:webPort,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:false}}},
  server: {
    host: '127.0.0.1', port: webPort, strictPort: true, hmr: false,
    proxy: { '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } },
  },
});
