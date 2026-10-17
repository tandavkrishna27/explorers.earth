import {defineConfig} from '@playwright/test';
const origin=process.env.PLAYWRIGHT_EXTERNAL_BASE_URL??'';
const match=/^http:\/\/127\.0\.0\.1:([1-9]\d{3,4})$/.exec(origin);
if(!match||Number(match[1])>65535||process.env.REPLATFORM_E2E_LANE!=='apps-enrichment'||!process.env.APPS_E2E_FIXTURE_PATH||process.env.APPS_E2E_FIXTURE_PATH!==process.env.REPLATFORM_E2E_FIXTURE_PATH)throw Error('Apps enrichment requires its owned descriptor and loopback origin');
export default defineConfig({testDir:'.',testMatch:'apps-enrichment.spec.ts',fullyParallel:false,workers:1,retries:0,repeatEach:1,timeout:120000,expect:{timeout:15000},reporter:'line',use:{baseURL:origin,headless:true,trace:'off',video:'off',screenshot:'off'},projects:[{name:'apps-desktop',use:{browserName:'chromium',viewport:{width:1365,height:900}}},{name:'apps-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}]});
