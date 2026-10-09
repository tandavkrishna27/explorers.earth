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
    do {
      const search=new URLSearchParams({...params,limit:'24',snapshotToken:snapshot.snapshotToken,...(cursor?{cursor}:{})});
      const page=await json(`${route}?${search}`,persona);
      expect(page.snapshot===snapshot.revision && page.snapshotToken===snapshot.snapshotToken && page.expiresAt===snapshot.expiresAt).toBe(true);
      expect(Array.isArray(page.items) && page.items.length<=24).toBe(true);rows.push(...page.items);
      if(page.nextCursor===null) break;
      expect(typeof page.nextCursor==='string' && page.items.length>0 && !seen.has(page.nextCursor)).toBe(true);
      cursor=page.nextCursor;seen.add(cursor!);
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
test.beforeEach(async ({},info)=>{manifest=await control('reset',info) as PlacesManifest;});

function child(category:'products'|'people') {
  return manifest.collections.find(c=>c.accountId===manifest.personas.ownerA.accountId && c.category===category && c.title===`Owned ${category==='products'?'Products':'People'}`)!;
}
function linkButton(page:Page,title:string,name:string) {
  // This actual wrapper contains the h3 selection card and its sibling action.
  return page.locator('div.flex.flex-col.gap-2').filter({has:page.getByRole('heading',{name:title,exact:true})})
    .getByRole('button',{name,exact:true});
}
const commandResponse=(page:Page,id:string,method:string)=>page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/collections/${id}/location` && r.request().method()===method);
async function assertRelation(parentId:string,childId:string,linked:boolean) {
  const parent=await editable('collections',parentId),value=await editable('collections',childId);
  expect(parent.linkedChildren.some((link:Dto)=>link.childCollectionId===childId && link.locationCollectionId===parentId)).toBe(linked);
  expect(linked?value.locationLink?.locationCollectionId===parentId:value.locationLink===null).toBe(true);
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

test('Place links: existing Products and People lists attach detach and survive reload',async ({page})=>{
  const transport=await appPage(page,manifest.personas.ownerA);const [parent,second]=aLists();
  for(const category of ['products','people'] as const) {
    const item=child(category),before=await editable('collections',item.id),content=await complete(category);
    const ownRecommendations=content.recommendations.filter(r=>manifest.recommendations.some(seed=>seed.collectionId===item.id && seed.id===r.id));
    await page.goto(`/recommendations/places/${parent.id}/add-${category}`);
    await expect(page.getByRole('heading',{name:category==='products'?'Add Products':'Add People',exact:true})).toBeVisible();
    const linked=commandResponse(page,item.id,'POST');
    await linkButton(page,item.title,'Link to this location').click();const response=await linked;expect(response.status()).toBe(200);
    const body=response.request().postDataJSON();expect(body.childCollectionId).toBe(item.id);expect(body.locationCollectionId).toBe(parent.id);
    expect(body.expectedChildRevision).toBe(before.revision);expect(Number.isSafeInteger(body.expectedLocationRevision)).toBe(true);
    await assertRelation(parent.id,item.id,true);await page.reload();
    await expect(linkButton(page,item.title,'Unlink from this location')).toBeVisible();
    const detached=commandResponse(page,item.id,'DELETE');await linkButton(page,item.title,'Unlink from this location').click();
    const removed=await detached;expect(removed.status()).toBe(200);expect(removed.request().postDataJSON().childCollectionId).toBe(item.id);
    await assertRelation(parent.id,item.id,false);await page.reload();await expect(linkButton(page,item.title,'Link to this location')).toBeVisible();
    const after=await editable('collections',item.id);same([after.title,after.slug,after.description],[before.title,before.slug,before.description]);
    const afterContent=await complete(category);
    same(afterContent.memberships.filter(m=>m.collectionId===item.id).map(m=>[m.recommendationId,m.displayOrder]),
      content.memberships.filter(m=>m.collectionId===item.id).map(m=>[m.recommendationId,m.displayOrder]));
    same(afterContent.recommendations.filter(r=>ownRecommendations.some(original=>original.id===r.id)),ownRecommendations);
    for(const seed of manifest.recommendations.filter(r=>r.collectionId===item.id))expect((await editable('recommendations',seed.id)).entityId).toBe(seed.entityId);
    expect((await editable('collections',second.id)).linkedChildren.some((link:Dto)=>link.childCollectionId===item.id)).toBe(false);
  }
  transport.assertExpected();expect(transport.observations.length).toBe(0);
});

test('Place links: retained create forms atomically create and link Products and People lists',async ({page})=>{
  const transport=await appPage(page,manifest.personas.ownerA);const parent=aLists()[0];
  for(const category of ['products','people'] as const) {
    const product=category==='products',title=`Created Linked ${product?'Products':'People'}`,slug=`created-linked-${category}`;
    await page.goto(`/recommendations/places/${parent.id}/add-${category}`);
    await page.getByRole('button',{name:product?/^Create a New Product List/:/^Create a New People List/}).click();
    const container=page.getByRole('heading',{name:product?'Create New Product List':'Create New People List',exact:true}).locator('../..');
    const form=container.locator('form');
    await form.getByPlaceholder(product?'e.g. Paris Essentials, Travel Gear':'e.g. Local Creators, Inspiring Founders').fill(title);
    await form.getByPlaceholder(product?"Describe what's in this product collection":'Describe the people in this collection').fill('Created through retained form');
    await form.getByPlaceholder('my-list-url').fill(slug);
    const created=page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/collections` && r.request().method()==='POST');
    await form.getByRole('button',{name:product?'Create & Add Products':'Create & Add People',exact:true}).click();
    const response=await created;expect(response.status()).toBe(201);const body=response.request().postDataJSON();
    same([body.category,body.title,body.slug,body.description,body.parentLocationCollectionId],[category,title,slug,'Created through retained form',parent.id]);
    expect(Object.hasOwn(body,'parentExpectedRevision')).toBe(false);
    const id=(await response.json()).collection.id;await expect(page).toHaveURL(new RegExp(`/recommendations/${category}/${id}/add$`));
    await page.reload();const saved=await editable('collections',id);
    same([saved.title,saved.slug,saved.description],[title,slug,'Created through retained form']);await assertRelation(parent.id,id,true);
    // Foreign-parent refusal is a canonical API negative; successful creation above is UI.
    const b=manifest.personas.ownerB,before=(await complete(category,b)).collections.map(c=>c.id);
    const invalid={category,title:'Foreign parent create',slug:`foreign-parent-${category}`,description:null,visibility:'private',publicationState:'draft',parentLocationCollectionId:parent.id};
    const foreign=await api('/collections',b,'POST',invalid),missing=await api('/collections',b,'POST',{...invalid,parentLocationCollectionId:randomUUID()});
    expect(foreign.status).toBe(404);expect(missing.status).toBe(404);same(normalized(await foreign.json()),normalized(await missing.json()));
    same((await complete(category,b)).collections.map(c=>c.id),before);
  }
  transport.assertExpected();expect(transport.observations.length).toBe(0);
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
  await page.goto(`/recommendations/places/${parent.id}/add-products`);
  let release!:()=>void,held!:()=>void;const delivered=new Promise<void>(resolve=>held=resolve),gate=new Promise<void>(resolve=>release=resolve);
  let originalBody='',originalKey='',observedBody:Dto|undefined;
  const routePath=`**${base}/collections/${item.id}/location`;
  await page.route(routePath,async route=>{
    if(route.request().method()!=='POST')return route.continue();
    originalBody=route.request().postData()!;originalKey=route.request().headers()['idempotency-key'];observedBody=JSON.parse(originalBody);
    held();await gate;await route.continue();
  });
  const conflict=commandResponse(page,item.id,'POST');
  try {
    await linkButton(page,item.title,'Link to this location').click();await delivered;
    const actualParent=await editable('collections',parent.id);
    expect(observedBody?.expectedLocationRevision).toBe(actualParent.revision);expect(observedBody?.expectedChildRevision).toBe(beforeChild.revision);
    expect(observedBody?.childCollectionId).toBe(item.id);expect(observedBody?.locationCollectionId).toBe(parent.id);expect(Boolean(originalKey)).toBe(true);
    const advanced=await patchCollection(parent.id,{description:'Actual concurrent owner revision'});expect(advanced.revision>actualParent.revision).toBe(true);
    release();const response=await conflict;expect(response.status()).toBe(409);
    expect(response.request().postData()===originalBody && response.request().headers()['idempotency-key']===originalKey).toBe(true);
  } finally {release();await page.unroute(routePath);}
  await assertRelation(parent.id,item.id,false);same(await editable('collections',item.id),beforeChild);
  same(membershipValues((await complete('products')).memberships),membershipValues(content.memberships));same((await complete('products')).recommendations,content.recommendations);
  const afterObserve=await control('observe',info);same(afterObserve.relations,beforeObserve.relations);
  const parentAfter=await editable('collections',parent.id);expect(parentAfter.description).toBe('Actual concurrent owner revision');
  expect(parentAfter.revision>beforeParent.revision).toBe(true);same(immutableParent(parentAfter),immutableParent(beforeParent));
  same(afterObserve.collections.filter((row:Dto)=>row.id!==parent.id),beforeObserve.collections.filter((row:Dto)=>row.id!==parent.id));
  await page.reload();const retry=commandResponse(page,item.id,'POST');await linkButton(page,item.title,'Link to this location').click();
  const retried=await retry;expect(retried.status()).toBe(200);
  expect(retried.request().postDataJSON().expectedLocationRevision).toBe(parentAfter.revision);
  expect(retried.request().headers()['idempotency-key']!==originalKey).toBe(true);await assertRelation(parent.id,item.id,true);
  // Canonical B setup supplies a valid Products child; a Places row is never used as a child.
  const b=manifest.personas.ownerB,bParent=manifest.collections.find(c=>c.accountId===b.accountId && c.category==='places')!;
  const created=await api('/collections',b,'POST',{category:'products',title:'Owner B foreign-link control',slug:'owner-b-foreign-link-control',description:null,visibility:'private',publicationState:'draft'});
  expect(created.status).toBe(201);const bChildId=(await created.json() as Dto).collection.id;
  const bChild=await editable('collections',bChildId,b),bLocation=await editable('collections',bParent.id,b);
  const aChild=await editable('collections',item.id),aParent=await editable('collections',parent.id);
  const bIds=(await complete('products',b)).collections.map(c=>c.id),relations=(await control('observe',info)).relations;
  const foreignParent={childCollectionId:bChildId,expectedChildRevision:bChild.revision,locationCollectionId:parent.id,expectedLocationRevision:aParent.revision};
  const foreign=await api(`/collections/${bChildId}/location`,b,'POST',foreignParent);
  const absent=await api(`/collections/${bChildId}/location`,b,'POST',{...foreignParent,locationCollectionId:randomUUID()});
  expect(foreign.status).toBe(404);expect(absent.status).toBe(404);same(normalized(await foreign.json()),normalized(await absent.json()));
  const missing=randomUUID(),foreignChild={childCollectionId:item.id,expectedChildRevision:aChild.revision,locationCollectionId:bParent.id,expectedLocationRevision:bLocation.revision};
  const denied=await api(`/collections/${item.id}/location`,b,'POST',foreignChild),missingChild=await api(`/collections/${missing}/location`,b,'POST',{...foreignChild,childCollectionId:missing});
  expect(denied.status).toBe(404);expect(missingChild.status).toBe(404);same(normalized(await denied.json()),normalized(await missingChild.json()));
  same((await complete('products',b)).collections.map(c=>c.id),bIds);same((await control('observe',info)).relations,relations);
  same(await editable('collections',item.id),aChild);same(await editable('collections',parent.id),aParent);same(await editable('collections',bChildId,b),bChild);
  same(membershipValues((await complete('products')).memberships),membershipValues(content.memberships));same((await complete('products')).recommendations,content.recommendations);
  transport.assertExpected();expect(transport.observations.length).toBe(0);
});
