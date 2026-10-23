import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
// BEGIN PLACE LINKS ATOMIC DIAGNOSTIC CONTRACT
const placeLinksAtomicStates = new WeakMap<object, PlaceLinksAtomicState>();
const placeLinksAtomicEmitted = new WeakSet<object>();
const placeLinksAtomicTitle = 'Place links: retained create forms atomically create and link Products and People lists';
const placeLinksAtomicBoundaries = ['unavailable','setup','iteration-entry','navigation','open-form','fill-name','fill-description','fill-slug','baseline-reads','route-install','fresh-register','fresh-click','fresh-response','stale-register','held-click','delivered','held-checks','stale-advance','stale-release','stale-response','conflict-visible','stale-preservation','retained-fields','stale-retry-register','stale-retry-click','stale-retry-response','replay-prerequisites','lost-release','uncertain-visible','replay-preservation','replay-advance','replay-register','replay-click','replay-click-probe','replay-click-hidden-enabled','replay-click-hidden-disabled','replay-click-visible-disabled','replay-click-visible-self','replay-click-visible-blocked','replay-click-blocked-toast-hovered','replay-click-blocked-toast-unhovered','replay-click-blocked-header','replay-click-visible-outside','replay-click-visible-unavailable','replay-click-unavailable','replay-click-post','replay-click-receipt','replay-response','accepted-checks','destination','parent-check','reload','saved-checks','relation-check','linked-count','negative-baseline','negative-requests','negative-checks','provider-check'];
type PlaceLinksAtomicBody = {category:string; phase:string; boundary:string; body:string; elapsed:string; remaining:string};
type PlaceLinksAtomicState = {live:PlaceLinksAtomicBody; firstCaught?:PlaceLinksAtomicBody; cleanup:string; sealed:boolean; origin?:number; lastElapsed?:number; budget?:number; unavailable?:boolean};
function placeLinksAtomicIdentity(info:TestInfo):boolean {
  return resolve(info.file)===resolve(fileURLToPath(import.meta.url)) && info.title===placeLinksAtomicTitle
    && Array.isArray(info.titlePath) && info.titlePath.length===2 && info.titlePath[0]==='place-links.spec.ts' && info.titlePath[1]===placeLinksAtomicTitle
    && info.project.name==='place-links-desktop' && info.repeatEachIndex===0 && info.retry===0;
}
function placeLinksAtomicDisable(info:TestInfo):void {
  try { placeLinksAtomicEmitted.add(info); } catch {/* Best-effort instrumentation: its own failure must not replace the result under test. */}
  try { placeLinksAtomicStates.delete(info); } catch {/* Best-effort teardown: a cleanup failure must not mask the real outcome. */}
}
function placeLinksAtomicTake(info:TestInfo):PlaceLinksAtomicState|undefined {
  const state=placeLinksAtomicStates.get(info);
  if(!state || placeLinksAtomicEmitted.has(info))return undefined;
  placeLinksAtomicStates.delete(info);
  return state;
}
function placeLinksAtomicTiming(state:PlaceLinksAtomicState):{elapsed:string;remaining:string} {
  const now=performance.now(),elapsed=now-state.origin!;
  if(state.unavailable || !Number.isFinite(now) || !Number.isFinite(elapsed) || elapsed<0 || elapsed<state.lastElapsed!) {
    state.unavailable=true;
    return {elapsed:'unavailable',remaining:'unavailable'};
  }
  state.lastElapsed=elapsed;
  const remaining=Math.max(0,state.budget!-elapsed)/1000,seconds=elapsed/1000;
  return {elapsed:seconds<1?'under-one':seconds<10?'one-to-ten':seconds<30?'ten-to-thirty':seconds<60?'thirty-to-sixty':seconds<90?'sixty-to-ninety':seconds<120?'ninety-to-one-twenty':'one-twenty-plus',
    remaining:remaining===0?'zero':remaining<1?'under-one':remaining<10?'one-to-ten':remaining<30?'ten-to-thirty':remaining<60?'thirty-to-sixty':'sixty-plus'};
}
function placeLinksAtomicCoherent(body:PlaceLinksAtomicBody,cleanup:string):boolean {
  const outside=['unavailable','setup','provider-check'].includes(body.boundary),negative=['negative-baseline','negative-requests','negative-checks'].includes(body.boundary);
  if(!placeLinksAtomicBoundaries.includes(body.boundary) || !['products','people','unavailable'].includes(body.category) || !['fresh','stale','lost-ack','unavailable'].includes(body.phase) || !['unknown','completed','caught'].includes(body.body) || !['not-entered','release','listener-off','unroute','completed'].includes(cleanup))return false;
  if(outside)return body.category==='unavailable' && body.phase==='unavailable' && body.body==='unknown' && cleanup==='not-entered';
  if(negative)return body.category!=='unavailable' && body.phase==='unavailable' && body.body==='unknown' && cleanup==='not-entered';
  if(body.category==='unavailable' || body.phase==='unavailable')return false;
  if(body.boundary==='iteration-entry' && (body.body!=='unknown' || cleanup!=='not-entered'))return false;
  if(body.body!=='unknown' && placeLinksAtomicBoundaries.indexOf(body.boundary)<10)return false;
  return true;
}
function beginPlaceLinksAtomicDiagnostic(info:TestInfo):void {
  try {
    if(placeLinksAtomicStates.get(info) || placeLinksAtomicEmitted.has(info) || !placeLinksAtomicIdentity(info))return;
    const budget=info.timeout,origin=performance.now();
    const unavailable=!Number.isFinite(budget) || budget<=0 || !Number.isFinite(origin) || origin<0;
    const state:PlaceLinksAtomicState={live:{category:'unavailable',phase:'unavailable',boundary:'unavailable',body:'unknown',elapsed:'unavailable',remaining:'unavailable'},cleanup:'not-entered',sealed:false,origin,lastElapsed:0,budget,unavailable};
    placeLinksAtomicStates.set(info,state);
  } catch { placeLinksAtomicDisable(info); }
}
function setPlaceLinksAtomicBoundary(info:TestInfo,category:string,phase:string,boundary:string):void {
  try {
    const state=placeLinksAtomicTake(info);if(!state)return;
    if(state.sealed){placeLinksAtomicStates.set(info,state);return;}
    const reset=['unavailable','setup','iteration-entry','negative-baseline','negative-requests','negative-checks','provider-check'].includes(boundary);
    const cleanup=reset?'not-entered':state.cleanup;
    const live={category,phase,boundary,body:'unknown',...placeLinksAtomicTiming(state)};
    if(!placeLinksAtomicCoherent(live,cleanup)){placeLinksAtomicDisable(info);return;}
    placeLinksAtomicStates.set(info,{...state,live,cleanup});
  } catch { placeLinksAtomicDisable(info); }
}
function recordPlaceLinksAtomicBody(info:TestInfo,outcome:string):void {
  try {
    const state=placeLinksAtomicTake(info);if(!state)return;
    if(state.sealed){placeLinksAtomicStates.set(info,state);return;}
    const live={...state.live,body:outcome,...placeLinksAtomicTiming(state)};
    if(!['completed','caught'].includes(outcome) || !placeLinksAtomicCoherent(live,state.cleanup)){placeLinksAtomicDisable(info);return;}
    placeLinksAtomicStates.set(info,{...state,live,firstCaught:state.firstCaught ?? (outcome==='caught'?live:undefined)});
  } catch { placeLinksAtomicDisable(info); }
}
function setPlaceLinksAtomicCleanup(info:TestInfo,cleanup:string):void {
  try {
    const state=placeLinksAtomicTake(info);if(!state)return;
    if(state.sealed){placeLinksAtomicStates.set(info,state);return;}
    if(!placeLinksAtomicCoherent(state.live,cleanup)){placeLinksAtomicDisable(info);return;}
    placeLinksAtomicStates.set(info,{...state,cleanup});
  } catch { placeLinksAtomicDisable(info); }
}
function finalizePlaceLinksAtomicDiagnostic(info:TestInfo):void {
  try {
    const state=placeLinksAtomicTake(info);if(!state)return;
    const live=state.firstCaught ?? state.live;
    if(!placeLinksAtomicCoherent(live,state.cleanup) || live.body==='completed' && state.cleanup==='not-entered'){placeLinksAtomicDisable(info);return;}
    placeLinksAtomicStates.set(info,{live,cleanup:state.cleanup,sealed:true});
  } catch { placeLinksAtomicDisable(info); }
}
function capturePlaceLinksAtomicDiagnostic(info:TestInfo):void {
  try {
    const state=placeLinksAtomicStates.get(info);
    if(!state || !state.sealed || placeLinksAtomicEmitted.has(info))return;
    placeLinksAtomicStates.delete(info);
    placeLinksAtomicEmitted.add(info);
    if(!placeLinksAtomicIdentity(info) || !['failed','timedOut','interrupted'].includes(info.status!))return;
    const errors=info.errors;
    if(!Array.isArray(errors))return;
    const body=state.live;
    errors.push({message:'[place-links-atomic-diagnostic-v1:'+ [body.category,body.phase,body.boundary,body.body,state.cleanup,body.elapsed,body.remaining].join('|')+']'});
  } catch { placeLinksAtomicDisable(info); }
}

// END PLACE LINKS ATOMIC DIAGNOSTIC CONTRACT
import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {test, expect, type Browser, type Page, type TestInfo} from '@playwright/test';
import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import {installPlacesProviderTransport} from '../setup/places-provider-transport';
import type {PlacesManifest, PlacesPersona} from '../../../tunes/scripts/places-browser-support';

// Private reset authority stays in Node. Only reset-issued cookies reach cookie storage.
type Fixture = {origin:string; apiOrigin:string; version:1; runId:string; commit:string;
  placesControl:{url:string; capability:string; runId:string; commit:string; version:1}};
const path = process.env.PLACE_LINKS_E2E_FIXTURE_PATH;
if (!path) throw new Error('Places requires the owned fixture runner');
const fixture = JSON.parse(readFileSync(path,'utf8')) as Fixture;
assertFixtureOrigin(fixture);
if (fixture.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL || fixture.version !== 1
  || fixture.placesControl.runId !== fixture.runId || fixture.placesControl.commit !== fixture.commit
  || new URL(fixture.placesControl.url).hostname !== '127.0.0.1'
  || !/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(fixture.apiOrigin)) throw new Error('Places fixture authority mismatch');
const base = '/api/explorers/v1';
type Dto = Record<string, any>;
let manifest:PlacesManifest;
async function control(action:'reset'|'observe', info:TestInfo) {
  if(info.repeatEachIndex !== 0) throw new Error('Places repeat denied');
  const response = await fetch(fixture.placesControl.url,{method:'POST',headers:{
    'Content-Type':'application/json','x-places-capability':fixture.placesControl.capability},
    body:JSON.stringify({action,caseId:info.title,project:info.project.name,repeat:0,runId:fixture.runId,commit:fixture.commit})});
  expect(response.status).toBe(200);
  const result = await response.json() as Dto;
  expect(result.version===1 && result.runId===fixture.runId && result.commit===fixture.commit
    && result.caseId===info.title && result.project===info.project.name).toBe(true);
  return result;
}
async function api(pathname:string, persona?:PlacesPersona, method='GET', body?:Dto, extra:Record<string,string>={}) {
  // Direct authority is the attested private API; no hosted or arbitrary URL admission.
  const response = await fetch(`${fixture.apiOrigin}${base}${pathname}`,{method,headers:{
    ...(persona?{Cookie:persona.cookie}:{}),...(method==='GET'||method==='HEAD'?{}:{Origin:fixture.origin,
      'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...extra},
    ...(body?{body:JSON.stringify(body)}:{}),redirect:'error'});
  return response;
}
async function json(pathname:string, persona?:PlacesPersona) {
  const response=await api(pathname,persona);expect(response.status).toBe(200);return await response.json() as Dto;
}
async function editable(kind:'collections'|'recommendations',id:string,persona=manifest.personas.ownerA) {
  const body=await json(`/${kind}/${id}/editable?status=active`,persona);
  const value=body[kind==='collections'?'collection':'recommendation'];
  expect(value.id===id && value.accountId===persona.accountId && Number.isSafeInteger(value.revision)).toBe(true);
  // The category content revision is a bigint carried as a decimal string; commands send a number.
  if(value.categoryRevision!==undefined)value.categoryRevision=Number(value.categoryRevision);
  return value as Dto;
}
async function patchCollection(id:string,patch:Dto,persona=manifest.personas.ownerA) {
  const observed=await editable('collections',id,persona);
  const response=await api(`/collections/${id}`,persona,'PATCH',{expectedRevision:observed.revision,...patch});
  expect(response.status).toBe(200);return editable('collections',id,persona);
}
async function complete(category:string,persona=manifest.personas.ownerA) {
  const snapshot=await json(`/categories/${category}/content-snapshot`,persona);
  const streams:Record<string,Dto[]>={};
  for(const [key,route,params] of [
    ['collections','/collections',{category,status:'all'}],
    ['recommendations','/recommendations',{category,status:'active'}],
    ['memberships',`/categories/${category}/memberships`,{collectionStatus:'all',recommendationStatus:'active'}],
  ] as const) {
    const rows:Dto[]=[],seen=new Set<string>();let cursor:string|undefined;
    // This loop form is frozen: scripts/place-links-atomic-diagnostic.test.mjs compares the
    // printed AST of this spec against a recorded nativeSource, so rewriting it as for(;;)
    // changes protected source. The loop is unconditional by design and breaks internally.
    do {
      const search=new URLSearchParams({...params,limit:'24',snapshotToken:snapshot.snapshotToken,...(cursor?{cursor}:{})});
      const page=await json(`${route}?${search}`,persona);
      expect(page.snapshot===snapshot.revision && page.snapshotToken===snapshot.snapshotToken && page.expiresAt===snapshot.expiresAt).toBe(true);
      expect(Array.isArray(page.items) && page.items.length<=24).toBe(true);rows.push(...page.items);
      if(page.nextCursor===null) break;
      expect(typeof page.nextCursor==='string' && page.items.length>0 && !seen.has(page.nextCursor)).toBe(true);
      cursor=page.nextCursor;seen.add(cursor!);
    // eslint-disable-next-line no-constant-condition
    } while(true);
    streams[key]=rows;
  }
  expect(streams.collections.every(row=>row.accountId===persona.accountId && row.category===category)
    && streams.recommendations.every(row=>row.accountId===persona.accountId && row.category===category)).toBe(true);
  return streams;
}
async function appPage(page:Page,persona?:PlacesPersona) {
  const transport=await installPlacesProviderTransport(page);
  if(persona) {
    const split=persona.cookie.indexOf('=');
    await page.context().addCookies([{name:persona.cookie.slice(0,split),value:persona.cookie.slice(split+1),url:fixture.origin,sameSite:'Lax',httpOnly:true}]);
    await page.addInitScript(({userId,handle})=>localStorage.setItem('auth-storage',JSON.stringify({state:{
      isAuthenticated:true,token:'places-fixture-placeholder',user:{id:userId,documentId:userId,username:handle,
        email:`${userId}@example.invalid`,blocked:false}},version:0})),{userId:persona.userId,handle:persona.handle});
    const sessionResponse=await fetch(fixture.apiOrigin+'/api/auth/get-session',{headers:{Cookie:persona.cookie},redirect:'error'});
    expect(sessionResponse.status).toBe(200);
    const session=await sessionResponse.json() as Dto;expect(session.user?.id===persona.userId).toBe(true);
    const current=await json('/me',persona);
    expect(current.account.id===persona.accountId && current.account.handle===persona.handle
      && current.account.onboardingStatus==='complete').toBe(true);
  }
  return transport;
}
async function anonymous(browser:Browser) {
  const use=test.info().project.use;
  const context=await browser.newContext({baseURL:fixture.origin,viewport:use.viewport,isMobile:use.isMobile,
    hasTouch:use.hasTouch,deviceScaleFactor:use.deviceScaleFactor});const page=await context.newPage();
  const transport=await appPage(page);return {context,page,transport};
}
const aLists=()=>manifest.collections.filter(c=>c.accountId===manifest.personas.ownerA.accountId && c.category==='places');
const publicPath=(slug?:string,handle=manifest.personas.ownerA.handle)=>`/profiles/${handle}/recommendations/places${slug?`/${slug}`:''}`;
const same=(actual:unknown,expected:unknown)=>expect(JSON.stringify(actual)===JSON.stringify(expected)).toBe(true);
async function bytes(label:string,persona?:PlacesPersona) {
  const media=manifest.media.find(m=>m.label===label)!;
  const response=await api(media.url.slice(base.length),persona);expect(response.status).toBe(200);
  const body=Buffer.from(await response.arrayBuffer());expect(response.headers.get('content-type')).toContain('image/png');
  expect(body.length).toBe(media.length);expect(createHash('sha256').update(body).digest('hex')===media.sha256).toBe(true);
  const etag=response.headers.get('etag');expect(etag===`"${media.sha256}"`).toBe(true);
  const head=await api(media.url.slice(base.length),persona,'HEAD');expect(head.status).toBe(200);
  expect(Number(head.headers.get('content-length'))).toBe(media.length);expect((await head.arrayBuffer()).byteLength).toBe(0);
  const range=await api(media.url.slice(base.length),persona,'GET',undefined,{Range:'bytes=0-7'});
  // Exact local Range response proves the retained media controller contract.
  expect(range.status).toBe(206);expect(range.headers.get('content-range')).toBe(`bytes 0-7/${media.length}`);
  const rangeBody=Buffer.from(await range.arrayBuffer());expect(rangeBody.length).toBe(8);expect(rangeBody.equals(body.subarray(0,8))).toBe(true);
  const conditional=await api(media.url.slice(base.length),persona,'GET',undefined,{'If-None-Match':etag!});
  expect(conditional.status).toBe(304);expect((await conditional.arrayBuffer()).byteLength).toBe(0);
  return etag!;
}
async function deniedBytes(label:string,etag:string,persona?:PlacesPersona) {
  const media=manifest.media.find(m=>m.label===label)!;
  for(const [method,headers] of [['GET',{}],['HEAD',{}],['GET',{Range:'bytes=0-7'}],['GET',{'If-None-Match':etag}]] as const) {
    const response=await api(media.url.slice(base.length),persona,method,undefined,headers);
    expect(response.status).toBe(404);expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('etag')!==etag).toBe(true); // Express weak JSON-error ETags are permitted.
    const body=Buffer.from(await response.arrayBuffer());expect(!body.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))).toBe(true);
    expect(response.headers.get('content-type')?.includes('image/png')??false).toBe(false);
  }
}
function normalized(value:unknown):unknown {
  if(Array.isArray(value))return value.map(normalized);
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>key!=='requestId').map(([key,v])=>[key,normalized(v)]));
  return value;
}
async function equalMissing(pathname:string,missing:string,persona:PlacesPersona,method='GET',body?:Dto) {
  const foreign=await api(pathname,persona,method,body),absent=await api(missing,persona,method,body);
  expect(foreign.status).toBe(404);expect(absent.status).toBe(404);
  same(normalized(await foreign.json()),normalized(await absent.json()));
}
// eslint-disable-next-line no-empty-pattern -- the empty fixture pattern is frozen: root scripts/ seal tests assert this spec's exact source text, so `_` breaks them.
test.beforeEach(async ({},info)=>{manifest=await control('reset',info) as PlacesManifest;});

function child(category:'products'|'people') {
  return manifest.collections.find(c=>c.accountId===manifest.personas.ownerA.accountId && c.category===category && c.title===`Owned ${category==='products'?'Products':'People'}`)!;
}
// WP10. A Places list page has no tabs: the read-only "Linked lists" section and the Manage
// panel (with Attach) both sit under the places, and both are regions named "Linked lists".
const placeListPath=(id:string)=>`/recommendations/places?list=${encodeURIComponent(id)}`;
const onPlaceList=(id:string)=>(url:URL)=>url.origin===fixture.origin && url.pathname==='/recommendations/places' && url.searchParams.get('list')===id && url.hash==='';
function managePanel(page:Page) {
  return page.getByRole('region',{name:'Linked lists',exact:true}).filter({has:page.getByRole('button',{name:'Attach',exact:true})});
}
function linkedSection(page:Page) {
  return page.getByRole('region',{name:'Linked lists',exact:true}).filter({hasNot:page.getByRole('button',{name:'Attach',exact:true})});
}
async function openPicker(page:Page) {
  await managePanel(page).getByRole('button',{name:'Attach',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Attach a list',exact:true});await expect(picker).toBeVisible();return picker;
}
// LNK-06. "Create a new list" in the picker opens the shared New list dialog, which creates
// the list and attaches it to the open list in one command.
async function newListDialog(page:Page,category:string) {
  const picker=await openPicker(page);
  await picker.getByRole('combobox',{name:'Category for the new list',exact:true}).selectOption(category);
  await picker.getByRole('button',{name:'Create a new list',exact:true}).click();
  const form=page.getByRole('dialog',{name:'New list',exact:true});await expect(form).toBeVisible();return form;
}
const linkResponse=(page:Page,id:string,method:string)=>page.waitForResponse(r=>new URL(r.url()).pathname.startsWith(`${base}/collections/${id}/links`) && r.request().method()===method);
async function assertRelation(parentId:string,childId:string,linked:boolean) {
  const parent=await editable('collections',parentId),value=await editable('collections',childId);
  expect(parent.linkedLists.filter((card:Dto)=>card.direction==='outgoing' && card.collection.id===childId).length).toBe(linked?1:0);
  expect(value.linkedLists.filter((card:Dto)=>card.direction==='incoming' && card.collection.id===parentId).length).toBe(linked?1:0);
}
async function patchAccount(patch:Dto) {
  const persona=manifest.personas.ownerA,current=await json('/me',persona);
  const response=await api('/account',persona,'PATCH',{expectedRevision:current.account.revision,...patch});
  expect(response.status).toBe(200);
}
async function categoryVisibility(category:string,visible:boolean) {
  const current=await json('/me',manifest.personas.ownerA);
  expect(current.account.categories.some((entry:Dto)=>entry.category===category)).toBe(true);
  await patchAccount({categories:current.account.categories.map((entry:Dto)=>({...entry,isPublic:entry.category===category?visible:entry.isPublic}))});
}
const independentPath=(category:string,slug:string)=>`/profiles/${manifest.personas.ownerA.handle}/recommendations/${category}/${slug}`;
const membershipValues=(rows:Dto[])=>rows.map(row=>[row.collectionId,row.recommendationId,row.displayOrder]);
const immutableParent=(row:Dto)=>Object.fromEntries(Object.entries(row).filter(([key])=>!['revision','categoryRevision','description'].includes(key)));

test('Place links: existing Products and People lists attach detach and survive reload',async ({page},info)=>{
  const transport=await appPage(page,manifest.personas.ownerA);const [parent,second]=aLists();
  const own=(title:string)=>manifest.collections.find(c=>c.accountId===manifest.personas.ownerA.accountId && c.title===title)!;
  // WP10 (LNK-02). Any of the owner's lists attaches, not only Products and People.
  const reads=own('Owned Reads'),apps=own('Owned Apps');
  await page.goto(placeListPath(parent.id));await expect(managePanel(page)).toBeVisible();
  for(const category of ['products','people'] as const) {
    const item=child(category),before=await editable('collections',item.id),content=await complete(category);
    const ownRecommendations=content.recommendations.filter(r=>manifest.recommendations.some(seed=>seed.collectionId===item.id && seed.id===r.id));
    const picker=await openPicker(page);await picker.getByRole('searchbox',{name:'Find a list',exact:true}).fill(item.title);
    const linked=linkResponse(page,parent.id,'POST');
    await picker.getByRole('option',{name:item.title,exact:true}).click();const response=await linked;expect(response.status()).toBe(201);
    const body=response.request().postDataJSON();expect(body.linkedCollectionId).toBe(item.id);expect(body.role).toBe(null);
    expect(Number.isSafeInteger(body.expectedHostRevision) && Number.isSafeInteger(body.expectedLinkedRevision)).toBe(true);
    await expect(managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true})).toBeVisible();
    await assertRelation(parent.id,item.id,true);await page.reload();
    await expect(linkedSection(page).getByRole('link',{name:new RegExp(item.title)})).toBeVisible();
    // LNK-04 / OWN-13. Detach offers Undo; Undo restores the same link.
    const detached=linkResponse(page,parent.id,'DELETE');await managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true}).click();
    const removed=await detached;expect(removed.status()).toBe(200);await assertRelation(parent.id,item.id,false);
    const undone=linkResponse(page,parent.id,'POST');await page.getByRole('button',{name:'Undo',exact:true}).click();
    expect((await undone).status()).toBe(201);await assertRelation(parent.id,item.id,true);
    await page.reload();await expect(managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true})).toBeVisible();
    const final=linkResponse(page,parent.id,'DELETE');await managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true}).click();
    expect((await final).status()).toBe(200);
    await assertRelation(parent.id,item.id,false);await page.reload();
    await expect(managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true})).toHaveCount(0);
    const after=await editable('collections',item.id);same([after.title,after.slug,after.description],[before.title,before.slug,before.description]);
    const afterContent=await complete(category);
    same(afterContent.memberships.filter(m=>m.collectionId===item.id).map(m=>[m.recommendationId,m.displayOrder]),
      content.memberships.filter(m=>m.collectionId===item.id).map(m=>[m.recommendationId,m.displayOrder]));
    same(afterContent.recommendations.filter(r=>ownRecommendations.some(original=>original.id===r.id)),ownRecommendations);
    for(const seed of manifest.recommendations.filter(r=>r.collectionId===item.id))expect((await editable('recommendations',seed.id)).entityId).toBe(seed.entityId);
    expect((await editable('collections',second.id)).linkedLists.some((card:Dto)=>card.collection.id===item.id)).toBe(false);
  }
  for(const item of [reads,apps]) {
    const picker=await openPicker(page);await picker.getByRole('searchbox',{name:'Find a list',exact:true}).fill(item.title);
    const linked=linkResponse(page,parent.id,'POST');await picker.getByRole('option',{name:item.title,exact:true}).click();
    expect((await linked).status()).toBe(201);await expect(managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true})).toBeVisible();
  }
  await page.reload();
  for(const item of [reads,apps])await expect(linkedSection(page).getByRole('link',{name:new RegExp(item.title)})).toBeVisible();
  // LNK-05. A linked list opens as itself and shows the link back (incoming); Back returns.
  await linkedSection(page).getByRole('link',{name:new RegExp(reads.title)}).click();
  await expect(page).toHaveURL(url=>url.pathname===`/recommendations/books/${reads.id}`);
  await expect(linkedSection(page).getByRole('link',{name:new RegExp(parent.title)})).toBeVisible();
  await page.goBack();await expect(page).toHaveURL(onPlaceList(parent.id));
  const observed=await control('observe',info);
  same(observed.relations.filter((r:Dto)=>r.location_collection_id===parent.id).map((r:Dto)=>r.child_collection_id).sort(),[reads.id,apps.id].sort());
  transport.assertExpected();expect(transport.observations.length).toBe(0);
});

test('Place links: retained create forms atomically create and link Products and People lists',async ({page},info)=>{
beginPlaceLinksAtomicDiagnostic(info);try {

  setPlaceLinksAtomicBoundary(info,'unavailable','unavailable','setup');
const transport=await appPage(page,manifest.personas.ownerA);const parent=aLists()[0];
  const errorBody=(value:Dto,code:string)=>{
    same(Object.keys(value),['error']);same(Object.keys(value.error).sort(),['code','message','requestId']);
    expect(value.error.code).toBe(code);expect(typeof value.error.message).toBe('string');
    expect(typeof value.error.requestId==='string' && value.error.requestId.length>0).toBe(true);
    return {error:{code:value.error.code,message:value.error.message}};
  };
  const createResponse=()=>page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/collections` && r.request().method()==='POST');
  for(const category of ['products','people'] as const) {
    const product=category==='products';
    for(const phase of ['fresh','stale','lost-ack'] as const) {
      setPlaceLinksAtomicBoundary(info,category,phase,'iteration-entry');
const title=`Created Linked ${product?'Products':'People'} ${phase}`,slug=`created-linked-${category}-${phase}`,description='Created through the attach picker';
      setPlaceLinksAtomicBoundary(info,category,phase,'navigation');
await page.goto(placeListPath(parent.id));
      setPlaceLinksAtomicBoundary(info,category,phase,'open-form');
const form=await newListDialog(page,category);
      const nameField=form.getByLabel('Name',{exact:true});
      const descriptionField=form.getByLabel('Short description (optional)',{exact:true});
      const slugField=form.getByLabel('Web address',{exact:true});
      setPlaceLinksAtomicBoundary(info,category,phase,'fill-name');
await nameField.fill(title);setPlaceLinksAtomicBoundary(info,category,phase,'fill-description');
await descriptionField.fill(description);setPlaceLinksAtomicBoundary(info,category,phase,'fill-slug');
await slugField.fill(slug);
      const submit=form.getByRole('button',{name:'Create list',exact:true});
      setPlaceLinksAtomicBoundary(info,category,phase,'baseline-reads');
const before=await editable('collections',parent.id),content=await complete(category),observation=await control('observe',info);
      let release!:()=>void,held!:()=>void,originalBody='',originalKey='',receipt:Dto|undefined,committedParent:Dto|undefined;
      const delivered=new Promise<void>(resolve=>held=resolve),gate=new Promise<void>(resolve=>release=resolve);
      let parentReads=0;const read=(request:import('@playwright/test').Request)=>{
        if(request.method()==='GET' && new URL(request.url()).pathname===`${base}/collections/${parent.id}/editable`)parentReads++;
      };
      page.on('request',read);
      const routePath=`**${base}/collections`;let first=true;
      // BEGIN PLACE LINKS REPLAY DECLARATION PROBE
let placeLinksReplayClickProbe=false;
// END PLACE LINKS REPLAY DECLARATION PROBE
const handler=async (route:import('@playwright/test').Route)=>{
// BEGIN PLACE LINKS REPLAY REQUEST PROBE
if(placeLinksReplayClickProbe && route.request().method()==='POST' && new URL(route.request().url()).pathname===`${base}/collections`)setPlaceLinksAtomicBoundary(info,category,phase,'replay-click-post');
// END PLACE LINKS REPLAY REQUEST PROBE
        if(route.request().method()!=='POST' || !first)return route.continue();first=false;
        originalBody=route.request().postData()!;originalKey=route.request().headers()['idempotency-key'];
        expect(Boolean(originalKey)).toBe(true);
        if(phase==='lost-ack') {
          const committed=await route.fetch();expect(committed.status()).toBe(201);receipt=await committed.json();
          committedParent=await editable('collections',parent.id);held();await gate;await route.abort('failed');
        } else {held();await gate;await route.continue();}
      };
      setPlaceLinksAtomicBoundary(info,category,phase,'route-install');
if(phase!=='fresh')await page.route(routePath,handler);
      let accepted:import('@playwright/test').Response;
      try {
        if(phase==='fresh') {
          setPlaceLinksAtomicBoundary(info,category,phase,'fresh-register');
const created=createResponse();setPlaceLinksAtomicBoundary(info,category,phase,'fresh-click');
await submit.click();setPlaceLinksAtomicBoundary(info,category,phase,'fresh-response');
accepted=await created;
        } else {
          setPlaceLinksAtomicBoundary(info,category,phase,'stale-register');
const refused=phase==='stale'?createResponse():undefined;
          setPlaceLinksAtomicBoundary(info,category,phase,'held-click');
await submit.click();setPlaceLinksAtomicBoundary(info,category,phase,'delivered');
await delivered;
          // The host's CATEGORY revision is read fresh right before the create (LNK-06).
          setPlaceLinksAtomicBoundary(info,category,phase,'held-checks');
const initial=JSON.parse(originalBody);expect(initial.attachTo.expectedHostRevision).toBe(before.categoryRevision);
          same([initial.category,initial.title,initial.slug,initial.description,initial.attachTo.hostCollectionId,initial.attachTo.role],[category,title,slug,description,parent.id,null]);
          const readsBefore=parentReads;expect(readsBefore>0).toBe(true);
          if(phase==='stale') {
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-advance');
const advanced=await patchCollection(parent.id,{description:`Concurrent ${category} stale revision`});expect(advanced.categoryRevision>before.categoryRevision).toBe(true);
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-release');
release();setPlaceLinksAtomicBoundary(info,category,phase,'stale-response');
const conflict=await refused!;expect(conflict.status()).toBe(409);errorBody(await conflict.json(),'CONFLICT');
            expect(conflict.request().postData()).toBe(originalBody);expect(conflict.request().headers()['idempotency-key']).toBe(originalKey);
            // The New list dialog reports every 409 on its web address field and stays open.
            setPlaceLinksAtomicBoundary(info,category,phase,'conflict-visible');
await expect(form.getByRole('alert')).toBeVisible();
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-preservation');
same(await complete(category),content);same((await control('observe',info)).relations,observation.relations);
            same((await control('observe',info)).collections.filter((row:Dto)=>row.id!==parent.id),observation.collections.filter((row:Dto)=>row.id!==parent.id));
            same(await editable('collections',parent.id),advanced);
            setPlaceLinksAtomicBoundary(info,category,phase,'retained-fields');
await expect(nameField).toHaveValue(title);await expect(descriptionField).toHaveValue(description);await expect(slugField).toHaveValue(slug);
            await expect(page).toHaveURL(onPlaceList(parent.id));
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-retry-register');
const created=createResponse();
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-retry-click');
await submit.click();
            setPlaceLinksAtomicBoundary(info,category,phase,'stale-retry-response');
accepted=await created;
            setPlaceLinksAtomicBoundary(info,category,phase,'accepted-checks');
expect(accepted.request().headers()['idempotency-key']).not.toBe(originalKey);expect(accepted.request().postDataJSON().attachTo.expectedHostRevision).toBe(advanced.categoryRevision);expect(parentReads>readsBefore).toBe(true);
          } else {
            setPlaceLinksAtomicBoundary(info,category,phase,'replay-prerequisites');
expect(receipt!.collection.attachedTo.hostCollectionId).toBe(parent.id);expect(receipt!.collection.attachedTo.hostCategoryRevision).toBe(committedParent!.categoryRevision);
            await assertRelation(parent.id,receipt!.collection.id,true);
            setPlaceLinksAtomicBoundary(info,category,phase,'lost-release');
release();setPlaceLinksAtomicBoundary(info,category,phase,'uncertain-visible');
await expect(page.getByText("Couldn't create the list. Try again.",{exact:true})).toBeVisible();
            setPlaceLinksAtomicBoundary(info,category,phase,'retained-fields');
await expect(nameField).toHaveValue(title);await expect(descriptionField).toHaveValue(description);await expect(slugField).toHaveValue(slug);
            await expect(page).toHaveURL(onPlaceList(parent.id));
            setPlaceLinksAtomicBoundary(info,category,phase,'replay-preservation');
const committedContent=await complete(category),committedObserve=await control('observe',info);
            expect(committedContent.collections.length).toBe(content.collections.length+1);
            expect(committedContent.collections.filter(row=>row.id===receipt!.collection.id)).toHaveLength(1);
            same(committedContent.recommendations,content.recommendations);same(committedContent.memberships,content.memberships);
            setPlaceLinksAtomicBoundary(info,category,phase,'replay-advance');
const later=await patchCollection(parent.id,{description:`Later ${category} receipt control`});expect(later.categoryRevision>committedParent!.categoryRevision).toBe(true);
            // A second Create after an uncertain outcome is a NEW command (fresh key, fresh host
            // read). The committed list owns the web address, so it is refused: never a duplicate.
            setPlaceLinksAtomicBoundary(info,category,phase,'replay-register');
const replay=createResponse();setPlaceLinksAtomicBoundary(info,category,phase,'replay-click');
// BEGIN PLACE LINKS REPLAY CLICK PROBE
if(category==='products' && info.project.name==='place-links-desktop') {
  placeLinksReplayClickProbe=true;
  setPlaceLinksAtomicBoundary(info,category,phase,'replay-click-probe');
  void replay.then(response=>{try{if(response.status()===201)setPlaceLinksAtomicBoundary(info,category,phase,'replay-click-receipt');}catch{/* Best-effort instrumentation: its own failure must not replace the result under test. */}},()=>{});
  let readiness='replay-click-unavailable';
  try {readiness=await submit.evaluate(element=>{
    try {
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      const visible=rect.width>0 && rect.height>0 && style.visibility!=='hidden' && style.visibility!=='collapse' && style.display!=='none';
      const enabled=!element.matches(':disabled') && element.getAttribute('aria-disabled')!=='true';
      if(!visible)return enabled?'replay-click-hidden-enabled':'replay-click-hidden-disabled';
      if(!enabled)return 'replay-click-visible-disabled';
      const left=Math.max(0,rect.left),right=Math.min(innerWidth,rect.right),top=Math.max(0,rect.top),bottom=Math.min(innerHeight,rect.bottom);
      if(right<=left || bottom<=top)return 'replay-click-visible-outside';
      const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
      if(hit===null)return 'replay-click-visible-unavailable';
      if(element===hit || element.contains(hit))return 'replay-click-visible-self';
      const toaster=hit.closest('[data-sonner-toaster]');
      if(toaster)return toaster.matches(':hover')?'replay-click-blocked-toast-hovered':'replay-click-blocked-toast-unhovered';
      if(hit.closest('.dashboard-header'))return 'replay-click-blocked-header';
      return 'replay-click-visible-blocked';
    } catch {return 'replay-click-unavailable';}
  });}catch{/* Best-effort instrumentation: its own failure must not replace the result under test. */}
  setPlaceLinksAtomicBoundary(info,category,phase,readiness);
}
// END PLACE LINKS REPLAY CLICK PROBE
await submit.click();setPlaceLinksAtomicBoundary(info,category,phase,'replay-response');
accepted=await replay;
            setPlaceLinksAtomicBoundary(info,category,phase,'accepted-checks');
expect(accepted.status()).toBe(409);errorBody(await accepted.json(),'CONFLICT');expect(accepted.request().headers()['idempotency-key']).not.toBe(originalKey);
            setPlaceLinksAtomicBoundary(info,category,phase,'replay-preservation');
same(await complete(category),committedContent);same((await control('observe',info)).relations,committedObserve.relations);
            same((await control('observe',info)).collections.filter((row:Dto)=>row.id!==parent.id),committedObserve.collections.filter((row:Dto)=>row.id!==parent.id));
            same(await editable('collections',parent.id),later);await expect(form.getByRole('alert')).toBeVisible();await submit.press('Escape');
          }
        }
        setPlaceLinksAtomicBoundary(info,category,phase,'accepted-checks');
if(phase!=='lost-ack')expect(accepted.status()).toBe(201);
        const body=accepted.request().postDataJSON(),result=phase==='lost-ack'?receipt!:await accepted.json();
        same([body.category,body.title,body.slug,body.description,body.attachTo.hostCollectionId,body.attachTo.role],[category,title,slug,description,parent.id,null]);
        expect(Number.isSafeInteger(body.attachTo.expectedHostRevision)).toBe(true);
        same([result.collection.title,result.collection.slug,result.collection.attachedTo.hostCollectionId],[title,slug,parent.id]);
        const id=result.collection.id;
        // LNK-06. The owner stays on the origin list; the dialog is gone.
        setPlaceLinksAtomicBoundary(info,category,phase,'destination');
await expect(page).toHaveURL(onPlaceList(parent.id));await expect(form).toHaveCount(0);
        setPlaceLinksAtomicBoundary(info,category,phase,'parent-check');
expect((await editable('collections',parent.id)).linkedLists.filter((card:Dto)=>card.direction==='outgoing' && card.collection.id===id)).toHaveLength(1);
        setPlaceLinksAtomicBoundary(info,category,phase,'reload');
await page.reload();
        setPlaceLinksAtomicBoundary(info,category,phase,'saved-checks');
const saved=await editable('collections',id);same([saved.title,saved.slug,saved.description],[title,slug,description]);
        setPlaceLinksAtomicBoundary(info,category,phase,'relation-check');
await assertRelation(parent.id,id,true);
        setPlaceLinksAtomicBoundary(info,category,phase,'linked-count');
await expect(managePanel(page).getByRole('button',{name:`Detach ${title}`,exact:true})).toBeVisible();
        expect((await control('observe',info)).relations.filter((row:Dto)=>row.child_collection_id===id)).toHaveLength(1);
        expect((await complete(category)).collections.filter(row=>row.slug===slug)).toHaveLength(1);
      recordPlaceLinksAtomicBody(info,'completed');
} catch(nativeError){recordPlaceLinksAtomicBody(info,'caught');throw nativeError;} finally {setPlaceLinksAtomicCleanup(info,'release');release?.();setPlaceLinksAtomicCleanup(info,'listener-off');page.off('request',read);if(phase!=='fresh'){setPlaceLinksAtomicCleanup(info,'unroute');await page.unroute(routePath,handler);}setPlaceLinksAtomicCleanup(info,'completed');}
    }
    setPlaceLinksAtomicBoundary(info,category,'unavailable','negative-baseline');
const b=manifest.personas.ownerB,before=(await complete(category,b)).collections.map(c=>c.id),currentParent=await editable('collections',parent.id),beforeNegative=await control('observe',info);
    const invalid={category,title:'Foreign parent create',slug:`foreign-parent-${category}`,description:null,visibility:'private',publicationState:'draft',attachTo:{hostCollectionId:parent.id,expectedHostRevision:currentParent.categoryRevision,role:null}};
    setPlaceLinksAtomicBoundary(info,category,'unavailable','negative-requests');
const foreign=await api('/collections',b,'POST',invalid),missing=await api('/collections',b,'POST',{...invalid,attachTo:{...invalid.attachTo,hostCollectionId:randomUUID()}});
    setPlaceLinksAtomicBoundary(info,category,'unavailable','negative-checks');
expect(foreign.status).toBe(404);expect(missing.status).toBe(404);same(errorBody(await foreign.json(),'NOT_FOUND'),errorBody(await missing.json(),'NOT_FOUND'));
    same((await complete(category,b)).collections.map(c=>c.id),before);
    same((await control('observe',info)).collections,beforeNegative.collections);same((await control('observe',info)).relations,beforeNegative.relations);
    same(await editable('collections',parent.id),currentParent);
  }
  setPlaceLinksAtomicBoundary(info,'unavailable','unavailable','provider-check');
transport.assertExpected();expect(transport.observations.length).toBe(0);

} finally {finalizePlaceLinksAtomicDiagnostic(info);}
});

test('Place links: public children obey parent child category and account visibility',async ({page,browser},info)=>{
  await appPage(page,manifest.personas.ownerA);const [parent,second]=aLists(),product=child('products'),person=child('people');
  const baseline=await control('observe',info),productRec=manifest.recommendations.find(r=>r.collectionId===product.id)!,personRec=manifest.recommendations.find(r=>r.collectionId===person.id)!;
  const nested=(await json(publicPath(parent.slug))).recommendationLists[0];
  same(nested.product_lists.map((c:Dto)=>c.documentId),[product.id]);same(nested.person_lists.map((c:Dto)=>c.documentId),[person.id]);
  const other=(await json(publicPath(second.slug))).recommendationLists[0];same([other.product_lists,other.person_lists],[[],[]]);
  const etags:Record<string,string>={};
  const assets=manifest.media.filter(asset=>['Pparent','Pproduct','Ppeople','Paccount'].includes(asset.label));
  expect(assets.length).toBe(4);expect(new Set(assets.map(asset=>asset.id)).size).toBe(4);expect(new Set(assets.map(asset=>asset.collectionId)).size).toBe(4);
  for(const asset of assets) {
    expect((await editable('collections',asset.collectionId)).coverMediaId===asset.id).toBe(true);etags[asset.label]=await bytes(asset.label);
  }
  const anon=await anonymous(browser);
  try {
    const locationUrl=`/${manifest.personas.ownerA.handle}/places/${parent.slug}`;
    await anon.page.goto(locationUrl);
    await anon.page.getByRole('button',{name:/^Products\s*1$/}).click();
    await expect(anon.page.getByText(productRec.title,{exact:true})).toBeVisible();await expect(anon.page.getByText(`List: ${product.title}`,{exact:true})).toBeVisible();
    await expect(anon.page.getByText('Private Products recommendation',{exact:true})).toHaveCount(0);
    await anon.page.getByText(productRec.title,{exact:true}).click();await expect(anon.page.getByRole('heading',{name:productRec.title,exact:true})).toBeVisible();
    await anon.page.keyboard.press('Escape');
    await anon.page.getByRole('button',{name:/^People\s*1$/}).click();
    await expect(anon.page.getByText(personRec.title,{exact:true})).toBeVisible();await expect(anon.page.getByText(`List: ${person.title}`,{exact:true})).toBeVisible();
    await expect(anon.page.getByText('Private People recommendation',{exact:true})).toHaveCount(0);
    await anon.page.getByText(personRec.title,{exact:true}).click();await expect(anon.page.getByRole('heading',{name:personRec.title,exact:true})).toBeVisible();
    // Parent withdrawal is a real observed canonical transition, with the live modal open.
    await patchCollection(parent.id,{visibility:'private'});
    expect((await api(publicPath(parent.slug))).status).toBe(404);await anon.page.reload();
    await expect(anon.page.getByRole('heading',{name:personRec.title,exact:true})).toHaveCount(0);
    await expect(anon.page.getByText(productRec.title,{exact:true})).toHaveCount(0);
    await deniedBytes('Pparent',etags.Pparent);
    expect((await api(independentPath('products',product.slug))).status).toBe(200);await bytes('Pproduct');
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/products/${product.slug}`);await expect(anon.page.getByText(productRec.title,{exact:true}).filter({visible:true}).first()).toBeVisible();
    await patchCollection(parent.id,{visibility:'public'});
    await anon.page.goto(locationUrl);await anon.page.getByRole('button',{name:/^Products\s*1$/}).click();
    await anon.page.getByText(productRec.title,{exact:true}).click();await expect(anon.page.getByRole('heading',{name:productRec.title,exact:true})).toBeVisible();
    await patchCollection(product.id,{visibility:'private'});await deniedBytes('Pproduct',etags.Pproduct);
    expect((await api(independentPath('products',product.slug))).status).toBe(404);
    const hiddenProduct=(await json(publicPath(parent.slug))).recommendationLists[0];same(hiddenProduct.product_lists,[]);
    await anon.page.reload();await expect(anon.page.getByRole('heading',{name:productRec.title,exact:true})).toHaveCount(0);
    await expect(anon.page.getByText(productRec.title,{exact:true})).toHaveCount(0);
    await patchCollection(product.id,{visibility:'public'});
    await anon.page.reload();await anon.page.getByRole('button',{name:/^People\s*1$/}).click();await anon.page.getByText(personRec.title,{exact:true}).click();
    await expect(anon.page.getByRole('heading',{name:personRec.title,exact:true})).toBeVisible();
    // Retained category/account editors are outside this slice: canonical API transitions.
    await categoryVisibility('people',false);await deniedBytes('Ppeople',etags.Ppeople);
    same((await json(publicPath(parent.slug))).recommendationLists[0].person_lists,[]);
    await anon.page.reload();await expect(anon.page.getByRole('heading',{name:personRec.title,exact:true})).toHaveCount(0);
    await expect(anon.page.getByText(personRec.title,{exact:true})).toHaveCount(0);
    await categoryVisibility('people',true);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${second.slug}`);
    await expect(anon.page.getByText(productRec.title,{exact:true})).toHaveCount(0);await expect(anon.page.getByText(personRec.title,{exact:true})).toHaveCount(0);
    await patchAccount({publicProfile:false});await deniedBytes('Paccount',etags.Paccount);
    expect((await api(publicPath(parent.slug))).status).toBe(404);expect((await api(independentPath('products','owned-account-products'))).status).toBe(404);
    for(const label of ['Pparent','Pproduct','Ppeople','Paccount']) {
      await bytes(label,manifest.personas.ownerA);await deniedBytes(label,etags[label],manifest.personas.ownerB);
    }
    same((await control('observe',info)).relations,baseline.relations);
    await assertRelation(parent.id,product.id,true);await assertRelation(parent.id,person.id,true);
    anon.transport.assertExpected();
  } finally {await anon.context.close();}
});

test('Place links: stale and foreign link commands preserve both lists',async ({page},info)=>{
  const transport=await appPage(page,manifest.personas.ownerA);const parent=aLists()[0],item=child('products');
  const beforeParent=await editable('collections',parent.id),beforeChild=await editable('collections',item.id),content=await complete('products'),beforeObserve=await control('observe',info);
  await page.goto(placeListPath(parent.id));await expect(managePanel(page)).toBeVisible();
  let release!:()=>void,held!:()=>void;const delivered=new Promise<void>(resolve=>held=resolve),gate=new Promise<void>(resolve=>release=resolve);
  let originalBody='',originalKey='',observedBody:Dto|undefined;
  const routePath=`**${base}/collections/${parent.id}/links`;
  await page.route(routePath,async route=>{
    if(route.request().method()!=='POST')return route.continue();
    originalBody=route.request().postData()!;originalKey=route.request().headers()['idempotency-key'];observedBody=JSON.parse(originalBody);
    held();await gate;await route.continue();
  });
  const conflict=linkResponse(page,parent.id,'POST');
  try {
    const picker=await openPicker(page);await picker.getByRole('searchbox',{name:'Find a list',exact:true}).fill(item.title);
    await picker.getByRole('option',{name:item.title,exact:true}).click();await delivered;
    const actualParent=await editable('collections',parent.id);
    expect(observedBody?.expectedHostRevision).toBe(actualParent.categoryRevision);expect(observedBody?.expectedLinkedRevision).toBe(beforeChild.categoryRevision);
    expect(observedBody?.linkedCollectionId).toBe(item.id);expect(Boolean(originalKey)).toBe(true);
    const advanced=await patchCollection(parent.id,{description:'Actual concurrent owner revision'});expect(advanced.categoryRevision>actualParent.categoryRevision).toBe(true);
    release();const response=await conflict;expect(response.status()).toBe(409);
    expect(response.request().postData()===originalBody && response.request().headers()['idempotency-key']===originalKey).toBe(true);
    await expect(managePanel(page).getByRole('button',{name:`Detach ${item.title}`,exact:true})).toHaveCount(0);
  } finally {release();await page.unroute(routePath);}
  await assertRelation(parent.id,item.id,false);same(await editable('collections',item.id),beforeChild);
  same(membershipValues((await complete('products')).memberships),membershipValues(content.memberships));same((await complete('products')).recommendations,content.recommendations);
  const afterObserve=await control('observe',info);same(afterObserve.relations,beforeObserve.relations);
  const parentAfter=await editable('collections',parent.id);expect(parentAfter.description).toBe('Actual concurrent owner revision');
  expect(parentAfter.revision>beforeParent.revision).toBe(true);same(immutableParent(parentAfter),immutableParent(beforeParent));
  same(afterObserve.collections.filter((row:Dto)=>row.id!==parent.id),beforeObserve.collections.filter((row:Dto)=>row.id!==parent.id));
  await page.reload();const picker=await openPicker(page);await picker.getByRole('searchbox',{name:'Find a list',exact:true}).fill(item.title);
  const retry=linkResponse(page,parent.id,'POST');await picker.getByRole('option',{name:item.title,exact:true}).click();
  const retried=await retry;expect(retried.status()).toBe(201);
  expect(retried.request().postDataJSON().expectedHostRevision).toBe(parentAfter.categoryRevision);
  expect(retried.request().headers()['idempotency-key']!==originalKey).toBe(true);await assertRelation(parent.id,item.id,true);
  const attach=(hostId:string,body:Dto,persona=manifest.personas.ownerA)=>api(`/collections/${hostId}/links`,persona,'POST',body);
  // One link per unordered pair: the reverse of an existing link is refused.
  const linkedNow=await editable('collections',item.id),hostNow=await editable('collections',parent.id),pairRelations=(await control('observe',info)).relations;
  const reverse=await attach(item.id,{expectedHostRevision:linkedNow.categoryRevision,linkedCollectionId:parent.id,expectedLinkedRevision:hostNow.categoryRevision,role:null});
  expect(reverse.status).toBe(409);same((await control('observe',info)).relations,pairRelations);
  same(await editable('collections',item.id),linkedNow);same(await editable('collections',parent.id),hostNow);
  // Owner B cannot link A's list from either side; a foreign list reads exactly like a missing one.
  const b=manifest.personas.ownerB,bParent=manifest.collections.find(c=>c.accountId===b.accountId && c.category==='places')!;
  const bLocation=await editable('collections',bParent.id,b);
  const aChild=await editable('collections',item.id),aParent=await editable('collections',parent.id);
  const bIds=(await complete('places',b)).collections.map(c=>c.id),relations=(await control('observe',info)).relations;
  const foreignLinked={expectedHostRevision:bLocation.categoryRevision,linkedCollectionId:item.id,expectedLinkedRevision:aChild.categoryRevision,role:null};
  const foreign=await attach(bParent.id,foreignLinked,b),absent=await attach(bParent.id,{...foreignLinked,linkedCollectionId:randomUUID()},b);
  expect(foreign.status).toBe(404);expect(absent.status).toBe(404);same(normalized(await foreign.json()),normalized(await absent.json()));
  const foreignHost={expectedHostRevision:aParent.categoryRevision,linkedCollectionId:bParent.id,expectedLinkedRevision:bLocation.categoryRevision,role:null};
  const denied=await attach(parent.id,foreignHost,b),missingHost=await attach(randomUUID(),foreignHost,b);
  expect(denied.status).toBe(404);expect(missingHost.status).toBe(404);same(normalized(await denied.json()),normalized(await missingHost.json()));
  same((await complete('places',b)).collections.map(c=>c.id),bIds);same((await control('observe',info)).relations,relations);
  same(await editable('collections',item.id),aChild);same(await editable('collections',parent.id),aParent);same(await editable('collections',bParent.id,b),bLocation);
  same(membershipValues((await complete('products')).memberships),membershipValues(content.memberships));same((await complete('products')).recommendations,content.recommendations);
  transport.assertExpected();expect(transport.observations.length).toBe(0);
});

// eslint-disable-next-line no-empty-pattern -- the empty fixture pattern is frozen: root scripts/ seal tests assert this spec's exact source text, so `_` breaks them.
test.afterEach(({},info)=>{finalizePlaceLinksAtomicDiagnostic(info);capturePlaceLinksAtomicDiagnostic(info);});
