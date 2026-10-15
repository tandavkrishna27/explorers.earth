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
test.beforeEach(async (_,info)=>{manifest=await control('reset',info) as PlacesManifest;});

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

// ---------------------------------------------------------------------------
// Additive Places pin identities. AUTHORED ONLY: no native run has executed any
// of the four cases below, so none of them is qualified. They are registered
// separately from the original eight Places identities in suite-manifest.json
// under additiveRegistrations, together with the owned fixture declarations they
// still require. Until the fixture declares these case identifiers the reset in
// beforeEach is refused, so these cases fail at setup instead of reporting a
// pass; that refusal is intentional and must not be weakened with a retry.
//
// Every transport bound comes from the server's advertised clientTransport.
// No chunk size, pin cap, staging bound or policy number is written here: an
// absent policy must leave the feature unavailable, and no advertised budget is
// divided into a product pin cap.
// ---------------------------------------------------------------------------

type PinsTransport={policyId:string;policyVersion:number;replacementBytes:number;replacementIds:number;
  transportChunkBytes:number;transportChunkIds:number;ownerStagingBytes:number;commitProcessingBytes:number;
  commitProcessingMs:number;commitWorkUnits:number;draftExpiryMs:number};

/** The only admissible source of staging bounds. Unavailable is terminal, never a default. */
async function advertisedPinsTransport(listId:string,persona=manifest.personas.ownerA) {
  const envelope=await json(`/collections/${listId}/place-pins/availability`,persona);
  // Canonical single-key response envelope, identical to the client transport contract.
  expect(envelope!==null && typeof envelope==='object' && Object.keys(envelope).length===1
    && Object.keys(envelope)[0]==='placePinsAvailability').toBe(true);
  const dto=envelope.placePinsAvailability as Dto;
  expect(dto.available===true && dto.state==='configured').toBe(true);
  const transport=dto.clientTransport as PinsTransport;
  for(const key of ['replacementBytes','replacementIds','transportChunkBytes','transportChunkIds',
    'ownerStagingBytes','commitProcessingBytes','commitProcessingMs','commitWorkUnits','draftExpiryMs'] as const)
    expect(Number.isSafeInteger(transport[key]) && transport[key]>0).toBe(true);
  expect(transport.transportChunkIds<=transport.replacementIds).toBe(true);
  return transport;
}

/** Complete owner traversal of one list: pinned-first order, ascending positions, list-local counts. */
async function ownerListMembers(listId:string,persona=manifest.personas.ownerA) {
  const snapshot=await json('/categories/places/content-snapshot',persona);
  const rows:Dto[]=[],seen=new Set<string>();let cursor:string|undefined,metadata:Dto|undefined,pages=0;
  for (;;) {
    const search=new URLSearchParams({category:'places',collectionId:listId,status:'active',limit:'24',
      snapshotToken:snapshot.snapshotToken,...(cursor?{cursor}:{})});
    const page=await json(`/recommendations?${search}`,persona);pages++;
    expect(page.snapshotToken===snapshot.snapshotToken && page.snapshot===snapshot.revision).toBe(true);
    expect(page.placePins!==undefined && page.placePins.collectionId===listId).toBe(true);
    if(metadata)same(page.placePins,metadata);else metadata=page.placePins;
    expect(Array.isArray(page.items) && page.items.length<=24).toBe(true);rows.push(...page.items);
    if(page.nextCursor===null)break;
    expect(typeof page.nextCursor==='string' && page.items.length>0 && !seen.has(page.nextCursor)).toBe(true);
    cursor=page.nextCursor;seen.add(cursor!);
  }
  expect(new Set(rows.map(row=>row.id)).size).toBe(rows.length);
  // Per-row place pin state is served on the owner MEMBERSHIP projection as
  // `placePinPosition`, because a place pin is collection-local (collection_place_pins).
  // The recommendation DTO's `pin` is the CATEGORY top pick (category_recommendation_pins),
  // a different feature, and is null for every row here by design. Read the designed source.
  const positionOf=new Map<string,number>(),members=new Set<string>(),memberSeen=new Set<string>();
  let memberCursor:string|undefined;
  for (;;) {
    // The category is specified by the route alone; repeating it in the query is refused.
    const search=new URLSearchParams({collectionStatus:'all',recommendationStatus:'active',
      limit:'24',snapshotToken:snapshot.snapshotToken,...(memberCursor?{cursor:memberCursor}:{})});
    const page=await json(`/categories/places/memberships?${search}`,persona);
    expect(page.snapshotToken===snapshot.snapshotToken && page.snapshot===snapshot.revision).toBe(true);
    expect(Array.isArray(page.items) && page.items.length<=24).toBe(true);
    for(const row of page.items as Dto[]) {
      // The per-row pin field is emitted for every places membership row, pinned or not.
      expect(Object.prototype.hasOwnProperty.call(row,'placePinPosition')).toBe(true);
      expect(row.placePinPosition===null
        || (Number.isSafeInteger(row.placePinPosition) && row.placePinPosition>=0)).toBe(true);
      if(row.collectionId!==listId) continue;
      expect(row.collectionArchived===false && row.recommendationArchived===false).toBe(true);
      expect(members.has(row.recommendationId)).toBe(false);members.add(row.recommendationId);
      if(row.placePinPosition!==null) positionOf.set(row.recommendationId,row.placePinPosition);
    }
    if(page.nextCursor===null)break;
    expect(typeof page.nextCursor==='string' && page.items.length>0 && !memberSeen.has(page.nextCursor)).toBe(true);
    memberCursor=page.nextCursor;memberSeen.add(memberCursor!);
  }
  // Closure: the paged recommendation traversal and this list's memberships are the same rows.
  expect(members.size===rows.length && rows.every(row=>members.has(row.id))).toBe(true);
  const boundary=rows.findIndex(row=>!positionOf.has(row.id));
  // Pinned-first: no pinned row may follow the first unpinned row, whatever its display order.
  expect(boundary===-1 || rows.slice(boundary).every(row=>!positionOf.has(row.id))).toBe(true);
  const pinned=rows.filter(row=>positionOf.has(row.id)),positions=pinned.map(row=>positionOf.get(row.id)!);
  expect(JSON.stringify(positions)===JSON.stringify([...positions].sort((a:number,b:number)=>a-b))).toBe(true);
  expect(new Set(positions).size).toBe(positions.length); // one pin position per row, list-local
  expect(metadata!.eligiblePinCount).toBe(pinned.length);
  expect(metadata!.eligibleItemCount).toBe(rows.length);
  return {rows,pages,pinnedIds:pinned.map(row=>row.id as string),ids:rows.map(row=>row.id as string),metadata:metadata!};
}

/** Complete public child traversal through the actual server continuations only. */
async function publicDetailSequence(slug:string,handle=manifest.personas.ownerA.handle) {
  const ids:string[]=[],sizes:number[]=[],seen=new Set<string>();let cursor:string|null=null;
  do {
    const dto=await json(`${publicPath(slug,handle)}?limit=24${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);
    const row=dto.recommendationLists[0];expect(Array.isArray(row.recommended_places)).toBe(true);
    ids.push(...row.recommended_places.map((place:Dto)=>place.documentId));sizes.push(row.recommended_places.length);
    cursor=row.recommended_places_next_cursor;
    if(cursor!==null) {
      expect(typeof cursor==='string' && /^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(cursor)).toBe(true);
      expect(seen.has(cursor)).toBe(false);seen.add(cursor);
    }
    expect(sizes.length).toBeLessThanOrEqual(64);
  } while(cursor);
  expect(new Set(ids).size).toBe(ids.length);
  return {ids,sizes,pages:sizes.length};
}

async function openPinsEditor(page:Page,list:Dto) {
  await page.goto('/recommendations/places');
  await page.getByText(list.title,{exact:true}).filter({visible:true}).first().click();
  const open=page.getByRole('button',{name:'Edit pinned places',exact:true});
  await expect(open).toBeEnabled();await open.click();
  const dialog=page.getByRole('dialog',{name:'Pinned places in this list',exact:true});
  await expect(dialog).toBeVisible();
  // A configured policy is what makes Save reachable; unavailable keeps it absent.
  await expect(dialog.getByRole('button',{name:'Save pins',exact:true})).toBeVisible();
  return dialog;
}
const orderedPinRows=(dialog:Locator)=>dialog.getByRole('list',{name:'Ordered pinned places',exact:true}).locator('li');
const pinnedNames=async(dialog:Locator)=>(await orderedPinRows(dialog).locator('span').allTextContents())
  .map(text=>text.trim().replace(/^\d+\.\s*/,''));

/** Click Pin in an explicit sequence so the staged order is the click order, never a sort. */
async function stagePins(dialog:Locator,names:string[]) {
  await dialog.getByRole('button',{name:'Clear all pins',exact:true}).click();
  await expect(orderedPinRows(dialog)).toHaveCount(0);
  for(const name of names) {
    await dialog.getByRole('button',{name:`Pin ${name}`,exact:true}).click();
    await expect(dialog.getByRole('button',{name:`Unpin ${name}`,exact:true})).toBeVisible();
  }
  expect(JSON.stringify(await pinnedNames(dialog))===JSON.stringify(names)).toBe(true);
}

/** Finite census of the actual pin request families; no bodies, keys or URLs retained. */
function recordPinRequests(page:Page,listId:string) {
  const counts={availability:0,replace:0,begin:0,chunk:0,commit:0,abort:0};
  const chunkIndexes:number[]=[];
  const prefix=`${base}/collections/${listId}/place-pins`;
  const handler=(request:BrowserRequest)=>{
    const {pathname}=new URL(request.url()),method=request.method();
    if(!pathname.startsWith(prefix))return;
    if(pathname===`${prefix}/availability` && method==='GET')counts.availability++;
    else if(pathname===prefix && method==='PUT')counts.replace++;
    else if(pathname===`${prefix}/drafts` && method==='POST')counts.begin++;
    else if(method==='PUT' && /\/drafts\/[^/]+\/chunks\/(\d+)$/.test(pathname)) {
      counts.chunk++;chunkIndexes.push(Number(pathname.match(/\/chunks\/(\d+)$/)![1]));
    }
    else if(method==='POST' && /\/drafts\/[^/]+\/commit$/.test(pathname))counts.commit++;
    else if(method==='DELETE' && /\/drafts\/[^/]+$/.test(pathname))counts.abort++;
  };
  page.on('request',handler);
  return ()=>{page.off('request',handler);return {counts,chunkIndexes};};
}

test('Places: additive pinned-first owner traversal and signed seek survive reload and list navigation',async ({page})=>{
  const lists=aLists(),list=lists[0],other=lists[1];
  await appPage(page,manifest.personas.ownerA);
  const transport=await advertisedPinsTransport(list.id);
  const before=await ownerListMembers(list.id);
  // The uncapped per-list obligation: the advertised budget must admit the whole list.
  expect(before.ids.length<=transport.replacementIds).toBe(true);
  expect(before.pages>1).toBe(true); // a complete read, not one page of a bounded preview
  const titleOf=new Map(manifest.recommendations.map(row=>[row.id,row.title]));
  // Pin across the boundary: the last member first, then the first, then a middle one.
  const chosen=[before.ids.at(-1)!,before.ids[0],before.ids[Math.floor(before.ids.length/2)]];
  const names=chosen.map(id=>titleOf.get(id)!);
  const dialog=await openPinsEditor(page,list);
  await stagePins(dialog,names);
  await dialog.getByRole('button',{name:'Save pins',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Pinned places in this list',exact:true})).toHaveCount(0);
  await expect.poll(async()=>JSON.stringify((await ownerListMembers(list.id)).pinnedIds)).toBe(JSON.stringify(chosen));
  const after=await ownerListMembers(list.id);
  expect(after.metadata.collectionRevision>before.metadata.collectionRevision).toBe(true);
  same(after.ids.slice(0,chosen.length),chosen);
  same([...after.ids].sort(),[...before.ids].sort()); // no member gained, lost or duplicated
  expect(after.pages).toBe(before.pages);
  await page.reload();
  const reloaded=await openPinsEditor(page,list);
  expect(JSON.stringify(await pinnedNames(reloaded))===JSON.stringify(names)).toBe(true);
  await reloaded.getByRole('button',{name:'Close pinned places editor',exact:true}).click();
  // Cross-page navigation must re-read the list, not reuse another list's pin state.
  const otherDialog=await openPinsEditor(page,other);
  expect((await pinnedNames(otherDialog)).length).toBe(0);
  await otherDialog.getByRole('button',{name:'Close pinned places editor',exact:true}).click();
  const back=await openPinsEditor(page,list);
  expect(JSON.stringify(await pinnedNames(back))===JSON.stringify(names)).toBe(true);
  same((await ownerListMembers(list.id)).pinnedIds,chosen);
  same((await ownerListMembers(other.id)).pinnedIds,[]);
});

test('Places: additive public pinned pages omit private members and restart without mixed rows',async ({page,browser})=>{
  const list=aLists()[0];
  await appPage(page,manifest.personas.ownerA);
  await advertisedPinsTransport(list.id);
  const before=await ownerListMembers(list.id);
  const titleOf=new Map(manifest.recommendations.map(row=>[row.id,row.title]));
  const chosen=[before.ids.at(-1)!,before.ids[1],before.ids[0]];
  const dialog=await openPinsEditor(page,list);
  await stagePins(dialog,chosen.map(id=>titleOf.get(id)!));
  await dialog.getByRole('button',{name:'Save pins',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Pinned places in this list',exact:true})).toHaveCount(0);
  await expect.poll(async()=>JSON.stringify((await ownerListMembers(list.id)).pinnedIds)).toBe(JSON.stringify(chosen));
  const published=await publicDetailSequence(list.slug);
  same(published.ids.slice(0,chosen.length),chosen);
  expect(published.pages>1).toBe(true);
  // Withdraw one pinned member. It must leave public order and public counts together.
  const hidden=chosen[1],current=await editable('recommendations',hidden);
  const withdraw=await api(`/recommendations/${hidden}`,manifest.personas.ownerA,'PATCH',
    {expectedRevision:current.revision,publicationState:'draft'});
  expect(withdraw.status).toBe(200);
  const withheld=await publicDetailSequence(list.slug);
  same(withheld.ids.slice(0,2),[chosen[0],chosen[2]]);
  expect(withheld.ids.includes(hidden)).toBe(false);
  expect(withheld.ids.length).toBe(published.ids.length-1);
  // Owner retains the withdrawn pin; a public omission is not an unpin.
  const withdrawn=await ownerListMembers(list.id);
  expect(withdrawn.pinnedIds.includes(hidden)).toBe(true);
  same(withdrawn.pinnedIds,chosen);
  const retained=await editable('recommendations',hidden);
  expect(retained.publicationState).toBe('draft');
  // A continuation issued before the change cannot resume under the new tuple, and a
  // legacy offset cursor cannot be translated into the pinned ordering either.
  const firstPage=await json(`${publicPath(list.slug)}?limit=24`);
  const stale=firstPage.recommendationLists[0].recommended_places_next_cursor as string|null;
  expect(typeof stale==='string').toBe(true);
  const republish=await api(`/recommendations/${hidden}`,manifest.personas.ownerA,'PATCH',
    {expectedRevision:retained.revision,publicationState:'published'});
  expect(republish.status).toBe(200);
  const resumed=await api(`${publicPath(list.slug)}?limit=24&cursor=${encodeURIComponent(stale!)}`);
  expect(resumed.status).toBe(409);
  const legacy=await api(`${publicPath(list.slug)}?limit=24&cursor=o24`);
  expect(legacy.status===400 || legacy.status===409).toBe(true); // rejected, never translated
  const restarted=await publicDetailSequence(list.slug);
  same(restarted.ids.slice(0,chosen.length),chosen);
  expect(new Set(restarted.ids).size).toBe(restarted.ids.length);
  const anon=await anonymous(browser);
  try {
    const detailPages=recordPublicPages(anon.page,publicPath(list.slug),true);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${list.slug}`);
    const cards=anon.page.locator('button[aria-label^="Owned Place R"]');
    // The rendered census must equal the server's own complete public traversal of THIS
    // list, which is this case's complete list, not the 53-row default of the seeded ones.
    await exhaustRendered(anon.page,cards,'places',24,restarted.ids.length);
    const rendered=await cards.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')));
    expect(new Set(rendered).size).toBe(rendered.length); // restart cleared rows, never mixed them
    same([...rendered].sort(),restarted.ids.map(id=>titleOf.get(id)!).sort()); // same rows, not just the same count
    same(rendered.slice(0,chosen.length),chosen.map(id=>titleOf.get(id)!));
    const observed=await detailPages();
    expect(observed.parseFailures).toBe(0);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places`);
    await anon.page.goto(`/${manifest.personas.ownerA.handle}/places/${list.slug}`);
    await expect(cards.first()).toHaveAttribute('aria-label',titleOf.get(chosen[0])!);
    anon.transport.assertExpected();
  } finally {await anon.context.close();}
});

test('Places: additive complete70 staged pin order commits in advertised chunks and replays a lost acknowledgement once',async ({page})=>{
  const list=aLists()[0];
  await appPage(page,manifest.personas.ownerA);
  const transport=await advertisedPinsTransport(list.id);
  const before=await ownerListMembers(list.id);
  const total=before.ids.length;
  // The acceptance fixture size for this case is the complete list; it is never a cap.
  expect(total).toBe(before.metadata.eligibleItemCount);
  expect(total<=transport.replacementIds).toBe(true);
  expect(total>transport.transportChunkIds).toBe(true); // this case exists to exercise framing
  const expectedChunks=Math.ceil(total/transport.transportChunkIds);
  const titleOf=new Map(manifest.recommendations.map(row=>[row.id,row.title]));
  const sequence=[...before.ids].reverse();
  const dialog=await openPinsEditor(page,list);
  const census=recordPinRequests(page,list.id);
  let lost=false;
  const commitPattern=new RegExp(`^${base}/collections/${list.id}/place-pins/drafts/[^/]+/commit$`);
  const commitMatcher=(url:URL)=>commitPattern.test(url.pathname);
  await page.route(commitMatcher,async route=>{
    if(lost)return route.continue();
    lost=true;
    // The server commits; only the acknowledgement is lost, which is the real ambiguity.
    await route.fetch();
    await route.abort('connectionaborted');
  });
  try {
    await stagePins(dialog,sequence.map(id=>titleOf.get(id)!));
    await dialog.getByRole('button',{name:'Save pins',exact:true}).click();
    const retry=dialog.getByRole('button',{name:'Retry save',exact:true});
    await expect(retry).toBeVisible();
    await expect(dialog.getByRole('alert')).toBeVisible();
    expect(JSON.stringify(await pinnedNames(dialog))
      ===JSON.stringify(sequence.map(id=>titleOf.get(id)!))).toBe(true); // draft retained
    await retry.click();
    await expect(page.getByRole('dialog',{name:'Pinned places in this list',exact:true})).toHaveCount(0);
  } finally {await page.unroute(commitMatcher);}
  const {counts,chunkIndexes}=census();
  expect(counts.replace).toBe(0); // a staged sequence never falls back to a single replace
  expect(counts.begin).toBe(1);
  expect(counts.chunk).toBe(expectedChunks);
  same(chunkIndexes,Array.from({length:expectedChunks},(_,index)=>index));
  expect(counts.commit).toBe(2); // the lost acknowledgement and its one exact replay
  expect(counts.abort).toBe(0);
  const after=await ownerListMembers(list.id);
  same(after.pinnedIds,sequence); // exact full order, no truncation at any chunk edge
  expect(after.metadata.eligiblePinCount).toBe(total);
  same([...after.ids].sort(),[...before.ids].sort());
  await page.reload();
  const reloaded=await openPinsEditor(page,list);
  expect(JSON.stringify(await pinnedNames(reloaded))
    ===JSON.stringify(sequence.map(id=>titleOf.get(id)!))).toBe(true);
  const settled=await ownerListMembers(list.id);
  same(settled.pinnedIds,sequence);
  expect(settled.metadata.collectionRevision).toBe(after.metadata.collectionRevision); // replay, not a second commit
});

type PlacesPinDiagnosticPhase='initial-load'|'pin70-save'|'server-refusal'|'disable-check'|'sessionB'|'returnA'|'reopen';
// Only fixed classifications reach the retained reporter; never DOM text, identities or credentials.
async function capturePlacesPinDiagnostic(page:Page,info:TestInfo,phase:PlacesPinDiagnosticPhase,started:number,owner:'unavailable'|'ownerA'|'ownerB'|'other') {
  const elapsed=Date.now()-started,budget=info.timeout;
  const elapsedBucket=elapsed>=budget?'expired':elapsed>=budget*0.75?'last-quarter':elapsed>=budget*0.5?'half-to-three-quarters':elapsed>=budget*0.25?'quarter-to-half':'under-quarter';
  let observation={ownerState:'unavailable',action:'unavailable',cardCount:'unavailable',sample:'unavailable'};
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    if(!page.isClosed()) {
      const captured=await Promise.race([page.evaluate(()=>{
        const actions=Array.from(document.querySelectorAll('button')).filter(node=>node.textContent?.trim()==='Edit pinned places');
        const action=actions.length===0?'absent':actions.length!==1?'unavailable':actions[0].disabled?'disabled':'enabled';
        // Recommendations does not expose owner.error. The editor disabled prop is exactly
        // owner.loading; an absent editor therefore leaves owner state unobservable.
        const ownerState=action==='disabled'?'loading':action==='enabled'?'ready':'unavailable';
        const count=document.querySelectorAll('.places-grid-card').length;
        return {ownerState,action,cardCount:count===0?'zero':count<=10?'one-to-ten':count<=24?'eleven-to-twenty-four':'more-than-twenty-four',sample:'captured'};
      }),new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),1000);})]);
      if(captured)observation=captured;
    }
  } catch {/* Best-effort instrumentation: its own failure must not replace the result under test. */} finally {if(timer!==undefined)clearTimeout(timer);}
  try {info.errors.push({message:`[places-pin-diagnostic-v1:${phase}|${elapsedBucket}|${observation.ownerState}|${observation.action}|${observation.cardCount}|${owner}|${observation.sample}]`});} catch {/* Best-effort instrumentation: its own failure must not replace the result under test. */}
}

test('Places: additive complete70 resource refusal and session replacement keep the returned fence authoritative',async ({page},info)=>{
  const started=Date.now();let phase:PlacesPinDiagnosticPhase='initial-load';
  let owner:'unavailable'|'ownerA'|'ownerB'|'other'='unavailable';
  const classifyOwner=async(response:BrowserResponse)=>{
    if(new URL(response.url()).pathname!==`${base}/me` || response.request().method()!=='GET')return;
    try {const body=await response.json();owner=body?.account?.id===manifest.personas.ownerA.accountId?'ownerA':body?.account?.id===manifest.personas.ownerB.accountId?'ownerB':'other';} catch {owner='unavailable';}
  };
  page.on('response',classifyOwner);
  try {
  const list=aLists()[0];
  await appPage(page,manifest.personas.ownerA);
  const transport=await advertisedPinsTransport(list.id);
  const before=await ownerListMembers(list.id);
  const total=before.ids.length;
  expect(total<=transport.replacementIds).toBe(true);
  const titleOf=new Map(manifest.recommendations.map(row=>[row.id,row.title]));
  const sequence=[...before.ids];
  const dialog=await openPinsEditor(page,list);
  phase='pin70-save';
  await stagePins(dialog,sequence.map(id=>titleOf.get(id)!));
  await dialog.getByRole('button',{name:'Save pins',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Pinned places in this list',exact:true})).toHaveCount(0);
  await expect.poll(async()=>JSON.stringify((await ownerListMembers(list.id)).pinnedIds)).toBe(JSON.stringify(sequence));
  const committed=await ownerListMembers(list.id);
  // Server resource refusal is authoritative and leaves the committed pins untouched.
  // The refused size is derived from the advertised bound, never from a chosen number.
  phase='server-refusal';
  const oversized=Array.from({length:transport.replacementIds+1},(_,index)=>sequence[index%total]);
  const refusedDuplicates=await api(`/collections/${list.id}/place-pins`,manifest.personas.ownerA,'PUT',
    {expectedCollectionRevision:committed.metadata.collectionRevision,
      expectedCategoryContentRevision:committed.metadata.categoryContentRevision,
      orderedRecommendationIds:oversized});
  expect(refusedDuplicates.status===400 || refusedDuplicates.status===413 || refusedDuplicates.status===422).toBe(true);
  same((await ownerListMembers(list.id)).pinnedIds,sequence);
  // A stale fence cannot overwrite the committed sequence either.
  const stale=await api(`/collections/${list.id}/place-pins`,manifest.personas.ownerA,'PUT',
    {expectedCollectionRevision:before.metadata.collectionRevision,
      expectedCategoryContentRevision:before.metadata.categoryContentRevision,
      orderedRecommendationIds:[sequence[0]]});
  expect(stale.status).toBe(409);
  same((await ownerListMembers(list.id)).pinnedIds,sequence);
  // Session replacement in the same tab: the replaced owner must see no stale pin state,
  // and the original owner's returned fence stays authoritative on reload.
  phase='disable-check';
  const open=await openPinsEditor(page,list);
  expect(JSON.stringify(await pinnedNames(open))
    ===JSON.stringify(sequence.map(id=>titleOf.get(id)!))).toBe(true);
  phase='sessionB';owner='unavailable';
  const b=manifest.personas.ownerB,split=b.cookie.indexOf('=');
  await page.context().clearCookies();
  await page.context().addCookies([{name:b.cookie.slice(0,split),value:b.cookie.slice(split+1),
    url:fixture.origin,sameSite:'Lax',httpOnly:true}]);
  await page.addInitScript(({userId,handle})=>localStorage.setItem('auth-storage',JSON.stringify({state:{
    isAuthenticated:true,token:'places-fixture-placeholder',user:{id:userId,documentId:userId,username:handle,
      email:`${userId}@example.invalid`,blocked:false}},version:0})),{userId:b.userId,handle:b.handle});
  await page.reload();
  await page.goto('/recommendations/places');
  for(const title of sequence.slice(0,3).map(id=>titleOf.get(id)!))
    await expect(page.getByText(title,{exact:true})).toHaveCount(0);
  expect((await api(`/collections/${list.id}/place-pins/availability`,b)).status).toBe(404);
  same((await ownerListMembers(list.id)).pinnedIds,sequence);
  // Back to the original owner: the committed fence, not the replaced session, decides.
  await page.context().clearCookies();
  phase='returnA';owner='unavailable';
  const a=manifest.personas.ownerA,aSplit=a.cookie.indexOf('=');
  await page.context().addCookies([{name:a.cookie.slice(0,aSplit),value:a.cookie.slice(aSplit+1),
    url:fixture.origin,sameSite:'Lax',httpOnly:true}]);
  await page.addInitScript(({userId,handle})=>localStorage.setItem('auth-storage',JSON.stringify({state:{
    isAuthenticated:true,token:'places-fixture-placeholder',user:{id:userId,documentId:userId,username:handle,
      email:`${userId}@example.invalid`,blocked:false}},version:0})),{userId:a.userId,handle:a.handle});
  await page.reload();
  phase='reopen';
  const restored=await openPinsEditor(page,list);
  expect(JSON.stringify(await pinnedNames(restored))
    ===JSON.stringify(sequence.map(id=>titleOf.get(id)!))).toBe(true);
  const settled=await ownerListMembers(list.id);
  same(settled.pinnedIds,sequence);
  expect(settled.metadata.collectionRevision).toBe(committed.metadata.collectionRevision);
  } catch(originalError) {await capturePlacesPinDiagnostic(page,info,phase,started,owner);throw originalError;}
  finally {page.off('response',classifyOwner);}
});
