import {randomUUID} from 'node:crypto';
import {test,expect,type APIRequestContext,type APIResponse,type Page,type Response,type BrowserContext,type Request} from '@playwright/test';
import {z} from 'zod/v3';
import {GUIDES_CASES,GUIDES_PROJECTS,guidesObservationRowSchemas} from '../../../tunes/scripts/guides-browser-support';
import {guideAggregateDtoSchema,type GuideAggregateDto} from '../../../tunes/shared/explorersGuideContract';
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

