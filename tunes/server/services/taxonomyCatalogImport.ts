import {createHash, randomUUID} from 'node:crypto';
import {isProxy} from 'node:util/types';
import {taxonomyImportSchema, type TaxonomyImport, type TaxonomyTerm} from '../../shared/explorersTaxonomyContract';

/** INTERNAL TRUSTED MIGRATOR CORE ONLY. The connection must be allocated by a
 * separately reviewed operator entry. Parsing, these types, grants, or a runtime
 * Pool are not proof of approval. No HTTP factory, env lookup, or pool construction.
 * UNQUALIFIED: synthetic tests do not prove real catalog/provider/operator data,
 * PostgreSQL races, privileges, or application/lifecycle safety. Before concurrent
 * deployment reconcile the latest 0049 purge_explorers_account_content and
 * maintenance enclosing account locks: account/category ->
 * recommendation cascade -> 0053 recommendation_taxonomy_catalog_lock DELETE
 * is inverted against import's catalog -> account order. T2 owns that inventory.
 */
interface DbClient {
 query(sql:string, values?:unknown[]):Promise<{rows:Record<string,unknown>[]} >;
 release():void;
}
export interface TrustedTaxonomyMigratorPool {connect():Promise<DbClient>}
type Source=TaxonomyImport['sourceMappings'][number];
type Legacy=TaxonomyImport['legacySlugMappings'][number];
interface Assignment {recommendationId:string;accountId:string;termId:string;position:number}
interface State {version:number;defaultLocale:string|null;configured:boolean;terms:TaxonomyTerm[];foreignTerms:{id:string;parentId:string|null}[];sources:Source[];legacy:Legacy[];assignments:Assignment[];accounts:string[];receipts:Record<string,unknown>[];identityHistory:TaxonomyTerm[]}
export interface TaxonomyImportPlan {
 qualification:'unqualified-core';inputHash:string;category:TaxonomyImport['category'];
 observedCatalogVersion:number;catalogVersion:number;changed:boolean;changes:string[];
 conflicts:string[];affectedAssignments:Assignment[];affectedRoutes:string[];affectedAccounts:string[];
}
export interface TaxonomyImportReceipt extends TaxonomyImportPlan {receiptId:string;reviewedBy:string;input:TaxonomyImport}

// Copy descriptors, never invoke getters or toJSON. Reject non-JSON objects,
// sparse arrays, cycles, symbols and hidden fields rather than silently dropping.
function snapshot(value:unknown, ancestors=new Set<object>()):unknown {
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(typeof value!=='object'||value===null)throw new Error('Plain JSON data required');
 if(isProxy(value))throw new Error('Proxy input unsupported');
 if(ancestors.has(value))throw new Error('Cyclic input');
 const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
 if(proto!==(array?Array.prototype:Object.prototype)&&!(proto===null&&!array))throw new Error('Plain JSON data required');
 ancestors.add(value);const descriptors=Object.getOwnPropertyDescriptors(value);const output:Record<string,unknown>|unknown[]=array?[]:Object.create(null);
 for(const key of Reflect.ownKeys(descriptors)){
  if(array&&key==='length')continue;
  if(typeof key!=='string')throw new Error('Symbol input unsupported');
  const descriptor=descriptors[key];if(!descriptor.enumerable||!('value' in descriptor))throw new Error('Data descriptors required');
  if(array&&!/^(0|[1-9][0-9]*)$/.test(key))throw new Error('Plain arrays required');
  Object.defineProperty(output,key,{value:snapshot(descriptor.value,ancestors),enumerable:true,configurable:true,writable:true});
 }
 if(array&&Object.keys(output).length!==(value as unknown[]).length)throw new Error('Sparse arrays unsupported');
 ancestors.delete(value);return output;
}
function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
const sourceKey=(v:Source)=>canonical([v.sourceHost,v.entityKind,v.documentId]);
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function normalized(input:TaxonomyImport):TaxonomyImport {
 return {...input,terms:[...input.terms].sort((a,b)=>compare(a.id,b.id)),sourceMappings:[...input.sourceMappings].sort((a,b)=>compare(sourceKey(a),sourceKey(b))),legacySlugMappings:[...input.legacySlugMappings].sort((a,b)=>compare(a.legacySlug,b.legacySlug))};
}
export function validateTaxonomyCatalogImport(raw:unknown):{input:TaxonomyImport;inputHash:string} {
 const input=normalized(taxonomyImportSchema.parse(snapshot(raw)));
 // The SQL column is integer; JS safe integers alone are insufficient.
 if(input.terms.some(t=>t.position>2147483647))throw new Error('Term position exceeds SQL integer');
 return freeze({input,inputHash:createHash('sha256').update(canonical(input)).digest('hex')});
}
function historicalIdentities(rows:Record<string,unknown>[]):TaxonomyTerm[] {
 const identities=new Map<string,TaxonomyTerm>(),slugs=new Map<string,string>();
 for(const row of rows){
  let validated:ReturnType<typeof validateTaxonomyCatalogImport>;
  try {validated=validateTaxonomyCatalogImport(row.input);}
  catch {throw new Error('Malformed historical taxonomy input evidence');}
  if(row.category!==validated.input.category||row.import_contract!==validated.input.version||row.input_hash!==validated.inputHash)
   throw new Error('Mismatched historical taxonomy input evidence');
  for(const term of validated.input.terms){
   const prior=identities.get(term.id),slugKey=canonical([term.category,term.slug]);
   if((prior&&(prior.category!==term.category||prior.slug!==term.slug))||(slugs.has(slugKey)&&slugs.get(slugKey)!==term.id))
    throw new Error('Contradictory historical taxonomy identity evidence');
   identities.set(term.id,term);slugs.set(slugKey,term.id);
  }
 }
 return [...identities.values()];
}
async function load(client:DbClient,input:TaxonomyImport):Promise<State> {
 const category=input.category;
 await client.query('LOCK TABLE public.taxonomy_terms IN SHARE ROW EXCLUSIVE MODE');
 const [catalog]= (await client.query('/* catalog */ SELECT version,state,default_locale FROM public.taxonomy_catalogs WHERE category=$1 FOR UPDATE',[category])).rows;
 if(!catalog)throw new Error('Missing taxonomy catalog');
 const version=Number(catalog.version);if(!Number.isSafeInteger(version)||version<0)throw new Error('Invalid catalog version');
 const terms=(await client.query('/* terms */ SELECT id,category,slug,parent_id,position,active FROM public.taxonomy_terms ORDER BY id')).rows;
 const labels=(await client.query('/* labels */ SELECT l.term_id,l.locale,l.label FROM public.taxonomy_term_translations l JOIN public.taxonomy_terms t ON t.id=l.term_id WHERE t.category=$1 ORDER BY l.term_id,l.locale',[category])).rows;
 const sources=(await client.query('/* sources */ SELECT source_host,entity_kind,document_id,term_id FROM public.taxonomy_source_mappings WHERE category=$1 ORDER BY source_host,entity_kind,document_id',[category])).rows;
 const legacy=(await client.query('/* legacy */ SELECT legacy_slug,term_id FROM public.taxonomy_legacy_slug_mappings WHERE category=$1 ORDER BY legacy_slug',[category])).rows;
 // Conservative category-wide invalidation includes accounts with catalog route
 // consumers even if they have no assigned term. Tombstone counters are retained.
 const scopes=(await client.query('/* scopes */ SELECT account_id FROM public.account_category_content_state WHERE category=$1 UNION SELECT account_id FROM public.recommendations WHERE category=$1 UNION SELECT account_id FROM public.collections WHERE category=$1 ORDER BY account_id',[category])).rows;
 const accounts=scopes.map(r=>String(r.account_id));
 await client.query('/* account locks */ SELECT id FROM public.creator_accounts WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[accounts]);
 for(const account of accounts){
  await client.query('SELECT pg_catalog.pg_advisory_xact_lock(44031,pg_catalog.hashtext($1::text || \':\' || $2::text))',[account,category]);
 }
 await client.query('/* category locks */ SELECT account_id FROM public.account_category_content_state WHERE category=$1 AND account_id=ANY($2::uuid[]) ORDER BY account_id,category FOR UPDATE',[category,accounts]);
 await client.query('/* recommendation locks */ SELECT id FROM public.recommendations WHERE category=$1 ORDER BY id FOR UPDATE',[category]);
 const assignments=(await client.query('/* assignments */ SELECT recommendation_id,account_id,term_id,position FROM public.recommendation_taxonomy WHERE category=$1 ORDER BY recommendation_id,position',[category])).rows;
 const receipts=(await client.query('/* receipts */ SELECT input_hash,catalog_version,receipt FROM public.taxonomy_import_receipts WHERE category=$1 AND input_hash=$2 ORDER BY created_at,id',[category,createHash('sha256').update(canonical(input)).digest('hex')])).rows;
 // A removed UUID/slug remains reserved by immutable reviewed history. Read
 // both categories without the new input hash filter. The table entry lock
 // serializes trusted importers globally before this evidence is inspected.
 const history=(await client.query('/* identity history */ SELECT category,import_contract,input_hash,receipt->\'input\' AS input FROM public.taxonomy_import_receipts ORDER BY created_at,id')).rows;
 const identityHistory=historicalIdentities(history);
 return {version,defaultLocale:catalog.default_locale===null?null:String(catalog.default_locale),configured:catalog.state==='CONFIGURED',
  terms:terms.filter(t=>t.category===category).map(t=>({id:String(t.id),category,slug:String(t.slug),parentId:t.parent_id===null?null:String(t.parent_id),position:Number(t.position),active:t.active===true,labels:Object.fromEntries(labels.filter(l=>l.term_id===t.id).map(l=>[String(l.locale),String(l.label)]))})),
  foreignTerms:terms.filter(t=>t.category!==category).map(t=>({id:String(t.id),parentId:t.parent_id===null?null:String(t.parent_id)})),
  sources:sources.map(s=>({sourceHost:String(s.source_host),entityKind:String(s.entity_kind),documentId:String(s.document_id),termId:String(s.term_id)})),
  legacy:legacy.map(l=>({legacySlug:String(l.legacy_slug),termId:String(l.term_id)})),
  assignments:assignments.map(a=>({recommendationId:String(a.recommendation_id),accountId:String(a.account_id),termId:String(a.term_id),position:Number(a.position)})),accounts,receipts,identityHistory};
}
function plan(input:TaxonomyImport,inputHash:string,state:State):TaxonomyImportPlan {
 const conflicts:string[]=[],changes:string[]=[];
 const proposed=new Map(input.terms.map(t=>[t.id,t]));const current=new Map(state.terms.map(t=>[t.id,t]));
 const slugs=new Map(state.terms.map(t=>[t.slug,t.id]));
 const historicalIds=new Map(state.identityHistory.map(t=>[t.id,t]));
 const historicalSlugs=new Map(state.identityHistory.map(t=>[canonical([t.category,t.slug]),t.id]));
 for(const term of input.terms){
  const old=current.get(term.id);
  const historical=historicalIds.get(term.id),historicalSlug=historicalSlugs.get(canonical([term.category,term.slug]));
  if(historical&&(historical.category!==term.category||historical.slug!==term.slug))conflicts.push('Historical UUID identity changed:'+term.id);
  if(historicalSlug!==undefined&&historicalSlug!==term.id)conflicts.push('Historical slug identity changed:'+term.slug);
  if(state.foreignTerms.some(t=>t.id===term.id))conflicts.push('Cross-category UUID:'+term.id);
  if(old&&old.slug!==term.slug)conflicts.push('Stable slug changed:'+term.id);
  if(slugs.has(term.slug)&&slugs.get(term.slug)!==term.id)conflicts.push('Stable slug reassigned:'+term.slug);
  if(!old)changes.push('term:add:'+term.id);
  else for(const key of ['labels','position','active','parentId'] as const)if(canonical(old[key])!==canonical(term[key]))changes.push('term:'+key+':'+term.id);
 }
 for(const old of state.terms)if(!proposed.has(old.id)){
  changes.push('term:delete:'+old.id);
  // Bootstrap rows may predate this importer. Omitting one would erase the only
  // durable identity evidence; retain it until an import records it unchanged.
  const reserved=historicalIds.get(old.id);
  if(!reserved||reserved.category!==old.category||reserved.slug!==old.slug)conflicts.push('Unreserved current identity deletion:'+old.id);
  if(state.assignments.some(a=>a.termId===old.id)||state.foreignTerms.some(t=>t.parentId===old.id))conflicts.push('Referenced term deletion:'+old.id);
 }
 for(const old of state.sources){const next=input.sourceMappings.find(s=>sourceKey(s)===sourceKey(old));if(!next||next.termId!==old.termId)conflicts.push('Stable source identity removed/reassigned:'+sourceKey(old));}
 if(canonical(state.sources.slice().sort((a,b)=>compare(sourceKey(a),sourceKey(b))))!==canonical(input.sourceMappings))changes.push('sourceMappings');
 if(canonical(state.legacy.slice().sort((a,b)=>compare(a.legacySlug,b.legacySlug)))!==canonical(input.legacySlugMappings))changes.push('legacySlugMappings');
 if(!state.configured||state.defaultLocale!==input.defaultLocale)changes.push('defaultLocale');
 const groups=new Map<string,Assignment[]>();for(const a of state.assignments){const group=groups.get(a.recommendationId)??[];group.push(a);groups.set(a.recommendationId,group);}
 for(const [id,rows] of groups){
  const root=rows.find(r=>r.position===0),child=rows.find(r=>r.position===1);
  const rootTerm=root&&proposed.get(root.termId),childTerm=child&&proposed.get(child.termId);
  if(!rootTerm||rootTerm.parentId!==null||rows.length>(input.category==='people'?1:2)||rows.some(r=>r.position<0||r.position>(input.category==='people'?0:1))||
    (child&&(!childTerm||childTerm.parentId!==rootTerm.id)))conflicts.push('Existing assignment invalidated:'+id);
 }
 const changed=changes.length>0,next=changed?state.version+1:state.version;
 if(!Number.isSafeInteger(next)||next<1)conflicts.push('Catalog version exhausted/invalid');
 // Original identical hash may replay its immutable current-version receipt.
 const replay=state.receipts.some(r=>Number(r.catalog_version)===state.version);
 if(input.catalogVersion!==next&&!(replay&&!changed))conflicts.push('Proposed catalogVersion must equal observed '+(changed?'version + 1':'version'));
 if(state.receipts.length>0&&(changed||!replay))conflicts.push('Input hash already used for another catalog state');
 return {qualification:'unqualified-core',inputHash,category:input.category,observedCatalogVersion:state.version,catalogVersion:next,changed,changes:changes.sort(compare),conflicts:conflicts.sort(compare),affectedAssignments:changed?state.assignments:[],affectedRoutes:changed?[...new Set([...state.terms.map(t=>t.slug),...input.terms.map(t=>t.slug),...state.legacy.map(l=>l.legacySlug),...input.legacySlugMappings.map(l=>l.legacySlug)])].sort(compare):[],affectedAccounts:changed?state.accounts:[]};
}
async function transaction<T>(pool:TrustedTaxonomyMigratorPool,work:(client:DbClient)=>Promise<T>,commit:boolean):Promise<T>{
 const client=await pool.connect();let began=false;
 try {await client.query('BEGIN');began=true;const result=await work(client);await client.query(commit?'COMMIT':'ROLLBACK');began=false;return result;}
 catch(error){if(began){try{await client.query('ROLLBACK');}catch{/* Preserve the original error. */}}throw error;}
 finally{client.release();}
}
export async function dryRunTaxonomyCatalogImport(pool:TrustedTaxonomyMigratorPool,raw:unknown):Promise<TaxonomyImportPlan>{
 const validated=validateTaxonomyCatalogImport(raw);
 return transaction(pool,async client=>freeze(plan(validated.input,validated.inputHash,await load(client,validated.input))),false);
}
export async function applyTaxonomyCatalogImport(pool:TrustedTaxonomyMigratorPool,raw:unknown,reviewedBy:string):Promise<TaxonomyImportReceipt>{
 const {input,inputHash}=validateTaxonomyCatalogImport(raw);
 if(typeof reviewedBy!=='string'||reviewedBy.length<1||reviewedBy.length>200||!reviewedBy.trim()||/[\u0000-\u001f\u007f]/.test(reviewedBy))throw new Error('Reviewed operator identity required');
 return transaction(pool,async client=>{
  const state=await load(client,input),result=plan(input,inputHash,state);
  if(result.conflicts.length)throw new Error('Taxonomy import conflicts: '+result.conflicts.join('; '));
  if(!result.changed&&state.receipts.length){
   // First identical rerun records an immutable no-op; further retries reuse
   // that no-op receipt. The original changed receipt remains untouched.
   const stored=state.receipts.find(r=>Number(r.catalog_version)===state.version&&(r.receipt as TaxonomyImportReceipt).changed===false);
   if(stored)
   return freeze(stored.receipt as unknown as TaxonomyImportReceipt);
  }
  const receipt:TaxonomyImportReceipt={...result,receiptId:randomUUID(),reviewedBy,input};
  if(result.changed){
   // Remove mappings first for deleted, unreferenced terms. Sources cannot be
   // reassigned by this core; reviewed identity merge requires another contract.
   await client.query('DELETE FROM public.taxonomy_source_mappings WHERE category=$1',[input.category]);
   await client.query('DELETE FROM public.taxonomy_legacy_slug_mappings WHERE category=$1',[input.category]);
   // Detach old parents to allow complete reviewed reparenting/deletion. Tree and
   // assignment validation already passed; deferred guards check final state.
   await client.query('UPDATE public.taxonomy_terms SET parent_id=NULL WHERE category=$1 AND parent_id IS NOT NULL',[input.category]);
   await client.query('DELETE FROM public.taxonomy_terms WHERE category=$1 AND NOT(id=ANY($2::uuid[]))',[input.category,input.terms.map(t=>t.id)]);
   for(const term of input.terms)await client.query('INSERT INTO public.taxonomy_terms(id,category,slug,parent_id,position,active) VALUES($1,$2,$3,NULL,$4,$5) ON CONFLICT(id) DO UPDATE SET position=EXCLUDED.position,active=EXCLUDED.active',[term.id,input.category,term.slug,term.position,term.active]);
   for(const term of input.terms)if(term.parentId!==null)await client.query('UPDATE public.taxonomy_terms SET parent_id=$2 WHERE id=$1 AND category=$3',[term.id,term.parentId,input.category]);
   await client.query('DELETE FROM public.taxonomy_term_translations WHERE term_id IN(SELECT id FROM public.taxonomy_terms WHERE category=$1)',[input.category]);
   for(const term of input.terms)for(const locale of Object.keys(term.labels).sort(compare))await client.query('INSERT INTO public.taxonomy_term_translations(term_id,locale,label) VALUES($1,$2,$3)',[term.id,locale,term.labels[locale]]);
   for(const source of input.sourceMappings)await client.query('INSERT INTO public.taxonomy_source_mappings(category,source_host,entity_kind,document_id,term_id) VALUES($1,$2,$3,$4,$5)',[input.category,source.sourceHost,source.entityKind,source.documentId,source.termId]);
   for(const legacy of input.legacySlugMappings)await client.query('INSERT INTO public.taxonomy_legacy_slug_mappings(category,legacy_slug,term_id) VALUES($1,$2,$3)',[input.category,legacy.legacySlug,legacy.termId]);
   await client.query('UPDATE public.taxonomy_catalogs SET state=\'CONFIGURED\',version=$2,default_locale=$3 WHERE category=$1',[input.category,result.catalogVersion,input.defaultLocale]);
   // No association/recommendation DML: global invalidation occurs exactly once
   // per scope, independent of 0037 association statement triggers.
   for(const account of state.accounts)await client.query('INSERT INTO public.account_category_content_state(account_id,category,revision) VALUES($1,$2,1) ON CONFLICT(account_id,category) DO UPDATE SET revision=public.account_category_content_state.revision+1',[account,input.category]);
  }
  await client.query('INSERT INTO public.taxonomy_import_receipts(id,category,import_contract,input_hash,catalog_version,changed,reviewed_by,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',[receipt.receiptId,input.category,input.version,inputHash,result.catalogVersion,result.changed,reviewedBy,canonical(receipt)]);
  return freeze(receipt);
 },true);
}
