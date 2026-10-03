import {test,expect} from 'vitest';
import {assertFixtureOrigin,isOptionalFontRequest,isOptionalLoaderImage,publicReadBudgetDelayMs} from '../../../../explorers-earth/e2e/replatform/proxy-fixture-authority.mjs';
test('proxy analytics respects the observed production read-budget reset',()=>{
 expect(publicReadBudgetDelayMs('limit=120, remaining=110, reset=40')).toBe(0);
 expect(publicReadBudgetDelayMs('limit=120, remaining=20, reset=42')).toBe(42250);
 expect(publicReadBudgetDelayMs('limit=120, remaining=0, reset=0')).toBe(250);
 for(const header of [undefined,'limit=120, remaining=-1, reset=10','limit=120, remaining=121, reset=10','limit=120, remaining=2, reset=61','limit=999, remaining=20, reset=5'])expect(()=>publicReadBudgetDelayMs(header)).toThrow();
});
test('only current loader GIF image requests qualify as denied decorations',()=>{
 expect(isOptionalLoaderImage('https://zupimages.net/up/19/34/4820.gif','image')).toBe(true);
 expect(isOptionalLoaderImage('https://zupimages.net/up/19/34/6vlb.gif','image')).toBe(true);
 expect(isOptionalLoaderImage('https://zupimages.net/up/19/34/4820.gif','fetch')).toBe(false);
 expect(isOptionalLoaderImage('https://zupimages.net/up/19/34/other.gif','image')).toBe(false);
 expect(isOptionalLoaderImage('https://strapi.invalid/api','image')).toBe(false);
});
test('optional typography is denied only for exact Google stylesheet/font resources',()=>{
 expect(isOptionalFontRequest('https://fonts.googleapis.com/css2?family=Inter','stylesheet')).toBe(true);
 expect(isOptionalFontRequest('https://fonts.gstatic.com/s/inter/v1/a.woff2','font')).toBe(true);
 for(const [url,type] of [['https://fonts.googleapis.com/css2','fetch'],['https://fonts.googleapis.com/api','stylesheet'],['https://fonts.gstatic.com/s/x','script'],['https://fonts.googleapis.com.evil/css2','stylesheet'],['http://fonts.googleapis.com/css2','stylesheet'],['https://api.strapi.invalid/api','fetch']])expect(isOptionalFontRequest(url,type)).toBe(false);
});
import {readFileSync} from 'node:fs';
import {validateProxyDiscovery,validateProxyExecution,validateProxyResources} from '../../../../scripts/platform-proxy-browser-contract.mjs';
const proof=():Record<string,string|boolean>=>({kind:'owned-synthetic-proxy/v1',runId:'a'.repeat(32),project:'platform-browser-'+ 'a'.repeat(32),sourceCommit:'b'.repeat(40),webImage:'sha256:'+ 'c'.repeat(64),capability:'d'.repeat(64),origin:'https://qa.platform.invalid',callback:'https://qa.platform.invalid/api/auth/callback/google',database:'platform_qa',runtimeRole:'platform_browser_login',observerOwned:true,protectedArtifacts:true});
const fixture=()=>({origin:'https://qa.platform.invalid',proxyAuthority:proof(),personas:{ownerA:{userId:'owner-a',cookie:'__Secure-better-auth.session_token=token.signature',handle:'ownera'}}});
const env=()=>({PLAYWRIGHT_EXTERNAL_BASE_URL:'https://qa.platform.invalid',PLATFORM_PROXY_AUTHORITY:JSON.stringify(proof())});
test('preserves existing owned loopback fixture origin',()=>expect(()=>assertFixtureOrigin({origin:'http://127.0.0.1:55100'},{PLAYWRIGHT_EXTERNAL_BASE_URL:'http://127.0.0.1:55100'})).not.toThrow());
test('accepts only complete matching protected synthetic proxy authority',()=>expect(()=>assertFixtureOrigin(fixture(),env())).not.toThrow());
for(const key of ['kind','runId','project','sourceCommit','webImage','capability','origin','callback','database','runtimeRole','observerOwned','protectedArtifacts']) test('rejects missing authority '+key,()=>{const f=fixture();delete f.proxyAuthority[key];expect(()=>assertFixtureOrigin(f,env())).toThrow();});
for(const [key,value] of [['kind','hosted-qa'],['project','production'],['sourceCommit','unknown'],['webImage','latest'],['origin','https://prod.example'],['callback','http://qa.platform.invalid/api/auth/callback/google'],['database','postgres'],['runtimeRole','postgres'],['observerOwned',false],['protectedArtifacts',false]] as Array<[string,string|boolean]>) test('rejects unsafe authority '+key,()=>{const f=fixture();f.proxyAuthority[key]=value;expect(()=>assertFixtureOrigin(f,{...env(),PLATFORM_PROXY_AUTHORITY:JSON.stringify(f.proxyAuthority)})).toThrow();});
test('rejects unknown fields and absent capability envelope',()=>{const f=fixture();f.proxyAuthority.secret='leak';expect(()=>assertFixtureOrigin(f,env())).toThrow();expect(()=>assertFixtureOrigin(fixture(),{PLAYWRIGHT_EXTERNAL_BASE_URL:fixture().origin})).toThrow();});
test('rejects non-secure and mismatched session personas',()=>{const f=fixture();f.personas.ownerA.cookie='better-auth.session_token=x';expect(()=>assertFixtureOrigin(f,env())).toThrow();f.personas.ownerA.cookie='__Secure-better-auth.session_token=';expect(()=>assertFixtureOrigin(f,env())).toThrow();});
const manifest=JSON.parse(readFileSync(new URL('../../../../explorers-earth/e2e/replatform/platform-proxy.manifest.json',import.meta.url),'utf8'));
function report(){return {errors:[],stats:{expected:38,unexpected:0,flaky:0,skipped:0},suites:[{specs:manifest.identities.map((x:{file:string;title:string;project:string})=>({file:x.file,title:x.title,tests:[{projectName:x.project,expectedStatus:'passed',status:'expected',results:[{status:'passed',retry:0,error:undefined as unknown}]}]}))}]};}
test('accepts exactly 38 identities and one successful result each',()=>{expect(validateProxyDiscovery(report(),manifest)).toBe(38);expect(validateProxyExecution(report(),manifest,0)).toBe(38);});
for(const kind of ['missing','extra','wrong-project','skipped','failed','retried','duplicate-result','error','aggregate','exit'])test('refuses unsafe proxy receipt '+kind,()=>{const r=report();let exit=0;const t=r.suites[0].specs[0].tests[0];if(kind==='missing')r.suites[0].specs.pop();if(kind==='extra')r.suites[0].specs.push(r.suites[0].specs[0]);if(kind==='wrong-project')t.projectName='wrong';if(kind==='skipped')t.results[0].status='skipped';if(kind==='failed')t.results[0].status='failed';if(kind==='retried')t.results[0].retry=1;if(kind==='duplicate-result')t.results.push({...t.results[0]});if(kind==='error')t.results[0].error={message:'failure'};if(kind==='aggregate')r.stats.expected=37;if(kind==='exit')exit=1;expect(()=>validateProxyExecution(r,manifest,exit)).toThrow();});
const resources=()=>({project:proof().project,runId:proof().runId,containers:[{project:proof().project,service:'api'},{project:proof().project,service:'browser'}],volumes:[{name:proof().project+'-fixture',nonce:proof().runId},{name:proof().project+'_postgres-data',project:proof().project}]});
test('permits only verified owned containers and volumes for cleanup',()=>expect(()=>validateProxyResources(resources())).not.toThrow());
for(const kind of ['foreign-container','unknown-service','foreign-volume','wrong-nonce','wrong-project'])test('refuses cleanup '+kind,()=>{const r=resources();if(kind==='foreign-container')r.containers[0].project='other';if(kind==='unknown-service')r.containers[0].service='production';if(kind==='foreign-volume')r.volumes[0].name='prod-database';if(kind==='wrong-nonce')r.volumes[0].nonce='b'.repeat(32);if(kind==='wrong-project')r.project='production';expect(()=>validateProxyResources(r)).toThrow();});
