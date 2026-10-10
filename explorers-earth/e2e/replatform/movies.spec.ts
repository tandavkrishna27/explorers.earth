import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {test,expect,type Page,type BrowserContext,type APIRequestContext,type TestInfo} from '@playwright/test';
import {canonicalMoviesBrowserSnapshot,moviesProducerEnums} from '../../src/features/Movies/api/moviesOwnerDiagnostic';
// BEGIN MOVIES PUBLIC DIAGNOSTIC CONTRACT
type MoviesPublicStage='setup'|'category-navigation'|'category-request'|'category-status'|'category-json'|'list-count'|'hero-count'|'later-pin'|'list-navigation'|'list-continuation'|'modal-open'|'modal-note'|'modal-zero'|'modal-close'|'later-list-navigation'|'later-list-visible'|'page-legacy-check'|'contexts-create'|'pages-create'|'contexts-monitor'|'dual-navigation'|'left-visible'|'right-visible'|'left-cookie-empty'|'right-cookie-empty'|'switch-other'|'other-visible'|'prior-owner-absent'|'right-still-visible'|'switch-back'|'restored-visible'|'other-owner-absent'|'left-legacy-check'|'right-legacy-check'|'contexts-close'|'screenshot';
const moviesPublicDiagnosticStates=new WeakMap<TestInfo,MoviesPublicStage>();
const moviesPublicDiagnosticSeen=new WeakSet<TestInfo>();
function moviesPublicDiagnosticIdentity(info:TestInfo):boolean{
 const title='anonymous category later list complete hero and modal preserve zero fields';
 if(info.title!==title||info.project.name!=='movies-mobile'||info.repeatEachIndex!==0||info.retry!==0||resolve(info.file)!==fileURLToPath(import.meta.url))return false;
 const path=info.titlePath;return Array.isArray(path)&&((path.length===1&&path[0]===title)||(path.length===2&&path[0]==='movies.spec.ts'&&path[1]===title));
}
function setMoviesPublicDiagnosticStage(info:TestInfo,stage:MoviesPublicStage):void{
 if(moviesPublicDiagnosticIdentity(info))moviesPublicDiagnosticStates.set(info,stage);
}
function captureMoviesPublicDiagnostic(info:TestInfo):void{
 try{
  const stage=moviesPublicDiagnosticStates.get(info);
  if(!stage||!moviesPublicDiagnosticIdentity(info)||!['failed','timedOut','interrupted'].includes(info.status??'')||moviesPublicDiagnosticSeen.has(info))return;
  if(info.errors.some(error=>typeof error.message==='string'&&error.message.includes('movies-public-diagnostic-v1:')))return;
  info.errors.push({message:'[movies-public-diagnostic-v1:'+stage+']'});moviesPublicDiagnosticSeen.add(info);
 }catch{}
}
// END MOVIES PUBLIC DIAGNOSTIC CONTRACT

test.afterEach(({},info)=>{captureMoviesPublicDiagnostic(info);});

const diagnosticTitle='owner manual form all fields snapshot repeat edits and archive reload';
type DiagnosticStage='setup'|'edit-navigation'|'edit-form'|'save-start'|'save-returned'|'list-route-reached'|'saved-note-confirmed'|'keep-draft-start'|'keep-draft-returned'|'archive';
const diagnosticStages=new WeakMap<TestInfo,{iteration:'none'|'first'|'second';stage:DiagnosticStage}>();
const diagnosticEnabled=(info:TestInfo)=>info.title===diagnosticTitle&&(info.project.name==='movies-mobile'||info.project.name==='movies-desktop')&&info.repeatEachIndex===0&&info.retry===0&&resolve(info.file)===fileURLToPath(import.meta.url);
function diagnosticStage(info:TestInfo,stage:DiagnosticStage,iteration?:'first'|'second'){
 const previous=diagnosticStages.get(info);if(previous)diagnosticStages.set(info,{...previous,stage,...(iteration?{iteration}:{})});
}
test.afterEach(async({page},info)=>{
 const state=diagnosticStages.get(info);if(!state||!diagnosticEnabled(info)||!['failed','timedOut','interrupted'].includes(info.status??''))return;
 let snapshot=canonicalMoviesBrowserSnapshot(undefined);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try {
  const projection=await Promise.race([
   page.evaluate(enums=>{
    // Build a fixed projection locally: no raw slot or DOM crosses this boundary.
    const empty={owner:'unavailable',phase:'unavailable',cause:'none',view:'unavailable',list:'unavailable',visibility:'unavailable',signal:'unavailable',guard:'unavailable',prompt:'unavailable',button:'unavailable',sample:'unavailable'};
    try {
     const slot=(globalThis as unknown as {__moviesOwnerDiagnostic?:unknown}).__moviesOwnerDiagnostic;
     if(!slot||typeof slot!=='object'||Array.isArray(slot)||Object.getPrototypeOf(slot)!==Object.prototype)return empty;
     const gate=Object.getOwnPropertyDescriptors(slot);
     if(Reflect.ownKeys(slot).length!==2||gate.version?.value!==1||!gate.snapshot||!('value' in gate.snapshot))return empty;
     const producer=gate.snapshot.value;
     if(!producer||typeof producer!=='object'||Array.isArray(producer)||Object.getPrototypeOf(producer)!==Object.prototype)return empty;
     const descriptors=Object.getOwnPropertyDescriptors(producer),keys=Object.keys(enums);
     if(Reflect.ownKeys(producer).length!==keys.length||keys.some(key=>!descriptors[key]||!('value' in descriptors[key])||!(enums as Record<string,readonly string[]>)[key].includes(descriptors[key].value)))return empty;
     const buttons=Array.from(document.querySelectorAll('button')).filter(button=>button.textContent?.trim()==='Keep Draft');
     let button='absent';
     if(buttons.length>1)button='multiple';
     else if(buttons.length===1){const element=buttons[0],style=getComputedStyle(element),rect=element.getBoundingClientRect();const visible=style.visibility!=='hidden'&&style.visibility!=='collapse'&&style.display!=='none'&&rect.width>0&&rect.height>0;button=!visible?'hidden':element.disabled||element.getAttribute('aria-disabled')==='true'?'disabled':'visible-enabled';}
     return {...Object.fromEntries(keys.map(key=>[key,descriptors[key].value])),button,sample:'captured'};
    }catch{return empty;}
   },moviesProducerEnums),
   new Promise<undefined>(resolve=>{timer=setTimeout(()=>resolve(undefined),1000);}),
  ]);
  snapshot=canonicalMoviesBrowserSnapshot(projection);
 }catch{/* closed page, failed evaluation or cap expiry is unavailable */}
 finally{if(timer)clearTimeout(timer);}
 // Public TestInfo has no original start time: both deadline observations stay unavailable.
 const receipt={version:1,iteration:state.iteration,stage:state.stage,...snapshot,budgetAtStage:'unavailable',budgetAtFailure:'unavailable'};
 const keys=['iteration','stage','owner','phase','cause','view','list','visibility','signal','guard','prompt','button','budgetAtStage','budgetAtFailure','sample'] as const;
 try{info.errors.push({message:`[movies-diagnostic-v1:${keys.map(key=>receipt[key]).join('|')}]`});}catch{/* retain original errors unchanged */}
});
type Persona={userId:string;cookie:string;handle:string};
const fixture=JSON.parse(readFileSync(process.env.MOVIES_E2E_FIXTURE_PATH!,'utf8')) as {origin:string;personas:{ownerA:Persona;ownerB:Persona}};
assertFixtureOrigin(fixture);if(fixture.origin!==process.env.PLAYWRIGHT_EXTERNAL_BASE_URL)throw Error('Movie fixture origin mismatch');
const base='/api/explorers/v1',png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
async function cookies(context:BrowserContext,owner:Persona){const i=owner.cookie.indexOf('=');await context.addCookies([{name:owner.cookie.slice(0,i),value:owner.cookie.slice(i+1),url:fixture.origin,sameSite:'Lax'}]);}
async function signIn(page:Page,owner=fixture.personas.ownerA){await cookies(page.context(),owner);await page.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===fixture.origin||['data:','blob:'].includes(u.protocol)?r.continue():r.abort();});const me=await page.request.get(`${base}/me`);expect(me.status()).toBe(200);const account=(await me.json()).account;expect(account.id).not.toBe(owner.userId);return account;}
async function command(api:APIRequestContext,method:'post'|'patch'|'put'|'delete',path:string,data:unknown,key=randomUUID()){return api[method](`${base}${path}`,{headers:{Origin:fixture.origin,'Idempotency-Key':key},data});}
async function editable(api:APIRequestContext,kind:'collections'|'recommendations',id:string){const r=await api.get(`${base}/${kind}/${id}/editable`);expect(r.status()).toBe(200);return (await r.json())[kind==='collections'?'collection':'recommendation'];}
async function createList(api:APIRequestContext,title:string){const r=await command(api,'post','/collections',{category:'movies',title,slug:`uat-${randomUUID()}`,visibility:'private',publicationState:'draft'});expect(r.status()).toBe(201);return (await r.json()).collection;}
async function provider(api:APIRequestContext,list:any,id='42',kind='movie'){const e=await command(api,'post','/entities/resolve',{kind:'provider',category:'movies',provider:'tmdb',externalKind:kind,externalId:id});expect(e.status()).toBe(200);const r=await command(api,'post','/recommendations',{category:'movies',collectionId:list.id,expectedCollectionRevision:1,entityId:(await e.json()).entity.id,publicationState:'published'});expect(r.status()).toBe(201);return (await r.json()).recommendation;}
async function copy(api:APIRequestContext,r:any,key=randomUUID()){const response=await command(api,'post',`/recommendations/${r.id}/movie-media/import`,{expectedRevision:r.revision},key);expect(response.status()).toBe(200);return (await response.json()).movieMediaImport;}
async function publish(api:APIRequestContext,id:string,visible=true){const c=await editable(api,'collections',id);expect((await command(api,'patch',`/collections/${id}`,{expectedRevision:c.revision,visibility:visible?'public':'private',publicationState:visible?'published':'draft'})).status()).toBe(200);}
function monitor(page:Page){const bad:string[]=[];page.on('request',r=>{if(/legacy-rest.invalid|localhost:1337|api\.themoviedb\.org|[?&]api_key=/.test(r.url())||/graphql/.test(r.url())&&/MovieLists|MoviesByList|RecommendedMovie|MyAccountForMovies/.test(r.postData()??''))bad.push(r.url());});return bad;}
async function continueUntil(page:Page,label:string,title:string){const target=page.getByText(title,{exact:true});for(let attempt=0;attempt<4&&await target.count()===0;attempt++){const more=page.getByRole('button',{name:label,exact:true});await expect(more.or(target).first()).toBeVisible();if(await target.count())break;await more.scrollIntoViewIfNeeded();try{await more.click({timeout:2000});}catch(error){if(await target.count())break;if(await more.count()===0)throw error;} }await expect(target).toBeVisible();}
async function ownerForm(page:Page,list:any){await page.goto(`/recommendations/movies/${list.id}/add`);await expect(page.getByPlaceholder('Search "Interstellar", "Breaking Bad"...')).toBeVisible();}

test('owner manual form all fields snapshot repeat edits and archive reload',async({page},info)=>{
 if(diagnosticEnabled(info)){
  diagnosticStages.set(info,{iteration:'none',stage:'setup'});
  await page.addInitScript(()=>{(globalThis as unknown as {__moviesOwnerDiagnostic:unknown}).__moviesOwnerDiagnostic={version:1,snapshot:{owner:'unavailable',phase:'unavailable',cause:'none',view:'unavailable',list:'unavailable',visibility:'unavailable',signal:'unavailable',guard:'unavailable',prompt:'unavailable'}};});
 }
 try{
 await signIn(page);const bad=monitor(page);await page.goto('/recommendations/movies');await page.getByRole('button',{name:'New List',exact:true}).filter({visible:true}).first().click();
 await page.locator('input[name="List_Name"]').fill(`Manual ${info.project.name}`);await page.locator('textarea[name="list_description"]').fill('UAT list description');const created=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/collections`);await page.getByRole('button',{name:'Create List',exact:true}).click();const list=(await (await created).json()).collection;
 await page.getByRole('button',{name:'Add Movie or Show',exact:true}).click();await page.getByRole('button',{name:'Add manually',exact:true}).click();await page.getByPlaceholder('Movie title').first().fill('Manual round-trip');await page.getByPlaceholder('Movie title').nth(1).fill('Original manual');await page.getByPlaceholder('e.g. 2008').fill('2020');await page.getByPlaceholder('e.g. Vince Gilligan').fill('Manual director');await page.getByPlaceholder('e.g. 62').fill('0');await page.getByPlaceholder('Brief description...').fill('Manual overview');await page.locator('.ql-editor').fill('Manual note 😀');await page.locator('input[type=file]').setInputFiles({name:'snapshot.png',mimeType:'image/png',buffer:png});
 const added=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`);await page.getByRole('button',{name:'Add to List',exact:true}).click();const r=(await (await added).json()).recommendation;await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${list.id}$`));
 let detail=await editable(page.request,'recommendations',r.id);expect(detail.mediaIds).toHaveLength(1);expect(detail.providerMedia).toBeNull();expect(detail.effectiveMovieDetails.runtimeMinutes).toBe(0);expect(detail.note.html.replaceAll('&nbsp;',' ')).toContain('Manual note 😀');
 let editIteration=0;
 for(const note of ['First edit','Second edit']){diagnosticStage(info,'edit-navigation',editIteration++===0?'first':'second');await page.goto(`/recommendations/movies/${list.id}/edit/${r.id}`);diagnosticStage(info,'edit-form');await page.locator('.ql-editor').fill(note);diagnosticStage(info,'save-start');await page.getByRole('button',{name:'Save Changes',exact:true}).click();diagnosticStage(info,'save-returned');await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${list.id}$`));diagnosticStage(info,'list-route-reached');detail=await editable(page.request,'recommendations',r.id);expect(detail.note.html.replaceAll('&nbsp;',' ')).toContain(note);diagnosticStage(info,'saved-note-confirmed');diagnosticStage(info,'keep-draft-start');await page.getByRole('button',{name:'Keep Draft',exact:true}).click();diagnosticStage(info,'keep-draft-returned');}
 diagnosticStage(info,'archive');
 await page.locator('button').filter({has:page.locator('svg.lucide-ellipsis')}).first().click();const archived=page.waitForResponse(res=>res.request().method()==='DELETE'&&new URL(res.url()).pathname===`${base}/recommendations/${r.id}`);page.once('dialog',dialog=>{expect(dialog.message()).toBe('Archive this recommendation from all lists?');void dialog.accept();});await page.getByRole('button',{name:'Archive recommendation',exact:true}).click();expect((await archived).status()).toBe(200);await page.reload();await expect(page.getByText('No movies added yet.',{exact:true})).toBeVisible();expect(bad).toEqual([]);await page.screenshot({path:info.outputPath('movies-owner.png'),fullPage:true});
 }catch(error){
  // No public whole-test deadline origin is available at this failure boundary.
  throw error;
 }
});

test('canonical both-kind provider search resolves typed facts and copies original cast slots',async({page})=>{
 await signIn(page);const bad=monitor(page);for(const kind of ['movie','tv']){const list=await createList(page.request,`Provider ${kind}`);await ownerForm(page,list);await page.getByPlaceholder('Search "Interstellar", "Breaking Bad"...').fill('fixture');await page.getByRole('button').filter({hasText:kind==='movie'?'Fixture Movie 42':'Fixture Show 42'}).click();await expect(page.getByText('Fixture Watch',{exact:true})).toBeVisible();await page.locator('.ql-editor').fill(`Provider ${kind} note`);const added=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`);await page.getByRole('button',{name:'Add to List',exact:true}).click();const r=(await (await added).json()).recommendation;await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${list.id}$`));const detail=await editable(page.request,'recommendations',r.id);expect(detail.entity.provenance.externalKind).toBe(kind);expect(detail.providerMedia.poster).not.toBeNull();expect(detail.providerMedia.backdrop).not.toBeNull();expect(detail.providerMedia.cast.map((c:any)=>c.slot.ordinal)).toEqual([0,1,2,3,4,5,6,7,8,9]);expect(detail.providerMedia.cast[0].media).toBeNull();expect(detail.providerMedia.cast[9].media).not.toBeNull();expect(detail.effectiveMovieDetails.watchProviders.US.flatrate[0].name).toBe('Fixture Watch');}expect(bad).toEqual([]);
});

test('anonymous category later list complete hero and modal preserve zero fields',async({page,browser},info)=>{
 setMoviesPublicDiagnosticStage(info,'setup');
 const owner=fixture.personas.ownerB,bad=monitor(page);setMoviesPublicDiagnosticStage(info,'category-navigation');
 await page.goto(`/${owner.handle}/movies`);setMoviesPublicDiagnosticStage(info,'category-request');
 const result=await page.request.get(`${base}/profiles/${owner.handle}/recommendations/movies`);setMoviesPublicDiagnosticStage(info,'category-status');
 expect(result.status()).toBe(200);setMoviesPublicDiagnosticStage(info,'category-json');
 const data=await result.json();setMoviesPublicDiagnosticStage(info,'list-count');
 expect(data.movieLists).toHaveLength(12);setMoviesPublicDiagnosticStage(info,'hero-count');
 expect(data.topPicks).toHaveLength(15);setMoviesPublicDiagnosticStage(info,'later-pin');
 expect(data.topPicks.some((r:any)=>r.title==='ownerB seed movie 13-0')).toBe(true);
 setMoviesPublicDiagnosticStage(info,'list-navigation');
 await page.goto(`/${owner.handle}/movies/seed-list-0`);setMoviesPublicDiagnosticStage(info,'list-continuation');
 await continueUntil(page,'Load more movies','ownerB seed movie 0-29');setMoviesPublicDiagnosticStage(info,'modal-open');
 await page.getByText('ownerB seed movie 0-29',{exact:true}).click();setMoviesPublicDiagnosticStage(info,'modal-note');
 await expect(page.getByText('Seed rich note 😀')).toBeVisible();setMoviesPublicDiagnosticStage(info,'modal-zero');
 await expect(page.getByText('0m',{exact:true})).toBeVisible();setMoviesPublicDiagnosticStage(info,'modal-close');
 await page.keyboard.press('Escape');setMoviesPublicDiagnosticStage(info,'later-list-navigation');
 await page.goto(`/${owner.handle}/movies/seed-list-13`);setMoviesPublicDiagnosticStage(info,'later-list-visible');
 await expect(page.getByText('ownerB seed movie 13-0',{exact:true})).toBeVisible();setMoviesPublicDiagnosticStage(info,'page-legacy-check');
 expect(bad).toEqual([]);
 setMoviesPublicDiagnosticStage(info,'contexts-create');
 const contexts=[await browser.newContext(),await browser.newContext()];let publicBodyCompleted=false;
 try{setMoviesPublicDiagnosticStage(info,'pages-create');
 const left=await contexts[0].newPage(),right=await contexts[1].newPage();setMoviesPublicDiagnosticStage(info,'contexts-monitor');
 const leftBad=monitor(left),rightBad=monitor(right);setMoviesPublicDiagnosticStage(info,'dual-navigation');
 await Promise.all([left.goto(`/${owner.handle}/movies`),right.goto(`/${owner.handle}/movies`)]);setMoviesPublicDiagnosticStage(info,'left-visible');
 await expect(left.getByText('ownerB seed movie 0-0',{exact:true}).first()).toBeVisible();setMoviesPublicDiagnosticStage(info,'right-visible');
 await expect(right.getByText('ownerB seed movie 0-0',{exact:true}).first()).toBeVisible();setMoviesPublicDiagnosticStage(info,'left-cookie-empty');
 expect(await contexts[0].cookies()).toEqual([]);setMoviesPublicDiagnosticStage(info,'right-cookie-empty');
 expect(await contexts[1].cookies()).toEqual([]);
 const other=fixture.personas.ownerA;setMoviesPublicDiagnosticStage(info,'switch-other');
 await left.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},`/${other.handle}/movies`);setMoviesPublicDiagnosticStage(info,'other-visible');
 await expect(left.getByText('ownerA seed movie 0-0',{exact:true}).first()).toBeVisible();setMoviesPublicDiagnosticStage(info,'prior-owner-absent');
 await expect(left.getByText('ownerB seed movie 0-0',{exact:true})).toHaveCount(0);setMoviesPublicDiagnosticStage(info,'right-still-visible');
 await expect(right.getByText('ownerB seed movie 0-0',{exact:true}).first()).toBeVisible();
 setMoviesPublicDiagnosticStage(info,'switch-back');
 await left.evaluate(path=>{history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate'));},`/${owner.handle}/movies`);setMoviesPublicDiagnosticStage(info,'restored-visible');
 await expect(left.getByText('ownerB seed movie 0-0',{exact:true}).first()).toBeVisible();setMoviesPublicDiagnosticStage(info,'other-owner-absent');
 await expect(left.getByText('ownerA seed movie 0-0',{exact:true})).toHaveCount(0);setMoviesPublicDiagnosticStage(info,'left-legacy-check');
 expect(leftBad).toEqual([]);setMoviesPublicDiagnosticStage(info,'right-legacy-check');
 expect(rightBad).toEqual([]);
 publicBodyCompleted=true;
 }finally{if(publicBodyCompleted)setMoviesPublicDiagnosticStage(info,"contexts-close");
 await Promise.all(contexts.map(c=>c.close()));}
 setMoviesPublicDiagnosticStage(info,'screenshot');
 await page.screenshot({path:info.outputPath('movies-public.png'),fullPage:true});
});

test('global TMDB taxonomy and signed genre continuation include later list memberships',async({page})=>{
 await signIn(page);const genres=await page.request.get(`${base}/catalog/movie-genres`);expect(genres.status()).toBe(200);const owner=fixture.personas.ownerB;await page.goto(`/${owner.handle}/movies/genre/action`);await continueUntil(page,'Load more Movies','ownerB seed movie 0-29');await page.goto(`/${owner.handle}/movies/genre/drama`);await expect(page.getByText('ownerB seed movie 13-0',{exact:true})).toBeVisible();await expect(page.getByText('No movies found in this genre.')).toHaveCount(0);
});

test('optional provider image failures and immutable replay remain separate from manual snapshots',async({page})=>{
 await signIn(page);for(const id of ['42','43','44']){const list=await createList(page.request,`Copies ${id}`),r=await provider(page.request,list,id),key=randomUUID(),result=await copy(page.request,r,key);expect(result.slots.find((s:any)=>s.slot.kind==='poster').status).toBe(id==='44'?'unavailable':'copied');expect(result.slots.find((s:any)=>s.slot.kind==='cast'&&s.slot.ordinal===1).status).toBe(id==='42'?'copied':'unavailable');expect(await copy(page.request,r,key)).toEqual(result);const detail=await editable(page.request,'recommendations',r.id);expect(detail.mediaIds).toHaveLength(0);await page.goto(`/recommendations/movies/${list.id}`);await expect(page.getByText(`Fixture Movie ${id}`,{exact:true})).toBeVisible();}
});

test('real copied bytes respect fresh list privacy on GET HEAD and conditional reads',async({page,browser})=>{
 await signIn(page);const owner=fixture.personas.ownerA,list=await createList(page.request,'Privacy'),r=await provider(page.request,list),result=await copy(page.request,r),media=result.slots.find((s:any)=>s.slot.kind==='poster').media;await publish(page.request,list.id);const anon=await browser.newContext({baseURL:fixture.origin});try{expect((await anon.request.get(media.url)).status()).toBe(200);await publish(page.request,list.id,false);for(const method of ['get','head'] as const)expect((await anon.request[method](media.url,{headers:{Range:'bytes=0-10','If-None-Match':'"warm"'}})).status()).toBe(404);await publish(page.request,list.id);expect((await anon.request.get(media.url)).status()).toBe(200);await page.goto(`/${owner.handle}/movies/${list.slug}`);await expect(page.getByText('Fixture Movie 42',{exact:true})).toBeVisible();}finally{await anon.close();}
});

test('foreign owner denial and original edit observation preserve an unsaved stale draft',async({page,browser})=>{
 await signIn(page);const list=await createList(page.request,'Stale'),r=await provider(page.request,list),other=await browser.newContext({baseURL:fixture.origin});await cookies(other,fixture.personas.ownerB);try{expect((await other.request.get(`${base}/recommendations/${r.id}/editable`)).status()).toBe(404);expect((await command(other.request,'patch',`/recommendations/${r.id}`,{expectedRevision:r.revision,userRating:1})).status()).toBe(404);await page.goto(`/recommendations/movies/${list.id}/edit/${r.id}`);await page.locator('.ql-editor').fill('Unsaved stale Movie draft');const observation=await editable(page.request,'recommendations',r.id);expect((await command(page.request,'patch',`/recommendations/${r.id}`,{expectedRevision:observation.revision,userRating:7})).status()).toBe(200);const conflict=page.waitForResponse(res=>res.request().method()==='PATCH'&&new URL(res.url()).pathname===`${base}/recommendations/${r.id}`);await page.getByRole('button',{name:'Save Changes',exact:true}).click();expect((await conflict).status()).toBe(409);await expect(page.locator('.ql-editor')).toContainText('Unsaved stale Movie draft');}finally{await other.close();}
});

test('category-wide fifteen pins reject a sixteenth and retained manager keeps staged selection',async({page})=>{
 await signIn(page,fixture.personas.ownerB);const response=await page.request.get(`${base}/categories/movies/top-picks?limit=100`);expect(response.status()).toBe(200);const original=await response.json();expect(original.items).toHaveLength(15);const memberships=await page.request.get(`${base}/categories/movies/memberships?limit=100`);expect(memberships.status()).toBe(200);const extra=(await memberships.json()).items.find((m:any)=>!original.items.some((p:any)=>p.recommendationId===m.recommendationId));expect(extra).toBeTruthy();const overflow=await command(page.request,'put','/categories/movies/top-picks',{expectedCategoryRevision:original.snapshot,expectedPinRevision:original.pinRevision,orderedPins:[...original.items.map((p:any)=>({recommendationId:p.recommendationId,collectionId:p.collectionId})),{recommendationId:extra.recommendationId,collectionId:extra.collectionId}]});expect(overflow.status()).toBe(422);await page.goto('/recommendations/movies');await page.getByRole('button').filter({hasText:'Manage Top Picks'}).filter({visible:true}).first().click();await expect(page.getByRole('button',{name:'Save Top Picks',exact:true})).toBeVisible();const row=page.locator('li').filter({hasText:'ownerB seed movie 0-0'}).first();await row.locator('button').filter({has:page.locator('svg.lucide-minus')}).click();expect((await (await page.request.get(`${base}/categories/movies/top-picks?limit=100`)).json()).items).toHaveLength(15);const reordered=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname===`${base}/categories/movies/top-picks/order`);await page.locator('li button').filter({has:page.locator('svg.lucide-chevron-down')}).filter({visible:true}).first().click();expect((await reordered).status()).toBe(200);expect((await (await page.request.get(`${base}/categories/movies/top-picks?limit=100`)).json()).items).toHaveLength(15);await page.getByRole('button',{name:'Save Top Picks',exact:true}).click();await expect.poll(async()=>((await (await page.request.get(`${base}/categories/movies/top-picks?limit=100`)).json()).items.length)).toBe(14);const current=await (await page.request.get(`${base}/categories/movies/top-picks?limit=100`)).json();expect((await command(page.request,'put','/categories/movies/top-picks',{expectedCategoryRevision:current.snapshot,expectedPinRevision:current.pinRevision,orderedPins:original.items.map((p:any)=>({recommendationId:p.recommendationId,collectionId:p.collectionId}))})).status()).toBe(200);
});

test('delayed real canonical search continuation cannot append after query replacement',async({page})=>{
 await signIn(page);const list=await createList(page.request,'Continuation');await ownerForm(page,list);const input=page.getByPlaceholder('Search "Interstellar", "Breaking Bad"...');await input.fill('continuation');await page.getByRole('button',{name:'Load more results',exact:true}).click();const busy=page.waitForResponse(r=>new URL(r.url()).pathname===`${base}/catalog/movies`&&new URL(r.url()).searchParams.get('query')==='fixture');await input.fill('fixture');expect((await busy).status()).toBe(429);await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button').filter({hasText:'Fixture Movie 124'})).toHaveCount(0);await page.waitForTimeout(3500);await page.getByRole('button',{name:'Retry search',exact:true}).click();await expect(page.getByRole('button').filter({hasText:'Fixture Movie 42'})).toBeVisible();await expect(page.getByRole('button').filter({hasText:'Fixture Movie 124'})).toHaveCount(0);
});

test('manual television zero season is typed and does not acquire provider authority',async({page})=>{
 await signIn(page);const list=await createList(page.request,'Manual TV');await ownerForm(page,list);await page.getByRole('button',{name:'Add manually',exact:true}).click();await page.getByLabel('Type').selectOption('tv');await page.getByPlaceholder('Movie title').first().fill('Manual zero seasons');await page.getByPlaceholder('e.g. 5').fill('0');const added=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`);await page.getByRole('button',{name:'Add to List',exact:true}).click();const r=(await (await added).json()).recommendation;await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${list.id}$`));const detail=await editable(page.request,'recommendations',r.id);expect(detail.effectiveMovieDetails.mediaType).toBe('tv');expect(detail.effectiveMovieDetails.seasonCount).toBe(0);expect(detail.entity.provenance).toBeNull();expect(detail.providerMedia).toBeNull();
});

test('provider source replacement retires old copied assets while retaining a uploaded snapshot',async({page})=>{
 await signIn(page);const list=await createList(page.request,'Replace source'),r=await provider(page.request,list),copied=await copy(page.request,r);const upload=await page.request.post(`${base}/media`,{headers:{Origin:fixture.origin,'Content-Type':'image/png','X-Media-Purpose':'recommendation','X-File-Name':'retained.png'},data:png});expect(upload.status()).toBe(201);const snapshot=(await upload.json()).media,observed=await editable(page.request,'recommendations',r.id);expect((await command(page.request,'patch',`/recommendations/${r.id}`,{expectedRevision:observed.revision,mediaIds:[snapshot.id]})).status()).toBe(200);const fresh=await editable(page.request,'recommendations',r.id);const resolved=await command(page.request,'post','/entities/resolve',{kind:'provider',category:'movies',provider:'tmdb',externalKind:'tv',externalId:'42'});expect(resolved.status()).toBe(200);const replacement=await command(page.request,'post',`/recommendations/${r.id}/entity`,{expectedRevision:fresh.revision,entityId:(await resolved.json()).entity.id});expect(replacement.status()).toBe(200);const detail=await editable(page.request,'recommendations',r.id);expect(detail.providerMedia.source.externalKind).toBe('tv');expect(detail.providerMedia.poster).toBeNull();expect(detail.providerMedia.backdrop).toBeNull();expect(detail.providerMedia.cast.every((c:any)=>c.media===null)).toBe(true);expect(detail.entity.provenance.externalKind).toBe('tv');expect(detail.mediaIds).toEqual([snapshot.id]);expect((await page.request.get(snapshot.url)).status()).toBe(200);for(const slot of copied.slots.filter((s:any)=>s.status==='copied'))expect((await page.request.get(slot.media.url)).status()).toBe(404);await page.goto(`/recommendations/movies/${list.id}`);await expect(page.getByText('Fixture Show 42',{exact:true})).toBeVisible();
});

test('public signed continuations deny malformed cross-scope and changed-limit tokens',async({page})=>{
 const owner=fixture.personas.ownerB,path=`${base}/profiles/${owner.handle}/recommendations/movies/genres/action`,first=await page.request.get(path+'?limit=24');expect(first.status()).toBe(200);const data=await first.json();expect(data.nextCursor).toBeTruthy();for(const suffix of ['?limit=12&cursor='+encodeURIComponent(data.nextCursor),'?limit=24&cursor=bad'])expect((await page.request.get(path+suffix)).status()).toBe(400);expect((await page.request.get(path.replace('/genres/action','/genres/drama')+'?limit=24&cursor='+encodeURIComponent(data.nextCursor))).status()).toBe(400);await page.goto(`/${owner.handle}/movies/genre/action`);await expect(page.getByText('ownerB seed movie 0-0',{exact:true})).toBeVisible();
});
