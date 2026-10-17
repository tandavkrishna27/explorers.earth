import { mergeConfig } from 'vite';
import presentationConfig from './music-presentation.vite.config';

// Preserve the render-only Music player and original inert Maps fixture.
// All application-local API/base URLs must match the owned fixture origin.
const origin = 'http://127.0.0.1:55184';
export default mergeConfig(presentationConfig, {
  cacheDir: 'node_modules/.vite-category-alignment-55184',
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/graphql`),
    'import.meta.env.VITE_REST_API_URL': JSON.stringify(`${origin}/api`),
    'import.meta.env.VITE_BASE_URL': JSON.stringify(origin),
    'import.meta.env.VITE_PAYMENT_API_URL': JSON.stringify(origin),
  },
  server: { port: 55184, strictPort: true },
});
