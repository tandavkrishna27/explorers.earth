import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import { containedConfig } from './category-navigation.vite.config';

const port = Number(process.env.DASHBOARD_LAYOUT_PORT ?? 55179);
// The category-navigation fixture, plus the Movies add route served by the shared add template.
export default mergeConfig(containedConfig(port), {
  cacheDir: `node_modules/.vite-dashboard-layout-${port}`,
  resolve: { alias: [{ find: /^\.\/components\/dashboard\/AddMoviePage$/, replacement: fileURLToPath(new URL('./setup/add-item-layout-harness.tsx', import.meta.url)) }] },
});
