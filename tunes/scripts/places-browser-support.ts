import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {basename,dirname,isAbsolute,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import type {Pool, PoolClient} from 'pg';
import type {createCanonicalApp} from '../server/auth/canonicalApp';
import type {ExplorersAuthConfig} from '../server/auth/betterAuth';
import type {LocalObjectStorage} from '../server/services/objectStorage';
import {emptyPlaceContext, emptyPlaceDetails, placeCollectionDetailsSchema, type PlaceLocationSnapshot} from '../shared/explorersPlaceContract';
import {insertProductDetails} from '../server/repositories/productCatalogRepository';
import {insertPlaceDetails, writePlaceCollectionDetails, writePlaceContext} from '../server/repositories/placeCatalogRepository';

export function assertPlacesStorageDirectory(path:string){
  const resolved=resolve(path),parent=dirname(resolved);
  if(!isAbsolute(path)||resolved!==path||basename(resolved)!=='owned-media'||!/^explorers-profile-e2e-[A-Za-z0-9]+$/.test(basename(parent))||dirname(parent)!==resolve(tmpdir()))throw new Error('Owned Places storage path mismatch');
  for(const candidate of [parent,resolved])if(existsSync(candidate)&&(lstatSync(candidate).isSymbolicLink()||realpathSync(candidate)!==candidate||!lstatSync(candidate).isDirectory()))throw new Error('Owned Places storage custody changed');
}
/** Additive Places pin identities. Declared separately and appended to the frozen
 * original four below, which keep their existing positions and bytes. */
export const PLACES_PIN_CASES = [
  'Places: additive pinned-first owner traversal and signed seek survive reload and list navigation',
  'Places: additive public pinned pages omit private members and restart without mixed rows',
  'Places: additive complete70 staged pin order commits in advertised chunks and replays a lost acknowledgement once',
  'Places: additive complete70 resource refusal and session replacement keep the returned fence authoritative',
] as const;
/** The complete70 acceptance fixture size: the complete active membership seeded into
 * one owned list for the additive pin cases. An acceptance size for the uncapped
 * per-list obligation only; it is never a product pin cap or a staging bound. */
export const PLACES_COMPLETE70_MEMBERS = 70;
/**
 * SYNTHETIC FIXTURE DATA - NOT PRODUCTION CONFIGURATION AND NOT A DEFAULT.
 *
 * Labelled synthetic place-pins staging policy owned by this private Places browser
 * fixture. It exists only so the additive pin identities can observe an advertised
 * clientTransport; it is injected exclusively through the fixture-only canonical
 * composition path and is never read by production composition, which passes no
 * policy at all and therefore leaves the pin feature correctly unavailable.
 *
 * Real pin staging bounds (chunk and count limits, byte limits, owner draft quotas
 * and expiry) remain a MISSING EXTERNAL INPUT. Nothing here may be promoted to an
 * operational value, a default or an approved product limit.
 */
export const SYNTHETIC_FIXTURE_PLACE_PINS_POLICY = Object.freeze({
  policyId:'synthetic-fixture-places-pins-e2e',policyVersion:1,
  // The item bound admits the complete70 membership whole (never a product pin cap), while
  // the replacement BYTE bound is one fixed-width identifier array short of a 70-id single
  // replacement envelope. The client planner chooses a single replacement only when BOTH
  // bounds admit the sequence, so a byte bound - not an item cap - is what makes the
  // complete membership arrive as the several advertised chunks this policy frames it into.
  transportChunkBytes:1024,transportChunkIds:20,replacementBytes:2730,replacementIds:70,
  ownerDraftQuota:4,ownerStagingBytes:20000,draftExpiryMs:600000,stagingRetentionMs:900000,receiptRetentionMs:1800000,
  commitProcessingBytes:40000,commitProcessingMs:20000,commitWorkUnits:100000,cleanupBatchSize:16,cleanupWorkUnits:256,
});
export const PLACES_CASES = [
  'Places: retained location create edit and reload preserve zero and absent coordinates',
  'Places: complete owner and anonymous pages contain every seeded list and recommendation',
  'Places: owned image bytes disappear after the final public attachment is hidden',
  'Places: foreign owner edits and private contact reads cannot disclose owner data',
  ...PLACES_PIN_CASES,
] as const;
export const PLACE_LINK_CASES = [
  'Place links: existing Products and People lists attach detach and survive reload',
  'Place links: retained create forms atomically create and link Products and People lists',
  'Place links: public children obey parent child category and account visibility',
  'Place links: stale and foreign link commands preserve both lists',
] as const;
export type PlacesLane = 'places' | 'place-links';
export type PlacesIdentity = {caseId:string; project:string};
export type PlacesPersona = {userId:string; accountId:string; handle:string; cookie:string; revision:number};
type LocationSeed = {title:string; slug:string; displayOrder:number; snapshot:PlaceLocationSnapshot};
export function buildPlacesSeedPlan(caseId:string) {
  if (![...PLACES_CASES,...PLACE_LINK_CASES].includes(caseId as never)) throw new Error('Undeclared Places case');
  const traversal = caseId === PLACES_CASES[1];
  // Additive pin cases seed the complete70 acceptance membership into the first owned
  // list and keep the original two-location shape, so a second list stays available
  // for the cross-list navigation obligation.
  const pinned = (PLACES_PIN_CASES as readonly string[]).includes(caseId);
  const locationCount = traversal?53:2;
  const recommendationCount = pinned?PLACES_COMPLETE70_MEMBERS:traversal?53:1;
  return {
    locations:Array.from({length:locationCount},(_,index):LocationSeed=>({
      title:index===0?'Owned Zero City':index===1?'Owned Absent City':`Owned City C${String(index+1).padStart(2,'0')}`,
      slug:`owned-city-c${String(index+1).padStart(2,'0')}`,displayOrder:index,
      snapshot:{version:1,name:index===1?'Owned Absent City':'Owned Zero City',address:'Owned Test Country',providerPlaceId:null,latitude:index===1?null:0,longitude:index===1?null:0},
    })),
    recommendations:Array.from({length:recommendationCount},(_,index)=>({title:`Owned Place R${String(index+1).padStart(2,'0')}`,displayOrder:index})),
    traversal,
    pinned,
    // Observed public list page sizes for the seeded locations; identical to the
    // previously inlined [24,24,5] / [2] for the original four cases.
    publicPageSizes:Array.from({length:Math.ceil(locationCount/24)},(_,index)=>Math.min(24,locationCount-index*24)),
  };
}
export function validatePlacesControl(input:{remote:string;host:string;expectedHost:string;capability:string;expectedCapability:string;runId:string;expectedRunId:string;commit:string;expectedCommit:string;lane:string;body:Record<string,unknown>;active?:PlacesIdentity}) {
  const b=input.body, titles=input.lane==='places'?PLACES_CASES:input.lane==='place-links'?PLACE_LINK_CASES:[];
  if(input.remote!=='127.0.0.1'||input.host!==input.expectedHost||! /^[a-f0-9]{64}$/.test(input.capability)||! /^[a-f0-9]{64}$/.test(input.expectedCapability)||!timingSafeEqual(Buffer.from(input.capability),Buffer.from(input.expectedCapability))||input.runId!==input.expectedRunId||input.commit!==input.expectedCommit||! /^[a-f0-9]{32}$/.test(input.runId)||! /^[a-f0-9]{40}$/.test(input.commit)||!b||Array.isArray(b)||Object.keys(b).sort().join(',')!=='action,caseId,commit,project,repeat,runId'||b.runId!==input.runId||b.commit!==input.commit||b.repeat!==0||!titles.includes(b.caseId as never)||! [`${input.lane}-desktop`,`${input.lane}-mobile`].includes(String(b.project))||! ['reset','observe'].includes(String(b.action))||(b.action==='observe'&&(input.active?.caseId!==b.caseId||input.active?.project!==b.project)))throw new Error('Owned Places control denied');
}
type ResetContent = {id:string;account_id:string;category:string};
type ResetAnalytics = ResetContent & {collection_id:string|null;recommendation_id:string|null};
export function ownedPlacesAnalyticsIds(events:ResetAnalytics[],content:ResetContent[],accountIds:string[]) {
  const owned=new Set(accountIds),categories=new Set(['places','products','people']);
  const targets=new Map(content.filter(row=>owned.has(row.account_id)&&categories.has(row.category)).map(row=>[row.id,row]));
  return events.filter(event=>owned.has(event.account_id)&&categories.has(event.category)&&[event.collection_id,event.recommendation_id].some(id=>{const target=id?targets.get(id):undefined;return target?.account_id===event.account_id&&target?.category===event.category;})).map(event=>event.id);
}
export const PLACES_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==','base64');
type Collection = {id:string;accountId:string;category:string;title:string;slug:string;displayOrder:number;revision:number;snapshot:PlaceLocationSnapshot|null;visibility:'public'|'private';publicationState:'published'};
type Recommendation = {id:string;accountId:string;collectionId:string;entityId:string;title:string;displayOrder:number;revision:number};
type Media = {id:string;accountId:string;collectionId:string;key:string;sha256:string;length:number;contentType:'image/png';url:string;label:string};
export type PlacesManifest = {version:1;runId:string;commit:string;caseId:string;project:string;personas:Record<string,PlacesPersona>;collections:Collection[];recommendations:Recommendation[];relations:{childCollectionId:string;locationCollectionId:string;accountId:string}[];media:Media[];expectedPublic:{placesCollectionIds:string[];recommendationIds:string[];pageSizes:number[];previewLimit:12;linkedArrayLimit:12};provider:'simulated Maps selection and bounded Google REST; no provider photos'};
/** Private Node controller. The capability and session cookies are never browser globals. */
export async function startPlacesControl(options:{pool:Pool;composed:ReturnType<typeof createCanonicalApp>;config:ExplorersAuthConfig;runId:string;commit:string;personas:Record<string,{userId:string;cookie:string;handle:string}>;storage:LocalObjectStorage;storageDirectory:string;port:number;apiOrigin:string;lane:PlacesLane}) {
  const {pool,config,runId,commit,storage,apiOrigin,lane}=options;
  assertPlacesStorageDirectory(options.storageDirectory);
  if(!/^[a-f0-9]{32}$/.test(runId)||!/^[a-f0-9]{40}$/.test(commit)||!['places','place-links'].includes(lane)||!Number.isInteger(options.port)||options.port<1024||options.port>65535||!/^http:\/\/127\.0\.0\.1:[1-9]\d{3,4}$/.test(apiOrigin)||Number(new URL(apiOrigin).port)>65535)throw new Error('Owned Places startup authority mismatch');
  const capability=randomBytes(32).toString('hex'),host=`127.0.0.1:${options.port}`;
  const personas:Record<string,PlacesPersona>={};
  for(const [name,persona] of Object.entries(options.personas)) {
    const initial=await fetch(`${apiOrigin}/api/explorers/v1/me`,{headers:{Cookie:persona.cookie},signal:AbortSignal.timeout(10000)});
    if(initial.status!==200)throw new Error('Owned Places session materialization failed');
    const current=await initial.json() as {account:{id:string;revision:number}};
    const completed=await fetch(`${apiOrigin}/api/explorers/v1/account`,{method:'PATCH',headers:{Cookie:persona.cookie,Origin:config.baseURL,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({expectedRevision:current.account.revision,handle:persona.handle,displayName:`Places ${name}`,accountType:'Creator',onboardingStatus:'complete'}),signal:AbortSignal.timeout(10000)});
    if(completed.status!==200)throw new Error('Owned Places canonical onboarding failed');
    const dto=await completed.json() as {account:{revision:number}};
    personas[name]={...persona,accountId:current.account.id,revision:dto.account.revision};
  }
  const accountIds=Object.values(personas).map(p=>p.accountId),userIds=Object.values(personas).map(p=>p.userId);
  let manifest:PlacesManifest|undefined,closed=false,busy=false;
  const entityIds=new Set<string>(),keys=new Set<string>();
  async function assertOwnership(db:Pool|PoolClient) {
    if((await db.query('SELECT current_database() AS database')).rows[0]?.database!==`music_uat_${runId}`)throw new Error('Owned Places database fingerprint changed');
    const owned=await db.query('SELECT user_id,account_id FROM initial_account_bindings WHERE user_id=ANY($1::text[])',[userIds]);
    if(owned.rows.length!==userIds.length||Object.values(personas).some(p=>!owned.rows.some(row=>row.user_id===p.userId&&row.account_id===p.accountId)))throw new Error('Owned Places fingerprint changed');
  }
  async function reset(identity:PlacesIdentity):Promise<PlacesManifest> {
    const plan=buildPlacesSeedPlan(identity.caseId),oldKeys=[...keys],newKeys:string[]=[],newEntities:string[]=[];
    const result:PlacesManifest={version:1,runId,commit,...identity,personas,collections:[],recommendations:[],relations:[],media:[],expectedPublic:{placesCollectionIds:[],recommendationIds:[],pageSizes:plan.publicPageSizes,previewLimit:12,linkedArrayLimit:12},provider:'simulated Maps selection and bounded Google REST; no provider photos'};
    manifest=undefined;
    let committed=false;
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query("SET LOCAL statement_timeout='10000ms'");
      await assertOwnership(db);
      // 0036 retains analytics receipt tombstones, while exact event references
      // must be removed before the owned content's RESTRICT foreign keys permit reset.
      const content=(await db.query<ResetContent>("SELECT id,account_id,category FROM collections WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people') UNION ALL SELECT id,account_id,category FROM recommendations WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people')",[accountIds])).rows;
      const events=(await db.query<ResetAnalytics>("SELECT id,account_id,category,collection_id,recommendation_id FROM analytics_events WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people') AND (collection_id IS NOT NULL OR recommendation_id IS NOT NULL)",[accountIds])).rows;
      const eventIds=ownedPlacesAnalyticsIds(events,content,accountIds);
      if(eventIds.length){
        await db.query('UPDATE analytics_event_receipts SET event_id=NULL,retired_at=coalesce(retired_at,clock_timestamp()) WHERE event_id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])',[eventIds,accountIds]);
        await db.query('DELETE FROM analytics_events WHERE id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])',[eventIds,accountIds]);
      }
      // These three personas were created solely for this owned run. Scope every
      // deletion to them and the three allocated categories, including UI-created rows.
      await db.query("DELETE FROM collections WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people')",[accountIds]);
      await db.query("DELETE FROM recommendations WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people')",[accountIds]);
      if(entityIds.size)await db.query('DELETE FROM entities WHERE id=ANY($1::uuid[]) AND NOT EXISTS(SELECT 1 FROM recommendations WHERE entity_id=entities.id)',[[...entityIds]]);
      const ownedMediaIds=oldKeys.map(key=>key.split('/')[2]);
      if(ownedMediaIds.length){
        await db.query("DELETE FROM media_objects WHERE media_id=ANY($1::uuid[]) AND object_key=ANY($2::text[]) AND storage_environment='local'",[ownedMediaIds,oldKeys]);
        await db.query("DELETE FROM media_assets WHERE id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[]) AND purpose='collection'",[ownedMediaIds,accountIds]);
      }
      for(const [name,p] of Object.entries(personas)) {
        await db.query("UPDATE creator_accounts SET status='active',suspended_at=NULL,deletion_requested_at=NULL,onboarding_status='complete',handle=$2,display_name=$3,account_type='Creator',public_profile=true WHERE id=$1",[p.accountId,p.handle,`Places ${name}`]);
        await db.query('UPDATE user_security_state SET blocked_at=NULL WHERE user_id=$1',[p.userId]);
        for(const category of ['places','products','people'])await db.query(`INSERT INTO account_category_settings(account_id,category,is_public,display_order) SELECT $1,$2,true,coalesce(max(display_order)+1,0) FROM account_category_settings WHERE account_id=$1 ON CONFLICT(account_id,category) DO UPDATE SET is_public=true`,[p.accountId,category]);
      }
      async function collection(accountId:string,category:string,title:string,slug:string,order:number,snapshot:PlaceLocationSnapshot|null=null,visibility:'public'|'private'='public') {
        const id=randomUUID();
        await db.query("INSERT INTO collections(id,account_id,category,title,slug,display_order,visibility,publication_state) VALUES($1,$2,$3,$4,$5,$6,$7,'published')",[id,accountId,category,title,slug,order,visibility]);
        if(category==='places')await writePlaceCollectionDetails(db,id,accountId,placeCollectionDetailsSchema.parse({locationEntityId:null,locationSnapshot:snapshot,instagramMediaUrl:null}));
        const row:Collection={id,accountId,category,title,slug,displayOrder:order,revision:1,snapshot,visibility,publicationState:'published'};
        result.collections.push(row);return row;
      }
      async function recommendation(list:Collection,title:string,order:number) {
        const entityId=randomUUID(),id=randomUUID(),kind=list.category==='places'?'place':list.category==='products'?'product':'person';
        await db.query("INSERT INTO entities(id,kind,title,origin) VALUES($1,$2,$3,'manual')",[entityId,kind,title]);newEntities.push(entityId);
        if(kind==='product')await insertProductDetails(db,entityId,{productUrl:'https://example.invalid/owned-product',brand:null,logoUrl:null,description:null,specifications:{},imageUrls:[]});
        if(kind==='place')await insertPlaceDetails(db,entityId,{...emptyPlaceDetails(),latitude:0,longitude:0,formattedAddress:'Owned Test Country'});
        await db.query("INSERT INTO recommendations(id,account_id,category,entity_id,publication_state) VALUES($1,$2,$3,$4,'published')",[id,list.accountId,list.category,entityId]);
        // The owner pin editor and the public card both label a place by its contact name
        // when one exists, falling back to the place title. The original four cases seed one
        // shared private contact on purpose, because they assert that contact never leaks.
        // The additive pin cases address members BY TITLE, so a single shared contact name
        // would make all 70 members indistinguishable in the UI; they seed no contact at
        // all. No case loses a contact it asserts on, and no assertion is relaxed.
        if(kind==='place')await writePlaceContext(db,id,list.accountId,plan.pinned?emptyPlaceContext()
          :{...emptyPlaceContext(),contactName:'Owned private contact',contactNumber:'+15550001111'});
        await db.query('INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,$5)',[list.id,id,list.accountId,list.category,order]);
        result.recommendations.push({id,accountId:list.accountId,collectionId:list.id,entityId,title,displayOrder:order,revision:1});
      }
      const a=personas.ownerA,b=personas.ownerB;
      for(const seed of plan.locations)await collection(a.accountId,'places',seed.title,seed.slug,seed.displayOrder,seed.snapshot,identity.caseId===PLACES_CASES[0]&&seed.displayOrder===1?'private':'public');
      const parents=result.collections.filter(c=>c.accountId===a.accountId&&c.category==='places');
      for(const seed of plan.recommendations)await recommendation(parents[0],seed.title,seed.displayOrder);
      const independent=await collection(b.accountId,'places',parents[0].title,parents[0].slug,0,parents[0].snapshot);
      await recommendation(independent,'Independent owner B recommendation',0);
      const products=await collection(a.accountId,'products','Owned Products','owned-products',0);
      const people=await collection(a.accountId,'people','Owned People','owned-people',0);
      const accountChild=await collection(a.accountId,'products','Owned Account Products','owned-account-products',1);
      const privateProduct=await collection(a.accountId,'products','Private Products','private-products',2,null,'private');
      const privatePeople=await collection(a.accountId,'people','Private People','private-people',1,null,'private');
      for(const child of [products,people,accountChild,privateProduct,privatePeople])await recommendation(child,`${child.title} recommendation`,0);
      // Existing attach/detach and stale cases begin unlinked. Visibility begins
      // linked; this setup never substitutes for a canonical transition under test.
      if(identity.caseId===PLACE_LINK_CASES[2])for(const child of [products,people,privateProduct,privatePeople]) {
        await db.query('INSERT INTO collection_location_links(child_collection_id,account_id,child_category,location_collection_id) VALUES($1,$2,$3,$4)',[child.id,a.accountId,child.category,parents[0].id]);
        result.relations.push({childCollectionId:child.id,locationCollectionId:parents[0].id,accountId:a.accountId});
      }
      const hash=createHash('sha256').update(PLACES_PNG).digest();
      for(const [label,list] of [['Pparent',parents[0]],['Pproduct',products],['Ppeople',people],['Paccount',accountChild],['Pindependent',independent]] as const) {
        const id=randomUUID(),key=`local/${list.accountId}/${id}`;
        newKeys.push(key);await storage.put(key,PLACES_PNG);
        await db.query("INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at) VALUES($1,$2,'collection','ready','image/png',$3,$4,now())",[id,list.accountId,PLACES_PNG.length,hash]);
        await db.query("INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256) VALUES($1,'original','local',$2,'image/png',$3,$4)",[id,key,PLACES_PNG.length,hash]);
        await db.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[list.id,list.accountId,id]);
        result.media.push({id,accountId:list.accountId,collectionId:list.id,key,sha256:hash.toString('hex'),length:PLACES_PNG.length,contentType:'image/png',url:`/api/explorers/v1/media/${id}/content`,label});
      }
      // Triggered category/attachment revisions are real observations, never guesses.
      for(const row of result.collections)row.revision=Number((await db.query('SELECT revision::text FROM collections WHERE id=$1',[row.id])).rows[0].revision);
      for(const row of result.recommendations)row.revision=Number((await db.query('SELECT revision::text FROM recommendations WHERE id=$1',[row.id])).rows[0].revision);
      for(const p of Object.values(personas))p.revision=Number((await db.query('SELECT revision::text FROM creator_accounts WHERE id=$1',[p.accountId])).rows[0].revision);
      result.expectedPublic.placesCollectionIds=parents.filter(c=>c.visibility==='public').map(c=>c.id);
      result.expectedPublic.recommendationIds=result.recommendations.filter(r=>r.collectionId===parents[0].id).map(r=>r.id);
      await db.query('COMMIT');committed=true;
      newEntities.forEach(id=>entityIds.add(id));newKeys.forEach(key=>keys.add(key));
      for(const key of oldKeys){await storage.delete(key);keys.delete(key);}
      const context=await options.composed.auth.$context;
      for(const persona of Object.values(personas)){
        const session=await context.internalAdapter.createSession(persona.userId,false);
        const signature=createHmac('sha256',config.secret).update(session.token).digest('base64');
        persona.cookie=`${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
        const verified=await fetch(`${apiOrigin}/api/explorers/v1/me`,{headers:{Cookie:persona.cookie},signal:AbortSignal.timeout(10000)});
        const dto=await verified.json() as {account?:{id:string;revision:number}};
        if(verified.status!==200||dto.account?.id!==persona.accountId)throw new Error('Owned Places reset session verification failed');
        persona.revision=dto.account.revision;
      }
      manifest=result;return result;
    } catch(error) {
      if(!committed){
        await db.query('ROLLBACK');
        for(const key of newKeys){keys.add(key);await storage.delete(key);keys.delete(key);}
      }
      throw error;
    } finally {db.release();}
  }
  const server=createServer(async(req,res)=>{
    try {
      if(closed||busy||req.method!=='POST'||req.url!=='/control')throw new Error('Control unavailable');
      let size=0;const chunks:Buffer[]=[];
      for await(const chunk of req){size+=chunk.length;if(size>4096)throw new Error('Control too large');chunks.push(Buffer.from(chunk));}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      validatePlacesControl({remote:req.socket.remoteAddress??'',host:req.headers.host??'',expectedHost:host,capability:String(req.headers['x-places-capability']??''),expectedCapability:capability,runId,expectedRunId:runId,commit,expectedCommit:commit,lane,body,active:manifest});
      if(busy||closed)throw new Error('Control unavailable');
      busy=true;
      try {
        await assertOwnership(pool);
        const result=body.action==='reset'?await reset({caseId:body.caseId,project:body.project}):{
          version:1,runId,commit,caseId:manifest!.caseId,project:manifest!.project,
          collections:(await pool.query("SELECT id,account_id,category,title,slug,revision::text,visibility,publication_state FROM collections WHERE account_id=ANY($1::uuid[]) AND category IN ('places','products','people') ORDER BY account_id,category,display_order,id LIMIT 256",[accountIds])).rows,
          relations:(await pool.query('SELECT child_collection_id,location_collection_id,account_id FROM collection_location_links WHERE account_id=ANY($1::uuid[]) ORDER BY child_collection_id LIMIT 64',[accountIds])).rows,
        };
        res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(result));
      } finally {busy=false;}
    }catch{res.statusCode=403;res.end('{"error":"owned Places control denied"}');}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(options.port,'127.0.0.1',done);});
  return {url:`http://${host}/control`,capability,runId,commit,version:1 as const,close:async()=>{
    closed=true;
    await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));
    for(const key of keys){await storage.delete(key);keys.delete(key);}
  }};
}
