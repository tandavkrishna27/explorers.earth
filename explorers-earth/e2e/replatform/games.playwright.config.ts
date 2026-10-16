import {defineConfig} from '@playwright/test';
if(!process.env.GAMES_E2E_FIXTURE_PATH||!process.env.PLAYWRIGHT_EXTERNAL_BASE_URL?.startsWith('http://127.0.0.1:'))throw new Error('Games requires its owned fixture');
// expect.timeout is 18000, above the 15000ms client abort on
// publicProfileGatewayClient.ts:78, so a read the PRODUCT abandons is observed as a product
// failure rather than racing an assertion with identical patience. 18000 and not the 25000
// used by public-parity/people, because this lane's per-test budget is 120000, not 900000:
// the worst test here awaits 6 assertions, and 6 x 18000 = 108s stays inside 120s even if
// every one is slow-but-passing, whereas 6 x 25000 = 150s would exceed it and convert an
// assertion failure into an opaque test timeout -- the very confusion this separates.
export default defineConfig({testDir:'.',outputDir:process.env.GAMES_E2E_ARTIFACT_DIR,testMatch:'games.spec.ts',fullyParallel:false,workers:1,retries:0,repeatEach:1,forbidOnly:true,timeout:120000,expect:{timeout:18000},reporter:'line',use:{baseURL:process.env.PLAYWRIGHT_EXTERNAL_BASE_URL,headless:true,trace:'off',video:'off',screenshot:'off'},projects:[{name:'games-desktop',use:{browserName:'chromium',viewport:{width:1365,height:900}}},{name:'games-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});
