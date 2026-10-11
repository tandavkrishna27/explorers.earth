import {randomUUID} from 'node:crypto';
import {test,expect,type APIRequestContext,type APIResponse,type Page,type Response,type BrowserContext,type Request} from '@playwright/test';
import {z} from 'zod/v3';
import {GUIDES_CASES,GUIDES_PROJECTS,guidesObservationRowSchemas} from '../../../tunes/scripts/guides-browser-support';
import {guideAggregateDtoSchema,type GuideAggregateDto} from '../../../tunes/shared/explorersGuideContract';
import {ownerCollectionPageSchema,ownerSnapshotSchema,ownerMembershipPageSchema,ownerRecommendationPageSchema} from '../../../tunes/shared/explorersOwnerContentContract';
import {createGuidesHarnessClient,validateGuidesEnvironment} from './guides-harness-client';

const {origin}=validateGuidesEnvironment(process.env),base='/api/explorers/v1';
type Observation={guides:(typeof guidesObservationRowSchemas.guide)['_output'][];sections:(typeof guidesObservationRowSchemas.section)['_output'][];personas:Record<string,(typeof guidesObservationRowSchemas.persona)['_output']>;media:unknown[];objects:unknown[];attachments:unknown[]};

// Compare every persisted row, allowing only the documented target mutation.
// The owner's category revision is shared by its archived sibling as well.
function assertPersistedScope(before:Observation,after:Observation,guideId:string,orderedIds:string[],archived:boolean,revision:number){
 const target=before.guides.find(g=>g.id===guideId)!;expect(target).toBeDefined();
 expect(after.guides.map(g=>g.id)).toEqual(before.guides.map(g=>g.id));
 expect(after.sections.map(s=>s.id).sort()).toEqual([...before.sections.filter(s=>s.collectionId!==guideId).map(s=>s.id),...orderedIds].sort());
 const rows=after.sections.filter(s=>s.collectionId===guideId).sort((a,b)=>a.displayOrder-b.displayOrder);
 expect(rows.map(s=>s.id)).toEqual(orderedIds);expect(rows.map(s=>s.displayOrder)).toEqual(orderedIds.map((_,i)=>i));
 for(const row of rows){const old=before.sections.find(s=>s.id===row.id)!;if(archived){expect(row).toEqual(old);continue;}const {displayOrder:_oldOrder,updatedAt:_oldTime,...retained}=old;const {displayOrder:_order,updatedAt:_time,...actual}=row;expect(actual).toEqual(retained);}
 for(const row of before.sections.filter(s=>s.collectionId!==guideId))expect(after.sections.find(s=>s.id===row.id)).toEqual(row);
 for(const old of before.guides){const row=after.guides.find(g=>g.id===old.id)!;const {categoryContentRevision:_oldCategory,...retained}=old;const {categoryContentRevision:_category,...actual}=row;
  if(old.id===guideId){expect(actual).toEqual({...retained,revision:old.revision+(archived?1:0),archivedAt:archived?row.archivedAt:old.archivedAt});if(archived)expect(row.archivedAt).not.toBeNull();}
  else expect(actual).toEqual(retained);
  expect(row.categoryContentRevision).toBe(old.accountId===target.accountId?revision:old.categoryContentRevision);
 }
 for(const [owner,old] of Object.entries(before.personas))expect(after.personas[owner]).toEqual({...old,guidesContentRevision:old.accountId===target.accountId?revision:old.guidesContentRevision});
 for(const key of ['media','objects','attachments'] as const)expect(after[key]).toEqual(before[key]);
}

async function consume<T>(response:APIResponse,read:(response:APIResponse)=>Promise<T>){try{return await read(response);}finally{await response.dispose();}}
async function aggregate(request:APIRequestContext,id:string){return consume(await request.get(`${base}/collections/${id}/guide`),async r=>{expect(r.status()).toBe(200);const value=guideAggregateDtoSchema.parse((await r.json()).guide);expect(value.collectionId).toBe(id);expect(value.nextCursor).toBeNull();expect(value.sectionCount).toBe(value.sections.length);return value;});}
async function reorderCanonical(request:APIRequestContext,id:string,current:GuideAggregateDto,sectionIds:string[]){
 return consume(await request.patch(`${base}/collections/${id}/guide/sections/order`,{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:{revision:current.revision,sectionIds}}),async r=>{expect(r.status()).toBe(200);const value=guideAggregateDtoSchema.parse((await r.json()).guide);expect(value.collectionId).toBe(id);expect(value.revision).toBeGreaterThan(current.revision);expect(value.sections.map(s=>s.id)).toEqual(sectionIds);expect(value.sections.map(s=>s.displayOrder)).toEqual(sectionIds.map((_,i)=>i));return value;});
}
const publicPage=z.object({version:z.literal('explorers-public-content/v1'),items:z.array(z.object({id:z.string().uuid(),title:z.string(),slug:z.string(),description:z.string().nullable(),heading:z.string().nullable()}).strict()),nextCursor:z.string().nullable()}).strict();
async function publicIds(request:APIRequestContext,handle:string){return consume(await request.get(`${base}/public/profiles/${handle}/collections/guides?limit=24`),async r=>{expect(r.status()).toBe(200);const value=publicPage.parse(await r.json());expect(value.nextCursor).toBeNull();return value.items.map(x=>x.id);});}
async function browserBody(response:Response){expect(response.status()).toBe(200);const body=await response.body();expect(body.length).toBeLessThanOrEqual(65536);expect(await response.finished()).toBeNull();return JSON.parse(body.toString('utf8'));}
function acknowledgement(page:Page,path:string,body:(value:Record<string,unknown>)=>boolean){const original=page.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname===`${base}${path}`&&r.request().method()==='DELETE'&&body(r.request().postDataJSON()));void original.catch(()=>undefined);return original;}
async function sectionOrder(page:Page,title:string,titles:string[]){await expect(page.getByRole('heading',{level:1,name:title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Add Day/Stop',exact:true})).toBeVisible();const itinerary=page.getByRole('heading',{level:2,name:'Your Itinerary',exact:true}).locator('..');await itinerary.getByRole('button').first().click();const headings=page.getByRole('heading',{level:3}).filter({hasText:/^दिन /});await expect(headings).toHaveText(titles);}
async function emptyGuideList(page:Page){await expect(page.getByRole('heading',{level:3,name:'Write the itinerary',exact:true})).toBeVisible();await expect(page.getByText('Craft travel guides and day-by-day itineraries. Help others explore the world the way you did.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Add Guide',exact:true})).toBeVisible();}
async function nativeDeleteSection(page:Page,id:string,sectionId:string,title:string,revision:number){
 const row=page.getByRole('heading',{level:3,name:title,exact:true}).locator('../../..');await expect(row).toHaveCount(1);await row.getByRole('button').first().click();await row.getByRole('button',{name:'Delete',exact:true}).click();
 const heading=page.getByRole('heading',{name:'Delete Section',exact:true});await expect(heading).toBeVisible();const modal=heading.locator('../..');await expect(modal).toContainText(`Are you sure you want to delete the section "${title}"?`);
 const ack=acknowledgement(page,`/collections/${id}/guide/sections/${sectionId}`,body=>body.revision===revision);await modal.getByRole('button',{name:'Delete',exact:true}).click();const value=guideAggregateDtoSchema.parse((await browserBody(await ack)).guide);expect(value.collectionId).toBe(id);expect(value.sections.some(s=>s.id===sectionId)).toBe(false);expect(value.revision).toBeGreaterThan(revision);await expect(heading).toHaveCount(0);return value;
}
async function nativeArchiveGuide(page:Page,id:string,title:string,revision:number){
 const row=page.locator('.white-theme').filter({has:page.getByRole('heading',{level:3,name:title,exact:true})});await expect(row).toHaveCount(1);await row.getByRole('button').first().click();await row.getByRole('button',{name:'Delete',exact:true}).click();const heading=page.getByRole('heading',{name:'Confirm Deletion',exact:true});await expect(heading).toBeVisible();
 const ack=acknowledgement(page,`/collections/${id}`,body=>body.expectedRevision===revision);await heading.locator('..').getByRole('button',{name:'Delete Guide',exact:true}).click();const archived=z.object({id:z.string().uuid(),archived:z.literal(true)}).strict().parse((await browserBody(await ack)).collection);expect(archived.id).toBe(id);await expect(heading).toHaveCount(0);
}

// These source cards author their frozen cases only. The complete lane
// receives registration after all eight independent source cards are accepted.
test(GUIDES_CASES[3],async({browser},info)=>{
 const harness=createGuidesHarnessClient();expect(info.repeatEachIndex).toBe(0);expect(GUIDES_PROJECTS).toContain(info.project.name);
 const manifest=await harness.start({caseId:GUIDES_CASES[3],project:info.project.name as typeof GUIDES_PROJECTS[number],repeat: 0});
 let owner:BrowserContext|undefined,guest:BrowserContext|undefined,completed=false;
 try{
  owner=await harness.createContext(browser,'ownerA',info.project.name==='guides-mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1365,height:900}});
  guest=await harness.createContext(browser,'ownerC');await harness.trackProducer(()=>guest!.clearCookies());
  const page=await harness.trackProducer(()=>owner!.newPage());trackGuidesBootstrap(page,manifest.personas.ownerA);
  await harness.trackProducer(async()=>{
   const guide=manifest.guides.find(g=>g.key==='ownerA-guide-0')!;expect(guide).toBeDefined();expect(manifest.guides).toHaveLength(3);expect(manifest.sections.filter(s=>s.collectionId===guide.id)).toHaveLength(4);
   const baseline:Observation=await harness.observe();expect(await publicIds(guest!.request,manifest.personas.ownerA.handle)).toEqual([guide.id]);expect(await publicIds(guest!.request,manifest.personas.ownerB.handle)).toEqual(manifest.guides.filter(g=>g.accountId===manifest.personas.ownerB.accountId).map(g=>g.id));
   await navigateGuides(page,`/recommendations/guides/${guide.id}`);const initial=await aggregate(owner!.request,guide.id);expect(initial.sections.map(s=>s.id)).toEqual(manifest.sections.filter(s=>s.collectionId===guide.id).map(s=>s.id));await sectionOrder(page,guide.title,initial.sections.map(s=>s.title));
   // Explicit canonical API coverage: retained Guides has no section reorder UI.
   const ordered=[initial.sections[2],initial.sections[0],initial.sections[3],initial.sections[1]],ids=ordered.map(s=>s.id);const reordered=await reorderCanonical(owner!.request,guide.id,initial,ids);
   const afterReorder:Observation=await harness.observe();assertPersistedScope(baseline,afterReorder,guide.id,ids,false,reordered.revision);await reloadGuides(page);await sectionOrder(page,guide.title,ordered.map(s=>s.title));expect(await aggregate(owner!.request,guide.id)).toEqual(reordered);
   const deleted=await nativeDeleteSection(page,guide.id,ordered[1].id,ordered[1].title,reordered.revision),survivors=ordered.filter(s=>s.id!==ordered[1].id);const afterDelete:Observation=await harness.observe();assertPersistedScope(afterReorder,afterDelete,guide.id,survivors.map(s=>s.id),false,deleted.revision);
   await reloadGuides(page);await sectionOrder(page,guide.title,survivors.map(s=>s.title));expect(await aggregate(owner!.request,guide.id)).toEqual(deleted);expect(await publicIds(guest!.request,manifest.personas.ownerA.handle)).toEqual([guide.id]);
   await navigateGuides(page,'/recommendations/guides');await expect(page.getByRole('heading',{level:3,name:guide.title,exact:true})).toHaveCount(1);await nativeArchiveGuide(page,guide.id,guide.title,afterDelete.guides.find(g=>g.id===guide.id)!.revision);
   await reloadGuides(page);await emptyGuideList(page);await expect(page.getByRole('heading',{level:3,name:guide.title,exact:true})).toHaveCount(0);
   const afterArchive:Observation=await harness.observe(),revision=afterArchive.personas.ownerA.guidesContentRevision;expect(revision).toBeGreaterThan(deleted.revision);assertPersistedScope(afterDelete,afterArchive,guide.id,survivors.map(s=>s.id),true,revision);expect(await aggregate(owner!.request,guide.id)).toMatchObject({sections:deleted.sections,details:deleted.details,sectionCount:3,revision});
   expect(await publicIds(guest!.request,manifest.personas.ownerA.handle)).toEqual([]);expect(await publicIds(guest!.request,manifest.personas.ownerB.handle)).toEqual(manifest.guides.filter(g=>g.accountId===manifest.personas.ownerB.accountId).map(g=>g.id));
   await consume(await guest!.request.get(`${base}/public/profiles/${manifest.personas.ownerA.handle}/collections/guides/${guide.slug}/recommendations`),async r=>{expect(r.status()).toBe(404);expect((await r.json()).error.code).toBe('NOT_FOUND');});
  });
  await settleGuidesBootstrap(page);await harness.closeContext(owner);owner=undefined;await harness.closeContext(guest);guest=undefined;await harness.retire();completed=true;
 }finally{
  if(!completed){const closed=await Promise.allSettled([owner,guest].filter((c):c is BrowserContext=>!!c).map(c=>harness.closeContext(c)));await harness.fail();if(closed.some(r=>r.status==='rejected'))throw Error('Guides source case containment failed');}
 }
});
type GuidesBootstrapIdentity={userId:string;accountId:string;handle:string}|null;
type GuidesBootstrapRecord={kind:'session'|'me';work:Promise<void>;finished:()=>void;failed:()=>void};
const guidesBootstraps=new WeakMap<Page,{expected:GuidesBootstrapIdentity;records:Map<Request,GuidesBootstrapRecord>;floor:number;failed:boolean}>();
// Observe original browser transports. APIRequestContext sign-in probes cannot
// settle AuthSyncManager's independent session -> account bootstrap.
function trackGuidesBootstrap(page:Page,expected:GuidesBootstrapIdentity){
 const identity=expected===null?null:Object.freeze({userId:expected.userId,accountId:expected.accountId,handle:expected.handle});
 const existing=guidesBootstraps.get(page);
 if(existing){if(page.url()!=='about:blank'||existing.records.size)throw Error('Guides bootstrap identity changed');existing.expected=identity;return;}
 const state={expected:identity,records:new Map<Request,GuidesBootstrapRecord>(),floor:0,failed:false};guidesBootstraps.set(page,state);
 page.on('request',request=>{
  const url=new URL(request.url());if(url.origin!==origin||request.method()!=='GET')return;
  const kind=url.pathname==='/api/auth/get-session'?'session':url.pathname===`${base}/me`?'me':undefined;if(!kind)return;
  if(state.records.size>=128){state.failed=true;return;}
  const identity=state.expected;let finish!:()=>void,fail!:()=>void,respond!:(response:Response)=>void;
  const terminal=new Promise<void>((resolve,reject)=>{finish=resolve;fail=()=>reject(Error('Guides bootstrap request failed'));});
  const response=new Promise<Response>(resolve=>{respond=resolve;});
  // Body/finished and the request terminal event are independently required;
  // a failure races only toward refusal and never supplies successful evidence.
  const work=Promise.all([terminal,response.then(async value=>{
   if(value.status()!==200)throw Error('Guides bootstrap response refused');
   const bytes=await value.body();if(bytes.length>65536)throw Error('Guides bootstrap body refused');
   const body=JSON.parse(bytes.toString('utf8'));
   if(kind==='session'){
    if(identity?body?.user?.id!==identity.userId||typeof body?.session?.id!=='string'||!body.session.id:body!==null)throw Error('Guides bootstrap session refused');
   }else if(!identity||body?.account?.id!==identity.accountId||body.account.handle!==identity.handle||body.account.onboardingStatus!=='complete')throw Error('Guides bootstrap account refused');
   if(await value.finished()!==null)throw Error('Guides bootstrap response incomplete');
  })]).then(()=>undefined).catch(()=>{state.failed=true;throw Error('Guides bootstrap settlement refused');});
  void work.catch(()=>undefined);
  const record:GuidesBootstrapRecord={kind,work,finished:finish,failed:fail};state.records.set(request,record);
  // Store the positive response delivery privately on this original request record.
  responses.set(record,respond);
 });
 const responses=new WeakMap<GuidesBootstrapRecord,(response:Response)=>void>();
 page.on('response',response=>{const record=state.records.get(response.request());if(record)responses.get(record)!(response);});
 page.on('requestfinished',request=>{state.records.get(request)?.finished();});
 page.on('requestfailed',request=>{if(state.records.has(request)){state.failed=true;state.records.get(request)!.failed();}});
}
async function settleGuidesBootstrap(page:Page,budget=15000){
 if(!Number.isInteger(budget)||budget<1||budget>15000)throw Error('Guides bootstrap budget invalid');
 const state=guidesBootstraps.get(page);if(!state)throw Error('Guides bootstrap observer missing');
 if(page.isClosed())throw Error('Guides bootstrap page closed before settlement');
 if(page.url()==='about:blank'&&state.records.size===0)return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const work=(async()=>{
  for(;;){
   if(state.failed)throw Error('Guides bootstrap settlement refused');
   const records=[...state.records.values()];await Promise.all(records.map(record=>record.work));
   // Read the same existing module served by the guarded Vite fixture; return
   // only a boolean. Never create state, force refresh, or expose account data.
   const current=await page.evaluate(async expected=>{
    const path='/src/store/store.ts';const module=await import(/* @vite-ignore */ path);const state=module.default.getState();
    return expected?state.status==='active-complete'&&state.isAuthenticated===true&&state.accountId===expected.accountId&&state.user?.id===expected.userId&&state.user?.documentId===expected.userId&&state.user?.username===expected.handle&&state.token===null:
     state.status==='signed-out'&&state.isAuthenticated===false&&state.accountId===null&&state.user===null&&state.token===null;
   },state.expected);
   if(state.failed)throw Error('Guides bootstrap settlement refused');
   const currentRecords=[...state.records.values()].slice(state.floor);
   if(current&&records.length===state.records.size&&currentRecords.some(record=>record.kind==='session')&&(state.expected?currentRecords.some(record=>record.kind==='me'):currentRecords.every(record=>record.kind!=='me')))return;
   await new Promise<void>(resolve=>setTimeout(resolve,10));
  }
 })();void work.catch(()=>undefined);
 try{await Promise.race([work,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{state.failed=true;reject(Error('Guides bootstrap settlement deadline'));},budget);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function navigateGuides(page:Page,path:string){await settleGuidesBootstrap(page);const state=guidesBootstraps.get(page)!;state.floor=state.records.size;await page.goto(path);await settleGuidesBootstrap(page);}
async function reloadGuides(page:Page){await settleGuidesBootstrap(page);const state=guidesBootstraps.get(page)!;state.floor=state.records.size;await page.reload();await settleGuidesBootstrap(page);}

type SectionCommand={revision:number;title:string;description:string|null;blocks:GuideAggregateDto['sections'][number]['blocks']};
function assertEditorPersistedScope(before:Observation,after:Observation,expected:GuideAggregateDto,sectionId?:string){
 const target=before.guides.find(g=>g.id===expected.collectionId)!;expect(target).toBeDefined();
 expect(after.guides.map(g=>g.id)).toEqual(before.guides.map(g=>g.id));expect(after.sections.map(s=>s.id)).toEqual(before.sections.map(s=>s.id));
 for(const old of before.sections){const row=after.sections.find(s=>s.id===old.id)!;
  if(old.id===sectionId){const wanted=expected.sections.find(s=>s.id===sectionId)!;expect(wanted).toBeDefined();expect(old.collectionId).toBe(expected.collectionId);expect(row).toEqual({...old,title:wanted.title,description:wanted.description,blocks:wanted.blocks,updatedAt:row.updatedAt});}
  else expect(row).toEqual(old);
 }
 for(const old of before.guides)expect(after.guides.find(g=>g.id===old.id)).toEqual({...old,details:old.id===expected.collectionId?expected.details:old.details,categoryContentRevision:old.accountId===target.accountId?expected.revision:old.categoryContentRevision});
 for(const [owner,old] of Object.entries(before.personas))expect(after.personas[owner]).toEqual({...old,guidesContentRevision:old.accountId===target.accountId?expected.revision:old.guidesContentRevision});
 for(const key of ['media','objects','attachments'] as const)expect(after[key]).toEqual(before[key]);
}
function assertEditorAggregate(expected:GuideAggregateDto,actual:GuideAggregateDto,sectionId?:string){
 expect(actual.revision).toBeGreaterThan(expected.revision);
 expect(actual).toEqual({...expected,revision:actual.revision,sections:expected.sections.map(section=>section.id===sectionId?{...section,updatedAt:actual.sections.find(s=>s.id===sectionId)!.updatedAt}:section)});
}
function assertOriginalGuideCommandKey(response:Response,seen:Set<string>){
 const key=response.request().headers()['idempotency-key'];expect(key).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i);expect(seen.has(key)).toBe(false);seen.add(key);
}
function sectionAcknowledgement(page:Page,guideId:string,sectionId:string,command:SectionCommand){
 const work=page.waitForResponse(response=>{
  const url=new URL(response.url());if(url.origin!==origin||url.pathname!==`${base}/collections/${guideId}/guide/sections/${sectionId}`||response.request().method()!=='PATCH')return false;
  try{expect(response.request().postDataJSON()).toEqual(command);return true;}catch{return false;}
 });void work.catch(()=>undefined);return work;
}
function detailsAcknowledgement(page:Page,guideId:string,command:{revision:number;details:GuideAggregateDto['details']}){
 const work=page.waitForResponse(response=>{const url=new URL(response.url());if(url.origin!==origin||url.pathname!==`${base}/collections/${guideId}/guide`||response.request().method()!=='PUT')return false;try{expect(response.request().postDataJSON()).toEqual(command);return true;}catch{return false;}});void work.catch(()=>undefined);return work;
}
async function guideErrorEvidence(response:Response|APIResponse,status:number,code:string,message:string){
 expect(response.status()).toBe(status);const bytes=await response.body();expect(bytes.length).toBeLessThanOrEqual(65536);
 if('finished' in response)expect(await response.finished()).toBeNull();
 const value=JSON.parse(bytes.toString('utf8'));expect(Object.keys(value)).toEqual(['error']);expect(Object.keys(value.error).sort()).toEqual(['code','message','requestId']);
 expect(value.error.code).toBe(code);expect(value.error.message).toBe(message);expect(typeof value.error.requestId).toBe('string');expect(value.error.requestId.length).toBeGreaterThan(0);
 return {code:value.error.code as string,message:value.error.message as string};
}
async function openNativeTip(page:Page,placeName:string,text:string){
 await page.getByText('Tips',{exact:true}).click();const row=page.getByRole('heading',{level:4,name:placeName,exact:true}).locator('..');await expect(row).toHaveCount(1);await row.getByRole('button',{name:'Edit tip',exact:true}).click();
 const modal=page.getByRole('heading',{level:2,name:'Edit Tip',exact:true}).locator('../../../..');await expect(modal).toBeVisible();await modal.getByRole('textbox').fill(text);return modal;
}
function tipCommand(current:GuideAggregateDto,sectionId:string,text:string):SectionCommand{
 const section=current.sections.find(s=>s.id===sectionId)!;expect(section).toBeDefined();const blocks=structuredClone(section.blocks);blocks.timeline.morning[0].tips=text;
 return {revision:current.revision,title:section.title,description:section.description,blocks};
}

test(GUIDES_CASES[1],async({browser},info)=>{
 const harness=createGuidesHarnessClient();expect(info.repeatEachIndex).toBe(0);expect(GUIDES_PROJECTS).toContain(info.project.name);const manifest=await harness.start({caseId:GUIDES_CASES[1],project:info.project.name as typeof GUIDES_PROJECTS[number],repeat: 0});let owner:BrowserContext|undefined,completed=false;
 try{
  owner=await harness.createContext(browser,'ownerA',info.project.name==='guides-mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1365,height:900}});const page=await harness.trackProducer(()=>owner!.newPage());trackGuidesBootstrap(page,manifest.personas.ownerA);
  await harness.trackProducer(async()=>{
   const guide=manifest.guides.find(g=>g.key==='ownerA-guide-0')!;expect(guide).toBeDefined();await navigateGuides(page,`/recommendations/guides/${guide.id}`);let current=await aggregate(owner!.request,guide.id),observed:Observation=await harness.observe();expect(current.sections).toHaveLength(1);const sectionId=current.sections[0].id,keys=new Set<string>();
   expect(current.details).toEqual(guide.details);expect(current.sections[0].blocks).toEqual(manifest.sections.find(s=>s.id===sectionId)!.blocks);
   // The expected complete snapshot describes the permitted delta. The command
   // itself is always submitted by the retained editor using the original UI.
   const finishNative=async(response:Response,expected:GuideAggregateDto,target?:string)=>{
    assertOriginalGuideCommandKey(response,keys);const actual=guideAggregateDtoSchema.parse((await browserBody(response)).guide);assertEditorAggregate(expected,actual,target);const after:Observation=await harness.observe();assertEditorPersistedScope(observed,after,actual,target);observed=after;current=actual;
    await expect(page.getByRole('heading',{level:1,name:guide.title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Add Day/Stop',exact:true})).toBeVisible();await reloadGuides(page);await expect(page.getByRole('heading',{level:1,name:guide.title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Add Day/Stop',exact:true})).toBeVisible();expect(await aggregate(owner!.request,guide.id)).toEqual(actual);expect(await harness.observe()).toEqual(after);
   };
   // Full day/stop editor: title and rich editor description change while every
   // canonical block, precise money value, zero coordinate and identity persists.
   await sectionOrder(page,guide.title,current.sections.map(s=>s.title));
   const title='दिन café — संपादित',description='सुबह की सैर — café और भोजन',row=page.getByRole('heading',{level:3,name:current.sections[0].title,exact:true}).locator('../../..');await expect(row).toHaveCount(1);await row.getByRole('button').first().click();await row.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.getByRole('heading',{level:1,name:'Edit Day/Stop',exact:true})).toBeVisible();await page.getByPlaceholder('e.g., Day 1: Arrival & City Exploration',{exact:true}).fill(title);await page.locator('.ql-editor[contenteditable="true"]').fill(description);
   let expected=structuredClone(current);expected.sections[0].title=title;expected.sections[0].description=description;let ack=sectionAcknowledgement(page,guide.id,sectionId,{revision:current.revision,title,description,blocks:expected.sections[0].blocks});await page.getByRole('button',{name:'Update',exact:true}).click();await finishNative(await ack,expected,sectionId);
   // Existing Activities, packing tasks, map and tags are complete independent
   // blocks even when this editor shows only the changed title and description.
   await page.getByText('Transport',{exact:true}).click();await page.getByRole('heading',{level:3,name:title,exact:true}).click();const mode=page.getByRole('button',{name:'Walk',exact:true});await expect(mode).toHaveAttribute('title','Click to change travel mode');await mode.click();expected=structuredClone(current);expected.sections[0].blocks.transport.segments[0].mode='drive';ack=sectionAcknowledgement(page,guide.id,sectionId,{revision:current.revision,title,description,blocks:expected.sections[0].blocks});await page.locator('.travel-mode-selector').getByRole('button',{name:/^Drive/}).click();await finishNative(await ack,expected,sectionId);
   // Saving the existing accommodation through its native editor proves opaque
   // money/provenance/photo fields survive a replacement, including (0,0).
   await page.getByText('Stay',{exact:true}).click();await page.getByRole('heading',{level:3,name:title,exact:true}).click();await page.getByRole('button',{name:'Edit accommodation',exact:true}).click();const stayModal=page.getByRole('heading',{level:2,name:'Edit Accommodation',exact:true}).locator('../../../..');await expect(stayModal).toContainText(`Selected: ${current.sections[0].blocks.stay.accommodations[0].name}`);expected=structuredClone(current);ack=sectionAcknowledgement(page,guide.id,sectionId,{revision:current.revision,title,description,blocks:expected.sections[0].blocks});await stayModal.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit Accommodation',exact:true})).toHaveCount(0);await finishNative(await ack,expected,sectionId);
   await page.getByText('Budget',{exact:true}).click();const budgetRow=page.getByRole('row').filter({has:page.getByText(current.sections[0].blocks.budget.morning[0].name,{exact:true})});await expect(budgetRow).toHaveCount(1);await budgetRow.getByRole('button',{name:'Edit budget',exact:true}).click();const budgetModal=page.getByRole('heading',{level:3,name:'Edit Budget',exact:true}).locator('../../..');await budgetModal.locator('#currency-amount-input').fill('321.45');expected=structuredClone(current);Object.assign(expected.sections[0].blocks.budget.morning[0],{budgetAmount:'321.45',budgetCurrency:'INR',customBudget:null});ack=sectionAcknowledgement(page,guide.id,sectionId,{revision:current.revision,title,description,blocks:expected.sections[0].blocks});await budgetModal.getByRole('button',{name:'Save Budget',exact:true}).click();await finishNative(await ack,expected,sectionId);
   const tip='सुबह जल्दी आएँ — café ₹100.00',tipModal=await openNativeTip(page,current.sections[0].blocks.timeline.morning[0].name,tip);expected=structuredClone(current);expected.sections[0].blocks.timeline.morning[0].tips=tip;ack=sectionAcknowledgement(page,guide.id,sectionId,{revision:current.revision,title,description,blocks:expected.sections[0].blocks});await tipModal.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit Tip',exact:true})).toHaveCount(0);await finishNative(await ack,expected,sectionId);
   await page.getByText('Tips',{exact:true}).click();await page.getByRole('button',{name:'Edit guides and packaging tips',exact:true}).click();const general=page.getByRole('heading',{level:2,name:'Edit General Guides and Packaging Tips',exact:true}).locator('../../../..'),richText='यात्रा के लिए café — पानी साथ रखें',rich=general.locator('.ql-editor[contenteditable="true"]');await rich.fill(richText);await rich.press('ControlOrMeta+A');await general.locator('button.ql-bold').click();await expect(rich.locator('strong')).toHaveText(richText);await general.getByPlaceholder('e.g., adventure, family-friendly, budget',{exact:true}).fill('संस्मरण');await general.getByRole('button',{name:'Add',exact:true}).click();expected=structuredClone(current);expected.details.tipsNotes=[{type:'paragraph',children:[{type:'text',text:richText,bold:true}]}];expected.details.tags.push('संस्मरण');let detailsAck=detailsAcknowledgement(page,guide.id,{revision:current.revision,details:expected.details});await general.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit General Guides and Packaging Tips',exact:true})).toHaveCount(0);await finishNative(await detailsAck,expected);await page.getByText('Tips',{exact:true}).click();await expect(page.getByText(richText,{exact:true})).toBeVisible();await expect(page.getByText('संस्मरण',{exact:true})).toBeVisible();
   // Explicit canonical fixture prerequisite: the single-city seed cannot show
   // the retained Journey Route editor. These authored route snapshots describe
   // source setup; they do not claim a real provider lookup or native selection.
   const stop=(Place_Id:string,Place_Name:string)=>({Place_Id,Place_Name,Place_Address:'भारत',Geometry:{lat:0,lng:0}});expected=guideAggregateDtoSchema.parse({...current,details:{...current.details,multiCity:true,place:{isMultiCity:true,starting:stop('route-start','कोलकाता'),ending:stop('route-end','दिल्ली'),intermediateCities:[{...stop('route-middle','वाराणसी café'),id:'route-middle',hasDate:false}]}}});
   const prepared=await consume(await owner!.request.put(`${base}/collections/${guide.id}/guide`,{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:{revision:current.revision,details:expected.details}}),async response=>{expect(response.status()).toBe(200);return guideAggregateDtoSchema.parse((await response.json()).guide);});assertEditorAggregate(expected,prepared);const preparedRows:Observation=await harness.observe();assertEditorPersistedScope(observed,preparedRows,prepared);observed=preparedRows;current=prepared;await reloadGuides(page);expect(await aggregate(owner!.request,guide.id)).toEqual(prepared);
   await page.getByRole('button',{name:'Edit Journey Route',exact:true}).click();const journey=page.getByRole('heading',{level:2,name:'Edit Journey Route',exact:true}).locator('../../../..'),middle=journey.getByText('वाराणसी café',{exact:true}).locator('../../..');await expect(middle).toHaveCount(1);await middle.getByRole('button').last().click();await middle.getByRole('button',{name:'Set date',exact:true}).click();await journey.locator('input[type="date"]').fill('2026-10-12');expected=structuredClone(current);if(!('isMultiCity' in expected.details.place))throw Error('Journey fixture missing');expected.details.place.intermediateCities[0].hasDate=true;expected.details.place.intermediateCities[0].date='2026-10-12';detailsAck=detailsAcknowledgement(page,guide.id,{revision:current.revision,details:expected.details});await journey.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page.getByRole('heading',{name:'Edit Journey Route',exact:true})).toHaveCount(0);await finishNative(await detailsAck,expected);await page.getByRole('button',{name:'Edit Journey Route',exact:true}).click();await expect(page.locator('input[type="date"]')).toHaveValue('2026-10-12');await page.getByRole('heading',{name:'Edit Journey Route',exact:true}).locator('../../../..').getByRole('button',{name:'Cancel',exact:true}).click();expect(keys.size).toBe(7);
  });await settleGuidesBootstrap(page);await harness.closeContext(owner);owner=undefined;await harness.retire();completed=true;
 }finally{if(!completed){const closed=await Promise.allSettled([owner].filter((c):c is BrowserContext=>!!c).map(c=>harness.closeContext(c)));await harness.fail();if(closed.some(r=>r.status==='rejected'))throw Error('Guides source case containment failed');}}
});

test(GUIDES_CASES[2],async({browser},info)=>{
 const harness=createGuidesHarnessClient();expect(info.repeatEachIndex).toBe(0);expect(GUIDES_PROJECTS).toContain(info.project.name);
 const manifest=await harness.start({caseId:GUIDES_CASES[2],project:info.project.name as typeof GUIDES_PROJECTS[number],repeat: 0});let first:BrowserContext|undefined,second:BrowserContext|undefined,completed=false;
 try{
  const viewport=info.project.name==='guides-mobile'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1365,height:900}};
  first=await harness.createContext(browser,'ownerA',viewport);second=await harness.createContext(browser,'ownerA',viewport);
  const page=await harness.trackProducer(()=>first!.newPage()),other=await harness.trackProducer(()=>second!.newPage());trackGuidesBootstrap(page,manifest.personas.ownerA);trackGuidesBootstrap(other,manifest.personas.ownerA);
  await harness.trackProducer(async()=>{
   const guide=manifest.guides.find(g=>g.key==='ownerA-guide-0')!,sibling=manifest.guides.find(g=>g.key==='ownerA-guide-1')!,foreign=manifest.guides.find(g=>g.key==='ownerB-guide-0')!;expect(guide).toBeDefined();expect(sibling).toBeDefined();expect(foreign).toBeDefined();
   await navigateGuides(page,`/recommendations/guides/${guide.id}`);await navigateGuides(other,`/recommendations/guides/${guide.id}`);const initial=await aggregate(first!.request,guide.id);expect(initial.sections).toHaveLength(1);const section=initial.sections[0],draft='सुबह café — retained stale draft',winner='दूसरा लेखक — café';
   const modal=await openNativeTip(page,section.blocks.timeline.morning[0].name,draft),otherModal=await openNativeTip(other,section.blocks.timeline.morning[0].name,winner);
   const winnerAck=sectionAcknowledgement(other,guide.id,section.id,tipCommand(initial,section.id,winner));await otherModal.getByRole('button',{name:'Save Changes',exact:true}).click();const changed=guideAggregateDtoSchema.parse((await browserBody(await winnerAck)).guide);await expect(other.getByRole('heading',{name:'Edit Tip',exact:true})).toHaveCount(0);expect(changed.revision).toBeGreaterThan(initial.revision);
   expect(changed).toEqual({...initial,revision:changed.revision,sections:[{...section,blocks:tipCommand(initial,section.id,winner).blocks,updatedAt:changed.sections[0].updatedAt}]});await expect(other.getByRole('heading',{level:1,name:guide.title,exact:true})).toBeVisible();await expect(other.getByRole('button',{name:'+ Add Day/Stop',exact:true})).toBeVisible();
   const beforeConflict:Observation=await harness.observe(),staleAck=sectionAcknowledgement(page,guide.id,section.id,tipCommand(initial,section.id,draft));await modal.getByRole('button',{name:'Save Changes',exact:true}).click();await guideErrorEvidence(await staleAck,409,'CONFLICT','Guide changed; reload and retry');
   await expect(modal).toBeVisible();await expect(modal.getByRole('textbox')).toHaveValue(draft);await expect(page.getByText('Guide changed; reload and retry',{exact:true})).toBeVisible();expect(await aggregate(first!.request,guide.id)).toEqual(changed);expect(await harness.observe()).toEqual(beforeConflict);
   // Explicit user recovery: cancel the retained draft, reload, reopen, and submit
   // the same original intent against the newly observed aggregate.
   await modal.getByRole('button',{name:'Cancel',exact:true}).click();await reloadGuides(page);const recovered=await openNativeTip(page,section.blocks.timeline.morning[0].name,draft),fresh=await aggregate(first!.request,guide.id);expect(fresh).toEqual(changed);
   const retryAck=sectionAcknowledgement(page,guide.id,section.id,tipCommand(fresh,section.id,draft));await recovered.getByRole('button',{name:'Save Changes',exact:true}).click();const saved=guideAggregateDtoSchema.parse((await browserBody(await retryAck)).guide);expect(saved).toEqual({...fresh,revision:saved.revision,sections:[{...fresh.sections[0],blocks:tipCommand(fresh,section.id,draft).blocks,updatedAt:saved.sections[0].updatedAt}]});expect(saved.revision).toBeGreaterThan(fresh.revision);await expect(page.getByRole('heading',{name:'Edit Tip',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{level:1,name:guide.title,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Add Day/Stop',exact:true})).toBeVisible();await reloadGuides(page);expect(await aggregate(first!.request,guide.id)).toEqual(saved);
   // Canonical authorization probes have no corresponding native UI: wrong
   // guide section, foreign guide owner, and missing section are indistinguishable.
   const unchanged:Observation=await harness.observe(),command=tipCommand(saved,section.id,draft),siblingSection=manifest.sections.find(s=>s.collectionId===sibling.id)!;
   for(const [id,sectionId] of [[guide.id,siblingSection.id],[foreign.id,section.id],[guide.id,randomUUID()]])await consume(await first!.request.patch(`${base}/collections/${id}/guide/sections/${sectionId}`,{headers:{Origin:origin,'Idempotency-Key':randomUUID()},data:command}),r=>guideErrorEvidence(r,404,'NOT_FOUND','Resource unavailable'));
   expect(await harness.observe()).toEqual(unchanged);
  });
  await settleGuidesBootstrap(page);await settleGuidesBootstrap(other);await harness.closeContext(first);first=undefined;await harness.closeContext(second);second=undefined;await harness.retire();completed=true;
 }finally{if(!completed){const closed=await Promise.allSettled([first,second].filter((c):c is BrowserContext=>!!c).map(c=>harness.closeContext(c)));await harness.fail();if(closed.some(r=>r.status==='rejected'))throw Error('Guides source case containment failed');}}
});


type GuideFilter={guideType?:string;category?:string;days?:number;budget?:string;month?:string;location?:string;multiCity?:boolean};
type FilterGuide={id:string;title:string;details:GuideAggregateDto['details']};
function guideFilterIds(guides:readonly FilterGuide[],filter:GuideFilter){return guides.filter(({details:d})=>(!filter.guideType||d.guideType===filter.guideType)&&(!filter.category||d.categories.includes(filter.category))&&(!filter.days||d.numberOfDays===filter.days)&&(!filter.budget||d.budgetType===filter.budget)&&(!filter.month||d.bestTimeToVisit.includes(filter.month))&&(!filter.location||('name' in d.place&&d.place.name===filter.location))&&(!filter.multiCity||d.multiCity)).map(g=>g.id);}
function assertGuidePage(actual:string[],expected:readonly string[],offset:number,limit:number){expect(actual).toEqual(expected.slice(offset,offset+limit));expect(new Set(actual).size).toBe(actual.length);}

type GuideRead={url:URL;body:unknown};
// Own original requests from request start through body, finished response and
// terminal request event. No synthetic transport or cached application object.
function trackGuideReads(page:Page,predicate:(url:URL)=>boolean){
 const pending=new Map<Request,{terminal:Promise<void>;finish:()=>void;fail:()=>void}>(),works:Promise<GuideRead>[]=[];let failure:Error|undefined;
 const started=(request:Request)=>{const url=new URL(request.url());if(request.method()!=='GET'||url.origin!==origin||!predicate(url))return;let finish!:()=>void,fail!:()=>void;const terminal=new Promise<void>((resolve,reject)=>{finish=resolve;fail=()=>reject(Error('Guides original read failed'));});void terminal.catch(()=>undefined);pending.set(request,{terminal,finish,fail});};
 const responded=(response:Response)=>{const entry=pending.get(response.request());if(!entry)return;const work=(async()=>{expect(response.status()).toBe(200);const bytes=await response.body();expect(bytes.length).toBeLessThanOrEqual(4*1024*1024);expect(await response.finished()).toBeNull();await entry.terminal;return {url:new URL(response.url()),body:JSON.parse(bytes.toString('utf8')) as unknown};})();void work.catch(error=>{failure=error;});works.push(work);};
 const finished=(request:Request)=>pending.get(request)?.finish(),failed=(request:Request)=>pending.get(request)?.fail();page.on('request',started);page.on('response',responded);page.on('requestfinished',finished);page.on('requestfailed',failed);
 return {async reads(){if(failure)throw failure;return Promise.all(works);},async close(){try{await Promise.all(works);if(failure)throw failure;expect(works.length).toBe(pending.size);}finally{page.off('request',started);page.off('response',responded);page.off('requestfinished',finished);page.off('requestfailed',failed);}}};
}
function assertOwnerSectionReads(reads:GuideRead[],id:string,sections:readonly {id:string;displayOrder:number}[]){
 const pages=reads.filter(r=>r.url.pathname===`${base}/collections/${id}/guide`);expect(pages).toHaveLength(3);let revision:number|undefined;
 for(const [index,row] of pages.entries()){expect(row.url.searchParams.get('after')).toBe(index===0?null:String(index*20-1));expect(row.url.searchParams.get('limit')).toBeNull();const guide=guideAggregateDtoSchema.parse((row.body as {guide:unknown}).guide);expect(guide.collectionId).toBe(id);expect(guide.sectionCount).toBe(53);if(revision===undefined)revision=guide.revision;expect(guide.revision).toBe(revision);assertGuidePage(guide.sections.map(s=>s.id),sections.map(s=>s.id),index*20,20);expect(guide.sections.map(s=>s.displayOrder)).toEqual(sections.slice(index*20,index*20+20).map(s=>s.displayOrder));expect(guide.nextCursor).toBe(index<2?String(index*20+19):null);}
}
function assertOwnerCategoryReads(reads:GuideRead[],guides:readonly {id:string}[]){
 const snapshots=reads.filter(r=>r.url.pathname===`${base}/categories/guides/content-snapshot`);expect(snapshots).toHaveLength(2);const fences=snapshots.map(row=>ownerSnapshotSchema.parse(row.body));expect(fences[1].revision).toBe(fences[0].revision);expect(fences[1].pinRevision).toBe(fences[0].pinRevision);for(const snapshot of fences){
 const validation=reads.filter(r=>r.url.pathname===`${base}/categories/guides/content-snapshot/validate`&&r.url.searchParams.get('snapshotToken')===snapshot.snapshotToken);expect(validation).toHaveLength(1);expect(validation[0].url.searchParams.get('snapshotToken')).toBe(snapshot.snapshotToken);expect(ownerSnapshotSchema.parse(validation[0].body)).toEqual(snapshot);
 for(const [path,schema] of [[`${base}/collections`,ownerCollectionPageSchema],[`${base}/recommendations`,ownerRecommendationPageSchema],[`${base}/categories/guides/memberships`,ownerMembershipPageSchema]] as const){const pages=reads.filter(r=>r.url.pathname===path&&r.url.searchParams.get('snapshotToken')===snapshot.snapshotToken);expect(pages.length).toBeGreaterThan(0);let cursor:string|null=null;const ids:string[]=[];for(const row of pages){expect(row.url.searchParams.get('cursor')).toBe(cursor);expect(row.url.searchParams.get('limit')).toBe('24');const page=schema.parse(row.body);expect(page.snapshot).toBe(snapshot.revision);expect(page.snapshotToken).toBe(snapshot.snapshotToken);expect(page.expiresAt).toBe(snapshot.expiresAt);if(path===`${base}/collections`){const collectionPage=ownerCollectionPageSchema.parse(row.body);assertGuidePage(collectionPage.items.map(g=>g.id),guides.map(g=>g.id),ids.length,24);ids.push(...collectionPage.items.map(g=>g.id));}else expect(page.items).toEqual([]);cursor=page.nextCursor;}expect(cursor).toBeNull();if(path===`${base}/collections`){expect(pages.map(p=>ownerCollectionPageSchema.parse(p.body).items.length)).toEqual([24,24,6]);expect(ids).toEqual(guides.map(g=>g.id));}}}
}
const compatibilityGuidePage=z.object({guides:z.array(z.object({documentId:z.string().uuid(),guide_sections:z.array(z.object({documentId:z.string().uuid(),Sequence:z.number().int()}).passthrough()),Guide_Section_Details:z.array(z.object({documentId:z.string().uuid(),Sequence:z.number().int()}).passthrough()),guide_sections_next_cursor:z.string().nullable()}).passthrough())}).strict();
function assertPublicGuideReads(reads:GuideRead[],path:string,ids:readonly string[],detailId?:string){const pages=reads.filter(r=>r.url.pathname===path);expect(pages).toHaveLength(5);for(const [index,row] of pages.entries()){expect(row.url.searchParams.get('cursor')).toBe(index===0?null:`o${index*12}`);expect(row.url.searchParams.get('limit')).toBe(index===0?null:'12');const body=compatibilityGuidePage.parse(row.body);if(detailId){expect(body.guides).toHaveLength(1);const guide=body.guides[0];expect(guide.documentId).toBe(detailId);assertGuidePage(guide.guide_sections.map(s=>s.documentId),ids,index*12,12);expect(guide.Guide_Section_Details.map(s=>s.documentId)).toEqual(guide.guide_sections.map(s=>s.documentId));expect(guide.guide_sections.map(s=>s.Sequence)).toEqual(guide.guide_sections.map((_,i)=>index*12+i+1));expect(guide.guide_sections_next_cursor).toBe(index<4?`o${(index+1)*12}`:null);}else{assertGuidePage(body.guides.map(g=>g.documentId),ids,index*12,12);for(const guide of body.guides){expect(guide.guide_sections).toEqual([]);expect(guide.guide_sections_next_cursor).toBeNull();}}}}
async function nativeGuideContinuation(page:Page,label:'guides'|'days',complete:()=>Promise<boolean>,progress:()=>Promise<number>){for(let advance=0;advance<6;advance++){if(await complete())break;const before=await progress();const button=page.getByRole('button',{name:`Load more ${label}`,exact:true}).filter({visible:true}).first();await expect(button).toBeVisible();await button.scrollIntoViewIfNeeded();if(await button.isVisible()&&await button.isEnabled())await button.click();await expect.poll(async()=>await complete()||await progress()>before).toBe(true);}expect(await complete()).toBe(true);await expect(page.getByRole('button',{name:`Load more ${label}`,exact:true})).toHaveCount(0);}
async function guideCardOrder(page:Page,guides:readonly FilterGuide[],ids:string[]){const headings=page.getByRole('heading',{level:3}).filter({hasText:/^यात्रा \d+$/});await expect(headings).toHaveText(ids.map(id=>guides.find(g=>g.id===id)!.title));}
async function openGuideFilters(page:Page,isOwner:boolean,mobile:boolean){if(await page.locator('label').filter({hasText:'Guide Type'}).filter({visible:true}).count())return;if(isOwner&&mobile){const actions=page.locator('div.md\\:hidden').filter({has:page.getByRole('button',{name:'Create Guide',exact:true})});await expect(actions).toHaveCount(1);await actions.locator(':scope > button').click();}else await page.getByRole('button',{name:'Filters',exact:true}).filter({visible:true}).click();}
async function setGuideFilters(page:Page,filter:GuideFilter,isOwner:boolean,mobile:boolean){for(const [name,value] of [['Guide Type',filter.guideType],['Category',filter.category],[isOwner?'Number of Days':'Duration',filter.days?.toString()],[isOwner?'Budget Type':'Budget',filter.budget],['Best Time to Visit',filter.month]] as const){if(value!==undefined){const label=page.locator('label').filter({hasText:name}).filter({visible:true});await expect(label).toHaveCount(1);await label.locator('..').locator('select').selectOption(value);}}if(filter.multiCity)await page.getByText('All Guides',{exact:true}).filter({visible:true}).locator('..').locator('label').click();if(mobile)await page.getByRole('button',{name:'Apply Filters',exact:true}).click();if(filter.location)await page.getByRole('button',{name:filter.location,exact:true}).filter({visible:true}).click();}
async function clearGuideFilters(page:Page,isOwner:boolean,mobile:boolean){if(mobile)await openGuideFilters(page,isOwner,mobile);await page.getByRole('button',{name:isOwner&&!mobile?'Clear Filters':'Clear All Filters',exact:true}).filter({visible:true}).click();if(mobile)await page.getByRole('button',{name:'Apply Filters',exact:true}).click();}

test(GUIDES_CASES[4],async({browser},info)=>{
 const harness=createGuidesHarnessClient();expect(info.repeatEachIndex).toBe(0);expect(GUIDES_PROJECTS).toContain(info.project.name);const manifest=await harness.start({caseId:GUIDES_CASES[4],project:info.project.name as typeof GUIDES_PROJECTS[number],repeat: 0});let owner:BrowserContext|undefined,guest:BrowserContext|undefined,completed=false;
 try{
  const mobile=info.project.name==='guides-mobile',viewport=mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1365,height:900}};owner=await harness.createContext(browser,'ownerA',viewport);guest=await harness.createContext(browser,'ownerC',viewport);await harness.trackProducer(()=>guest!.clearCookies());const page=await harness.trackProducer(()=>owner!.newPage()),publicList=await harness.trackProducer(()=>guest!.newPage()),publicDetail=await harness.trackProducer(()=>guest!.newPage());trackGuidesBootstrap(page,manifest.personas.ownerA);
  await harness.trackProducer(async()=>{
   const baseline:Observation=await harness.observe(),guides=manifest.guides.filter(g=>g.accountId===manifest.personas.ownerA.accountId).sort((a,b)=>a.displayOrder-b.displayOrder),publicGuides=guides.filter(g=>g.visibility==='public'),selected=guides[0],sections=manifest.sections.filter(s=>s.collectionId===selected.id).sort((a,b)=>a.displayOrder-b.displayOrder);expect(guides).toHaveLength(54);expect(publicGuides).toHaveLength(53);expect(sections).toHaveLength(53);expect(baseline.guides.filter(g=>g.accountId===manifest.personas.ownerA.accountId).map(g=>g.id).sort()).toEqual(guides.map(g=>g.id).sort());expect(baseline.sections.filter(s=>s.collectionId===selected.id).sort((a,b)=>a.displayOrder-b.displayOrder).map(s=>s.id)).toEqual(sections.map(s=>s.id));
   const ownerReads=trackGuideReads(page,url=>url.pathname.startsWith(`${base}/`));await navigateGuides(page,'/recommendations/guides');await guideCardOrder(page,guides,guides.map(g=>g.id));assertOwnerCategoryReads(await ownerReads.reads(),guides);assertOwnerSectionReads(await ownerReads.reads(),selected.id,sections);await ownerReads.close();
   const ownerDetail=trackGuideReads(page,url=>url.pathname===`${base}/collections/${selected.id}/guide`);await navigateGuides(page,`/recommendations/guides/${selected.id}`);await sectionOrder(page,selected.title,sections.map(s=>s.title));assertOwnerSectionReads(await ownerDetail.reads(),selected.id,sections);await ownerDetail.close();const reloaded=trackGuideReads(page,url=>url.pathname===`${base}/collections/${selected.id}/guide`);await reloadGuides(page);await sectionOrder(page,selected.title,sections.map(s=>s.title));assertOwnerSectionReads(await reloaded.reads(),selected.id,sections);await reloaded.close();
   // Explicit canonical pages use the same current aggregate revision. Owner
   // section size20 and category size24 are independent contracts.
   let revision:number|undefined;for(const [index,after] of [undefined,19,39].entries())await consume(await owner!.request.get(`${base}/collections/${selected.id}/guide${after===undefined?'':`?after=${after}`}`),async response=>{expect(response.status()).toBe(200);const guide=guideAggregateDtoSchema.parse((await response.json()).guide);expect(guide.collectionId).toBe(selected.id);expect(guide.sectionCount).toBe(53);revision??=guide.revision;expect(guide.revision).toBe(revision);assertGuidePage(guide.sections.map(s=>s.id),sections.map(s=>s.id),index*20,20);expect(guide.nextCursor).toBe(index<2?String(index*20+19):null);});await consume(await owner!.request.get(`${base}/collections/${selected.id}/guide?limit=24`),response=>guideErrorEvidence(response,422,'INVALID_INPUT','Invalid section page size'));
   const categoryPath=`${base}/profiles/${manifest.personas.ownerA.handle}/recommendations/guides`,detailPath=`${categoryPath}/${selected.slug}`;
   for(const [index,offset] of [0,24,48].entries())await consume(await guest!.request.get(`${categoryPath}?limit=24${offset?`&cursor=o${offset}`:''}`),async response=>{expect(response.status()).toBe(200);const body=compatibilityGuidePage.parse(await response.json());assertGuidePage(body.guides.map(g=>g.documentId),publicGuides.map(g=>g.id),index*24,24);});
   for(const offset of [0,12,24,36,48])await consume(await guest!.request.get(`${detailPath}?limit=24${offset?`&cursor=o${offset}`:''}`),async response=>{expect(response.status()).toBe(200);const body=compatibilityGuidePage.parse(await response.json());expect(body.guides).toHaveLength(1);expect(body.guides[0].documentId).toBe(selected.id);assertGuidePage(body.guides[0].guide_sections.map(s=>s.documentId),sections.map(s=>s.id),offset,12);expect(body.guides[0].guide_sections_next_cursor).toBe(offset<48?`o${offset+12}`:null);});
   const detailReads=trackGuideReads(publicDetail,url=>url.pathname===detailPath);await publicDetail.goto(`/${manifest.personas.ownerA.handle}/guides/${selected.slug}`);await nativeGuideContinuation(publicDetail,'days',async()=>await publicDetail.getByRole('button',{name:'Day 53',exact:true}).count()===1,async()=>await publicDetail.getByRole('button',{name:/^Day \d+$/}).count());await expect(publicDetail.getByRole('button',{name:/^Day \d+$/})).toHaveText(sections.map((_,i)=>`Day ${i+1}`));assertPublicGuideReads(await detailReads.reads(),detailPath,sections.map(s=>s.id),selected.id);await detailReads.close();
   // Filter during continuation: itinerary has18 eligible guides spread over
   // five transport pages. The native continuation remains visible even while
   // only a positive subset of the loaded rows is rendered.
   const categoryReads=trackGuideReads(publicList,url=>url.pathname===categoryPath);await publicList.goto(`/${manifest.personas.ownerA.handle}/guides`);await expect(publicList.getByRole('heading',{level:3,name:publicGuides[0].title,exact:true})).toBeVisible();await openGuideFilters(publicList,false,mobile);await setGuideFilters(publicList,{guideType:'itinerary'},false,mobile);await nativeGuideContinuation(publicList,'guides',async()=>compatibilityGuidePage.parse((await categoryReads.reads()).at(-1)?.body??{guides:[]}).guides.some(g=>g.documentId===publicGuides.at(-1)!.id),async()=>(await categoryReads.reads()).length);assertPublicGuideReads(await categoryReads.reads(),categoryPath,publicGuides.map(g=>g.id));await guideCardOrder(publicList,publicGuides,guideFilterIds(publicGuides,{guideType:'itinerary'}));await categoryReads.close();await clearGuideFilters(publicList,false,mobile);await guideCardOrder(publicList,publicGuides,publicGuides.map(g=>g.id));
   await navigateGuides(page,'/recommendations/guides');await guideCardOrder(page,guides,guides.map(g=>g.id));
   const filters:GuideFilter[]=[{guideType:'itinerary'},{category:'culture'},{days:3},{budget:'per-person'},{location:'कोलकाता'},{guideType:'itinerary',category:'culture',days:3,budget:'per-person',location:'कोलकाता'}];for(const isOwner of [true,false]){const target=isOwner?page:publicList,rows=isOwner?guides:publicGuides;for(const filter of [...filters,...(isOwner?[{month:'अक्टूबर'}]:[]),{multiCity:true}]){await openGuideFilters(target,isOwner,mobile);const applied=isOwner&&filter.guideType&&filter.category?{...filter,month:'अक्टूबर'}:filter;await setGuideFilters(target,applied,isOwner,mobile);const ids=guideFilterIds(rows,applied);if(!filter.multiCity)expect(ids.length).toBeGreaterThan(0);else expect(ids).toEqual([]);expect(ids.length).toBeLessThan(rows.length);await guideCardOrder(target,rows,ids);await clearGuideFilters(target,isOwner,mobile);await guideCardOrder(target,rows,rows.map(g=>g.id));}}
   expect(await harness.observe()).toEqual(baseline);
  });await settleGuidesBootstrap(page);await harness.closeContext(owner);owner=undefined;await harness.closeContext(guest);guest=undefined;await harness.retire();completed=true;
 }finally{if(!completed){const closed=await Promise.allSettled([owner,guest].filter((c):c is BrowserContext=>!!c).map(c=>harness.closeContext(c)));await harness.fail();if(closed.some(r=>r.status==='rejected'))throw Error('Guides source case containment failed');}}
});
