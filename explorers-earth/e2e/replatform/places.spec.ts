import {readFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {test, expect, type Browser, type Page, type TestInfo, type Locator, type Response as BrowserResponse, type Request as BrowserRequest, type ConsoleMessage} from '@playwright/test';
import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import {installPlacesProviderTransport} from '../setup/places-provider-transport';
import type {PlacesManifest, PlacesPersona} from '../../../tunes/scripts/places-browser-support';

// Private reset authority stays in Node. Only reset-issued cookies reach cookie storage.
type Fixture = {origin:string; apiOrigin:string; version:1; runId:string; commit:string;
  placesControl:{url:string; capability:string; runId:string; commit:string; version:1}};
const path = process.env.PLACES_E2E_FIXTURE_PATH;
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
    for (;;) {
      const search=new URLSearchParams({...params,limit:'24',snapshotToken:snapshot.snapshotToken,...(cursor?{cursor}:{})});
      const page=await json(`${route}?${search}`,persona);
      expect(page.snapshot===snapshot.revision && page.snapshotToken===snapshot.snapshotToken && page.expiresAt===snapshot.expiresAt).toBe(true);
      expect(Array.isArray(page.items) && page.items.length<=24).toBe(true);rows.push(...page.items);
      if(page.nextCursor===null) break;
      expect(typeof page.nextCursor==='string' && page.items.length>0 && !seen.has(page.nextCursor)).toBe(true);
      cursor=page.nextCursor;seen.add(cursor!);
    }
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

function recordPublicPages(page:Page,pathname:string,detail:boolean) {
  type RecordedPage={offset:number;limit:number;ids:string[];requestCursor?:string|null;terminal?:boolean;nextCursor?:string|null};
  // The public shell runs MORE THAN ONE traversal of this very path at once. Besides the
  // rendered list page being audited here, the public navigation completes a preview of
  // every published list, and it reads the same child path with the PREVIEW page size.
  // Those preview reads are a different traversal with its own contract; they are not
  // pages of the page under audit, and they share its document, its URL path and its
  // response shape, so neither the document nor the payload can separate them.
  //
  // Admission is therefore by the requested page size of the traversal being audited -
  // 24 for a rendered list page, the 12 of the preview/category size otherwise - taken
  // from the request itself, with an absent limit meaning the server default of 12. That
  // is the only thing filtered. Every read of the audited traversal is still recorded and
  // validated in full: a duplicated limit parameter is still a failure, and the page
  // census below still demands the exact pages, offsets, limits, terminality, continuation
  // chain and complete id sequence, so a missing, extra or wrong page still fails.
  const size=detail?24:12;
  const foreign=Symbol('read from another traversal');
  const pending:Promise<RecordedPage|null|typeof foreign>[]=[];
  const handler=(response:BrowserResponse)=>{
    const url=new URL(response.url());
    if(url.pathname!==`${base}${pathname}` || response.request().method()!=='GET' || response.status()!==200)return;
    const query=new URL(response.request().url()).searchParams;
    if(query.getAll('limit').length<=1 && (query.get('limit')??'12')!==String(size))return;
    pending.push(response.json().then(dto=>{
      const cursors=query.getAll('cursor'),limits=query.getAll('limit');
      const cursor=cursors[0]??'o0',rawLimit=limits[0]??'12';
      const opaqueCursor=/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/;
      if(cursors.length>1 || limits.length>1 || (detail?cursors.length>0 && !opaqueCursor.test(cursor):!/^o(0|[1-9][0-9]*)$/.test(cursor))
        || !/^[1-9][0-9]*$/.test(rawLimit))throw new Error('Invalid pagination');
      const offset=detail?0:Number(cursor.slice(1)),limit=Number(rawLimit);
      if(!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) || limit!==(detail?24:12))throw new Error('Invalid pagination');
      if(!dto || !Array.isArray(dto.recommendationLists))throw new Error('Invalid page shape');
      if(detail && (dto.recommendationLists.length!==1 || !dto.recommendationLists[0]))throw new Error('Invalid detail shape');
      const rows=detail?dto.recommendationLists[0].recommended_places:dto.recommendationLists;
      if(!Array.isArray(rows) || rows.some((row:Dto)=>!row || typeof row.documentId!=='string' || row.documentId.length===0))throw new Error('Invalid rows');
      if(detail) {
        const nextCursor=dto.recommendationLists[0].recommended_places_next_cursor;
        if(nextCursor!==null && (typeof nextCursor!=='string' || !opaqueCursor.test(nextCursor)))throw new Error('Invalid next cursor');
        return {offset,limit,ids:rows.map((row:Dto)=>row.documentId),requestCursor:cursors[0]??null,terminal:nextCursor===null,nextCursor};
      }
      return {offset,limit,ids:rows.map((row:Dto)=>row.documentId)};
    }).catch(()=>null));
  };
  page.on('response',handler);
  return async()=>{
    page.off('response',handler);
    const results=(await Promise.all(pending)).filter((row):row is RecordedPage|null=>row!==foreign);
    return {parseFailures:results.filter(row=>row===null).length,
      pages:results.filter((row):row is RecordedPage=>row!==null).sort((a,b)=>a.offset-b.offset)};
  };
}
function assertPublicPageShape(recording:Awaited<ReturnType<ReturnType<typeof recordPublicPages>>>,expected:number[][]) {
  // Receipt sanitization retains source coordinates, not expected/actual payloads.
  // Each fixed assertion below identifies a distinct safe failure classification.
  expect(recording.parseFailures).toBe(0);
  let observations=recording.pages;
  if(expected[0].length===4) {
    // Child tokens are opaque. Logical row offsets come only from the observed
    // request == prior response continuation chain, never from token contents.
    const byCursor=new Map<string|null,typeof observations[number]>();
    let conflicts=0;
    for(const row of observations) {
      const key=row.requestCursor??null,previous=byCursor.get(key);
      if(previous) {
        if(previous.limit!==row.limit || previous.terminal!==row.terminal || previous.nextCursor!==row.nextCursor
          || JSON.stringify(previous.ids)!==JSON.stringify(row.ids))conflicts++;
      } else byCursor.set(key,row);
    }
    expect(conflicts).toBe(0);
    const offsets=new Map<string|null,number>(),visited=new Set<string|null>();
    let cursor:string|null=null,offset=0;
    for(;;) {
      expect(visited.has(cursor)).toBe(false);visited.add(cursor);
      const row=byCursor.get(cursor);expect(row!==undefined).toBe(true);
      if(!row)throw new Error('Missing continuation page');
      offsets.set(cursor,offset);offset+=row.ids.length;
      expect(row.terminal===(row.nextCursor===null)).toBe(true);
      if(row.nextCursor===null)break;
      expect(typeof row.nextCursor==='string' && row.nextCursor.length>0).toBe(true);
      cursor=row.nextCursor!;
    }
    expect(visited.size).toBe(byCursor.size);
    observations=observations.map(row=>({...row,offset:offsets.get(row.requestCursor??null)!}));
  }
  const firstByOffset=new Map<number,typeof observations[number]>();
  let duplicateConflicts=0;
  for(const row of observations) {
    const previous=firstByOffset.get(row.offset);
    if(previous) {
      if(previous.limit!==row.limit || previous.terminal!==row.terminal || previous.nextCursor!==row.nextCursor
        || JSON.stringify(previous.ids)!==JSON.stringify(row.ids))duplicateConflicts++;
    } else firstByOffset.set(row.offset,row);
  }
  expect(duplicateConflicts).toBe(0);
  expect(observations.filter(row=>!Number.isSafeInteger(row.offset) || row.offset<0).length).toBe(0);
  expect(observations.filter(row=>!Number.isSafeInteger(row.limit) || row.limit<=0).length).toBe(0);
  expect(observations.filter(row=>!expected.some(shape=>shape[0]===row.offset)).length).toBe(0);
  // Every physical observation passed admission before logical representatives are selected.
  const pages=[...firstByOffset.values()].sort((a,b)=>a.offset-b.offset);
  expect(pages.length).toBe(expected.length);
  expect(pages.filter((row,index)=>row.offset!==expected[index][0]).length).toBe(0);
  expect(pages.filter((row,index)=>row.limit!==expected[index][1]).length).toBe(0);
  expect(pages.filter((row,index)=>row.ids.length!==expected[index][2]).length).toBe(0);
  if(expected[0].length===4)expect(pages.filter((row,index)=>Number(row.terminal)!==expected[index][3]).length).toBe(0);
  return pages;
}
// `total` is the complete rendered census for the surface under test. The original eight
// identities exhaust the 53-row seeded surfaces; a caller on a differently sized list
// passes the count the SERVER's own complete traversal returned, never a literal.
async function exhaustRendered(page:Page,rows:Locator,label:string,initial:number,total=53) {
  await expect.poll(()=>rows.count()).toBeGreaterThanOrEqual(initial);
  // Scrolling a real button can let the real observer finish the same continuation.
  // Accept that race only when rendered rows demonstrably advanced; no request retry.
  for(let step=0;step<Math.max(5,Math.ceil(total/initial)+2) && await rows.count()<total;step++) {
    const before=await rows.count(),button=page.getByRole('button',{name:`Load more ${label}`,exact:true});
    try {await button.click({timeout:1000});}
    catch(error) {try {await expect.poll(()=>rows.count()).toBeGreaterThan(before);}catch {throw error;}}
    await expect.poll(()=>rows.count()).toBeGreaterThan(before);
  }
  await expect(rows).toHaveCount(total);
  await expect(page.getByRole('button',{name:`Load more ${label}`,exact:true})).toHaveCount(0);
}

test('Places: retained location create edit and reload preserve zero and absent coordinates',async ({page})=>{
  const transport=await appPage(page,manifest.personas.ownerA);
  const [zero,absent]=aLists();const z=await editable('collections',zero.id),n=await editable('collections',absent.id);
  same([z.placeLocation.locationSnapshot.latitude,z.placeLocation.locationSnapshot.longitude],[0,0]);
  same([n.placeLocation.locationSnapshot.latitude,n.placeLocation.locationSnapshot.longitude],[null,null]);
  await page.goto('/recommendations/places');
  await expect(page.getByText(zero.title,{exact:true}).filter({visible:true}).first()).toBeVisible();
  await expect(page.getByText(absent.title,{exact:true}).filter({visible:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Add Location',exact:true}).filter({visible:true}).first().click();
  await page.getByPlaceholder('Enter city, state, or country (Eg. Paris)').fill('Fixture');
  await page.getByRole('option',{name:'Fixture Zero City',exact:true}).click();
  await page.locator('input[name="placeUrl"]').fill('entered-create-slug');
  await page.locator('textarea[name="note"]').fill('Initial fixture note');
  await page.locator('input[name="recommendationSocialLink"]').fill('https://www.instagram.com/fixturecity/');
  const create=page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/collections` && r.request().method()==='POST');
  await page.getByRole('button',{name:'Add Location',exact:true}).filter({visible:true}).last().click();
  const response=await create;expect(response.status()).toBe(201);
  const command=response.request().postDataJSON();expect(command.slug).toBe('fixture-zero-city');
  expect(command.visibility).toBe('private');expect(command.publicationState).toBe('draft');
  const id=(await response.json()).collection.id;const before=await editable('collections',id);
  expect(before.title).toBe('Fixture Zero City');expect(before.slug).toBe('fixture-zero-city');
  same([before.placeLocation.locationSnapshot.latitude,before.placeLocation.locationSnapshot.longitude],[0,0]);
  expect(before.placeLocation.locationEntityId===null).toBe(true);
  same(before.placeLocation,command.placeLocation);
  expect(transport.observations.some(row=>row.fieldMask!==null) && transport.observations.some(row=>row.queryFields!==null)).toBe(true);
  await page.getByText('Fixture Zero City',{exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:'Manage',exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:'Edit',exact:true}).filter({visible:true}).first().click();
  await expect(page.getByPlaceholder('Enter city, state, or country (Eg. Paris)')).toBeDisabled();
  await expect(page.locator('input[name="placeUrl"]')).toBeEnabled();
  const providerCount=transport.observations.length;
  await page.locator('input[name="placeUrl"]').fill('edited-fixture-city');
  await page.locator('textarea[name="note"]').fill('Edited fixture note');
  await page.locator('input[name="recommendationSocialLink"]').fill('https://www.instagram.com/editedfixturecity/');
  // Diagnostic state contains counts/status and fixed classifications only, never console payloads or DTOs.
  let originalGuardRefused=false,updateError=false,editableRequests=0,patchRequests=0;
  const editableStatuses:number[]=[],patchStatuses:number[]=[];
  const countRequest=(request:BrowserRequest)=>{
    const pathname=new URL(request.url()).pathname;
    if(pathname===`${base}/collections/${id}/editable` && request.method()==='GET')editableRequests++;
    if(pathname===`${base}/collections/${id}` && request.method()==='PATCH')patchRequests++;
  };
  const countResponse=(response:BrowserResponse)=>{
    const pathname=new URL(response.url()).pathname;
    if(pathname===`${base}/collections/${id}/editable` && response.request().method()==='GET')editableStatuses.push(response.status());
    if(pathname===`${base}/collections/${id}` && response.request().method()==='PATCH')patchStatuses.push(response.status());
  };
  const classifyConsole=(message:ConsoleMessage)=>{
    if(message.type()!=='error')return;
    originalGuardRefused ||= message.text().includes('Reload the original location before editing');
    updateError ||= message.text().includes('Failed to update recommendation list:');
  };
  page.on('request',countRequest);page.on('response',countResponse);page.on('console',classifyConsole);
  const updated=page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/collections/${id}` && r.request().method()==='PATCH');
  void updated.catch(()=>{}); // Earlier diagnostic failure must not produce an unhandled pending waiter.
  let update:BrowserResponse;
  try {
    await page.getByRole('button',{name:'Update Location',exact:true}).click();
    const form=page.locator('input[name="placeUrl"]').locator('xpath=ancestor::form');
    const validationPresent=await form.getByText(/^(List Name is Required|Url name is Required)$/).count()>0;
    try {update=await updated;} catch(error) {
      // Classify only at the existing mandatory PATCH wait boundary; no added readiness wait.
      const captured=Object.freeze({originalGuardRefused,validationPresent,
        editableStatusFailure:editableStatuses.some(status=>status!==200),
        updateErrorWithoutPatch:updateError && patchRequests===0,patchRequests,editableRequests,patchResponses:patchStatuses.length});
      expect(captured.originalGuardRefused).toBe(false);
      expect(captured.validationPresent).toBe(false);
      expect(captured.editableStatusFailure).toBe(false);
      expect(captured.updateErrorWithoutPatch).toBe(false);
      expect(captured.patchRequests>0).toBe(true);
      expect(captured.editableRequests>0).toBe(true);
      expect(captured.patchResponses>0).toBe(true);
      throw error;
    }
    expect(update.status()).toBe(200);expect(update.request().postDataJSON().expectedRevision).toBe(before.revision);
  } finally {page.off('request',countRequest);page.off('response',countResponse);page.off('console',classifyConsole);}
  await expect(page.locator('input[name="placeUrl"]').locator('xpath=ancestor::form')).toHaveCount(0);
  await expect.poll(async ()=>(await editable('collections',id)).slug).toBe('edited-fixture-city');
  const after=await editable('collections',id);
  same(after.placeLocation.locationSnapshot,before.placeLocation.locationSnapshot);
  same([after.placeLocation.locationEntityId,after.title,after.coverMediaId],[before.placeLocation.locationEntityId,before.title,before.coverMediaId]);
  expect(after.description).toBe('Edited fixture note');
  expect(after.placeLocation.instagramMediaUrl).toBe('https://www.instagram.com/editedfixturecity/');
  expect(after.revision>before.revision).toBe(true);expect(after.publicationState).toBe('draft');
  await page.reload();await expect(page.getByText('Fixture Zero City',{exact:true}).filter({visible:true}).first()).toBeVisible();
  expect(transport.observations.length).toBe(providerCount);transport.assertExpected();
  same((await editable('collections',absent.id)).placeLocation,n.placeLocation);
});

test('Places: complete owner and anonymous pages contain every seeded list and recommendation',async ({page,browser})=>{
  await appPage(page,manifest.personas.ownerA);await page.goto('/recommendations/places');
  const owner=await complete('places'),lists=aLists();
  expect(JSON.stringify(owner.collections.filter(c=>!c.archived).sort((a,b)=>a.displayOrder-b.displayOrder).map(c=>c.id))===JSON.stringify(manifest.expectedPublic.placesCollectionIds)).toBe(true);
  const members=owner.memberships.filter(m=>m.collectionId===lists[0].id).sort((a,b)=>a.displayOrder-b.displayOrder);
  expect(JSON.stringify(members.map(m=>m.recommendationId))===JSON.stringify(manifest.expectedPublic.recommendationIds)).toBe(true);
  expect(JSON.stringify(members.map(m=>m.displayOrder))===JSON.stringify(Array.from({length:53},(_,i)=>i))).toBe(true);expect(owner.recommendations.length).toBe(53);
  const categoryIds:string[]=[];
  for(const [offset,size] of [[0,24],[24,24],[48,5],[53,0]]) {
    const dto=await json(`${publicPath()}?limit=24${offset?`&cursor=o${offset}`:''}`);
    expect(dto.recommendationLists.length).toBe(size);categoryIds.push(...dto.recommendationLists.map((c:Dto)=>c.documentId));
    if(offset===0)expect(dto.recommendationLists[0].recommended_places.length).toBe(12);
  }
  expect(JSON.stringify(categoryIds)===JSON.stringify(manifest.expectedPublic.placesCollectionIds)).toBe(true);expect(new Set(categoryIds).size).toBe(53);
  const recommendationIds:string[]=[],sizes:number[]=[],continuations=new Set<string>();let cursor:string|null=null;
  do {
    const dto=await json(`${publicPath(lists[0].slug)}?limit=24${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
    const row=dto.recommendationLists[0];sizes.push(row.recommended_places.length);
    recommendationIds.push(...row.recommended_places.map((r:Dto)=>r.documentId));cursor=row.recommended_places_next_cursor;
    expect(sizes.length).toBeLessThanOrEqual(3);
    if(sizes.length===3)expect(cursor).toBe(null);
    else {
      expect(typeof cursor==='string' && /^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor)).toBe(true);
      expect(continuations.has(cursor!)).toBe(false);continuations.add(cursor!);
    }
  } while(cursor);
  expect(JSON.stringify(sizes)===JSON.stringify([24,24,5])).toBe(true);
  expect(JSON.stringify(recommendationIds)===JSON.stringify(manifest.expectedPublic.recommendationIds)).toBe(true);expect(new Set(recommendationIds).size).toBe(53);
  const anon=await anonymous(browser);
  try {
    const categoryPages=recordPublicPages(anon.page,publicPath(),false);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places`);
    const headings=anon.page.locator('h2').filter({hasText:/^(Owned Zero City|Owned Absent City|Owned City C\d\d)$/});
    await exhaustRendered(anon.page,headings,'city lists',12);
    for(const row of lists)await expect(anon.page.getByRole('heading',{name:row.title,exact:true}).filter({visible:true}).first()).toBeVisible();
    expect(JSON.stringify((await headings.allTextContents()).map(title=>title.trim()))===JSON.stringify(lists.map(row=>row.title))).toBe(true);
    const categoryResponses=assertPublicPageShape(await categoryPages(),[[0,12,12],[12,12,12],[24,12,12],[36,12,12],[48,12,5]]);
    expect(JSON.stringify(categoryResponses.map(row=>[row.offset,row.limit,row.ids.length]))===JSON.stringify([[0,12,12],[12,12,12],[24,12,12],[36,12,12],[48,12,5]])).toBe(true);
    expect(JSON.stringify(categoryResponses.flatMap(row=>row.ids))===JSON.stringify(manifest.expectedPublic.placesCollectionIds)).toBe(true);
    const detailPages=recordPublicPages(anon.page,publicPath(lists[0].slug),true);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${lists[0].slug}`);
    const cards=anon.page.locator('button[aria-label^="Owned Place R"]');
    await exhaustRendered(anon.page,cards,'places',24);
    const titles=manifest.recommendations.filter(r=>r.collectionId===lists[0].id).map(r=>r.title);
    for(const title of titles)await expect(anon.page.getByRole('button',{name:title,exact:true})).toBeVisible();
    expect(JSON.stringify(await cards.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))))===JSON.stringify(titles)).toBe(true);
    const detailResponses=assertPublicPageShape(await detailPages(),[[0,24,24,0],[24,24,24,0],[48,24,5,1]]);
    expect(JSON.stringify(detailResponses.map(row=>[row.offset,row.limit,row.ids.length,row.terminal]))===JSON.stringify([[0,24,24,false],[24,24,24,false],[48,24,5,true]])).toBe(true);
    expect(JSON.stringify(detailResponses.flatMap(row=>row.ids))===JSON.stringify(manifest.expectedPublic.recommendationIds)).toBe(true);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${lists[52].slug}`);await anon.page.reload();
    await expect(anon.page.getByText(lists[52].title,{exact:true}).filter({visible:true}).first()).toBeVisible();
    anon.transport.assertExpected();
  } finally {await anon.context.close();}
});

test('Places: owned image bytes disappear after the final public attachment is hidden',async ({page,browser})=>{
  await appPage(page,manifest.personas.ownerA);const parent=aLists()[0];const media=manifest.media.find(m=>m.label==='Pparent')!;
  const anon=await anonymous(browser);
  try {
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places`);
    const image=anon.page.locator(`img[src="${media.url}"]`).first();await expect(image).toBeVisible();
    await expect.poll(()=>image.evaluate((node:HTMLImageElement)=>node.naturalWidth>0 && new URL(node.currentSrc).pathname===node.getAttribute('src'))).toBe(true);
    const etag=await bytes('Pparent');await bytes('Pindependent');
    // Canonical owner publication transition; this identity qualifies media policy.
    await patchCollection(parent.id,{visibility:'private'});
    await deniedBytes('Pparent',etag);await bytes('Pparent',manifest.personas.ownerA);
    await deniedBytes('Pparent',etag,manifest.personas.ownerB);
    await equalMissing(media.url.slice(base.length),`/media/${randomUUID()}/content`,manifest.personas.ownerB);
    const independent=manifest.collections.find(c=>c.accountId===manifest.personas.ownerB.accountId && c.category==='places')!;
    expect((await api(publicPath(independent.slug,manifest.personas.ownerB.handle))).status).toBe(200);await bytes('Pindependent');
    await anon.page.reload();await expect(anon.page.locator(`img[src="${media.url}"]`)).toHaveCount(0);anon.transport.assertExpected();
  } finally {await anon.context.close();}
});

test('Places: foreign owner edits and private contact reads cannot disclose owner data',async ({page,browser},info)=>{
  await appPage(page,manifest.personas.ownerA);const parent=aLists()[0],rec=manifest.recommendations.find(r=>r.collectionId===parent.id)!;
  const before=await editable('collections',parent.id),recommendation=await editable('recommendations',rec.id);
  const observed=await control('observe',info),b=manifest.personas.ownerB,bBefore=await complete('places',b);
  for(const [kind,id,revision] of [['collections',parent.id,before.revision],['recommendations',rec.id,recommendation.revision]] as const) {
    const missing=randomUUID();await equalMissing(`/${kind}/${id}/editable?status=active`,`/${kind}/${missing}/editable?status=active`,b);
    await equalMissing(`/${kind}/${id}`,`/${kind}/${missing}`,b,'PATCH',{expectedRevision:revision,...(kind==='collections'?{description:'Foreign edit'}:{userRating:3})});
  }
  same(await editable('collections',parent.id),before);same(await editable('recommendations',rec.id),recommendation);
  same((await control('observe',info)).collections,observed.collections);same((await control('observe',info)).relations,observed.relations);
  same((await complete('places',b)).collections.map(c=>c.id),bBefore.collections.map(c=>c.id));
  const privateDto=await json(publicPath(parent.slug));
  expect(!JSON.stringify(privateDto).includes('Owned private contact') && !JSON.stringify(privateDto).includes('+15550001111')).toBe(true);
  const anon=await anonymous(browser);
  try {
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${parent.slug}`);
    await anon.page.getByRole('button',{name:rec.title,exact:true}).click();
    await expect(anon.page.getByText('Owned private contact',{exact:true})).toHaveCount(0);
    expect(!(await anon.page.locator('body').innerText()).includes('+15550001111')).toBe(true);
    const callButton=anon.page.getByRole('dialog',{name:'Place details',exact:true}).locator('[data-public-place-detail]').getByText('Call',{exact:true}).locator('..').getByRole('button');
    await expect(callButton).toBeDisabled();
    // No retained disclosure toggle exists: explicit canonical API contact transition.
    const current=await editable('recommendations',rec.id);
    const disclose=await api(`/recommendations/${rec.id}`,manifest.personas.ownerA,'PATCH',{
      expectedRevision:current.revision,placeContext:{...current.placeContext,contactVisibility:'public'}});
    expect(disclose.status).toBe(200);
    const publicDto=await json(publicPath(parent.slug));const published=publicDto.recommendationLists[0].recommended_places.find((r:Dto)=>r.documentId===rec.id);
    expect(published.contact_name==='Owned private contact' && published.contact_number==='+15550001111').toBe(true);
    same(published.Place_Details.Public_Phone,privateDto.recommendationLists[0].recommended_places[0].Place_Details.Public_Phone);
    await anon.page.reload();await anon.page.getByRole('button',{name:rec.title,exact:true}).click();
    await expect(anon.page.getByRole('dialog',{name:'Place details',exact:true}).locator('[data-public-place-detail]').getByText('Call',{exact:true}).locator('..').getByRole('button')).toBeEnabled();anon.transport.assertExpected();
  } finally {await anon.context.close();}
});
