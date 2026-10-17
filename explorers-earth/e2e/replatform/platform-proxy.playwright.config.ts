import {defineConfig} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
const fixture=JSON.parse(readFileSync(process.env.BOOKS_E2E_FIXTURE_PATH!,'utf8'));
assertFixtureOrigin(fixture);
export default defineConfig({testDir:'.',fullyParallel:false,workers:1,retries:0,forbidOnly:true,timeout:120000,expect:{timeout:15000},reporter:'line',use:{baseURL:fixture.origin,headless:true,trace:'off',screenshot:'off',video:'off',ignoreHTTPSErrors:true},projects:[
 {name:'proxy-identity',testMatch:['auth.spec.ts','profile.spec.ts'],use:{browserName:'chromium',viewport:{width:1365,height:900}}},
 ...(['books','analytics'] as const).flatMap(name=>[{name:name+'-desktop',testMatch:name+'.spec.ts',use:{browserName:'chromium' as const,viewport:{width:1365,height:900}}},{name:name+'-mobile',testMatch:name+'.spec.ts',use:{browserName:'chromium' as const,viewport:{width:390,height:844},isMobile:true,hasTouch:true}}])
]});
