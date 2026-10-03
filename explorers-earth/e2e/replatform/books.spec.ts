import {assertFixtureOrigin} from './proxy-fixture-authority.mjs';
import {readFileSync} from 'node:fs';
import {test,expect,type Page,type BrowserContext,type APIRequestContext} from '@playwright/test';
type Persona={userId:string;cookie:string;handle:string};
const fixture=JSON.parse(readFileSync(process.env.BOOKS_E2E_FIXTURE_PATH!,'utf8')) as {origin:string;personas:{ownerA:Persona;ownerB:Persona}};
assertFixtureOrigin(fixture);
if(fixture.origin!==process.env.PLAYWRIGHT_EXTERNAL_BASE_URL)throw new Error('Books fixture origin mismatch');
const base='/api/explorers/v1';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
async function cookies(context:BrowserContext,owner:Persona){const i=owner.cookie.indexOf('=');await context.addCookies([{name:owner.cookie.slice(0,i),value:owner.cookie.slice(i+1),url:fixture.origin,sameSite:'Lax'}]);}
async function signIn(page:Page,owner:Persona){
 await cookies(page.context(),owner);
 await page.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===fixture.origin||['data:','blob:'].includes(url.protocol)?route.continue():route.abort();});
 const authority=await page.request.get(`${base}/me`);expect(authority.status()).toBe(200);const account=(await authority.json()).account;const session=await page.request.get("/api/auth/get-session");expect(session.status()).toBe(200);expect((await session.json()).user.id).toBe(owner.userId);expect(owner.userId).not.toBe(account.id);expect(account.id).toMatch(/^[0-9a-f-]{36}$/);return account;
}
async function command(api:APIRequestContext,method:'post'|'patch'|'put'|'delete',path:string,data:unknown){return api[method](`${base}${path}`,{headers:{Origin:fixture.origin,'Idempotency-Key':crypto.randomUUID()},data});}
async function editable(api:APIRequestContext,kind:'collections'|'recommendations',id:string){const result=await api.get(`${base}/${kind}/${id}/editable`);expect(result.status()).toBe(200);return (await result.json())[kind==='collections'?'collection':'recommendation'];}
async function profile(api:APIRequestContext){const r=await api.get(`${base}/me`);expect(r.status()).toBe(200);return (await r.json()).account;}
async function setCategory(api:APIRequestContext,isPublic:boolean){const p=await profile(api);const result=await command(api,'patch','/account',{expectedRevision:p.revision,categories:p.categories.map((c:any)=>({...c,...(c.category==='books'?{isPublic}:{})}))});expect(result.status()).toBe(200);}
async function setList(api:APIRequestContext,id:string,visible:boolean){const c=await editable(api,'collections',id);const r=await command(api,'patch',`/collections/${id}`,{expectedRevision:c.revision,visibility:visible?'public':'private',publicationState:visible?'published':'draft'});expect(r.status()).toBe(200);}
function monitor(page:Page){const forbidden:string[]=[];page.on('request',request=>{const url=request.url();if(url.startsWith('https://legacy-rest.invalid')||url.includes('localhost:1337'))forbidden.push(url);const body=request.postData()??'';if(/\/api\/instagram|https:\/\/www\.googleapis\.com\/books\/|[?&]key=/.test(url)||/graphql/.test(url)&&/MyAccountForBooks|BookLists|BooksByList|RecommendedBook|BookList|CategoryNavigationAccount/.test(body))forbidden.push(url);});return forbidden;}
async function createList(api:APIRequestContext,title:string){const r=await command(api,'post','/collections',{category:'books',title,slug:`fixture-${crypto.randomUUID()}`,visibility:'private',publicationState:'draft'});expect(r.status()).toBe(201);return (await r.json()).collection;}

test('owner form create, Add with all fields, publication, repeat edits and archive reload',async({page},info)=>{
 const owner=fixture.personas.ownerA;await signIn(page,owner);const forbidden=monitor(page);await setCategory(page.request,false);
 await page.goto('/recommendations/books');await page.getByRole('button',{name:'New List',exact:true}).filter({visible:true}).first().click();
 const title=`Browser ${info.project.name}`;await page.locator('input[name="List_Name"]').fill(title);await page.locator('textarea[name="list_description"]').fill('Browser list description');
 const created=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/collections`);
 await page.getByRole('button',{name:'Create List',exact:true}).click();const list=(await (await created).json()).collection;expect(list.visibility).toBe('private');expect(list.publicationState).toBe('draft');
 await expect(page).toHaveURL(new RegExp(`/recommendations/books/${list.id}$`));await expect(page.getByText('Yes, Publish',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Add Book',exact:true}).click();await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');
 await page.getByRole('button').filter({hasText:'Fixture success'}).click();await page.locator('.ql-editor').fill('Browser rich note 😀');await page.getByRole('button',{name:'Rate 8 out of 10'}).click();
 await page.getByPlaceholder('Name (e.g. Amazon)').fill('Personal link');await page.getByPlaceholder('https://...').fill('https://example.com/book');await page.getByRole('button',{name:'Add link'}).click();
 await page.locator('input[type=file]').setInputFiles({name:'snapshot.png',mimeType:'image/png',buffer:png});
 const added=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`);
 await page.getByRole('button',{name:'Add to List',exact:true}).click();const recommendation=(await (await added).json()).recommendation;expect(recommendation.publicationState).toBe('published');
 await page.getByRole('button',{name:'Yes, Publish',exact:true}).click();await expect(page.getByRole('button',{name:'Yes, Publish'})).toHaveCount(0);
 const detail=await editable(page.request,'recommendations',recommendation.id);expect(detail.note.html.replaceAll("&nbsp;"," ")).toContain('Browser rich note');expect(detail.userRating).toBe(8);expect(detail.bookContext.buyLinks).toContainEqual({name:'Personal link',url:'https://example.com/book'});expect(detail.mediaIds).toHaveLength(1);expect(detail.bookCovers.cover).not.toBeNull();expect(detail.bookCovers.thumbnail).not.toBeNull();
 await page.goto('/recommendations/books');
 if(info.project.name==='books-mobile')await page.locator('button').filter({has:page.locator('svg.lucide-chevron-down')}).first().click();
 const categorySaved=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname===`${base}/account`);await page.locator('label').filter({has:page.locator('input[type=checkbox]')}).filter({visible:true}).first().click();await categorySaved;
 await page.reload();await expect(page.getByText(title,{exact:true})).toBeVisible();
 for(const text of ['First edit without reload','Second edit without reload']){
  await page.goto(`/recommendations/books/${list.id}/edit/${recommendation.id}`);const image=page.locator('img[src*="/api/explorers/v1/media/"]').filter({visible:true}).first();await expect(image).toBeVisible();await expect.poll(()=>image.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);expect(new URL((await image.getAttribute('src'))!,fixture.origin).origin).toBe(fixture.origin);await page.locator('.ql-editor').fill(text);await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/recommendations/books/${list.id}$`));expect((await editable(page.request,'recommendations',recommendation.id)).note.html.replaceAll("&nbsp;"," ")).toContain(text);
 }
 await page.goto(`/recommendations/books/${list.id}`);await page.getByRole('button',{name:'Book actions for Fixture success'}).click();await page.getByRole('button',{name:'Delete',exact:true}).click();await expect(page.getByText('This recommendation will be removed from every list in your account.')).toBeVisible();await page.getByRole('button',{name:'Remove',exact:true}).click();await page.reload();await expect(page.getByText('No books in this list yet.')).toBeVisible();expect(forbidden).toEqual([]);
 await page.screenshot({path:info.outputPath('owner-books.png'),fullPage:true});
});

test('anonymous later list, complete subject children, full eligible hero and modal',async({page},info)=>{
 const owner=fixture.personas.ownerB;const forbidden=monitor(page);
 await page.route('**/*',r=>new URL(r.request().url()).origin===fixture.origin?r.continue():r.abort());
 await page.goto(`/${owner.handle}/books`);await expect(page.getByText(`${owner.userId}`,{exact:true})).toHaveCount(0);
 const result=await page.request.get(`${base}/profiles/${owner.handle}/recommendations/books`);expect(result.status()).toBe(200);const data=await result.json();expect(data.bookLists).toHaveLength(12);expect(data.topReads).toHaveLength(15);expect(data.topReads.some((b:any)=>b.title==='ownerB seed book 13-0')).toBe(true);expect(data.topReads[0].pin_order).toBe(0);
 await page.goto(`/${owner.handle}/books/seed-list-0`);await page.getByRole("button",{name:"Load more books",exact:true}).click();await expect(page.getByText('ownerB seed book 0-29',{exact:true})).toBeVisible();await page.getByText('ownerB seed book 0-29',{exact:true}).click();await expect(page.getByText('Seed rich note 😀')).toBeVisible();await page.keyboard.press('Escape');
 await page.goto(`/${owner.handle}/books/subject/later-subject`);await expect(page.getByText('ownerB seed book 0-29',{exact:true})).toBeVisible();
  await page.goto(`/${owner.handle}/books/subject/page-two-subject`);await expect(page.getByText('ownerB seed book 13-0',{exact:true})).toBeVisible();await expect(page.getByText('No books found for this subject.',{exact:true})).toHaveCount(0);
 await page.goto(`/${owner.handle}/books/seed-list-13`);await expect(page.getByText('ownerB seed book 13-0',{exact:true})).toBeVisible();expect(forbidden).toEqual([]);await page.screenshot({path:info.outputPath('public-books.png'),fullPage:true});
});

test('cover success, one-slot failure and both fallback remain distinct real API Add outcomes',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const candidates=await page.request.get(`${base}/catalog/books?query=fixture&limit=12`);expect(candidates.status()).toBe(200);
 for(const id of ['success','one-fallback','both-fallback']){
  const list=await createList(page.request,`Cover ${id}`);const resolved=await command(page.request,'post','/entities/resolve',{kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:id});expect(resolved.status()).toBe(200);
  const added=await command(page.request,'post','/recommendations',{category:'books',collectionId:list.id,expectedCollectionRevision:1,entityId:(await resolved.json()).entity.id,publicationState:'published'});expect(added.status()).toBe(201);const r=(await added.json()).recommendation;
  const imported=await command(page.request,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});expect(imported.status()).toBe(200);const slots=(await imported.json()).coverImport.slots;
  expect(slots.cover.status).toBe(id==='both-fallback'?'fallback':'copied');expect(slots.thumbnail.status).toBe(id==='success'?'copied':'fallback');
  await page.goto(`/recommendations/books/${list.id}`);await expect(page.getByText(`Fixture ${id}`,{exact:true})).toBeVisible();
 }
});

test('fresh privacy gates, real bytes, altered owner denial and stale revision retention',async({browser,page})=>{
 const a=fixture.personas.ownerA,b=fixture.personas.ownerB;await signIn(page,a);await setCategory(page.request,true);
 const list=await createList(page.request,'Privacy fixture');const entity=await command(page.request,'post','/entities/resolve',{kind:'provider',category:'books',provider:'google_books',externalKind:'volume',externalId:'success'});expect(entity.status()).toBe(200);
 const created=await command(page.request,'post','/recommendations',{category:'books',collectionId:list.id,expectedCollectionRevision:1,entityId:(await entity.json()).entity.id,publicationState:'published',note:{version:1,format:'quill-html',html:'<p>Privacy note</p>'}});expect(created.status()).toBe(201);const r=(await created.json()).recommendation;
 const cover=await command(page.request,'post',`/recommendations/${r.id}/book-covers`,{expectedRevision:1});expect(cover.status()).toBe(200);const media=(await cover.json()).coverImport.slots.cover.media;
 await setList(page.request,list.id,true);
 const anonymous=await browser.newContext({baseURL:fixture.origin}),other=await browser.newContext({baseURL:fixture.origin});await cookies(other,b);
 try{
  const path=`${base}/profiles/${a.handle}/recommendations/books/${list.slug}`;
  const read=()=>anonymous.request.get(path);
  expect((await read()).status()).toBe(200);expect((await anonymous.request.get(media.url)).status()).toBe(200);
  const observation=await editable(page.request,'recommendations',r.id);
  expect((await command(other.request,'patch',`/recommendations/${r.id}`,{expectedRevision:observation.revision,userRating:1})).status()).toBe(404);
  expect((await other.request.get(`${base}/recommendations/${r.id}/editable`)).status()).toBe(404);expect((await editable(page.request,'recommendations',r.id)).userRating).toBeNull();
  await page.goto(`/recommendations/books/${list.id}/edit/${r.id}`);await page.locator('.ql-editor').fill('Unsaved stale draft');
  expect((await command(page.request,'patch',`/recommendations/${r.id}`,{expectedRevision:observation.revision,userRating:7})).status()).toBe(200);
   const conflict=page.waitForResponse(response=>response.request().method()==='PATCH'&&new URL(response.url()).pathname===`${base}/recommendations/${r.id}`);
   await page.getByRole('button',{name:'Save Changes',exact:true}).click();expect((await conflict).status()).toBe(409);await expect(page.locator('.ql-editor')).toContainText('Unsaved stale draft');await expect(page).toHaveURL(new RegExp(`/edit/${r.id}$`));
  for(const gate of ['list','category','profile']){
   expect((await read()).status()).toBe(200);
   if(gate==='list')await setList(page.request,list.id,false);else if(gate==='category')await setCategory(page.request,false);else{const p=await profile(page.request);expect((await command(page.request,'patch','/account',{expectedRevision:p.revision,publicProfile:false})).status()).toBe(200);}
   expect((await read()).status()).toBe(404);for(const method of ['get','head'] as const)expect((await anonymous.request[method](media.url,{headers:{Range:'bytes=0-10','If-None-Match':'"warm"'}})).status()).toBe(404);
   if(gate==='list')await setList(page.request,list.id,true);else if(gate==='category')await setCategory(page.request,true);else{const p=await profile(page.request);expect((await command(page.request,'patch','/account',{expectedRevision:p.revision,publicProfile:true})).status()).toBe(200);}
   expect((await read()).status()).toBe(200);expect((await anonymous.request.get(media.url)).status()).toBe(200);
  }
 }finally{await anonymous.close();await other.close();}
});

test('15 across lists, rejected 16th, staged unpin plus immediate reorder and explicit Save',async({page})=>{
 await signIn(page,fixture.personas.ownerB);
 const pins=async()=>{const r=await page.request.get(`${base}/categories/books/top-picks?limit=100`);expect(r.status()).toBe(200);return r.json();};
 const initial=await pins();expect(initial.items).toHaveLength(15);
 const memberships=await page.request.get(`${base}/categories/books/memberships?limit=100`);expect(memberships.status()).toBe(200);const members=(await memberships.json()).items;
 const extra=members.find((m:any)=>!initial.items.some((pin:any)=>pin.recommendationId===m.recommendationId));expect(extra).toBeTruthy();
 const tooMany=await command(page.request,'put','/categories/books/top-picks',{expectedCategoryRevision:initial.snapshot,expectedPinRevision:initial.pinRevision,orderedPins:[...initial.items.map((pin:any)=>({recommendationId:pin.recommendationId,collectionId:pin.collectionId})),{recommendationId:extra.recommendationId,collectionId:extra.collectionId}]});expect(tooMany.status()).toBe(422);expect((await pins()).items).toHaveLength(15);
 await page.goto(`/recommendations/books/${extra.collectionId}`);await page.getByRole('button',{name:'Pin to Top Reads',exact:true}).first().click();await expect(page.getByText('Max 15 top reads allowed.')).toBeVisible();
 await page.goto('/recommendations/books');await page.getByRole('button',{name:'Manage Top Reads',exact:true}).filter({visible:true}).first().click();
 const unpin=page.getByRole('button',{name:/^Unpin ownerB seed book/}).first();const removedTitle=(await unpin.getAttribute('aria-label'))!.slice(6);await unpin.click();await expect(page.getByText('Manage Top Reads (14/15)',{exact:true})).toBeVisible();
 const moved=page.waitForResponse(r=>r.request().method()==='PATCH'&&new URL(r.url()).pathname===`${base}/categories/books/top-picks/order`);await page.getByRole('button',{name:/^Move .* down$/}).first().click();expect((await moved).status()).toBe(200);expect((await pins()).items).toHaveLength(15);await expect(page.getByText('Manage Top Reads (14/15)',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close Top Reads',exact:true}).click();await page.reload();expect((await pins()).items).toHaveLength(15);
 await page.getByRole('button',{name:'Manage Top Reads',exact:true}).filter({visible:true}).first().click();await page.getByRole('button',{name:`Unpin ${removedTitle}`,exact:true}).click();
 const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===`${base}/categories/books/top-picks`);await page.getByRole('button',{name:'Save Top Reads',exact:true}).click();expect((await saved).status()).toBe(200);await page.reload();expect((await pins()).items).toHaveLength(14);
 const current=await pins();const restored=await command(page.request,'put','/categories/books/top-picks',{expectedCategoryRevision:current.snapshot,expectedPinRevision:current.pinRevision,orderedPins:initial.items.map((pin:any)=>({recommendationId:pin.recommendationId,collectionId:pin.collectionId}))});expect(restored.status()).toBe(200);expect((await pins()).items).toHaveLength(15);
});





test('snapshot transport failure keeps Add draft and successful retry creates one recommendation',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const list=await createList(page.request,'Snapshot retry');await page.goto(`/recommendations/books/${list.id}/add`);
 await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');await page.getByRole('button').filter({hasText:'Fixture success'}).click();await page.locator('.ql-editor').fill('Preserved upload draft');await page.locator('input[type=file]').setInputFiles({name:'snapshot.png',mimeType:'image/png',buffer:png});
 const uploadPattern=`**${base}/media`;await page.route(uploadPattern,route=>route.request().method()==='POST'?route.abort('failed'):route.continue());await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page.getByText(/Failed to fetch|NetworkError|fetch failed/).first()).toBeVisible();await expect(page.locator('.ql-editor')).toContainText('Preserved upload draft');await expect(page).toHaveURL(new RegExp(`/books/${list.id}/add$`));
 await page.unroute(uploadPattern);await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/books/${list.id}$`));const content=await page.request.get(`${base}/categories/books/memberships?limit=100`);expect(content.status()).toBe(200);const memberships=(await content.json()).items.filter((m:any)=>m.collectionId===list.id);expect(memberships).toHaveLength(1);const detail=await editable(page.request,'recommendations',memberships[0].recommendationId);expect(detail.mediaIds).toHaveLength(1);expect(detail.note.html.replaceAll('&nbsp;',' ')).toContain('Preserved upload draft');
});

test('Add retry after pin transport failure patches changed draft without duplicate creation or covers',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const list=await createList(page.request,'Post-create retry');let creates=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`)creates++;});
 await page.goto(`/recommendations/books/${list.id}/add`);await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');await page.getByRole('button').filter({hasText:'Fixture success'}).click();await page.locator('.ql-editor').fill('Initial create draft');const pinPattern=`**${base}/categories/books/top-picks`;await page.route(pinPattern,route=>route.request().method()==='PUT'?route.abort('failed'):route.continue());
 const created=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`),conflict=page.waitForRequest(r=>r.method()==='PUT'&&new URL(r.url()).pathname===`${base}/categories/books/top-picks`);await page.getByRole('button',{name:'Add to List',exact:true}).click();const rec=(await(await created).json()).recommendation;await conflict;await expect(page.getByText('Unable to save top-picks',{exact:true})).toBeVisible();await page.unroute(pinPattern);await expect(page.getByRole('button',{name:'Add to List',exact:true})).toBeEnabled();await expect(page.locator('.ql-editor')).toContainText('Initial create draft');const before=await editable(page.request,'recommendations',rec.id);
 await page.locator('.ql-editor').fill('Changed after pin failure');await page.getByRole('button',{name:'Rate 9 out of 10'}).click();await page.locator('input[type=file]').setInputFiles({name:'later-snapshot.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/books/${list.id}$`));expect(creates).toBe(1);const after=await editable(page.request,'recommendations',rec.id);expect(after.note.html.replaceAll('&nbsp;',' ')).toContain('Changed after pin failure');expect(after.userRating).toBe(9);expect(after.mediaIds).toHaveLength(1);expect(after.bookCovers).toEqual(before.bookCovers);
 const members=await page.request.get(`${base}/categories/books/memberships?limit=100`);expect((await members.json()).items.filter((m:any)=>m.collectionId===list.id)).toHaveLength(1);
});

test('committed create with lost response replays original receipt and retains cover identity',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const list=await createList(page.request,'Lost create receipt');const bodies:string[]=[],keys:string[]=[];let rec:any;const createPattern=`**${base}/recommendations`;
 await page.route(createPattern,async route=>{if(route.request().method()!=='POST')return route.continue();bodies.push(route.request().postData()!);keys.push(route.request().headers()['idempotency-key']);if(bodies.length===1){const committed=await route.fetch();expect(committed.status()).toBe(201);rec=(await committed.json()).recommendation;return route.abort('failed');}return route.continue();});
 await page.goto(`/recommendations/books/${list.id}/add`);await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');await page.getByRole('button').filter({hasText:'Fixture success'}).click();await page.locator('.ql-editor').fill('Original lost command');await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page.getByText('Unable to save content',{exact:true})).toBeVisible();expect(rec.id).toBeTruthy();
 const pinPattern=`**${base}/categories/books/top-picks`;await page.route(pinPattern,route=>route.request().method()==='PUT'?route.abort('failed'):route.continue());await page.locator('.ql-editor').fill('Changed after lost receipt');await page.getByRole('button',{name:'Rate 9 out of 10'}).click();await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page.getByText('Unable to save top-picks',{exact:true})).toBeVisible();expect(bodies).toHaveLength(2);expect(bodies[1]).toBe(bodies[0]);expect(keys[1]).toBe(keys[0]);const copied=await editable(page.request,'recommendations',rec.id);expect(copied.bookCovers.cover).not.toBeNull();expect(copied.bookCovers.thumbnail).not.toBeNull();
 await page.unroute(pinPattern);await page.locator('.ql-editor').fill('Final recovered draft');await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/books/${list.id}$`));const final=await editable(page.request,'recommendations',rec.id);expect(final.note.html.replaceAll('&nbsp;',' ')).toContain('Final recovered draft');expect(final.userRating).toBe(9);expect(final.bookCovers).toEqual(copied.bookCovers);const members=await page.request.get(`${base}/categories/books/memberships?limit=100`);expect((await members.json()).items.filter((m:any)=>m.collectionId===list.id)).toEqual([expect.objectContaining({recommendationId:rec.id})]);expect(bodies).toHaveLength(2);
});

test('delayed canonical catalog continuation cannot append after query change or search unmount',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const list=await createList(page.request,'Continuation fences');
 for(const mode of ['query','unmount']){await page.goto(`/recommendations/books/${list.id}/add`);await page.getByPlaceholder('Search by title, author, or ISBN...').fill(`continuation-${mode}`);await expect(page.getByRole('button').filter({hasText:'Fixture continuation-0'})).toBeVisible();const pending=page.waitForRequest(r=>new URL(r.url()).pathname===`${base}/catalog/books`&&new URL(r.url()).searchParams.has('cursor'));await page.getByRole('button',{name:'Load more books',exact:true}).click();await pending;
 if(mode==='query'){await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');await expect(page.getByRole('button').filter({hasText:'Fixture success'})).toBeVisible();await expect(page.getByRole('button',{name:'Load more books',exact:true})).toHaveCount(0);}else{await page.getByRole('button').filter({hasText:'Fixture continuation-0'}).click();await expect(page.locator('.ql-editor')).toBeVisible();await expect(page.getByPlaceholder('Search by title, author, or ISBN...')).toHaveCount(0);}
 await page.waitForTimeout(1800);await expect(page.getByText(/Fixture obsolete/)).toHaveCount(0);if(mode==='query'){await expect(page.getByRole('button',{name:'Load more books',exact:true})).toHaveCount(0);await expect(page.getByRole('alert')).toHaveCount(0);}else await expect(page.locator('.ql-editor')).toBeVisible();}
});
test('unsent invalid buy URL can be corrected and saved once',async({page})=>{
 await signIn(page,fixture.personas.ownerA);const list=await createList(page.request,'Correct validation draft');let posts=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname===`${base}/recommendations`)posts++;});await page.goto(`/recommendations/books/${list.id}/add`);await page.getByPlaceholder('Search by title, author, or ISBN...').fill('fixture');await page.getByRole('button').filter({hasText:'Fixture success'}).click();await expect(page.locator('.ql-editor')).toBeVisible();await page.getByPlaceholder('Name (e.g. Amazon)').fill('Correction');await page.getByPlaceholder('https://...').fill('http://example.com:8080/book');await page.getByRole('button',{name:'Add link',exact:true}).click();await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page.getByText('Invalid content command',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Add to List',exact:true})).toBeEnabled();expect(posts).toBe(0);await page.getByText('Correction: http://example.com:8080/book',{exact:true}).locator('..').getByRole('button').click();await page.getByPlaceholder('Name (e.g. Amazon)').fill('Correction');await page.getByPlaceholder('https://...').fill('https://example.com/book');await page.getByRole('button',{name:'Add link',exact:true}).click();await page.getByRole('button',{name:'Add to List',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/books/${list.id}$`));expect(posts).toBe(1);const members=await page.request.get(`${base}/categories/books/memberships?limit=100`);const matching=(await members.json()).items.filter((m:any)=>m.collectionId===list.id);expect(matching).toHaveLength(1);const saved=await editable(page.request,'recommendations',matching[0].recommendationId);expect(saved.bookContext.buyLinks).toEqual([{name:'Google Books',url:'https://books.google.com/buy'},{name:'Correction',url:'https://example.com/book'}]);
});