import {expect, it} from 'vitest';
import {applyTaxonomyCatalogImport, dryRunTaxonomyCatalogImport, validateTaxonomyCatalogImport} from '../../services/taxonomyCatalogImport';

// Synthetic, resource-free SQL protocol tests. They do not qualify PostgreSQL,
// privileges, lifecycle races, actual vocabulary, or operator approval.
const id=(n:number)=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input=()=>({version:'explorers-taxonomy-import/v1',catalogVersion:1,category:'places',defaultLocale:'en',terms:[
 {id:id(1),category:'places',slug:'root',parentId:null,position:0,active:true,labels:{en:'Synthetic root'}},
 {id:id(2),category:'places',slug:'child',parentId:id(1),position:1,active:true,labels:{en:'Synthetic child'}},
],sourceMappings:[{sourceHost:'cms.example.org',entityKind:'roots',documentId:'original-id',termId:id(1)}],legacySlugMappings:[{legacySlug:'old-root',termId:id(1)}]});
function fake(options:{version?:number; terms?:Record<string,unknown>[]; labels?:Record<string,unknown>[]; sources?:Record<string,unknown>[]; legacy?:Record<string,unknown>[]; receipts?:Record<string,unknown>[]; history?:Record<string,unknown>[]; assignments?:Record<string,unknown>[]; fail?:string}={}){
 const calls:{sql:string;values:unknown[]}[]=[];let released=0;
 const client={async query(sql:string,values:unknown[]=[]){
  calls.push({sql,values});if(options.fail&&sql.includes(options.fail))throw new Error('synthetic failure');
  let rows:Record<string,unknown>[]=[];
  if(sql.includes('/* catalog */'))rows=[{version:options.version??0,state:options.version?'CONFIGURED':'UNCONFIGURED',default_locale:options.version?'en':null}];
  if(sql.includes('/* terms */'))rows=options.terms??[];
  if(sql.includes('/* sources */'))rows=options.sources??[];
  if(sql.includes('/* labels */'))rows=options.labels??[];
  if(sql.includes('/* legacy */'))rows=options.legacy??[];
  if(sql.includes('/* receipts */'))rows=options.receipts??[];
  if(sql.includes('/* identity history */'))rows=options.history??[];
  if(sql.includes('/* assignments */'))rows=options.assignments??[];
  if(sql.includes('/* scopes */'))rows=[{account_id:id(9)}];
  return {rows};
 },release(){released++;}};
 return {pool:{async connect(){return client;}},calls,get released(){return released;}};
}
it('snapshots data before parsing/hash; rejects accessors without executing them',()=>{
 const x=input();let invoked=false;Object.defineProperty(x,'defaultLocale',{enumerable:true,get(){invoked=true;return 'en';}});
 expect(()=>validateTaxonomyCatalogImport(x)).toThrow();expect(invoked).toBe(false);
 const y=input(),v=validateTaxonomyCatalogImport(y);y.terms[0].labels.en='mutated';
 expect(v.input.terms[0].labels.en).toBe('Synthetic root');expect(Object.isFrozen(v.input.terms[0].labels)).toBe(true);
 expect(validateTaxonomyCatalogImport({...input(),terms:[...input().terms].reverse()}).inputHash).toBe(v.inputHash);
 const proxy=new Proxy(input(),{getPrototypeOf(){throw new Error('Proxy trap executed');}});
 expect(()=>validateTaxonomyCatalogImport(proxy)).toThrow('Proxy input unsupported');
});
it('rejects complete invalid input before acquiring a connection',async()=>{
 const f=fake();await expect(applyTaxonomyCatalogImport(f.pool,{...input(),defaultLocale:'fr'},'reviewer')).rejects.toThrow();expect(f.calls).toEqual([]);
 expect(()=>validateTaxonomyCatalogImport({...input(),terms:[{...input().terms[0],position:2147483648}]})).toThrow();
});
it('dry-run reports changes, routes, assignments and writes nothing',async()=>{
 const f=fake();const r=await dryRunTaxonomyCatalogImport(f.pool,input());
 expect(r.changed).toBe(true);expect(r.changes).toContain('term:add:'+id(1));expect(r.affectedRoutes).toContain('old-root');
 expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);expect(f.calls.at(-1)?.sql).toBe('ROLLBACK');expect(f.released).toBe(1);
});
it('applies atomically with table/catalog/account/category/recommendation lock order and one invalidation',async()=>{
 const f=fake();const r=await applyTaxonomyCatalogImport(f.pool,input(),'synthetic-review');expect(r.catalogVersion).toBe(1);
 const sql=f.calls.map(c=>c.sql);const index=(s:string)=>sql.findIndex(q=>q.includes(s));
 expect(index('LOCK TABLE public.taxonomy_terms')).toBeLessThan(index('/* catalog */'));
 expect(index('/* catalog */')).toBeLessThan(index('/* account locks */'));
 expect(index('/* account locks */')).toBeLessThan(index('pg_advisory_xact_lock'));
 expect(index('pg_advisory_xact_lock')).toBeLessThan(index('/* recommendation locks */'));
 expect(index('/* recommendation locks */')).toBeLessThan(index('INSERT INTO public.taxonomy_terms'));
 expect(sql.filter(s=>s.startsWith('INSERT INTO public.account_category_content_state'))).toHaveLength(1);
 expect(sql.some(s=>/^(INSERT|UPDATE|DELETE).*recommendation_taxonomy/.test(s))).toBe(false);
 expect(sql.at(-1)).toBe('COMMIT');expect(f.released).toBe(1);
});
it('rejects stale version and conflicting stable identity/source mappings before DML',async()=>{
 for(const options of [
  {version:3},
  {terms:[{id:id(1),category:'places',slug:'other',parent_id:null,position:0,active:true}]},
  {sources:[{source_host:'cms.example.org',entity_kind:'roots',document_id:'original-id',term_id:id(2)}]},
 ]){const f=fake(options);await expect(applyTaxonomyCatalogImport(f.pool,input(),'reviewer')).rejects.toThrow();expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);expect(f.calls.at(-1)?.sql).toBe('ROLLBACK');}
});
it('rejects deletion/reparenting that would invalidate retained assignments',async()=>{
 const assignments=[{recommendation_id:id(8),account_id:id(9),term_id:id(1),position:0},{recommendation_id:id(8),account_id:id(9),term_id:id(2),position:1}];
 for(const terms of [[input().terms[0]],[input().terms[0],{...input().terms[1],parentId:null}]]){
  const f=fake({assignments});await expect(applyTaxonomyCatalogImport(f.pool,{...input(),terms},'reviewer')).rejects.toThrow();expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);
 }
});
it('rolls back failures and always releases the owned connection',async()=>{
 const f=fake({fail:'INSERT INTO public.taxonomy_terms'});await expect(applyTaxonomyCatalogImport(f.pool,input(),'reviewer')).rejects.toThrow('synthetic failure');expect(f.calls.at(-1)?.sql).toBe('ROLLBACK');expect(f.released).toBe(1);
});
const existing=()=>({version:1,terms:input().terms.map(t=>({id:t.id,category:t.category,slug:t.slug,parent_id:t.parentId,position:t.position,active:t.active})),labels:input().terms.map(t=>({term_id:t.id,locale:'en',label:t.labels.en})),sources:input().sourceMappings.map(s=>({source_host:s.sourceHost,entity_kind:s.entityKind,document_id:s.documentId,term_id:s.termId})),legacy:input().legacySlugMappings.map(l=>({legacy_slug:l.legacySlug,term_id:l.termId}))});
it('identical complete state writes only a no-op receipt, with current versions and no invalidation',async()=>{
 const f=fake(existing()),r=await applyTaxonomyCatalogImport(f.pool,input(),'reviewer');
 expect(r.changed).toBe(false);expect(r.catalogVersion).toBe(1);expect(r.affectedAccounts).toEqual([]);
 expect(f.calls.filter(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql)).map(c=>c.sql)).toEqual([expect.stringContaining('INSERT INTO public.taxonomy_import_receipts')]);
});
it('hash reruns reuse a recorded no-op, reject reused hash after another state, and preserve original changed receipt',async()=>{
 const original=await applyTaxonomyCatalogImport(fake().pool,input(),'reviewer');
 const first=fake({...existing(),receipts:[{input_hash:original.inputHash,catalog_version:1,receipt:original}]});
 const noop=await applyTaxonomyCatalogImport(first.pool,input(),'reviewer');expect(noop.changed).toBe(false);expect(noop.receiptId).not.toBe(original.receiptId);
 const second=fake({...existing(),receipts:[{input_hash:original.inputHash,catalog_version:1,receipt:original},{input_hash:noop.inputHash,catalog_version:1,receipt:noop}]});
 expect(await applyTaxonomyCatalogImport(second.pool,input(),'reviewer')).toEqual(noop);
 expect(second.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);
 const stale=fake({...existing(),version:2,receipts:[{input_hash:noop.inputHash,catalog_version:1,receipt:noop}]});await expect(applyTaxonomyCatalogImport(stale.pool,input(),'reviewer')).rejects.toThrow('hash already used');
});
it('label/deactivation/redirect changes invalidate each category scope once while retaining unavailable assignments',async()=>{
 const x=input();x.catalogVersion=2;x.terms[0].active=false;x.terms[0].labels.en='Edited';x.legacySlugMappings=[];
 const f=fake({...existing(),assignments:[{recommendation_id:id(8),account_id:id(9),term_id:id(1),position:0}]});
 const r=await applyTaxonomyCatalogImport(f.pool,x,'reviewer');expect(r.changed).toBe(true);expect(r.catalogVersion).toBe(2);expect(r.affectedAssignments).toHaveLength(1);expect(r.affectedRoutes).toContain('old-root');
 expect(f.calls.filter(c=>c.sql.startsWith('INSERT INTO public.account_category_content_state'))).toHaveLength(1);
});
const cleanInput=()=>({...input(),sourceMappings:[],legacySlugMappings:[]});
const historyRow=(raw:unknown)=>{
 const v=validateTaxonomyCatalogImport(raw);
 return {category:v.input.category,import_contract:v.input.version,input_hash:v.inputHash,input:v.input};
};
it('permits complete deletion of unreferenced terms while retaining immutable identity history',async()=>{
 const deleted={...cleanInput(),catalogVersion:2,terms:[]};
 const f=fake({...existing(),sources:[],legacy:[],history:[historyRow(cleanInput())]});
 const r=await applyTaxonomyCatalogImport(f.pool,deleted,'reviewer');expect(r.changed).toBe(true);expect(r.catalogVersion).toBe(2);
 expect(f.calls.some(c=>c.sql.startsWith('DELETE FROM public.taxonomy_terms'))).toBe(true);
});
it('rejects bootstrap deletion of a current unreferenced identity absent from validated immutable history',async()=>{
 const deleted={...cleanInput(),catalogVersion:2,terms:[]};
 for(const history of [[],[historyRow({...cleanInput(),terms:[{...input().terms[0],id:id(99),slug:'unrelated'}]})]]){
  const f=fake({...existing(),sources:[],legacy:[],history});
  await expect(applyTaxonomyCatalogImport(f.pool,deleted,'reviewer')).rejects.toThrow('Unreserved current identity deletion');
  expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);expect(f.calls.at(-1)?.sql).toBe('ROLLBACK');
 }
});
it('rejects deleted UUID reuse with a different slug or category and deleted slug reuse with a different UUID',async()=>{
 const removed={...cleanInput(),catalogVersion:2,terms:[]};
 const candidates=[
  {...cleanInput(),catalogVersion:3,terms:[{...input().terms[0],slug:'reused-uuid'}]},
  {...cleanInput(),catalogVersion:3,terms:[{...input().terms[0],id:id(99)}]},
  {...cleanInput(),catalogVersion:3,category:'people',terms:[{...input().terms[0],category:'people'}]},
 ];
 for(const candidate of candidates){
  const f=fake({version:2,history:[historyRow(cleanInput()),historyRow(removed)]});
  await expect(applyTaxonomyCatalogImport(f.pool,candidate,'reviewer')).rejects.toThrow('Historical');
  expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);
  const historyQuery=f.calls.find(c=>c.sql.includes('/* identity history */'))!;
  expect(historyQuery.sql).not.toMatch(/WHERE.*(input_hash|category)\s*=/);expect(historyQuery.values).toEqual([]);
 }
});
it('permits deleted identity reinstatement with its original UUID/category/slug',async()=>{
 const removed={...cleanInput(),catalogVersion:2,terms:[]};
 const f=fake({version:2,history:[historyRow(cleanInput()),historyRow(removed)]});
 const r=await applyTaxonomyCatalogImport(f.pool,{...cleanInput(),catalogVersion:3},'reviewer');expect(r.changed).toBe(true);expect(r.catalogVersion).toBe(3);
});
it('fails closed on malformed, mismatched, or contradictory immutable historical input evidence',async()=>{
 const good=historyRow(cleanInput());
 const inconsistent={...cleanInput(),catalogVersion:2,terms:[{...input().terms[0],slug:'changed-history'}]};
 for(const history of [
  [{...good,input:{...cleanInput(),unrecognized:true}}],
  [{...good,input_hash:'0'.repeat(64)}],
  [{...good,category:'people'}],
  [good,historyRow(inconsistent)],
 ]){
  const f=fake({version:2,history});await expect(applyTaxonomyCatalogImport(f.pool,{...cleanInput(),catalogVersion:3},'reviewer')).rejects.toThrow(/histor|Historical/);
  expect(f.calls.some(c=>/^(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);expect(f.calls.at(-1)?.sql).toBe('ROLLBACK');
 }
});
