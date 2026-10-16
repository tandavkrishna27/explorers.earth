import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium,request} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {assertFixtureOrigin,isOptionalFontRequest,isOptionalLoaderImage} from './proxy-fixture-authority.mjs';
const fixture=JSON.parse(readFileSync(process.env.BOOKS_E2E_FIXTURE_PATH,'utf8'));assertFixtureOrigin(fixture);
const api=await request.newContext({baseURL:fixture.origin,ignoreHTTPSErrors:true});const checks=[];
let browser;
try{
 for(const path of ['/','/profile','/runtime-config.json','/robots.txt','/sitemap.xml']){const r=await api.get(path);assert.equal(r.status(),200);assert.equal(r.headers()['x-robots-tag'],'noindex,nofollow');checks.push('https-noindex-'+path);}
 const config=await (await api.get('/runtime-config.json')).json();assert.equal(config.origin,fixture.origin);assert.equal(config.environment,'qa');assert.equal(config.analytics.enabled,false);assert.equal(config.apiPath,'/api');
 for(const path of ['/graphql','/socket.io/?EIO=4&transport=polling','/api/__analytics-observer']){const r=await api.get(path);assert.equal(r.status(),404);assert.equal(r.headers()['cache-control'],'no-store');checks.push('canonical-denial-'+path);}
 const signin=await api.post('/api/auth/sign-in/social',{headers:{Origin:fixture.origin},data:{provider:'google',callbackURL:fixture.origin+'/'}});assert.equal(signin.status(),200);const cookies=signin.headersArray().filter(h=>h.name.toLowerCase()==='set-cookie');assert.ok(cookies.some(h=>/; Secure(?:;|$)/i.test(h.value)&&/; HttpOnly(?:;|$)/i.test(h.value)&&/; SameSite=Lax/i.test(h.value)));const target=new URL((await signin.json()).url);assert.equal(target.origin,'https://accounts.google.com');assert.equal(target.searchParams.get('redirect_uri'),fixture.origin+'/api/auth/callback/google');checks.push('synthetic-oauth-init-secure-cookie');
 browser=await chromium.launch();const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage(),requests=[],unexpected=[];let deniedFonts=0;
 await page.route('**/*',route=>{const request=route.request(),u=new URL(request.url());if(!['data:','blob:'].includes(u.protocol)&&u.origin!==fixture.origin){if(isOptionalFontRequest(u.href,request.resourceType()))deniedFonts++;else if(!isOptionalLoaderImage(u.href,request.resourceType()))unexpected.push(request.resourceType());return route.abort();}return route.continue();});page.on('request',r=>requests.push(new URL(r.url()).pathname));await page.goto(fixture.origin+'/login');await page.getByRole('button',{name:/Google/i}).first().waitFor();assert.deepEqual(unexpected,[]);assert.ok(deniedFonts>0);checks.push('optional-font-network-denied');
 const runtime=requests.indexOf('/runtime-config.json'),firstApi=requests.findIndex(p=>p.startsWith('/api/'));assert.ok(runtime>=0&&(firstApi<0||runtime<firstApi));checks.push('browser-runtime-before-api');await context.close();
 writeFileSync('/private/preflight.json',JSON.stringify({checks,node:process.version,npm:execFileSync('npm',['--version'],{encoding:'utf8'}).trim(),chromium:browser.version(),playwright:JSON.parse(readFileSync(new URL('../../node_modules/@playwright/test/package.json',import.meta.url))).version,certificate:'synthetic-only-ignoreHTTPSErrors'}),{mode:0o600});
}finally{await browser?.close();await api.dispose();}
