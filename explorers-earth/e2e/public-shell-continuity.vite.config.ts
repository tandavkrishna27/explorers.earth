import { containedConfig } from './category-navigation.vite.config';

export default containedConfig(Number(process.env.CATEGORY_FIXTURE_PORT ?? 55179));
