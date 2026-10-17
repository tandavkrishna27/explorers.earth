import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
const port = Number(process.env.GUIDES_E2E_FRONTEND_PORT), origin = process.env.GUIDES_E2E_ORIGIN ?? '';
const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(origin);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || String(port) !== process.env.GUIDES_E2E_FRONTEND_PORT || !match || Number(match[1]) < 1024 || Number(match[1]) > 65535 || origin !== `http://127.0.0.1:${Number(match[1])}` || Number(match[1]) === port)
    throw Error('Guides frontend requires owned gateway ports');
const sourceURL = import.meta.url;
export default defineConfig({ envDir: false, envPrefix: 'GUIDES_NEVER_EXPOSE_PRIVATE_', plugins: [react()], resolve: { alias: [{
        find: /^\.\.\/\.\.\/\.\.\/lib\/browserPlacesProvider$/,
        replacement: fileURLToPath(new URL('../setup/guides-browser-provider.ts', sourceURL)),
    }] }, define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
        'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
        'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
        'import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL': JSON.stringify(origin),
        'import.meta.env.VITE_LOCAL_TUNES_ENABLED': JSON.stringify('false'),
        'import.meta.env.VITE_LOCAL_TUNES_API_URL': JSON.stringify(''),
        'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
        'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(''),
        'import.meta.env.VITE_PUBLIC_ACCESS_TOKEN': JSON.stringify(''),
        'import.meta.env.VITE_FULL_ACCESS_TOKEN': JSON.stringify(''),
    }, server: { host: '127.0.0.1', port, strictPort: true, hmr: false, origin, proxy: {} } });
