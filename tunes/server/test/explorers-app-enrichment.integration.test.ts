import {describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {ExplorersAppEnrichmentRepository} from '../repositories/explorersAppEnrichmentRepository';
import {canonicalAppJson,hashAppSnapshot} from '../application/appEnrichmentValidation';
const identity={sourceId:'synthetic',sourceIdentity:'Exact/A',sourceIdentityHash:'a'.repeat(64),canonicalizationVersion:'v1'};
const time='2026-10-12T00:00:00.000Z';
const snapshot=()=>{const value={snapshotId:randomUUID(),appEntityId:randomUUID(),...identity,adapterVersion:'v1',fetchedAt:time,contentHash:'0'.repeat(64),fields:{description:null,platforms:[]},fieldProvenance:{description:{sourceUrl:'https://example.org/app',observedAt:time},platforms:{sourceUrl:'https://example.org/app',observedAt:time}}};return {...value,contentHash:hashAppSnapshot(value)};};
const unavailable={connect:()=>{throw new Error('Unexpected resource access');}} as unknown as Pool;
const forbiddenTextCodes=[0,...Array.from({length:8},(_,index)=>index+1),11,12,...Array.from({length:18},(_,index)=>index+14),127];
// appTitleSchema forbids EVERY C0 plus U+007F, so TAB/LF/CR are lawful interior text in a
// description or platform member and forbidden in a title. Keeping the two sets apart is what
// lets the title evidence below fail for the control-character reason it claims to test.
const forbiddenTitleCodes=[...Array.from({length:32},(_,index)=>index),127];
// The ECMAScript WhiteSpace+LineTerminator characters zod .string().trim() strips but
// PostgreSQL btrim/1 does not. A value with one of these at either edge differs from its
// contract-trimmed form, so a raw-payload contentHash survives storage admission and then
// fails the read-side comparison permanently. 9/10/13 are the cited tab/newline gap; the rest
// are non-space Unicode whitespace that no locale-independent space test would have caught.
const trimEdgeCodes=[9,10,13,32,160,8192,12288,65279];
const trimEdgeTitleCodes=[32,160,8192,12288,65279];
// Spellings PostgreSQL's ::timestamptz and ::uuid input accept and the shared contract refuses.
// Derived by probing the actual schemas: datetime input skips surrounding whitespace and takes
// a space separator, lowercase t/z and a bare +HH offset, while hour 24, second 60 and a
// non-leap 29 February are accepted by the cast but refused by zod's datetime regex. uuid input
// additionally accepts brace-wrapped and unhyphenated spellings. Shared by the portable
// contract-side case and by the authored A1-S08 SQL evidence, so both target one list.
const unlawfulInstants=[' 2026-10-12T00:00:00.000Z','2026-10-12T00:00:00.000Z ','2026-10-12 00:00:00+00','2026-10-12t00:00:00.000Z','2026-10-12T00:00:00.000z','2026-10-12T00:00:00+00','2026-10-12T24:00:00.000Z','2026-10-12T00:00:60.000Z','2026-02-29T00:00:00.000Z'];
// Year zero is the SECOND of 0055's two documented retained-cast exceptions, and unlike the
// non-leap 29 February it is CONTRACT-LAWFUL (measured: snapshotForStorage admits it), so it
// cannot join `unlawfulInstants` - the portable admission case there asserts a contract throw.
// It therefore gets its own list, used only by the A1-S08 SQL evidence, where it is well-formed
// to app_enrichment_instant, reaches the retained cast and refuses as 22008 (measured).
const castExceptionInstants=['0000-01-01T00:00:00Z'];
const unlawfulIds=[`{${randomUUID()}}`,randomUUID().replace(/-/g,''),` ${randomUUID()}`,`${randomUUID()} `];
// Hosts the WHATWG URL parser inside safeAppUrlSchema refuses: an invalid percent-escape, an
// encoded delimiter, an empty bracketed literal, and dotted hosts read as malformed IPv4.
const unlawfulHosts=['%','%zz','a%2fb','[]','1.2.3.4.5','999.999.999.999'];
const provenanceFor=(fields:Record<string,unknown>)=>Object.fromEntries(Object.keys(fields).map(key=>[key,{sourceUrl:'https://example.org/app',observedAt:time}]));
/** Builds a snapshot shape over arbitrary fields with exactly matching provenance, so a refusal
 * below is attributable to the field's own text clause rather than to a fields/provenance mismatch. */
const snapshotWith=(fields:Record<string,unknown>,appEntityId?:string)=>({snapshotId:randomUUID(),appEntityId:appEntityId??randomUUID(),...identity,adapterVersion:'v1',fetchedAt:time,contentHash:'0'.repeat(64),fields,fieldProvenance:provenanceFor(fields)});
const edged=(text:string,code:number,position:'lead'|'trail')=>position==='lead'?`${String.fromCharCode(code)}${text}`:`${text}${String.fromCharCode(code)}`;
function rawSnapshotHash(value:ReturnType<typeof snapshot>):string {const {snapshotId:_id,contentHash:_hash,...payload}=value;return createHash('sha256').update(canonicalAppJson(payload),'utf8').digest('hex');}
describe('Apps A1 portable storage admission',()=>{
 it('validates exact immutable registry tuples before resource admission',()=>{
  expect(()=>new ExplorersAppEnrichmentRepository(unavailable,[{...identity,extra:true}])).toThrow();
  expect(()=>new ExplorersAppEnrichmentRepository(unavailable,[identity,identity])).toThrow();
 });
 it('validates actual canonical snapshot hash and exact provenance',()=>{
  const value=snapshot();expect(ExplorersAppEnrichmentRepository.snapshotForStorage(value)).toEqual(value);
  expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage({...value,contentHash:'b'.repeat(64)})).toThrow();
  expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage({...value,fieldProvenance:{}})).toThrow();
 });
 it('rejects absent registry before transaction and never assumes providers',async()=>{
  const repo=new ExplorersAppEnrichmentRepository(unavailable);
  await expect(repo.execute(randomUUID(),randomUUID(),{operation:'configureAppEnrichment',...identity,optIn:true,expectedBindingRevision:null,expectedRecommendationRevision:1},randomUUID(),{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:422});
 });
 it('preserves allowed interior whitespace and refuses every forbidden title, description and platform control',()=>{
  for(const code of forbiddenTextCodes)for(const field of ['description','platforms'] as const){const value=snapshot(),text=`a${String.fromCharCode(code)}b`;const bad={...value,fields:{...value.fields,[field]:field==='platforms'?[text]:text}};bad.contentHash=rawSnapshotHash(bad as ReturnType<typeof snapshot>);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();}
  for(const code of forbiddenTitleCodes){const bad=snapshotWith({title:`a${String.fromCharCode(code)}b`,description:null,platforms:[]});bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();}
  for(const code of [9,10,13]){const value=snapshot(),text=`a${String.fromCharCode(code)}b`;const allowed={...value,fields:{description:text,platforms:[text]}};allowed.contentHash=hashAppSnapshot(allowed);expect(ExplorersAppEnrichmentRepository.snapshotForStorage(allowed).fields).toEqual(allowed.fields);}
 });
 it('rejects every edge-whitespace value whose raw hash would outlive contract trimming',()=>{
  // This is the poisoning the storage layer must refuse: the raw payload hashes clean, the
  // contract then trims the edge character, re-hashes and can never match again. Asserting the
  // 422 here fixes the exact contract-side behaviour 0055 is now required to stay ahead of.
  for(const position of ['lead','trail'] as const){
   for(const code of trimEdgeCodes)for(const field of ['description','platforms'] as const){const text=edged('a',code,position),bad=snapshotWith({...(field==='platforms'?{platforms:[text],description:null}:{description:text,platforms:[]})});bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();}
   for(const code of trimEdgeTitleCodes){const bad=snapshotWith({title:edged('Title',code,position),description:null,platforms:[]});bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();}
  }
 });
 // 0055 constrained snapshotId/appEntityId with ::uuid and fetchedAt/observedAt with
 // ::timestamptz only. PostgreSQL's input for both types is far laxer than the contract's:
 // uuid also takes brace-wrapped and unhyphenated spellings, and datetime input skips
 // surrounding whitespace and accepts a space separator, lowercase t/z and a bare +HH offset.
 // Snapshot rows always originate outside this repository (music_runtime holds SELECT only on
 // app_enrichment_snapshots), so these are the exact spellings an out-of-band writer could
 // store past a cast-only guard, on an immutable row, denying the owner's entire suggestion
 // list forever. This case pins the contract side of that parity so the SQL grammar has a
 // falsifiable target; the SQL clauses themselves are witnessed by A1-S08.
 it('refuses every lax uuid and instant spelling a bare cast would have admitted',()=>{
  const value=snapshot();expect(ExplorersAppEnrichmentRepository.snapshotForStorage(value)).toEqual(value);
  for(const instant of unlawfulInstants){
   for(const bad of [{...value,fetchedAt:instant},{...value,fieldProvenance:{...value.fieldProvenance,description:{sourceUrl:'https://example.org/app',observedAt:instant}}}]){
    bad.contentHash=rawSnapshotHash(bad);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();
   }
  }
  for(const id of unlawfulIds)for(const field of ['snapshotId','appEntityId'] as const){
   const bad={...value,[field]:id};bad.contentHash=rawSnapshotHash(bad);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();
  }
  // An uppercase-hex id is LAWFUL: zod v3's uuid regex is case-insensitive and constrains
  // neither the version nor the variant nibble, so the SQL pattern may not refuse these.
  for(const id of [randomUUID().toUpperCase(),'a0eebc99-9c0b-9ef8-0b6d-6bb9bd380a11']){
   const good={...value,appEntityId:id};good.contentHash=hashAppSnapshot(good);
   expect(ExplorersAppEnrichmentRepository.snapshotForStorage(good).appEntityId).toBe(id);
  }
  // Hosts the WHATWG URL parser refuses although a character-class regex admits them.
  for(const host of unlawfulHosts){
   const bad={...value,fieldProvenance:{...value.fieldProvenance,description:{sourceUrl:`https://${host}/app`,observedAt:time}}};
   bad.contentHash=rawSnapshotHash(bad);expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();
  }
 });
 it('distinguishes owned historical entitlement conflict from foreign snapshot guess',async()=>{
  const account=randomUUID(),recommendation=randomUUID(),entity=randomUUID(),actor=randomUUID(),binding=randomUUID(),current=randomUUID(),historical=randomUUID(),ownedSnapshot=randomUUID();
  const client={release:()=>{},query:async(sql:string,values?:unknown[])=>{
   if(sql==='BEGIN'||sql==='ROLLBACK')return {rows:[]};
   if(sql.startsWith('SELECT r.*,e.kind,e.origin'))return {rows:[{id:recommendation,account_id:account,entity_id:entity,category:'apps',kind:'app',origin:'manual',revision:'1',archived_at:null}]};
   if(sql.startsWith('SELECT status FROM creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.startsWith('SELECT request_hash,response,status'))return {rows:[]};
   if(sql.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[]};
   if(sql.startsWith('SELECT * FROM app_enrichment_bindings'))return {rows:[{id:binding,account_id:account,recommendation_id:recommendation,app_entity_id:entity,opt_in:true,binding_revision:'3',current_generation_id:current}]};
   if(sql.startsWith('SELECT g.*,EXISTS'))return {rows:[{id:current,binding_id:binding,account_id:account,recommendation_id:recommendation,app_entity_id:entity,...{source_id:identity.sourceId,source_identity:identity.sourceIdentity,source_identity_hash:identity.sourceIdentityHash,canonicalization_version:identity.canonicalizationVersion},created_at:time,retired:false}]};
   if(sql.startsWith('SELECT * FROM app_enrichment_entitlements')){
    // The controlled catalog contains only one owner-qualified historical entitlement. A
    // current-only lookup lawfully returns no row, so this mock must gate on the statement the
    // repository actually issues: the owned-historical fix requires the current generation to
    // influence ORDER BY only and never the WHERE predicate. Gating on a parameter placeholder
    // the statement does not contain made the branch dead and the 409 unfalsifiable; asserting
    // the shape as well means reintroducing `AND generation_id=$4` fails here instead of
    // silently passing.
    const where=sql.slice(sql.indexOf(' WHERE '),sql.indexOf(' ORDER BY '));
    const currentOnly=/generation_id/.test(where);
    expect(currentOnly).toBe(false);
    expect(sql).toMatch(/ORDER BY \(generation_id=\$4\) DESC/);
    return {rows:values?.[0]===ownedSnapshot&&!currentOnly?[{snapshot_id:ownedSnapshot,recommendation_id:recommendation,generation_id:historical,account_id:account,app_entity_id:entity,observed_binding_revision:'1'}]:[]};
   }
   throw new Error('Unexpected portable statement');
  }};
  const pool={connect:async()=>client} as unknown as Pool,repo=new ExplorersAppEnrichmentRepository(pool,[identity]);
  const command={operation:'acceptAppEnrichment',expectedRecommendationRevision:1,expectedBindingRevision:3,selectedFields:[]};
  await expect(repo.execute(account,recommendation,{...command,snapshotId:ownedSnapshot},actor,{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});
  await expect(repo.execute(account,recommendation,{...command,snapshotId:randomUUID()},actor,{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:404});
 });
 it('rejects malformed command and key before resource admission',async()=>{
  const repo=new ExplorersAppEnrichmentRepository(unavailable,[identity]);
  await expect(repo.execute(randomUUID(),randomUUID(),{operation:'disableAppEnrichment',expectedRecommendationRevision:1,expectedBindingRevision:1},randomUUID(),{idempotencyKey:'short'})).rejects.toMatchObject({status:422});
  await expect(repo.execute(randomUUID(),randomUUID(),{operation:'disableAppEnrichment',extra:true},randomUUID(),{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:422});
 });
});

import type {PoolClient} from 'pg';
import {ExplorersRecommendationRepository} from '../repositories/explorersRecommendationRepository';
import type {AppEnrichmentResult} from '../repositories/explorersAppEnrichmentRepository';
/** The root-owned canonical55 runner supplies owned tracked pools and actual application/lifecycle seams.
 * This module never constructs pools, reads env, creates a database, runs automatically, or calls a provider.
 * Each callback is mandatory: missing shared mounts fail qualification rather than skip or claim success. */
export type AppsA1StorageHarness={
 admin:Pool;runtime:Pool;runtimeA:Pool;runtimeB:Pool;
 case:(id:string,work:()=>Promise<void>)=>Promise<void>;
 cleanup:()=>Promise<void>;
 reloadDisplay:(account:string,recommendation:string)=>Promise<Record<string,unknown>>;
 currentActorReplayStatus:(account:string,recommendation:string,command:unknown,key:string)=>Promise<number>;
 purgeOwned:(account:string)=>Promise<void>;
 waitForRuntimeBlocked:(pool:Pool)=>Promise<void>;
};
export const appsA1StorageCaseIds=[
 'A1-S01 ownership/category/kind/manual constraints','A1-S02 immutable payload and grant denials',
 'A1-S03 configure absent and empty registry','A1-S04 configure equal and disable equal',
 'A1-S05 binding-only change','A1-S06 rebind A-B-A retirement',
 'A1-S07 entitlement isolation/source identity','A1-S08 snapshot provenance/hash/schema',
 'A1-S09 changed merge/cache','A1-S10 empty acceptance','A1-S11 equal normalized acceptance',
 'A1-S12 stale manual edit','A1-S13 disabled fresh acceptance','A1-S14 replay and current authorization',
 'A1-S15 atomic deferred rollback','A1-S16 replacement retirement','A1-S17 lifecycle and shared retention','A1-S18 transaction races'
] as const;
type Fixture={account:string;recommendation:string;entity:string;actor:string};
type BindingResult=Extract<AppEnrichmentResult,{bindingId:string}>;
async function seedApps(h:AppsA1StorageHarness,entity?:string,category='apps',kind='app',origin='manual'):Promise<Fixture>{
 const account=(await h.admin.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
 const actualEntity=entity??(await h.admin.query('INSERT INTO entities(kind,title,origin) VALUES($1,$2,$3) RETURNING id',[kind,'Synthetic app',origin])).rows[0].id;
 if(!entity&&kind==='app')await h.admin.query('INSERT INTO app_entity_details(entity_id,app_url,developer,description,platforms) VALUES($1,$2,$3,$4,$5)',[actualEntity,'https://example.org/app','Manual developer','Manual description',['Manual']]);
 const recommendation=(await h.admin.query('INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,$2,$3) RETURNING id',[account,category,actualEntity])).rows[0].id;
 return {account,recommendation,entity:actualEntity,actor:randomUUID()};
}
/** seedApps deliberately creates a bare Apps recommendation with no list membership, which is
 * all the enrichment commands need. ExplorersRecommendationRepository.replaceRecommendationEntity
 * is different: it locks the recommendation's PARENT COLLECTIONS first and refuses with
 * 404 'Recommendation aggregate unavailable' (explorersRecommendationRepository.ts:494) when the
 * recommendation belongs to no live owner collection, because an entity replacement has to carry
 * every list the recommendation appears in. So the groups that exercise the real replacement call
 * must first put the fixture in one lawful, non-archived collection of its own category. This is
 * a genuine precondition of the command, not a softening: the membership is inserted with the
 * owner's own account and category so the collections/collection_items composite foreign keys
 * (0029:54-55) are satisfied exactly as an owner-created list would be, and nothing about the
 * replacement behaviour under assertion is relaxed. */
async function listed(h:AppsA1StorageHarness,f:Fixture,category='apps'){
 const collection=(await h.admin.query('INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,$2,$3,$4,0) RETURNING id',[f.account,category,'Owner list',`owner-list-${category}`])).rows[0].id;
 await h.admin.query('INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,0)',[collection,f.recommendation,f.account,category]);
 return collection;
}
const sourceB={...identity,sourceIdentity:'Exact/B',sourceIdentityHash:'b'.repeat(64)};
const repository=(h:AppsA1StorageHarness,pool=h.runtime)=>new ExplorersAppEnrichmentRepository(pool,[identity,sourceB]);
async function versions(h:AppsA1StorageHarness,f:Fixture){
 const row=(await h.admin.query("SELECT r.revision,coalesce(s.revision,0)::text category,b.binding_revision FROM recommendations r LEFT JOIN account_category_content_state s ON s.account_id=r.account_id AND s.category=r.category LEFT JOIN app_enrichment_bindings b ON b.recommendation_id=r.id WHERE r.id=$1",[f.recommendation])).rows[0];
 return {recommendation:Number(row.revision),category:String(row.category),binding:row.binding_revision==null?null:Number(row.binding_revision)};
}
async function run(h:AppsA1StorageHarness,f:Fixture,operation:string,extra:Record<string,unknown>={},key=randomUUID(),pool=h.runtime){
 const v=await versions(h,f);return repository(h,pool).execute(f.account,f.recommendation,{operation,expectedRecommendationRevision:v.recommendation,expectedBindingRevision:v.binding,...extra},f.actor,{idempotencyKey:key});
}
async function configured(h:AppsA1StorageHarness,f:Fixture){return await run(h,f,'configureAppEnrichment',{...identity,optIn:true}) as BindingResult;}
async function seedSnapshot(h:AppsA1StorageHarness,f:Fixture,b:BindingResult,fields:Record<string,unknown>={title:'Suggested',description:null,priceTier:'Free',platforms:[]},source=identity){
 const provenance=Object.fromEntries(Object.keys(fields).map(key=>[key,{sourceUrl:'https://example.org/app',observedAt:time}]));
 const raw={snapshotId:randomUUID(),appEntityId:f.entity,...source,adapterVersion:'synthetic-v1',fetchedAt:time,contentHash:'0'.repeat(64),fields,fieldProvenance:provenance};
 const value=ExplorersAppEnrichmentRepository.snapshotForStorage({...raw,contentHash:hashAppSnapshot(raw)});
 await insertSnapshot(h.admin,value);
 await h.admin.query('INSERT INTO app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) VALUES($1,$2,$3,$4,$5,$6)',[value.snapshotId,f.recommendation,b.bindingGenerationId,f.account,f.entity,b.bindingRevision]);return value;
}
async function insertSnapshot(db:Pick<Pool,'query'>,value:ReturnType<typeof ExplorersAppEnrichmentRepository.snapshotForStorage>){await db.query('INSERT INTO app_enrichment_snapshots(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,fetched_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[value.snapshotId,value.appEntityId,value.sourceId,value.sourceIdentity,value.sourceIdentityHash,value.canonicalizationVersion,value.fetchedAt,JSON.stringify(value)]);}
async function ownerState(h:AppsA1StorageHarness,f:Fixture){
 const output:Record<string,unknown>={};
 for(const [name,sql] of Object.entries({recommendation:'SELECT * FROM recommendations WHERE id=$1',overrides:'SELECT * FROM recommendation_display_overrides WHERE recommendation_id=$1',bindings:'SELECT * FROM app_enrichment_bindings WHERE recommendation_id=$1',generations:'SELECT * FROM app_enrichment_generations WHERE recommendation_id=$1 ORDER BY id',entitlements:'SELECT * FROM app_enrichment_entitlements WHERE recommendation_id=$1 ORDER BY snapshot_id,generation_id',acceptances:'SELECT * FROM app_enrichment_acceptances WHERE recommendation_id=$1 ORDER BY id'}))output[name]=(await h.admin.query(sql,[f.recommendation])).rows;
 output.versions=await versions(h,f);output.receipts=(await h.admin.query('SELECT * FROM application_command_receipts WHERE account_id=$1 ORDER BY id',[f.account])).rows;return output;
}
/** Returns the refusal's SQLSTATE and, when PostgreSQL reports one, the NAME of the constraint
 * that refused. Existing callers ignore the return value; a caller that needs to prove WHICH
 * guard fired (rather than merely that something did) asserts on `constraint`. */
async function denied(db:Pick<Pool,'query'>,sql:string,values:unknown[]=[],codes=['23514','23503','42501']){let code:string|undefined,constraint:string|undefined;try{await db.query(sql,values);}catch(error){code=(error as {code?:string}).code;constraint=(error as {constraint?:string}).constraint;}expect(code).toBeDefined();expect(codes).toContain(code);return {code,constraint};}
/** Raw privileged insert of an already-hashed payload: the only way to exercise 0055's own text
 * clauses, since every application path normalizes through the contract first. */
async function deniedSnapshot(h:AppsA1StorageHarness,value:Record<string,any>,codes=['23514']){await denied(h.admin,'INSERT INTO app_enrichment_snapshots(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,fetched_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[value.snapshotId,value.appEntityId,value.sourceId,value.sourceIdentity,value.sourceIdentityHash,value.canonicalizationVersion,value.fetchedAt,JSON.stringify(value)],codes);}
async function receiptCount(h:AppsA1StorageHarness,f:Fixture){return Number((await h.admin.query('SELECT count(*) count FROM application_command_receipts WHERE account_id=$1',[f.account])).rows[0].count);}
async function acceptanceCount(h:AppsA1StorageHarness,f:Fixture){return Number((await h.admin.query('SELECT count(*) count FROM app_enrichment_acceptances WHERE recommendation_id=$1',[f.recommendation])).rows[0].count);}
async function withBlockedAccount(h:AppsA1StorageHarness,f:Fixture,work:(blocker:PoolClient)=>Promise<void>){
 const blocker=await h.admin.connect();try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.account]);await work(blocker);}finally{await blocker.query('ROLLBACK');blocker.release();}
}
export async function runAppsA1StorageAcceptance(h:AppsA1StorageHarness):Promise<void>{
 for(const key of ['case','cleanup','reloadDisplay','currentActorReplayStatus','purgeOwned','waitForRuntimeBlocked'] as const)if(typeof h[key]!=='function')throw new Error('Canonical55 Apps harness incomplete');
 const cases:Array<()=>Promise<void>>=[
 async()=>{
  const f=await seedApps(h),other=await seedApps(h);await expect(repository(h).execute(other.account,f.recommendation,{operation:'configureAppEnrichment',...identity,optIn:true,expectedRecommendationRevision:1,expectedBindingRevision:null},f.actor,{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:404});
  for(const variant of [{category:'books',kind:'book',origin:'manual'},{category:'apps',kind:'app',origin:'provider'}]){const bad=await seedApps(h,undefined,variant.category,variant.kind,variant.origin);await expect(configured(h,bad)).rejects.toMatchObject({status:422});}
  await denied(h.admin,'INSERT INTO app_enrichment_bindings(account_id,recommendation_id,app_entity_id,opt_in) VALUES($1,$2,$3,true)',[other.account,f.recommendation,f.entity]);
  const book=(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Synthetic book','manual') RETURNING id")).rows[0].id;
  // Canonical0029 forbids impossible category/kind rows at autocommit; assert those constraints without persisting or waiving them.
  await denied(h.admin,"INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'books',$2)",[f.account,f.entity],['23514']);
  await denied(h.admin,"INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'apps',$2)",[f.account,book],['23514']);
 },
 async()=>{
  const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b);await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:[]});
  for(const [table,column] of [['app_enrichment_generations','id'],['app_enrichment_snapshots','id'],['app_enrichment_entitlements','snapshot_id'],['app_enrichment_acceptances','id'],['app_enrichment_generation_retirements','generation_id']]){
   if(table==='app_enrichment_generation_retirements'){await run(h,f,'rebindAppEnrichment',{...sourceB,optIn:true});}
   await denied(h.admin,`UPDATE ${table} SET ${column}=${column}`,[],['23514']);await denied(h.runtime,`UPDATE ${table} SET ${column}=${column}`,[],['42501']);
  }
  await denied(h.runtime,'INSERT INTO app_enrichment_snapshots SELECT * FROM app_enrichment_snapshots',[],['42501']);await denied(h.runtime,'INSERT INTO app_enrichment_entitlements SELECT * FROM app_enrichment_entitlements',[],['42501']);
  for(const fn of ['app_enrichment_immutable_payload','app_enrichment_binding_identity','app_enrichment_current_generation_guard','app_enrichment_snapshot_guard','app_enrichment_entitlement_guard','app_enrichment_acceptance_admission','app_enrichment_acceptance_guard'])expect((await h.admin.query('SELECT has_function_privilege(\'music_runtime\',$1,\'EXECUTE\') allowed',[`${fn}()`])).rows[0].allowed).toBe(false);
  for(const signature of ['app_enrichment_canonical_json(jsonb)','app_enrichment_safe_host(text)'])expect((await h.admin.query('SELECT has_function_privilege(\'music_runtime\',$1,\'EXECUTE\') allowed',[signature])).rows[0].allowed).toBe(false);
 },
 async()=>{const f=await seedApps(h);await expect(new ExplorersAppEnrichmentRepository(h.runtime).execute(f.account,f.recommendation,{operation:'configureAppEnrichment',...identity,optIn:true,expectedBindingRevision:null,expectedRecommendationRevision:1},f.actor,{idempotencyKey:randomUUID()})).rejects.toMatchObject({status:422});expect(await receiptCount(h,f)).toBe(0);const b=await configured(h,f);expect(b).toMatchObject({bindingRevision:1,changed:true});await expect(run(h,f,'configureAppEnrichment',{...identity,optIn:true,expectedBindingRevision:null})).rejects.toMatchObject({status:409});},
 async()=>{const f=await seedApps(h);await configured(h,f);const before=await versions(h,f),receipts=await receiptCount(h,f);expect(await run(h,f,'configureAppEnrichment',{...identity,optIn:true})).toMatchObject({changed:false});expect(await versions(h,f)).toEqual(before);await run(h,f,'disableAppEnrichment');const disabled=await versions(h,f);expect(await run(h,f,'disableAppEnrichment')).toMatchObject({changed:false});expect(await versions(h,f)).toEqual(disabled);expect(await receiptCount(h,f)).toBe(receipts+3);},
 async()=>{const f=await seedApps(h),b=await configured(h,f),before=await versions(h,f);const d=await run(h,f,'disableAppEnrichment') as BindingResult;expect(d.bindingGenerationId).toBe(b.bindingGenerationId);expect(await versions(h,f)).toEqual({...before,binding:before.binding!+1});await expect(run(h,f,'configureAppEnrichment',{...sourceB,optIn:true})).rejects.toMatchObject({status:422});},
 async()=>{const f=await seedApps(h),a=await configured(h,f),s=await seedSnapshot(h,f,a);const b=await run(h,f,'rebindAppEnrichment',{...sourceB,optIn:true}) as BindingResult,c=await run(h,f,'rebindAppEnrichment',{...identity,optIn:true}) as BindingResult;expect(new Set([a.bindingGenerationId,b.bindingGenerationId,c.bindingGenerationId]).size).toBe(3);expect((await h.admin.query('SELECT count(*) count FROM app_enrichment_generation_retirements WHERE generation_id=ANY($1::uuid[])',[[a.bindingGenerationId,b.bindingGenerationId]])).rows[0].count).toBe('2');await expect(run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:[]})).rejects.toMatchObject({status:409});},
 async()=>{const f=await seedApps(h),other=await seedApps(h,f.entity),b=await configured(h,f),ob=await configured(h,other),s=await seedSnapshot(h,f,b);await expect(run(h,other,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:[]})).rejects.toMatchObject({status:404});expect(await repository(h).readSuggestions(other.account,other.recommendation)).toEqual([]);await h.admin.query('INSERT INTO app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) VALUES($1,$2,$3,$4,$5,$6)',[s.snapshotId,other.recommendation,ob.bindingGenerationId,other.account,other.entity,ob.bindingRevision]);expect(await repository(h).readSuggestions(other.account,other.recommendation)).toEqual([s]);const bad={...s,snapshotId:randomUUID(),...sourceB};bad.contentHash=hashAppSnapshot(bad);await insertSnapshot(h.admin,bad);await denied(h.admin,'INSERT INTO app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) VALUES($1,$2,$3,$4,$5,$6)',[bad.snapshotId,f.recommendation,b.bindingGenerationId,f.account,f.entity,b.bindingRevision]);},
 async()=>{const f=await seedApps(h),b=await configured(h,f);for(const fields of [{},{description:null},{platforms:[]}]){const s=await seedSnapshot(h,f,b,fields);expect(await repository(h).readSuggestions(f.account,f.recommendation)).toContainEqual(s);}const value={...snapshot(),appEntityId:f.entity};value.contentHash=hashAppSnapshot(value);for(const bad of [{...value,contentHash:'c'.repeat(64)},{...value,fieldProvenance:{}},{...value,fields:{unknown:1}}]){expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage(bad)).toThrow();await denied(h.admin,'INSERT INTO app_enrichment_snapshots(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,fetched_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[bad.snapshotId,bad.appEntityId,bad.sourceId,bad.sourceIdentity,bad.sourceIdentityHash,bad.canonicalizationVersion,bad.fetchedAt,JSON.stringify(bad)],['23514']);}expect(()=>ExplorersAppEnrichmentRepository.snapshotForStorage({...value,fields:{platforms:null}})).toThrow();
  // Hash these malformed fixtures over the actual canonical domain without schema admission so SQL must reject text, not merely the hash.
  for(const code of forbiddenTextCodes)for(const field of ['description','platforms'] as const){const base={...snapshot(),appEntityId:f.entity},text=`a${String.fromCharCode(code)}b`,bad={...base,snapshotId:randomUUID(),fields:{...base.fields,[field]:field==='platforms'?[text]:text}};bad.contentHash=rawSnapshotHash(bad as ReturnType<typeof snapshot>);await denied(h.admin,'INSERT INTO app_enrichment_snapshots(id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version,fetched_at,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[bad.snapshotId,bad.appEntityId,bad.sourceId,bad.sourceIdentity,bad.sourceIdentityHash,bad.canonicalizationVersion,bad.fetchedAt,JSON.stringify(bad)],code===0?['22P05']:['23514']);}
  // Title had no SQL evidence at all: snapshot() populates only description and platforms, so
  // both title clauses were unwitnessed. Title forbids every C0 plus U+007F, which is why this
  // loop uses its own code set and why the clause may not rely on the locale [[:cntrl:]] class.
  for(const code of forbiddenTitleCodes){const bad=snapshotWith({title:`a${String.fromCharCode(code)}b`,description:null,platforms:[]},f.entity);bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad,code===0?['22P05']:['23514']);}
  // Edge-whitespace parity. Each payload is hashed over the RAW text, so the canonical-JSON hash
  // clause, the control-character clause and the length clause all pass: only the trim clause can
  // refuse it. Under btrim/1 every tab, newline and non-space Unicode space here was ADMITTED as
  // an immutable row the contract could never read back.
  for(const position of ['lead','trail'] as const){
   for(const code of trimEdgeCodes)for(const field of ['description','platforms'] as const){const text=edged('a',code,position),bad=snapshotWith(field==='platforms'?{platforms:[text],description:null}:{description:text,platforms:[]},f.entity);bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad);}
   for(const code of trimEdgeTitleCodes){const bad=snapshotWith({title:edged('Title',code,position),description:null,platforms:[]},f.entity);bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad);}
  }
  // The trim-edge regex leans on PostgreSQL's `$` matching END OF STRING only. Perl's `$` also
  // matches before a final newline, which would silently exempt exactly the trailing-LF value
  // the clause exists to refuse. One case pins that load-bearing dialect detail.
  for(const field of ['description','platforms'] as const){const text='a\n',bad=snapshotWith(field==='platforms'?{platforms:[text],description:null}:{description:text,platforms:[]},f.entity);bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad);}
  // Scalar SPELLING, not castability. Each payload here casts cleanly under ::uuid or
  // ::timestamptz and hashes cleanly over its raw text, so only the new format clauses can
  // refuse it. Without them these rows were admitted immutably and then failed every read.
  // 0055 pins app_enrichment_instant in a STATEMENT OF ITS OWN BEFORE the retained cast, so every
  // spelling the contract refuses but ::timestamptz accepts is a deterministic 23514 from that
  // clause. The ONE documented residue the month-length grammar cannot express - a non-leap
  // 29 February - is well-formed to the regex and therefore still reaches the retained cast,
  // where PostgreSQL's datetime input refuses it as a DATETIME FIELD OVERFLOW (22008, measured;
  // the migration's prose says 22P02, which is the uuid-side code, not this one). Each input
  // keeps EXACTLY ONE expected code so a refusal can still be attributed to one guard.
  for(const instant of unlawfulInstants){
   const castOnly=instant==='2026-02-29T00:00:00.000Z'?['22008']:['23514'];
   const bad=snapshotWith({description:null,platforms:[]},f.entity);bad.fetchedAt=instant;bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad,castOnly);
   const prov=snapshotWith({description:null,platforms:[]},f.entity) as Record<string,any>;prov.fieldProvenance.description.observedAt=instant;prov.contentHash=rawSnapshotHash(prov as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,prov,castOnly);
  }
  // The OTHER retained-cast exception: year zero. It had no SQL-side expectation anywhere before
  // this loop (only an ad-hoc probe), because it is contract-lawful and so cannot live in
  // `unlawfulInstants`. Single expected code, 22008, exactly as for the non-leap 29 February: the
  // regex admits it, PostgreSQL has no year 0, so only the retained cast can refuse it.
  for(const instant of castExceptionInstants){
   const bad=snapshotWith({description:null,platforms:[]},f.entity);bad.fetchedAt=instant;bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad,['22008']);
   const prov=snapshotWith({description:null,platforms:[]},f.entity) as Record<string,any>;prov.fieldProvenance.description.observedAt=instant;prov.contentHash=rawSnapshotHash(prov as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,prov,['22008']);
  }
  // Same list as the portable case above, deliberately. The brace-wrapped and unhyphenated
  // spellings ARE accepted by PostgreSQL's uuid input, reach the payload clause and refuse as
  // 23514. The whitespace-padded spellings are NOT: uuid input does not skip surrounding
  // whitespace (measured), so they refuse at the id/app_entity_id PARAMETER parse as 22P02
  // before the trigger runs at all. Both are real storage refusals of a contract-unlawful
  // spelling, and each input keeps its own single code so the firing guard stays identifiable.
  for(const id of unlawfulIds)for(const field of ['snapshotId','appEntityId'] as const){
   const bad=snapshotWith({description:null,platforms:[]},f.entity) as Record<string,any>;bad[field]=id;bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad,/^\s|\s$/.test(id)?['22P02']:['23514']);
  }
  for(const host of unlawfulHosts){
   const bad=snapshotWith({description:null,platforms:[]},f.entity) as Record<string,any>;bad.fieldProvenance.description.sourceUrl=`https://${host}/app`;bad.contentHash=rawSnapshotHash(bad as unknown as ReturnType<typeof snapshot>);await deniedSnapshot(h,bad);
  }
  // An uppercase-hex appEntityId is contract-lawful, so the uuid pattern must still admit it.
  await seedSnapshot(h,{...f,entity:f.entity.toUpperCase()},b,{description:null,platforms:[]});
  for(const code of [9,10,13]){const text=`a${String.fromCharCode(code)}b`;await seedSnapshot(h,f,b,{description:text,platforms:[text]});}
  // Interior whitespace stays lawful for a title too, and a plain title remains admissible: the
  // new clauses must not have turned into a blanket title refusal.
  await seedSnapshot(h,f,b,{title:'Suggested title',description:null,platforms:[]});
 },
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b);const manual={title:'Manual',developer:'Kept',logoUrl:null,downloadUrl:'https://example.org/download',description:'Old',platforms:['Manual']};await h.admin.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3::jsonb)',[f.recommendation,f.account,JSON.stringify(manual)]);const before=await versions(h,f);const accepted=await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['platforms','priceTier','description','title']});expect(accepted).toMatchObject({changed:true,recommendationRevision:before.recommendation+1,acceptedFields:['title','description','priceTier','platforms']});const after=await versions(h,f);expect(accepted.categoryContentRevision).toBe(after.category);expect(BigInt(after.category)).toBeGreaterThan(BigInt(before.category));expect(await h.reloadDisplay(f.account,f.recommendation)).toMatchObject({...manual,...s.fields});expect(await acceptanceCount(h,f)).toBe(1);},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),before=await versions(h,f);expect(await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:[]})).toMatchObject({changed:false,acceptedFields:[]});expect(await versions(h,f)).toEqual(before);expect((await h.admin.query('SELECT * FROM recommendation_display_overrides WHERE recommendation_id=$1',[f.recommendation])).rows).toEqual([]);expect((await h.admin.query('SELECT selected_fields,accepted_values FROM app_enrichment_acceptances WHERE recommendation_id=$1',[f.recommendation])).rows).toEqual([{selected_fields:[],accepted_values:{}}]);expect(await receiptCount(h,f)).toBe(2);},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b,{title:'Suggested'});await h.admin.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3::jsonb)',[f.recommendation,f.account,JSON.stringify({title:'Suggested',developer:'Kept'})]);const before=await versions(h,f);expect(await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['title']})).toMatchObject({changed:false,acceptedFields:['title']});expect(await versions(h,f)).toEqual(before);expect(await acceptanceCount(h,f)).toBe(1);},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),v=await versions(h,f);await new ExplorersRecommendationRepository(h.runtime).updateRecommendation(f.account,f.recommendation,v.recommendation,{displayOverrides:{title:'Manual edit'}},randomUUID());const before=await ownerState(h,f);await expect(run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['title'],expectedRecommendationRevision:v.recommendation})).rejects.toMatchObject({status:409});expect(await ownerState(h,f)).toEqual(before);},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b);await run(h,f,'disableAppEnrichment');await expect(run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['title'],expectedBindingRevision:b.bindingRevision})).rejects.toMatchObject({status:409});expect(await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['title']})).toMatchObject({changed:true});},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),v=await versions(h,f),key=randomUUID(),command={operation:'acceptAppEnrichment',snapshotId:s.snapshotId,selectedFields:[],expectedRecommendationRevision:v.recommendation,expectedBindingRevision:v.binding};const original=await repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key});
  // The receipt-spelling pin (0055 app_enrichment_acceptance_guard, the clause ahead of the
  // identifier comparison). A brace-wrapped snapshotId casts to the SAME uuid, so the comparison
  // that follows it is satisfied and only the pin can refuse this row: drop the pin and this
  // privileged insert SUCCEEDS. The repository can never produce such a response (it stringifies
  // an already-parsed result whose identifiers are contentIdSchema values), so an out-of-band
  // receipt writer is the only author of this shape, and this is the only witness for it.
  const pinned=randomUUID();
  // The receipt id is bound TWICE, as $1 (the uuid column) and as $4 (the text convert_to feeds
  // sha256). One placeholder cannot carry both: PostgreSQL deduces a SINGLE type per parameter,
  // so reusing $1 as a uuid column value AND inside convert_to($1::text,'UTF8') made the
  // statement itself unpreparable (42P08, inconsistent types deduced for parameter) before any
  // guard could run. Casting at each use cannot resolve it - $1::uuid and $1::text ARE the two
  // conflicting deductions - so the same value is simply passed twice, in its own parameter.
  // Identical literal string, so convert_to() hashes the SAME BYTES as before and the stored
  // receipt row is byte-identical; only the parameter list changed.
  await h.admin.query("INSERT INTO application_command_receipts(id,account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,$2,'acceptAppEnrichment',sha256(convert_to($4,'UTF8')),sha256(convert_to($4,'UTF8')),$3::jsonb)",[pinned,f.account,JSON.stringify({receiptId:pinned,recommendationId:f.recommendation,snapshotId:`{${s.snapshotId}}`,bindingGenerationId:b.bindingGenerationId,acceptedFields:[]}),pinned]);
  await denied(h.admin,'INSERT INTO app_enrichment_acceptances(account_id,recommendation_id,snapshot_id,generation_id,selected_fields,accepted_values,actor_user_id,receipt_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)',[f.account,f.recommendation,s.snapshotId,b.bindingGenerationId,[],'{}',f.actor,pinned],['23514']);
  await run(h,f,'rebindAppEnrichment',{...sourceB,optIn:false});expect(await repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})).toEqual(original);await expect(repository(h).execute(f.account,f.recommendation,{...command,selectedFields:['title']},f.actor,{idempotencyKey:key})).rejects.toMatchObject({status:409});const other=(await h.admin.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'apps',$2) RETURNING id",[f.account,f.entity])).rows[0].id;await expect(repository(h).execute(f.account,other,command,f.actor,{idempotencyKey:key})).rejects.toMatchObject({status:409});expect([403,404]).toContain(await h.currentActorReplayStatus(f.account,f.recommendation,command,key));await h.admin.query("UPDATE creator_accounts SET status='suspended',suspended_at=clock_timestamp() WHERE id=$1",[f.account]);await expect(repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})).rejects.toMatchObject({status:404});await h.admin.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[f.account]);expect(await repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})).toEqual(original);await h.admin.query('UPDATE application_command_receipts SET replay_until=clock_timestamp()-interval \'1 second\' WHERE id=$1',[original.receiptId]);await expect(repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})).rejects.toMatchObject({status:409});await h.admin.query('UPDATE application_command_receipts SET status=\'retired\',response=NULL WHERE id=$1',[original.receiptId]);await expect(repository(h).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})).rejects.toMatchObject({status:409});},
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),before=await ownerState(h,f),key=randomUUID();
  // Root installs no test trigger: an owned original client injects a deferred receipt constraint failure by intercepting only this insert parameter, preserving the real SQL transaction.
  const client=await h.runtime.connect();const bound=client.query.bind(client);let corrupted=true;
  const originalQuery=client.query;client.query=((sql:unknown,values?:unknown[])=>{if(corrupted&&typeof sql==='string'&&sql.startsWith('INSERT INTO application_command_receipts(')){const changed=[...values!];changed[2]='disableAppEnrichment';return bound(sql,changed);}return bound(sql as string,values);}) as PoolClient['query'];
  const owned={connect:async()=>new Proxy(client,{get(target,property){if(property==='release')return ()=>{};return Reflect.get(target,property);}})} as unknown as Pool;
  try{await expect(new ExplorersAppEnrichmentRepository(owned,[identity,sourceB]).execute(f.account,f.recommendation,{operation:'acceptAppEnrichment',snapshotId:s.snapshotId,selectedFields:['title'],expectedRecommendationRevision:b.recommendationRevision,expectedBindingRevision:b.bindingRevision},f.actor,{idempotencyKey:key})).rejects.toMatchObject({code:'23514'});}finally{corrupted=false;client.query=originalQuery;client.release();}
  expect(await ownerState(h,f)).toEqual(before);expect(await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:['title']},key)).toMatchObject({changed:true});
 },
 async()=>{const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),before=await versions(h,f),replacement=(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('app','Replacement','manual') RETURNING id")).rows[0].id;await listed(h,f);await new ExplorersRecommendationRepository(h.runtime).replaceRecommendationEntity(f.account,f.recommendation,before.recommendation,replacement,randomUUID());const row=(await h.admin.query('SELECT * FROM app_enrichment_bindings WHERE recommendation_id=$1',[f.recommendation])).rows[0];expect(row).toMatchObject({app_entity_id:replacement,opt_in:false,current_generation_id:null});expect(Number(row.binding_revision)).toBe(b.bindingRevision+1);expect((await versions(h,f)).recommendation).toBe(before.recommendation+1);expect((await h.admin.query('SELECT app_entity_id FROM app_enrichment_generations WHERE id=$1',[b.bindingGenerationId])).rows[0].app_entity_id).toBe(f.entity);expect(await repository(h).readSuggestions(f.account,f.recommendation)).toEqual([]);expect((await h.admin.query('SELECT payload FROM app_enrichment_snapshots WHERE id=$1',[s.snapshotId])).rows).toHaveLength(1);
  // Category EXIT of a BOUND Apps recommendation. recommendations.category is mutable (0029:40 is
  // a value CHECK with no immutability trigger, and 0029:138 grants music_runtime table-level
  // UPDATE with no column list), and no application path writes it, so this shape is reachable
  // only out of band -- which is exactly why it needs SQL evidence rather than a repository call.
  //
  // WHAT ACTUALLY REFUSES IT, measured, correcting an earlier claim in this file and in 0055:
  // NOT the replacement trigger. The composite foreign key
  // app_enrichment_bindings(recommendation_id,account_id,category) -> recommendations(id,account_id,
  // category) (0055:23,28) pins the binding's category to 'apps', so moving the referenced
  // recommendation out of 'apps' is a REFERENCED-KEY violation: PostgreSQL's internal RI
  // constraint triggers on `recommendations` are named RI_ConstraintTrigger_a_... and sort before
  // any user trigger named app_enrichment_..., so the statement is refused as 23503 naming that FK
  // and the widened OLD.category='apps' OR NEW.category='apps' WHEN clause is NEVER REACHED by an
  // exit statement at all. The earlier ['23514'] expectation here therefore asserted an outcome
  // that CANNOT OCCUR -- it was never a reachable witness. Crediting the FK is not a weakening:
  // the FK is a BROADER and EARLIER guard than the trigger could be, it refuses the whole
  // statement atomically, and asserting its NAME proves WHICH guard refused rather than merely
  // that something refused. The widened WHEN clause is retained as harmless defence-in-depth
  // should the FK shape ever change.
  //
  // THE FENCE IS BROADER THAN THE ENTITY-CHANGE CASE: measured, the FK refuses the exit with an
  // entity change, WITHOUT one (so it is not an entity-replacement guard), and AFTER
  // disableAppEnrichment (which leaves the binding row and its current_generation_id in place).
  // All three shapes are asserted below, each leaving the row completely unchanged.
  // The unbound and never-Apps cases that follow are non-discriminating by construction: they pin
  // the no-spurious-fire property and the fact that neither guard freezes the column outright.
  const exitFk='app_enrichment_bindings_recommendation_id_account_id_categ_fkey';
  const exiting=await seedApps(h),eb=await configured(h,exiting);
  const bookEntity=(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Exit target','manual') RETURNING id")).rows[0].id;
  const unchanged=async(opt_in:boolean)=>{
   expect((await h.admin.query('SELECT category,entity_id FROM recommendations WHERE id=$1',[exiting.recommendation])).rows[0]).toMatchObject({category:'apps',entity_id:exiting.entity});
   expect((await h.admin.query('SELECT app_entity_id,opt_in,current_generation_id FROM app_enrichment_bindings WHERE recommendation_id=$1',[exiting.recommendation])).rows[0]).toMatchObject({app_entity_id:exiting.entity,opt_in,current_generation_id:eb.bindingGenerationId});
   expect((await h.admin.query('SELECT count(*) count FROM app_enrichment_generation_retirements WHERE generation_id=$1',[eb.bindingGenerationId])).rows[0].count).toBe('0');
  };
  // Shape 1: exit in one statement with the entity change.
  expect((await denied(h.admin,'UPDATE recommendations SET category=$2,entity_id=$3,revision=revision+1 WHERE id=$1',[exiting.recommendation,'books',bookEntity],['23503'])).constraint).toBe(exitFk);
  await unchanged(true);
  // Shape 2: exit with NO entity change. The replacement trigger's WHEN clause additionally
  // requires NEW.entity_id IS DISTINCT FROM OLD.entity_id, so no trigger could ever have fenced
  // this statement -- yet the FK refuses it identically. This is the assertion that proves the
  // exit fence is the FK and is broader than the entity-change path the group previously covered.
  expect((await denied(h.admin,'UPDATE recommendations SET category=$2,revision=revision+1 WHERE id=$1',[exiting.recommendation,'books'],['23503'])).constraint).toBe(exitFk);
  await unchanged(true);
  // Shape 3: exit AFTER disableAppEnrichment. Disable sets opt_in=false and bumps
  // binding_revision but LEAVES the binding row and its current_generation_id in place
  // (explorersAppEnrichmentRepository.ts:88-89, and nothing in the repository DELETEs a binding),
  // so the referenced key still exists and the FK still refuses the exit.
  await run(h,exiting,'disableAppEnrichment');
  expect((await denied(h.admin,'UPDATE recommendations SET category=$2,entity_id=$3,revision=revision+1 WHERE id=$1',[exiting.recommendation,'books',bookEntity],['23503'])).constraint).toBe(exitFk);
  await unchanged(false);
  // The same exit on an UNBOUND Apps recommendation has no referencing binding row, so no
  // referenced key is violated and it must remain lawful: neither the FK nor the widened WHEN
  // clause freezes the column -- they fence the stale-binding path only.
  const unbound=await seedApps(h);
  const otherBook=(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Exit target 2','manual') RETURNING id")).rows[0].id;
  await h.admin.query('UPDATE recommendations SET category=$2,entity_id=$3,revision=revision+1 WHERE id=$1',[unbound.recommendation,'books',otherBook]);
  expect((await h.admin.query('SELECT category FROM recommendations WHERE id=$1',[unbound.recommendation])).rows[0].category).toBe('books');
  // NEGATIVE CASE -- no spurious fire. An entity replacement on a recommendation that was NEVER
  // in Apps makes BOTH WHEN disjuncts false (OLD.category='books', NEW.category='books') while
  // entity_id does change, so the widened clause must leave this statement completely alone.
  // What it would catch: a future clause widened too far (dropping the category test, or testing
  // only the entity change) would start firing app_enrichment_recommendation_replacement() on
  // every category's entity replacement -- harmless-looking, since the binding UPDATE matches
  // zero rows, but it puts an Apps function on the write path of Books/Movies/Places edits and
  // would mask a later binding leak across categories.
  const neverApps=await seedApps(h,undefined,'books','book','manual');
  const nextBook=(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Never apps target','manual') RETURNING id")).rows[0].id;
  await h.admin.query('UPDATE recommendations SET entity_id=$2,revision=revision+1 WHERE id=$1',[neverApps.recommendation,nextBook]);
  expect((await h.admin.query('SELECT category,entity_id FROM recommendations WHERE id=$1',[neverApps.recommendation])).rows[0]).toMatchObject({category:'books',entity_id:nextBook});
  expect((await h.admin.query('SELECT * FROM app_enrichment_bindings WHERE recommendation_id=$1',[neverApps.recommendation])).rows).toEqual([]);
  expect((await h.admin.query('SELECT count(*) count FROM app_enrichment_bindings WHERE account_id=$1',[neverApps.account])).rows[0].count).toBe('0');},
 async()=>{const f=await seedApps(h),other=await seedApps(h,f.entity),b=await configured(h,f),ob=await configured(h,other),s=await seedSnapshot(h,f,b);await h.admin.query('INSERT INTO app_enrichment_entitlements(snapshot_id,recommendation_id,generation_id,account_id,app_entity_id,observed_binding_revision) VALUES($1,$2,$3,$4,$5,$6)',[s.snapshotId,other.recommendation,ob.bindingGenerationId,other.account,other.entity,ob.bindingRevision]);await run(h,f,'acceptAppEnrichment',{snapshotId:s.snapshotId,selectedFields:[]});await h.admin.query("UPDATE creator_accounts SET status='suspended',suspended_at=clock_timestamp() WHERE id=$1",[f.account]);await expect(run(h,f,'disableAppEnrichment')).rejects.toMatchObject({status:404});await h.admin.query("UPDATE creator_accounts SET status='active',suspended_at=NULL WHERE id=$1",[f.account]);const v=await versions(h,f);await new ExplorersRecommendationRepository(h.runtime).archiveRecommendation(f.account,f.recommendation,v.recommendation,randomUUID());await expect(run(h,f,'disableAppEnrichment')).rejects.toMatchObject({status:404});await h.purgeOwned(f.account);for(const table of ['app_enrichment_bindings','app_enrichment_generations','app_enrichment_entitlements','app_enrichment_acceptances'])expect((await h.admin.query(`SELECT * FROM ${table} WHERE account_id=$1`,[f.account])).rows).toEqual([]);
  // Terminal purge RETIRES owner Apps command provenance rather than deleting the receipt rows.
  // 0055's purge block runs UPDATE application_command_receipts SET status='retired',response=NULL
  // scoped to exactly the four Apps operation names, and no migration deletes from that table at
  // all; 0027:8 admits 'retired' (widened again at 0035:41) and the response check at 0027:13 /
  // 0035:43 is satisfied by status='retired' with response IS NULL, so retirement IS the lawful
  // terminal shape and the row is retained for lifecycle FK coherence. This group exists to prove
  // the purge removed owner Apps provenance, so assert that shape POSITIVELY: the owner payload
  // (`response`) is gone from every Apps receipt and every one of them is latched 'retired'.
  const appsOperations=['configureAppEnrichment','disableAppEnrichment','rebindAppEnrichment','acceptAppEnrichment'];
  expect((await h.admin.query('SELECT operation,status,response FROM application_command_receipts WHERE account_id=$1 AND operation=ANY($2::text[]) ORDER BY operation',[f.account,appsOperations])).rows).toEqual([{operation:'acceptAppEnrichment',status:'retired',response:null},{operation:'configureAppEnrichment',status:'retired',response:null}]);
  // And nothing Apps-shaped survived the purge in a non-terminal state: zero rows among the four
  // operation names still carry a live status or a surviving response payload.
  expect((await h.admin.query("SELECT count(*) count FROM application_command_receipts WHERE account_id=$1 AND operation=ANY($2::text[]) AND (status<>'retired' OR response IS NOT NULL)",[f.account,appsOperations])).rows[0].count).toBe('0');
  // The harness's own lifecycle fixture receipt uses operation='delete', which is OUTSIDE the four
  // Apps names, so it can neither satisfy nor mask the two assertions above (both are scoped by
  // `operation=ANY(appsOperations)`, and the exact-equality assertion names only the two Apps rows
  // it expects). It is also the protected lifecycle receipt the scoping exists to spare: it must
  // still be present, unretired, with its response intact.
  expect((await h.admin.query("SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation='delete'",[f.account])).rows).toEqual([{status:'completed',response:{}}]);
  expect(await repository(h).readSuggestions(other.account,other.recommendation)).toEqual([s]);},
 async()=>{
  const pa=(await h.runtimeA.query('SELECT pg_backend_pid() pid')).rows[0].pid,pb=(await h.runtimeB.query('SELECT pg_backend_pid() pid')).rows[0].pid;expect(pa).not.toBe(pb);
  // Queue both real transactions on the held account lock. The root guard verifies each original worker is blocked before releasing the barrier.
  for(const mutation of ['edit','disable','rebind','replace'] as const)for(const first of ['accept','mutate'] as const){
   const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),v=await versions(h,f);
   const replacement=mutation==='replace'?(await h.admin.query("INSERT INTO entities(kind,title,origin) VALUES('app','Replacement','manual') RETURNING id")).rows[0].id:undefined;
   // Same genuine precondition as the replacement group: only the 'replace' mutation reaches
   // lockRecommendationParents, so only that fixture needs its owner list. Leaving the other
   // three mutations membership-free keeps this group's loser/winner expectations on exactly
   // the fixture shape they were authored against.
   if(mutation==='replace')await listed(h,f);
   const accept=()=>repository(h,h.runtimeA).execute(f.account,f.recommendation,{operation:'acceptAppEnrichment',snapshotId:s.snapshotId,selectedFields:['title'],expectedRecommendationRevision:v.recommendation,expectedBindingRevision:v.binding},f.actor,{idempotencyKey:randomUUID()});
   const mutate=():Promise<unknown>=>mutation==='edit'?new ExplorersRecommendationRepository(h.runtimeB).updateRecommendation(f.account,f.recommendation,v.recommendation,{displayOverrides:{title:'Other'}},randomUUID()):mutation==='replace'?new ExplorersRecommendationRepository(h.runtimeB).replaceRecommendationEntity(f.account,f.recommendation,v.recommendation,replacement!,randomUUID()):repository(h,h.runtimeB).execute(f.account,f.recommendation,{operation:mutation==='disable'?'disableAppEnrichment':'rebindAppEnrichment',...(mutation==='rebind'?{...sourceB,optIn:true}:{}),expectedRecommendationRevision:v.recommendation,expectedBindingRevision:v.binding},f.actor,{idempotencyKey:randomUUID()});
   let a:Promise<AppEnrichmentResult>|undefined,m:Promise<unknown>|undefined;
   await withBlockedAccount(h,f,async blocker=>{
    if(first==='accept'){a=accept();void a.catch(()=>{});await h.waitForRuntimeBlocked(h.runtimeA);m=mutate();void m.catch(()=>{});await h.waitForRuntimeBlocked(h.runtimeB);}
    else{m=mutate();void m.catch(()=>{});await h.waitForRuntimeBlocked(h.runtimeB);a=accept();void a.catch(()=>{});await h.waitForRuntimeBlocked(h.runtimeA);}
    await blocker.query('COMMIT');
   });
   const outcomes=await Promise.allSettled([a!,m!]);
   expect(outcomes[first==='accept'?0:1].status).toBe('fulfilled');
   const loser=outcomes[first==='accept'?1:0];expect(loser.status).toBe('rejected');if(loser.status==='rejected')expect(loser.reason).toMatchObject({status:409});
   expect(await acceptanceCount(h,f)).toBe(first==='accept'?1:0);
   expect((await versions(h,f)).recommendation).toBe(v.recommendation+((first==='accept'||mutation==='edit'||mutation==='replace')?1:0));
   expect(await receiptCount(h,f)).toBe(2);
  }
  const f=await seedApps(h),b=await configured(h,f),s=await seedSnapshot(h,f,b),v=await versions(h,f),key=randomUUID(),command={operation:'acceptAppEnrichment',snapshotId:s.snapshotId,selectedFields:[],expectedRecommendationRevision:v.recommendation,expectedBindingRevision:v.binding};
  const [a,c]=await Promise.all([repository(h,h.runtimeA).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key}),repository(h,h.runtimeB).execute(f.account,f.recommendation,command,f.actor,{idempotencyKey:key})]);expect(a).toEqual(c);expect(await acceptanceCount(h,f)).toBe(1);expect(await receiptCount(h,f)).toBe(2);
 }
 ];
 try{for(let index=0;index<appsA1StorageCaseIds.length;index++)await h.case(appsA1StorageCaseIds[index],cases[index]);}finally{await h.cleanup();}
}
