import { containedConfig } from './category-navigation.vite.config';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
export default mergeConfig(containedConfig(55184), {
  resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('./setup/category-theme-maps-fixture.tsx', import.meta.url)) } },
});
