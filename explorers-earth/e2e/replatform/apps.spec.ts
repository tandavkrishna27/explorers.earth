import {openSync,closeSync,readSync,fstatSync,lstatSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,sep,dirname,join,resolve,parse} from 'node:path';
import {createHash} from 'node:crypto';
import type {APIRequestContext, APIResponse, Page, TestInfo, Locator, BrowserContext, Response, Route, Request} from '@playwright/test';
import {z} from 'zod/v3';
import {test,expect,base,origin,lane,accounts,command} from './fixtures';
import {
 editableOwnerCollectionSchema,editableOwnerRecommendationSchema,ownerSnapshotSchema,
 ownerCollectionPageSchema,ownerRecommendationPageSchema,ownerMembershipPageSchema,ownerTopPickPageSchema,ownerMembershipDtoSchema,
} from '../../../tunes/shared/explorersOwnerContentContract';
import {recommendationCoreDtoSchema,collectionCoreDtoSchema} from '../../../tunes/shared/explorersContract';
import {richNoteSchema} from '../../../tunes/shared/explorersRichNoteContract';

// Source-only Apps lane. The coordinator must supply this fixed reset contract and
// register the eight project/title identities before this file is runnable.
const titles=[
 'Apps manual: list and complete typed recommendation create edit archive and reload',
 'Apps manual: ordered owned screenshots replacement and visibility enforce real bytes',
 'Apps manual: Keep Draft Publish and ancestor withdrawal preserve public state',
 'Apps manual: category top picks save reorder unpin and limit survive reload',
] as const;
const uuid=z.string().uuid();
const label=z.string().min(1).max(200),pathText=z.string().min(1).max(1024),sha=z.string().regex(/^[a-f0-9]{64}$/);
const fileLength=z.number().int().min(8).max(5*1024*1024);
const persona=z.object({userId:z.string().min(1).max(128),accountId:uuid,handle:z.string().min(1).max(64),cookie:z.string().min(3).max(4096)}).strict();
const identity={version:z.literal(1),runId:z.string().regex(/^[a-f0-9]{32}$/),commit:z.string().regex(/^[a-f0-9]{40}$/),
 caseId:z.enum(titles),project:z.enum(['apps-desktop','apps-mobile']),repeat:z.literal(0)};
const manifestSchema=z.object({...identity,personas:z.object({ownerA:persona,ownerB:persona}).strict(),
 collections:z.array(z.object({id:uuid,title:label,slug:z.string().min(1).max(200)}).strict()).max(2),
 recommendations:z.array(z.object({id:uuid,entityId:uuid,collectionId:uuid,title:label,developer:label}).strict()).max(16),
 memberships:z.array(z.object({recommendationId:uuid,collectionId:uuid}).strict()).max(16),
 media:z.array(z.object({id:uuid,owner:z.enum(['ownerA','ownerB']),length:fileLength,sha256:sha}).strict()).max(3),
 uploadFiles:z.array(z.object({path:pathText,name:z.string().max(100).regex(/^[a-z0-9-]+\.png$/),length:fileLength,sha256:sha}).strict()).max(2),
}).strict();
type Manifest=z.infer<typeof manifestSchema>;
function regularBytes(path:string,ceiling:number){
 if(!isAbsolute(path)||path.length>1024)throw Error('Apps fixture file custody invalid');
 const before=lstatSync(path);if(before.isSymbolicLink()||!before.isFile()||before.size>ceiling)throw Error('Apps fixture file custody invalid');
 const fd=openSync(path,'r');try{const current=fstatSync(fd);if(!current.isFile()||current.size!==before.size||current.ino!==before.ino||current.dev!==before.dev)throw Error('Apps fixture file custody changed');
  const bytes=Buffer.alloc(current.size+1);let count=0;while(count<bytes.length){const read=readSync(fd,bytes,count,bytes.length-count,null);if(read===0)break;count+=read;}if(count!==current.size)throw Error('Apps fixture file size changed');return bytes.subarray(0,count);
 }finally{closeSync(fd);}
}
// Coordinator must also bound/protect the shared descriptor before module loading:
// fixtures.ts reads it before this Apps-specific finite validation runs.
const descriptor=z.object({origin:z.literal(origin),controlCapability:sha,personas:z.unknown(),fixtureFilesRoot:pathText,
 version:z.literal(1),runId:identity.runId,commit:identity.commit}).passthrough()
 .parse(JSON.parse(regularBytes(process.env.REPLATFORM_E2E_FIXTURE_PATH!,65536).toString('utf8')));
const fixturePath=resolve(process.env.REPLATFORM_E2E_FIXTURE_PATH!);
const expectedRoot=join(dirname(fixturePath),'apps-fixture-files');
function canonicalAncestors(path:string){let current=resolve(path);for(;;){if(lstatSync(current).isSymbolicLink()||realpathSync(current).toLowerCase()!==current.toLowerCase())throw Error('Apps fixture ancestor invalid');const parent=dirname(current);if(parent===current||current===parse(current).root)break;current=parent;}}
canonicalAncestors(dirname(fixturePath));canonicalAncestors(expectedRoot);
const fixtureRoot=realpathSync(expectedRoot);if(resolve(descriptor.fixtureFilesRoot).toLowerCase()!==expectedRoot.toLowerCase()||!lstatSync(fixtureRoot).isDirectory())throw Error('Apps fixture root invalid');
if(lane!=='apps')throw Error('Apps lane required');
const observationSchema=z.object({...identity,collections:z.array(editableOwnerCollectionSchema).max(4),recommendations:z.array(editableOwnerRecommendationSchema).max(20),memberships:z.array(ownerMembershipDtoSchema).max(20),
 media:z.array(z.object({id:uuid,accountId:uuid,purpose:z.literal('recommendation'),status:z.enum(['ready','pending_delete','deleted']),length:fileLength,sha256:sha}).strict()).max(24)}).strict();
async function consume<T>(response:APIResponse,body:(response:APIResponse)=>Promise<T>){try{return await body(response);}finally{await response.dispose();}}
async function status(response:APIResponse,expected:number){return consume(response,async r=>{expect(r.status()).toBe(expected);});}
function unique(values:string[]){expect(new Set(values).size===values.length).toBe(true);}
async function control(request:APIRequestContext,action:'reset',info:TestInfo){
 const envelope={version:1,runId:descriptor.runId,commit:descriptor.commit,caseId:info.title,project:info.project.name,repeat:info.repeatEachIndex};
 z.object(identity).strict().parse(envelope);
 const response=await request.post('/api/__apps-fixture/control',{headers:{Origin:origin,'x-apps-fixture-capability':descriptor.controlCapability},data:{action,...envelope}});
 const raw=await consume(response,async r=>{expect(r.status()).toBe(200);return r.json();});
 const value=manifestSchema.parse(raw);
 for(const key of ['version','runId','commit','caseId','project','repeat'] as const)expect(value[key]).toBe(envelope[key]);
 for(const who of ['ownerA','ownerB'] as const){
  expect(value.personas[who].userId===accounts[who].userId&&value.personas[who].handle===accounts[who].handle).toBe(true);
 }
 unique(value.collections.map(x=>x.id));unique(value.recommendations.map(x=>x.id));unique(value.recommendations.map(x=>x.entityId));unique(value.recommendations.map(x=>x.title));unique(value.media.map(x=>x.id));unique(value.uploadFiles.map(x=>x.path));unique(value.uploadFiles.map(x=>x.sha256));unique(value.memberships.map(x=>`${x.collectionId}/${x.recommendationId}`));
 expect(value.personas.ownerA.accountId!==value.personas.ownerB.accountId&&value.personas.ownerA.userId!==value.personas.ownerB.userId).toBe(true);
 expect(value.recommendations.every(x=>value.collections.some(c=>c.id===x.collectionId)&&value.memberships.some(m=>m.collectionId===x.collectionId&&m.recommendationId===x.id))&&value.memberships.every(m=>value.recommendations.some(x=>x.id===m.recommendationId&&x.collectionId===m.collectionId))).toBe(true);
 const cardinalities=[[0,0,0,0,0],[2,2,2,2,2],[1,0,0,0,0],[2,16,16,0,0]][titles.indexOf(value.caseId)];expect([value.collections.length,value.recommendations.length,value.memberships.length,value.media.length,value.uploadFiles.length]).toEqual(cardinalities);
 return value;
}
async function observe(request:APIRequestContext,info:TestInfo){
 const envelope={version:1,runId:descriptor.runId,commit:descriptor.commit,caseId:info.title,project:info.project.name,repeat:info.repeatEachIndex};z.object(identity).strict().parse(envelope);
 const response=await request.post('/api/__apps-fixture/control',{headers:{Origin:origin,'x-apps-fixture-capability':descriptor.controlCapability},data:{action:'observe',...envelope}});
 const value=observationSchema.parse(await consume(response,async r=>{expect(r.status()).toBe(200);return r.json();}));for(const key of ['version','runId','commit','caseId','project','repeat'] as const)expect(value[key]===envelope[key]).toBe(true);unique(value.media.map(x=>x.id));return value;
}
async function json(request:APIRequestContext,path:string){return consume(await request.get(`${base}${path}`),async response=>{expect(response.status()).toBe(200);return response.json();});}
async function collection(request:APIRequestContext,id:string){const value=editableOwnerCollectionSchema.parse((await json(request,`/collections/${id}/editable?status=all`)).collection);expect(value.id===id&&value.category==='apps').toBe(true);return value;}
async function recommendation(request:APIRequestContext,id:string){const value=editableOwnerRecommendationSchema.parse((await json(request,`/recommendations/${id}/editable?status=all`)).recommendation);expect(value.id===id&&value.category==='apps').toBe(true);return value;}
async function patchList(request:APIRequestContext,id:string,patch:Record<string,unknown>){
 const current=await collection(request,id);await status(await command(request,'patch',`/collections/${id}`,{expectedRevision:current.revision,...patch}),200);return collection(request,id);
}
async function complete(request:APIRequestContext,accountId:string){
 const snapshot=ownerSnapshotSchema.parse(await json(request,'/categories/apps/content-snapshot'));
 async function stream<T>(path:string,params:Record<string,string>,schema:z.ZodType<{snapshot:string;snapshotToken:string;expiresAt:number;items:T[];nextCursor:string|null}>){
  const rows:T[]=[],seen=new Set<string>();let cursor:string|undefined;
  for(let count=0;count<8;count++){
   const query=new URLSearchParams({...params,limit:'24',snapshotToken:snapshot.snapshotToken,...(cursor?{cursor}:{})});
   const page=schema.parse(await json(request,`${path}?${query}`));
   expect(page.snapshot===snapshot.revision&&page.snapshotToken===snapshot.snapshotToken&&page.expiresAt===snapshot.expiresAt).toBe(true);
   expect(page.items.length).toBeLessThanOrEqual(24);rows.push(...page.items);
   if(page.nextCursor===null)return rows;
   expect(page.items.length>0&&!seen.has(page.nextCursor)).toBe(true);seen.add(page.nextCursor);cursor=page.nextCursor;
  }
  throw Error('Apps owner page bound exceeded');
 }
 const collections=await stream('/collections',{category:'apps',status:'all'},ownerCollectionPageSchema);
 const recommendations=await stream('/recommendations',{category:'apps',status:'all'},ownerRecommendationPageSchema);
 const memberships=await stream('/categories/apps/memberships',{collectionStatus:'all',recommendationStatus:'all'},ownerMembershipPageSchema);
 const pins=await stream('/categories/apps/top-picks',{},ownerTopPickPageSchema.superRefine((page,ctx)=>{if(page.pinRevision!==snapshot.pinRevision)ctx.addIssue({code:'custom',message:'Apps pin revision mismatch'});}));
 const validated=ownerSnapshotSchema.parse(await json(request,`/categories/apps/content-snapshot/validate?snapshotToken=${encodeURIComponent(snapshot.snapshotToken)}`));expect(validated).toEqual(snapshot);
 expect(collections.every(row=>row.accountId===accountId&&row.category==='apps')&&recommendations.every(row=>row.accountId===accountId&&row.category==='apps')).toBe(true);
 return {collections,recommendations,memberships,pins};
}
type AppsBootstrapIdentity={userId:string;accountId:string;handle:string}|null;
type AppsBootstrapRecord={kind:'session'|'me';work:Promise<void>;finished:()=>void;failed:()=>void};
const appsBootstraps=new WeakMap<Page,{expected:AppsBootstrapIdentity;records:Map<Request,AppsBootstrapRecord>;floor:number;failed:boolean}>();
// Observe original browser transports. APIRequestContext sign-in probes cannot
// settle AuthSyncManager's independent session -> account bootstrap.
function trackAppsBootstrap(page:Page,expected:AppsBootstrapIdentity){
 const identity=expected===null?null:Object.freeze({userId:expected.userId,accountId:expected.accountId,handle:expected.handle});
 const existing=appsBootstraps.get(page);
 if(existing){if(page.url()!=='about:blank'||existing.records.size)throw Error('Apps bootstrap identity changed');existing.expected=identity;return;}
 const state={expected:identity,records:new Map<Request,AppsBootstrapRecord>(),floor:0,failed:false};appsBootstraps.set(page,state);
 page.on('request',request=>{
  const url=new URL(request.url());if(url.origin!==origin||request.method()!=='GET')return;
  const kind=url.pathname==='/api/auth/get-session'?'session':url.pathname===`${base}/me`?'me':undefined;if(!kind)return;
  if(state.records.size>=128){state.failed=true;return;}
  const identity=state.expected;let finish!:()=>void,fail!:()=>void,respond!:(response:Response)=>void;
  const terminal=new Promise<void>((resolve,reject)=>{finish=resolve;fail=()=>reject(Error('Apps bootstrap request failed'));});
  const response=new Promise<Response>(resolve=>{respond=resolve;});
  // Body/finished and the request terminal event are independently required;
  // a failure races only toward refusal and never supplies successful evidence.
  const work=Promise.all([terminal,response.then(async value=>{
   if(value.status()!==200)throw Error('Apps bootstrap response refused');
   const bytes=await value.body();if(bytes.length>65536)throw Error('Apps bootstrap body refused');
   const body=JSON.parse(bytes.toString('utf8'));
   if(kind==='session'){
    if(identity?body?.user?.id!==identity.userId||typeof body?.session?.id!=='string'||!body.session.id:body!==null)throw Error('Apps bootstrap session refused');
   }else if(!identity||body?.account?.id!==identity.accountId||body.account.handle!==identity.handle||body.account.onboardingStatus!=='complete')throw Error('Apps bootstrap account refused');
   if(await value.finished()!==null)throw Error('Apps bootstrap response incomplete');
  })]).then(()=>undefined).catch(()=>{state.failed=true;throw Error('Apps bootstrap settlement refused');});
  void work.catch(()=>undefined);
  const record:AppsBootstrapRecord={kind,work,finished:finish,failed:fail};state.records.set(request,record);
  // Store the positive response delivery privately on this original request record.
  responses.set(record,respond);
 });
 const responses=new WeakMap<AppsBootstrapRecord,(response:Response)=>void>();
 page.on('response',response=>{const record=state.records.get(response.request());if(record)responses.get(record)!(response);});
 page.on('requestfinished',request=>{state.records.get(request)?.finished();});
 page.on('requestfailed',request=>{if(state.records.has(request)){state.failed=true;state.records.get(request)!.failed();}});
}
async function settleAppsBootstrap(page:Page,budget=15000){
 if(!Number.isInteger(budget)||budget<1||budget>15000)throw Error('Apps bootstrap budget invalid');
 const state=appsBootstraps.get(page);if(!state)throw Error('Apps bootstrap observer missing');
 if(page.isClosed())throw Error('Apps bootstrap page closed before settlement');
 if(page.url()==='about:blank'&&state.records.size===0)return;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const work=(async()=>{
  for(;;){
   if(state.failed)throw Error('Apps bootstrap settlement refused');
   const records=[...state.records.values()];await Promise.all(records.map(record=>record.work));
   // Read the same existing module served by the guarded Vite fixture; return
   // only a boolean. Never create state, force refresh, or expose account data.
   const current=await page.evaluate(async expected=>{
    const path='/src/store/store.ts';const module=await import(/* @vite-ignore */ path);const state=module.default.getState();
    return expected?state.status==='active-complete'&&state.isAuthenticated===true&&state.accountId===expected.accountId&&state.user?.id===expected.userId&&state.user?.documentId===expected.userId&&state.user?.username===expected.handle&&state.token===null:
     state.status==='signed-out'&&state.isAuthenticated===false&&state.accountId===null&&state.user===null&&state.token===null;
   },state.expected);
   if(state.failed)throw Error('Apps bootstrap settlement refused');
   const currentRecords=[...state.records.values()].slice(state.floor);
   if(current&&records.length===state.records.size&&currentRecords.some(record=>record.kind==='session')&&(state.expected?currentRecords.some(record=>record.kind==='me'):currentRecords.every(record=>record.kind!=='me')))return;
   await new Promise<void>(resolve=>setTimeout(resolve,10));
  }
 })();void work.catch(()=>undefined);
 try{await Promise.race([work,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{state.failed=true;reject(Error('Apps bootstrap settlement deadline'));},budget);})]);}
 finally{if(timer)clearTimeout(timer);}
}
async function navigateApps(page:Page,path:string){await settleAppsBootstrap(page);const state=appsBootstraps.get(page)!;state.floor=state.records.size;await page.goto(path);await settleAppsBootstrap(page);}
async function reloadApps(page:Page){await settleAppsBootstrap(page);const state=appsBootstraps.get(page)!;state.floor=state.records.size;await page.reload();await settleAppsBootstrap(page);}
async function closeAppsContext(context:BrowserContext,budget=15000){await Promise.all(context.pages().map(page=>settleAppsBootstrap(page,budget)));await context.close();}
test.afterEach(async({page})=>{await settleAppsBootstrap(page);});
async function signIn(page:Page,person:Manifest['personas']['ownerA']){
 trackAppsBootstrap(page,person);
 // Reset mints fresh canonical sessions. Shared signInAs uses initial descriptor
 // cookies, so install the returned session as the existing Places lane does.
 const split=person.cookie.indexOf('=');expect(split>0).toBe(true);
 await page.context().addCookies([{name:person.cookie.slice(0,split),value:person.cookie.slice(split+1),url:origin,sameSite:'Lax',httpOnly:true}]);
 await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
 await page.addInitScript(({userId,handle})=>localStorage.setItem('auth-storage',JSON.stringify({state:{isAuthenticated:true,token:'apps-fixture-placeholder',user:{id:userId,documentId:userId,username:handle,email:`${userId}@example.invalid`,blocked:false}},version:0})),{userId:person.userId,handle:person.handle});
 await consume(await page.request.get('/api/auth/get-session'),async session=>{expect(session.status()).toBe(200);expect((await session.json()).user?.id===person.userId).toBe(true);});
 const account=(await json(page.request,'/me')).account;expect(account.id===person.accountId&&account.id!==person.userId&&account.handle===person.handle&&account.onboardingStatus==='complete').toBe(true);
}
async function start(page:Page,info:TestInfo){
 const manifest=await control(page.request,'reset',info);await signIn(page,manifest.personas.ownerA);await refuseLinkPreview(page);
 await navigateApps(page,'/recommendations/apps');return manifest;
}
function visibleButton(page:Page,name:string|RegExp){return page.getByRole('button',{name,exact:typeof name==='string'}).and(page.locator('button:visible'));}
function renderedNoteText(html:string){const template=document.createElement('template');template.innerHTML=html;return (template.content.textContent??'').replace(/\s+/g,' ').trim();}
async function mobileManagerButton(page:Page){const active=page.locator('[data-public-category-artwork="true"]').getByRole('button',{name:/^Manage Top Picks/});const empty=page.getByRole('button',{name:/^Manage Top Picks \(0\//});const button=active.or(empty);await expect(button).toHaveCount(1);return button;}
function appRow(page:Page,title:string){return page.locator('div.group').filter({has:page.getByText(title,{exact:true})});}
async function edit(page:Page,listId:string,id:string,title:string){
 await navigateApps(page,`/recommendations/apps/${listId}`);const row=appRow(page,title);await expect(row).toHaveCount(1);
 await row.getByRole('button').last().click();await row.getByRole('button',{name:'Edit',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Edit App',exact:true})).toBeVisible();
 await expect(page).toHaveURL(new RegExp(`/edit/${id}$`));
}
// The App URL field reads a pasted/blurred link through the owner link-preview route, which
// fetches the third-party page. This lane admits no third-party egress, so the read is refused
// here; the form treats a failed read as "fill it in yourself" and never blocks saving.
async function refuseLinkPreview(page:Page){await page.route('**/catalog/link-preview**',route=>route.abort());}
// New add flow is search-first (App Store). This lane types every field itself, so it leaves
// the search for manual entry; the search itself is covered by the general-lane e2e/apps.spec.ts.
async function manualEntry(page:Page){
 await expect(page.getByPlaceholder('Search the App Store',{exact:true})).toBeVisible();await page.getByRole('button',{name:"Can't find it? Add manually",exact:true}).click();await expect(page.getByPlaceholder('Search the App Store',{exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Download URL',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Logo URL',{exact:true})).toHaveCount(0);
}
function saveButton(page:Page){return page.getByRole('toolbar',{name:'Item actions',exact:true}).getByRole('button',{name:'Save',exact:true});}
async function fillApp(page:Page,title:string,suffix:string){
 await page.getByLabel('App title',{exact:true}).fill(title);await page.getByLabel('Developer',{exact:true}).fill('Native Apps Developer');
 await page.getByLabel('App URL',{exact:true}).fill(`https://apps.example.invalid/app-${suffix}`);await page.getByLabel('Description',{exact:true}).fill('Native typed description');
 await page.getByLabel('Price',{exact:true}).selectOption('Paid');await page.getByRole('button',{name:'Web',exact:true}).click();await page.getByRole('button',{name:'Linux',exact:true}).click();
 await page.getByRole('slider',{name:'Your rating',exact:true}).getByRole('button',{name:'4 stars',exact:true}).click();await page.locator('[contenteditable="true"]').fill('Native Apps thoughts');
}
function acknowledgement(page:Page,path:string,method:string,body:(value:Record<string,unknown>)=>boolean){return page.waitForResponse(r=>new URL(r.url()).origin===origin&&new URL(r.url()).pathname===`${base}${path}`&&r.request().method()===method&&body(r.request().postDataJSON()));}
async function browserBody(response:Response,expected:number){expect(response.status()).toBe(expected);const body=await response.json();expect(await response.finished()).toBeNull();return body;}
async function save(page:Page){
 const route=new URL(page.url()).pathname,match=/^\/recommendations\/apps\/([a-f0-9-]+)\/(add|edit\/([a-f0-9-]+))$/.exec(route);if(!match)throw Error('Apps save route invalid');
 const listId=uuid.parse(match[1]),id=match[3]?uuid.parse(match[3]):undefined;
 const title=await page.getByLabel('App title',{exact:true}).inputValue(),developer=await page.getByLabel('Developer',{exact:true}).inputValue();
 const response=acknowledgement(page,id?`/recommendations/${id}`:'/recommendations',id?'PATCH':'POST',body=>id?typeof body.expectedRevision==='number'&&!!body.displayOverrides&&(body.displayOverrides as Record<string,unknown>).title===title&&(body.displayOverrides as Record<string,unknown>).developer===developer:body.collectionId===listId&&body.category==='apps'&&body.publicationState==='draft'&&typeof body.expectedCollectionRevision==='number'&&typeof body.entityId==='string');
 await saveButton(page).click();const result=recommendationCoreDtoSchema.parse((await browserBody(await response,id?200:201)).recommendation);expect(result.category==='apps'&&(!id||result.id===id)).toBe(true);
 await expect(page).toHaveURL(`${origin}/recommendations/apps/${listId}`);await expect(page.getByRole('button',{name:'Add App',exact:true})).toBeVisible();return result.id;
}
async function invalidThenValid(page:Page,title:string,suffix:string){
 await manualEntry(page);await expect(saveButton(page)).toBeDisabled();await fillApp(page,title,suffix);await page.getByLabel('App URL',{exact:true}).fill('javascript:invalid');
 // An unsafe link is refused inline and Save stays off; nothing leaves the form and nothing is lost.
 const route=page.url();await expect(page.getByRole('alert')).toBeVisible();await expect(saveButton(page)).toBeDisabled();await expect(page).toHaveURL(route);await expect(page.getByLabel('App title',{exact:true})).toHaveValue(title);await expect(page.getByLabel('App URL',{exact:true})).toHaveValue('javascript:invalid');await expect(page.getByLabel('Developer',{exact:true})).toHaveValue('Native Apps Developer');await expect(page.locator('[contenteditable="true"]')).toContainText('Native Apps thoughts');
 await page.getByLabel('App URL',{exact:true}).fill(`https://apps.example.invalid/app-${suffix}`);
}
async function createList(page:Page,title:string,slug:string){
 await visibleButton(page,'New List').click();await expect(page.getByRole('heading',{name:'Create New App List',exact:true})).toBeVisible();
 await page.getByPlaceholder('e.g. Developer Productivity Stack').fill(title);await page.getByPlaceholder('Describe what this app collection is about').fill('Native Apps list description');await page.getByPlaceholder('enter-url-name').fill(slug);
 const response=acknowledgement(page,'/collections','POST',body=>body.category==='apps'&&body.title===title&&body.slug===slug);await page.getByRole('button',{name:'Create List',exact:true}).click();const result=collectionCoreDtoSchema.parse((await browserBody(await response,201)).collection);expect(result.category).toBe('apps');await expect(page.getByRole('heading',{name:'Create New App List',exact:true})).toHaveCount(0);return result.id;
}
const publicSchema=z.object({appLists:z.array(z.object({documentId:uuid,List_Name:z.string(),slug:z.string(),recommended_apps:z.array(z.object({documentId:uuid,title:z.string(),is_pinned:z.boolean(),pin_order:z.number().nullable(),screenshots:z.array(z.string()).nullable()}).passthrough()),recommended_apps_next_cursor:z.string().nullable().optional()}).passthrough())}).passthrough();
async function publicApps(request:APIRequestContext,handle:string){return publicSchema.parse(await json(request,`/profiles/${encodeURIComponent(handle)}/recommendations/apps`));}
async function anonymous(page:Page){
 const use=test.info().project.use;
 const context=await page.context().browser()!.newContext({baseURL:origin,viewport:use.viewport,isMobile:use.isMobile,hasTouch:use.hasTouch,deviceScaleFactor:use.deviceScaleFactor});
 try{const publicPage=await context.newPage();trackAppsBootstrap(publicPage,null);await publicPage.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});return {context,page:publicPage,request:context.request};}catch(error){await closeAppsContext(context);throw error;}
}
function uploaded(file:Manifest['uploadFiles'][number]){
 const inside=relative(fixtureRoot,resolve(file.path));if(!isAbsolute(file.path)||!inside||inside==='..'||inside.startsWith(`..${sep}`)||isAbsolute(inside))throw Error('Apps upload outside owned root');
 try{canonicalAncestors(dirname(file.path));const actual=realpathSync(file.path);if(actual.toLowerCase()!==resolve(file.path).toLowerCase())throw Error('Apps upload custody changed');const buffer=regularBytes(file.path,5*1024*1024);expect(buffer.length===file.length&&createHash('sha256').update(buffer).digest('hex')===file.sha256).toBe(true);return {name:file.name,mimeType:'image/png',buffer};}catch{throw Error('Apps upload custody or bytes invalid');}
}
async function within<T>(promise:Promise<T>,milliseconds:number){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([promise,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Apps command settlement incomplete')),milliseconds);})]);}finally{if(timer)clearTimeout(timer);}}
async function bytes(request:APIRequestContext,id:string,file:{length:number;sha256:string},ownerOnly=false){
 const path=`${base}/media/${id}/content`,etag=`"${file.sha256}"`;
 const data=await consume(await request.get(path),async response=>{expect(response.status()).toBe(200);expect(response.headers()['content-length']).toBe(String(file.length));expect(response.headers().etag).toBe(etag);expect(response.headers()['content-type']).toMatch(/^image\/png/);if(ownerOnly)expect(response.headers()['cache-control']).toBe('no-store');const body=await response.body();expect(body.length===file.length&&createHash('sha256').update(body).digest('hex')===file.sha256).toBe(true);return body;});
 await consume(await request.head(path),async head=>{expect(head.status()).toBe(200);expect(head.headers().etag).toBe(etag);expect(head.headers()['content-length']).toBe(String(file.length));expect((await head.body()).length).toBe(0);});
 await consume(await request.get(path,{headers:{Range:'bytes=0-7'}}),async range=>{expect(range.status()).toBe(206);expect(range.headers()['content-range']).toBe(`bytes 0-7/${file.length}`);expect(range.headers()['content-length']).toBe('8');expect((await range.body()).equals(data.subarray(0,8))).toBe(true);});
 await consume(await request.get(path,{headers:{'If-None-Match':etag}}),async conditional=>{expect(conditional.status()).toBe(304);expect((await conditional.body()).length).toBe(0);});return etag;
}
async function denied(request:APIRequestContext,id:string,etag:string){await consume(await request.get(`${base}/media/${id}/content`,{headers:{'If-None-Match':etag}}),async response=>{expect(response.status()).toBe(404);expect(response.headers()['cache-control']).toContain('no-store');expect(response.headers().etag).toBeUndefined();});}
async function gallery(page:Page,handle:string,list:{slug:string},title:string,developer:string,ids:string[]){
 await navigateApps(page,`/${handle}/apps/${list.slug}`);await reloadApps(page);await page.getByRole('button').filter({hasText:title}).first().click();const modal=page.locator('[data-category-detail-panel]'),heading=modal.getByRole('heading',{name:title,exact:true});await expect(heading).toBeVisible();await expect(modal.getByText(developer,{exact:true}).first()).toBeVisible();
 const images=page.getByRole('img',{name:/^Screenshot [1-9][0-9]*$/});await expect(images).toHaveCount(ids.length);expect(await images.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src')))).toEqual(ids.map(id=>`${base}/media/${id}/content`));await page.getByRole('button',{name:'Close',exact:true}).click();await expect(heading).toHaveCount(0);
}
async function hero(page:Page,handle:string,items:{title:string}[]){
 await navigateApps(page,`/${handle}/apps`);await reloadApps(page);
 if(test.info().project.name==='apps-mobile'){
  const active=page.locator('[data-public-category-artwork="true"]:visible');await expect(active).toHaveCount(1);const hero=active.locator('../..');const cards=hero.locator('img');await expect(cards).toHaveCount(items.length);expect(await cards.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('alt')))).toEqual(items.map(x=>x.title));
  // The complete native card order is the stable witness despite real automatic
  // rotation. Capture active image/title together without assuming index zero.
  const selected=await active.evaluate(node=>({image:node.querySelector('img')?.getAttribute('alt'),title:Array.from(node.querySelectorAll('h2')).at(-1)?.textContent}));expect(selected.image===selected.title&&items.some(x=>x.title===selected.title)).toBe(true);
 }else{
  const thumbs=page.locator('button').filter({has:page.locator('img')}).filter({hasNot:page.locator('p')}).and(page.locator('button.w-32'));
  await expect(thumbs).toHaveCount(items.length);expect(await thumbs.locator('img').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('alt')))).toEqual(items.map(x=>x.title));await thumbs.nth(1).click();await expect(page.getByRole('heading',{level:1,name:items[1].title,exact:true})).toBeVisible();
 }
}
async function liveMedia(request:APIRequestContext,info:TestInfo,id:string,accountId:string,file:{length:number;sha256:string}){
 const row=(await observe(request,info)).media.find(x=>x.id===id);expect(row).toBeDefined();expect(row?.accountId===accountId&&row?.purpose==='recommendation'&&row?.status==='ready'&&row?.length===file.length&&row?.sha256===file.sha256).toBe(true);
}

// Auth settlement alone does not prove the owner list read rendered. A missing
// row can also mean loading, so require the actual loaded empty-list controls.
async function expectEmptyCrudList(page:Page){
 await expect(page.getByRole('heading',{name:'Native Apps CRUD',level:1,exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Add App',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'manage',exact:true})).toBeVisible();
 await expect(page.getByText('No apps added yet.',{exact:true})).toBeVisible();
 await expect(page.getByText('Add your first recommendation to this list.',{exact:true})).toBeVisible();
}
test(titles[0],async({page},info)=>{
 const m=await start(page,info),owner=m.personas.ownerA.accountId;expect((await complete(page.request,owner)).collections).toHaveLength(0);
 const listId=await createList(page,'Native Apps CRUD','native-apps-crud');await navigateApps(page,`/recommendations/apps/${listId}`);await page.getByRole('button',{name:'Add App',exact:true}).click();await invalidThenValid(page,'Native Complete App','crud');const id=await save(page);await page.getByRole('button',{name:'Keep Draft',exact:true}).click();await expect(page.getByRole('button',{name:'Keep Draft',exact:true})).toHaveCount(0);
 const created=await recommendation(page.request,id);expect(created.effectiveAppDetails).toMatchObject({appUrl:'https://apps.example.invalid/app-crud',developer:'Native Apps Developer',logoUrl:null,downloadUrl:null,description:'Native typed description',priceTier:'Paid',platforms:['Web','Linux']});expect(created.userRating).toBe(8);const persistedNote=richNoteSchema.parse(created.note);expect(await page.evaluate(renderedNoteText,persistedNote.html)).toBe('Native Apps thoughts');
 await edit(page,listId,id,'Native Complete App');await expect(page.getByLabel('App URL',{exact:true})).toBeDisabled();await page.getByLabel('App title',{exact:true}).fill('Native Edited App');await page.getByLabel('Developer',{exact:true}).fill('Edited Developer');expect(await save(page)).toBe(id);await reloadApps(page);
 const edited=await recommendation(page.request,id);expect(edited.entityId).toBe(created.entityId);expect(edited.displayTitle).toBe('Native Edited App');expect(edited.effectiveAppDetails?.developer).toBe('Edited Developer');
 const row=appRow(page,'Native Edited App');await row.getByRole('button').last().click();page.once('dialog',async dialog=>{expect(dialog.message()).toBe('Delete "Native Edited App"?');await dialog.accept();});const detached=acknowledgement(page,`/collections/${listId}/memberships/${id}`,'DELETE',body=>typeof body.expectedCollectionRevision==='number'&&typeof body.expectedRecommendationRevision==='number');await row.getByRole('button',{name:'Delete',exact:true}).click();const detachBody=await browserBody(await detached,200);expect(detachBody.membership.attached===false&&detachBody.membership.collection.id===listId&&detachBody.membership.recommendation.id===id).toBe(true);await expect(row).toHaveCount(0);await reloadApps(page);
 await expectEmptyCrudList(page);
 const after=await complete(page.request,owner);expect(after.memberships.some(x=>x.recommendationId===id&&x.collectionId===listId)).toBe(false);expect(after.recommendations.find(x=>x.id===id)?.archived).toBe(false);
 // Canonical recommendation archive is explicit API behavior; native Delete above detached only.
 const detachedDetail=await recommendation(page.request,id);await status(await command(page.request,'delete',`/recommendations/${id}`,{expectedRevision:detachedDetail.revision}),200);expect((await recommendation(page.request,id)).archived).toBe(true);
 await reloadApps(page);await expectEmptyCrudList(page);
 await page.getByRole('button',{name:'manage',exact:true}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();const modal=page.getByRole('heading',{name:'Delete List?',exact:true}).locator('..');const deleted=acknowledgement(page,`/collections/${listId}`,'DELETE',body=>typeof body.expectedRevision==='number');await modal.getByRole('button',{name:'Delete',exact:true}).click();const deleteBody=await browserBody(await deleted,200);expect(deleteBody.collection.id).toBe(listId);await expect(page).toHaveURL(`${origin}/recommendations/apps`);await expect(modal).toHaveCount(0);await reloadApps(page);expect((await complete(page.request,owner)).collections.find(x=>x.id===listId)?.archived).toBe(true);
 await observe(page.request,info);
});

test(titles[1],async({page},info)=>{
 const m=await start(page,info);expect(m.collections).toHaveLength(2);expect(m.recommendations).toHaveLength(2);expect(m.uploadFiles).toHaveLength(2);
 const target=m.recommendations[0],survivor=m.recommendations[1],shared=m.media.find(x=>x.owner==='ownerA')!;expect(shared).toBeDefined();const contexts:BrowserContext[]=[];
 try{
  const guest=await anonymous(page);contexts.push(guest.context);const other=await anonymous(page);contexts.push(other.context);
  await signIn(other.page,m.personas.ownerB);const etag=await bytes(guest.request,shared.id,shared);await bytes(other.request,shared.id,shared);
  await liveMedia(page.request,info,shared.id,m.personas.ownerA.accountId,shared);
  await edit(page,target.collectionId,target.id,target.title);await page.getByLabel('Screenshots',{exact:true}).setInputFiles(m.uploadFiles.map(uploaded));await expect(page.getByRole('status').filter({hasText:'Uploading screenshots'})).toHaveCount(0);await save(page);await reloadApps(page);
  let detail=await recommendation(page.request,target.id);expect(detail.appScreenshots?.screenshotMediaIds).toHaveLength(3);const added=detail.appScreenshots!.screenshotMediaIds.slice(1);for(let i=0;i<2;i++)await bytes(page.request,added[i],m.uploadFiles[i]);
  const publicTarget=(await publicApps(guest.request,m.personas.ownerA.handle)).appLists.find(x=>x.documentId===target.collectionId)!.recommended_apps.find(x=>x.documentId===target.id)!;expect(publicTarget.screenshots).toEqual(detail.appScreenshots!.screenshotMediaIds.map(id=>`${base}/media/${id}/content`));for(let i=0;i<2;i++){await bytes(guest.request,added[i],m.uploadFiles[i]);await liveMedia(page.request,info,added[i],m.personas.ownerA.accountId,m.uploadFiles[i]);}await gallery(guest.page,m.personas.ownerA.handle,m.collections.find(x=>x.id===target.collectionId)!,target.title,target.developer,detail.appScreenshots!.screenshotMediaIds);
  await edit(page,target.collectionId,target.id,target.title);await page.getByRole('button',{name:'Remove screenshot',exact:true}).first().click();
  // Delay one original screenshot PATCH, advance its real revision, then forward it
  // unchanged. No fulfilled response, replay, or synthetic conflict is admitted.
  let captured!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>{captured=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});const handlers:Promise<void>[]=[];
  const patchUrl=`${origin}${base}/recommendations/${target.id}`;
  let heldRequest:import('@playwright/test').Request|undefined;
  const hold=(route:Route)=>{const handler=(async()=>{if(route.request().method()!=='PATCH'||!route.request().postDataJSON()?.appScreenshots){await route.fallback();return;}expect(heldRequest===undefined).toBe(true);heldRequest=route.request();const body=heldRequest.postDataJSON();expect(body.expectedRevision===detail.revision&&JSON.stringify(body.appScreenshots.screenshotMediaIds)===JSON.stringify(added)).toBe(true);captured();await within(gate,15000);await route.continue();})();handlers.push(handler);void handler.catch(()=>undefined);return handler;};
  await page.route(patchUrl,hold);
  const responseDrain=page.waitForResponse(r=>r.url()===patchUrl&&r.request()===heldRequest,{timeout:15000}).then(async response=>{const body=await response.body();expect(body.length<=65536).toBe(true);expect(await response.finished()).toBeNull();return response;});void responseDrain.catch(()=>undefined);let primaryFailure:unknown;
  try{
   await saveButton(page).click();await within(ready,15000);
   const current=await recommendation(page.request,target.id);await status(await command(page.request,'patch',`/recommendations/${target.id}`,{expectedRevision:current.revision,userRating:7}),200);release();expect((await responseDrain).status()).toBe(409);
   await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('img',{name:'App screenshot',exact:true})).toHaveCount(2);expect((await recommendation(page.request,target.id)).appScreenshots?.screenshotMediaIds).toEqual(detail.appScreenshots?.screenshotMediaIds);await bytes(page.request,shared.id,shared);
  }catch(error){primaryFailure=error;throw error;}finally{
   release();let timer:ReturnType<typeof setTimeout>|undefined;
   // eslint-disable-next-line no-unsafe-finally -- unguarded: a cleanup failure here can replace an in-flight failure. Tracked as a follow-up; changing this control flow needs the Apps protected lane, which no CI job runs.
   try{const drained=await Promise.race([Promise.allSettled([...handlers,responseDrain]),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Apps held request drain incomplete')),5000);})]);if(drained.some(x=>x.status==='rejected'))throw Error('Apps held request drain failed');await page.unroute(patchUrl,hold);}
   // eslint-disable-next-line no-unsafe-finally -- guarded: this throw is reachable only when no original failure is in flight, so nothing is masked.
   catch(error){try{await closeAppsContext(page.context());}catch(closeError){throw new AggregateError([...(primaryFailure?[primaryFailure]:[]),error,closeError],'Apps held request containment failed');}throw primaryFailure?new AggregateError([primaryFailure,error],'Apps failure and request drain failure'):error;}finally{if(timer)clearTimeout(timer);}
  }
  await reloadApps(page);
  // Withdrawal of one attachment must leave the second legitimate public attachment readable.
  await patchList(page.request,target.collectionId,{visibility:'private'});await bytes(guest.request,shared.id,shared);
  await patchList(page.request,survivor.collectionId,{visibility:'private'});await denied(guest.request,shared.id,etag);await denied(other.request,shared.id,etag);await bytes(page.request,shared.id,shared,true);
  await edit(page,target.collectionId,target.id,target.title);await page.getByRole('button',{name:'Remove screenshot',exact:true}).first().click();await page.getByRole('button',{name:'Remove screenshot',exact:true}).first().click();await save(page);await reloadApps(page);detail=await recommendation(page.request,target.id);expect(detail.appScreenshots?.screenshotMediaIds).toEqual([added[1]]);await bytes(page.request,added[1],m.uploadFiles[1]);
  const foreign=m.media.find(x=>x.owner==='ownerB')!;expect(foreign).toBeDefined();await status(await page.request.get(`${base}/media/${foreign.id}/content`),404);await status(await command(page.request,'delete',`/media/${foreign.id}`,{}),404);await bytes(other.request,foreign.id,foreign,true);await liveMedia(other.request,info,foreign.id,m.personas.ownerB.accountId,foreign);expect((await recommendation(page.request,target.id)).appScreenshots?.screenshotMediaIds).toEqual([added[1]]);
  await observe(page.request,info);
 // eslint-disable-next-line no-unsafe-finally -- unguarded: a cleanup failure here can replace an in-flight failure. Tracked as a follow-up; changing this control flow needs the Apps protected lane, which no CI job runs.
 }finally{const closed=await Promise.allSettled(contexts.map(context=>closeAppsContext(context)));if(closed.some(x=>x.status==='rejected'))throw Error('Apps isolated context cleanup failed');}
});

test(titles[2],async({page},info)=>{
 const m=await start(page,info);expect(m.collections).toHaveLength(1);const list=m.collections[0],guest=await anonymous(page);
 try{
  await navigateApps(page,`/recommendations/apps/${list.id}`);await page.getByRole('button',{name:'Add App',exact:true}).click();await manualEntry(page);await fillApp(page,'Native Keep Draft App','draft');const draft=await save(page);await page.getByRole('button',{name:'Keep Draft',exact:true}).click();await expect(page.getByRole('button',{name:'Keep Draft',exact:true})).toHaveCount(0);expect((await collection(page.request,list.id)).visibility).toBe('private');expect((await recommendation(page.request,draft)).publicationState).toBe('draft');expect((await publicApps(guest.request,m.personas.ownerA.handle)).appLists.some(x=>x.documentId===list.id)).toBe(false);
  await page.getByRole('button',{name:'Add App',exact:true}).click();await manualEntry(page);await fillApp(page,'Native Publish App','publish');const published=await save(page);const listAck=acknowledgement(page,`/collections/${list.id}`,'PATCH',body=>body.visibility==='public'&&body.publicationState==='published'&&typeof body.expectedRevision==='number');await page.getByRole('button',{name:'Yes, Publish',exact:true}).click();expect((await browserBody(await listAck,200)).collection.id).toBe(list.id);await expect(page.getByRole('button',{name:'Yes, Publish',exact:true})).toHaveCount(0);await expect(page.getByRole('switch',{name:'Published',exact:true})).toBeVisible();await reloadApps(page);expect((await collection(page.request,list.id)).publicationState).toBe('published');expect((await recommendation(page.request,published)).publicationState).toBe('draft');
  const publishAck=acknowledgement(page,`/recommendations/${published}`,'PATCH',body=>body.publicationState==='published'&&typeof body.expectedRevision==='number');await page.getByRole('button',{name:'Publish Native Publish App',exact:true}).click();expect((await browserBody(await publishAck,200)).recommendation.id).toBe(published);await expect(page.getByRole('button',{name:'Keep Native Publish App as draft',exact:true})).toBeVisible();await reloadApps(page);expect((await recommendation(page.request,published)).publicationState).toBe('published');
  const projection=await publicApps(guest.request,m.personas.ownerA.handle);const rows=projection.appLists.find(x=>x.documentId===list.id)!.recommended_apps;expect(rows.map(x=>x.documentId)).toEqual([published]);await gallery(guest.page,m.personas.ownerA.handle,list,'Native Publish App','Native Apps Developer',[]);
  const withdrawAck=acknowledgement(page,`/collections/${list.id}`,'PATCH',body=>body.visibility==='private'&&body.publicationState==='draft'&&typeof body.expectedRevision==='number');await page.getByRole('switch',{name:'Published',exact:true}).click();expect((await browserBody(await withdrawAck,200)).collection.id).toBe(list.id);await expect(page.getByRole('switch',{name:'Draft',exact:true})).toBeVisible();await reloadApps(page);expect((await publicApps(guest.request,m.personas.ownerA.handle)).appLists.some(x=>x.documentId===list.id)).toBe(false);expect((await recommendation(page.request,published)).publicationState).toBe('published');
  await observe(page.request,info);
 }finally{await closeAppsContext(guest.context);}
});

test(titles[3],async({page},info)=>{
 const m=await start(page,info);expect(m.recommendations).toHaveLength(16);const guest=await anonymous(page);
  async function manager(){const button=info.project.name==='apps-mobile'?await mobileManagerButton(page):visibleButton(page,/^Manage Top Picks/);await button.click();return page.getByRole('heading',{name:/^Manage Top Picks \(/}).locator('../..');}
 async function savePins(modal:Locator,items:Manifest['recommendations']){const expected=items.map(x=>({recommendationId:x.id,collectionId:x.collectionId}));const ack=acknowledgement(page,'/categories/apps/top-picks','PUT',body=>JSON.stringify(body.orderedPins)===JSON.stringify(expected)&&typeof body.expectedCategoryRevision==='string'&&(body.expectedPinRevision===null||typeof body.expectedPinRevision==='number'));await modal.getByRole('button',{name:'Save Top Picks',exact:true}).click();await browserBody(await ack,200);await expect(page.getByRole('heading',{name:/^Manage Top Picks \(/})).toHaveCount(0);await reloadApps(page);}
 try{
  let modal=await manager();for(const item of m.recommendations.slice(0,15))await modal.getByRole('button',{name:item.title,exact:true}).click();await expect(modal.getByRole('button',{name:m.recommendations[15].title,exact:true})).toBeDisabled();expect((await complete(page.request,m.personas.ownerA.accountId)).pins).toHaveLength(0);await savePins(modal,m.recommendations.slice(0,15));
  let state=await complete(page.request,m.personas.ownerA.accountId);expect(state.pins.map(x=>x.recommendationId)).toEqual(m.recommendations.slice(0,15).map(x=>x.id));expect(state.pins.map(x=>x.position)).toEqual(Array.from({length:15},(_,i)=>i));
  modal=await manager();const first=modal.locator('li').filter({has:page.getByText(m.recommendations[0].title,{exact:true})});await expect(first.getByRole('button').nth(0)).toBeDisabled();await first.getByRole('button').nth(1).click();const reordered=[m.recommendations[1],m.recommendations[0],...m.recommendations.slice(2,15)];await savePins(modal,reordered);state=await complete(page.request,m.personas.ownerA.accountId);expect(state.pins.map(x=>x.recommendationId)).toEqual(reordered.map(x=>x.id));
  const projected=(await publicApps(guest.request,m.personas.ownerA.handle)).appLists.flatMap(x=>x.recommended_apps).filter(x=>x.is_pinned).sort((a,b)=>a.pin_order!-b.pin_order!);expect(projected.map(x=>x.documentId)).toEqual(reordered.map(x=>x.id));
  await hero(guest.page,m.personas.ownerA.handle,reordered);
  modal=await manager();await modal.locator('li').filter({has:page.getByText(reordered[0].title,{exact:true})}).getByRole('button').nth(2).click();await savePins(modal,reordered.slice(1));const final=await complete(page.request,m.personas.ownerA.accountId);expect(final.pins).toHaveLength(14);expect(final.pins.map(x=>x.recommendationId)).toEqual(reordered.slice(1).map(x=>x.id));expect(final.pins.map(x=>x.position)).toEqual(Array.from({length:14},(_,i)=>i));const finalPublic=(await publicApps(guest.request,m.personas.ownerA.handle)).appLists.flatMap(x=>x.recommended_apps).filter(x=>x.is_pinned).sort((a,b)=>a.pin_order!-b.pin_order!);expect(finalPublic.map(x=>x.documentId)).toEqual(reordered.slice(1).map(x=>x.id));expect(finalPublic.map(x=>x.pin_order)).toEqual(Array.from({length:14},(_,i)=>i));await hero(guest.page,m.personas.ownerA.handle,reordered.slice(1));await observe(page.request,info);
 }finally{await closeAppsContext(guest.context);}
});
