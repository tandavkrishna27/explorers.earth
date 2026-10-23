import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page,type Request} from '@playwright/test';
import {assertFixtureOrigin} from '../replatform/proxy-fixture-authority.mjs';

// WP5 (OWN-17) local measurement at the live round trip. Runs only inside the owned Movies
// fixture with `movies-fixture-perf-focus.patch` applied (`--focus perf`; the fixture is hash-pinned,
// so the patch stays local). It is not part of any CI lane.
const RTT_MS=185;
type Persona={cookie:string;userId:string;handle:string};
const fixture=JSON.parse(readFileSync(process.env.MOVIES_E2E_FIXTURE_PATH!,'utf8')) as {origin:string;personas:{ownerA:Persona}};
assertFixtureOrigin(fixture);if(fixture.origin!==process.env.PLAYWRIGHT_EXTERNAL_BASE_URL)throw Error('Movie fixture origin mismatch');
const base='/api/explorers/v1';

async function signIn(page:Page){
 const owner=fixture.personas.ownerA,i=owner.cookie.indexOf('=');
 await page.context().addCookies([{name:owner.cookie.slice(0,i),value:owner.cookie.slice(i+1),url:fixture.origin,sameSite:'Lax'}]);
 await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===fixture.origin||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});
}
async function throttle(page:Page){
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Network.enable');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:RTT_MS,downloadThroughput:-1,uploadThroughput:-1});
}
function countApi(page:Page){
 const seen:string[]=[];
 const onRequest=(r:Request)=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))seen.push(`${r.method()} ${u.pathname}`);};
 page.on('request',onRequest);
 return {seen,stop:()=>page.off('request',onRequest)};
}
async function createList(page:Page,title:string){
 const r=await page.request.post(`${base}/collections`,{headers:{Origin:fixture.origin,'Idempotency-Key':randomUUID()},data:{category:'movies',title,slug:`perf-${randomUUID()}`,visibility:'private',publicationState:'draft'}});
 expect(r.status()).toBe(201);return (await r.json()).collection as {id:string};
}

test('provider movie add: Save click to list page, and import completion',async({page})=>{
 await signIn(page);const list=await createList(page,'Perf list');
 await page.goto(`/recommendations/movies/${list.id}/add`);
 await throttle(page);
 await page.getByPlaceholder('Search "Interstellar", "Breaking Bad"...').fill('fixture');
 await page.getByRole('button').filter({hasText:'Fixture Movie 42'}).click();
 await expect(page.getByText('Fixture Watch',{exact:true})).toBeVisible();
 const api=countApi(page);
 let listAt=0;
 const imported=page.waitForResponse(r=>r.request().method()==='POST'&&/\/movie-media\/import$/.test(new URL(r.url()).pathname),{timeout:60000}).then(()=>Date.now());
 const start=Date.now();
 await page.getByRole('button',{name:'Add to List',exact:true}).click();
 await page.waitForURL(new RegExp(`/recommendations/movies/${list.id}$`));
 listAt=Date.now();
 const importAt=await imported;
 api.stop();
 console.log('WP5_PERF '+JSON.stringify({case:'movie-add',saveToListMs:listAt-start,saveToImportDoneMs:importAt-start,listBeforeImport:listAt<=importAt,requests:api.seen}));
});

test('Home: /me requests before first content',async({page})=>{
 await signIn(page);await throttle(page);
 const api=countApi(page);
 const start=Date.now();
 await page.goto('/home',{waitUntil:'networkidle'});
 const ms=Date.now()-start;
 api.stop();
 console.log('WP5_PERF '+JSON.stringify({case:'home',networkIdleMs:ms,me:api.seen.filter(r=>r===`GET ${base}/me`).length,requests:api.seen.length}));
});
