import {describe,it,expect,vi} from 'vitest';
import {RecommendationService} from '../../application/recommendations';
import {ExplorersRecommendationRepository} from '../../repositories/explorersRecommendationRepository';
import {replaceTaxonomyAssignment} from '../../repositories/taxonomyAssignmentRepository';
import {createRecommendationSchema} from '../../../shared/explorersContract';

const flatId='00000000-0000-5000-8000-000000000001';
function flatDb(rows:Record<string,unknown[]>){return {query:vi.fn(async(sql:string)=>({rows:Object.entries(rows).find(([k])=>sql.includes(k))?.[1]??[],rowCount:1}))};}

describe('flat curated assignment (S2)',()=>{
 it('writes one position-0 term for books',async()=>{
  const fake=flatDb({'FROM taxonomy_catalogs':[{state:'CONFIGURED',default_locale:'en'}],'FROM taxonomy_terms':[{id:flatId,parent_id:null,active:true}]});
  await replaceTaxonomyAssignment(fake as never,'r1','a1','books',{curatedTermId:flatId});
  expect(fake.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO recommendation_taxonomy'),['r1','a1','books',flatId,0]);
 });
 it('clears with null and refuses curatedTermId on places/people/movies',async()=>{
  const fake=flatDb({});
  await replaceTaxonomyAssignment(fake as never,'r1','a1','games',{curatedTermId:null});
  expect(fake.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM recommendation_taxonomy'),['r1','a1','games']);
  for(const c of ['places','people','movies'])await expect(replaceTaxonomyAssignment(flatDb({}) as never,'r1','a1',c,{curatedTermId:flatId})).rejects.toThrow(/mismatch/);
 });
 it('refuses an unconfigured catalog',async()=>{
  await expect(replaceTaxonomyAssignment(flatDb({'FROM taxonomy_catalogs':[{state:'UNCONFIGURED'}]}) as never,'r1','a1','apps',{curatedTermId:flatId})).rejects.toThrow(/unavailable/);
 });
 it('create schema accepts curatedTermId only for the four flat categories',()=>{
  const base={entityId:flatId,collectionId:flatId,expectedCollectionRevision:1};
  expect(createRecommendationSchema.safeParse({...base,category:'products',curatedTermId:flatId}).success).toBe(true);
  expect(createRecommendationSchema.safeParse({...base,category:'places',curatedTermId:flatId}).success).toBe(false);
 });
});
const id=(n:number)=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
function harness(options:{category?:string;inactive?:boolean;wrongParent?:boolean;foreign?:boolean;unconfigured?:boolean;changedCategory?:boolean}={}){
 const sql:string[]=[],writes:any[]=[];let observed=0;const receipts=new Map<string,any>();let assignments:string[]=[id(1)];let revision=1;let backup:any;
 const row=()=>({id:id(90),account_id:id(99),entity_id:id(80),category:options.category??'people',user_rating:null,publication_state:'draft',revision});
 const db={release(){},async query(s:string,p:any[]=[]){sql.push(s);let rows:any[]=[];
  if(s==='BEGIN')backup={assignments:[...assignments],revision};
  if(s==='ROLLBACK'){assignments=backup.assignments;revision=backup.revision;}
  if(s.includes('FROM account_memberships'))rows=[{status:'active',role:'owner',session_version:'1',blocked_at:null}];
  else if(s.startsWith('SELECT * FROM collections'))rows=[{id:id(91),category:row().category,revision:1}];
  else if(s.startsWith('INSERT INTO recommendations(')){revision=1;rows=[row()];}
  else if(s.startsWith('SELECT category FROM recommendations')){observed++;rows=options.foreign?[]:[{category:options.changedCategory&&observed>1?'books':row().category}];}
  else if(s.startsWith('SELECT status'))rows=[{status:'active'}];
  else if(s.includes('FROM application_command_receipts'))rows=receipts.has(p[2].toString("hex"))?[receipts.get(p[2].toString("hex"))]:[];
  else if(s.startsWith('SELECT * FROM recommendations'))rows=[row()];
  else if(s.startsWith('SELECT state'))rows=[{state:options.unconfigured?'UNCONFIGURED':'CONFIGURED',default_locale:'en'}];
  else if(s.startsWith('SELECT id,parent_id'))rows=p[1].map((term:string,i:number)=>({id:term,parent_id:i?(options.wrongParent?id(7):p[1][0]):null,active:!options.inactive}));
  else if(s.startsWith('UPDATE recommendations SET user_rating')){revision++;rows=[row()];}
  else if(s.startsWith('DELETE FROM recommendation_taxonomy')){assignments=[];writes.push(p);}
  else if(s.startsWith('INSERT INTO recommendation_taxonomy')){assignments.push(p[3]);writes.push(p);}
  else if(s.startsWith('INSERT INTO application_command_receipts'))receipts.set(p[2].toString("hex"),{request_hash:p[3],response:JSON.parse(p[4]),status:'completed',replayable:true});
  return {rows,rowCount:rows.length};}};
 const pool={connect:async()=>db,query:db.query};return {service:new RecommendationService(pool as any),repo:new ExplorersRecommendationRepository(pool as any),sql,writes,state:()=>({assignments,revision})};
}
it('actual update persists single sector, revision once, catalog before account and preserves replay/hash behavior',async()=>{
 const h=harness();const input={peopleSectorTermId:id(2)};const result=await h.repo.updateRecommendation(id(99),id(90),1,input,'command-1');
 expect(result.revision).toBe(2);expect(h.state()).toEqual({assignments:[id(2)],revision:2});
 expect(h.sql.findIndex(s=>s.includes('lock_explorers_taxonomy_catalog'))).toBeLessThan(h.sql.findIndex(s=>s.startsWith('SELECT status')));
 expect(await h.repo.updateRecommendation(id(99),id(90),1,input,'command-1')).toEqual(result);expect(h.writes).toHaveLength(2);
 await expect(h.repo.updateRecommendation(id(99),id(90),1,{peopleSectorTermId:id(3)},'command-1')).rejects.toMatchObject({status:409});
});
it('actual update distinguishes omission and unconfigured clearing',async()=>{
 const h=harness({unconfigured:true});await h.repo.updateRecommendation(id(99),id(90),1,{publicationState:'draft'},'preserve-1');expect(h.state().assignments).toEqual([id(1)]);
 await h.repo.updateRecommendation(id(99),id(90),2,{peopleSectorTermId:null},'clear-01');expect(h.state().assignments).toEqual([]);
});
it('actual update rolls back unavailable, wrong category, wrong parent and stale assignments',async()=>{
 for(const options of [{inactive:true},{unconfigured:true},{category:'books'},{category:'places',wrongParent:true}]){
  const h=harness(options);const input=options.category==='places'?{placesTaxonomy:{categoryTermId:id(1),subcategoryTermId:id(2)}}:{peopleSectorTermId:id(2)};
  await expect(h.repo.updateRecommendation(id(99),id(90),1,input,'invalid-1')).rejects.toMatchObject({status:422});expect(h.state()).toEqual({assignments:[id(1)],revision:1});expect(h.sql.at(-1)).toBe('ROLLBACK');
 }
 const h=harness();await expect(h.repo.updateRecommendation(id(99),id(90),2,{peopleSectorTermId:null},'stale-01')).rejects.toMatchObject({status:409});expect(h.writes).toHaveLength(0);
});
it('foreign owner and category change between observation and account lock stop before callback',async()=>{
 for(const options of [{foreign:true},{changedCategory:true}]){const h=harness(options);await expect(h.repo.updateRecommendation(id(99),id(90),1,{peopleSectorTermId:null},'foreign-1')).rejects.toMatchObject({status:404});expect(h.writes).toHaveLength(0);expect(h.sql.some(s=>s.startsWith('SELECT * FROM recommendations'))).toBe(false);}
});

const actor={userId:id(98),accountId:id(99),role:'owner' as const,credential:{kind:'oauth' as const,grantId:id(97),scopes:['recommendations:write']}};
it('actual application POST and PATCH forward assignment fields while returning strict core DTOs',async()=>{
 const h=harness();const created=await h.service.createRecommendation(actor,{category:'people',entityId:id(80),collectionId:id(91),expectedCollectionRevision:1,peopleSectorTermId:id(2)},{requestId:'fixture-request',idempotencyKey:'create-01'});
 expect(created.revision).toBe(1);expect(created).not.toHaveProperty('peopleSectorTermId');expect(h.state().assignments).toEqual([id(2)]);
 const updated=await h.service.updateRecommendation(actor,id(90),{expectedRevision:1,peopleSectorTermId:null},{requestId:'fixture-request',idempotencyKey:'update-01'});
 expect(updated.revision).toBe(2);expect(h.state().assignments).toEqual([]);
 const other=harness();await expect(other.service.createRecommendation(actor,{category:'people',entityId:id(80),collectionId:id(91),expectedCollectionRevision:1,placesTaxonomy:{categoryTermId:null,subcategoryTermId:null}},{requestId:'fixture-request',idempotencyKey:'wrong-01'})).rejects.toMatchObject({status:422});expect(other.sql.some(s=>s==='BEGIN')).toBe(false);
});
it('actual Places update persists root and direct child in association order',async()=>{
 const h=harness({category:'places'});await h.repo.updateRecommendation(id(99),id(90),1,{placesTaxonomy:{categoryTermId:id(1),subcategoryTermId:id(2)}},'places-01');expect(h.state().assignments).toEqual([id(1),id(2)]);expect(h.state().revision).toBe(2);
});

it('actual archive and entity replacement take catalog prelock without changing assignment ownership',async()=>{
 const archived=harness();await archived.repo.archiveRecommendation(id(99),id(90),1,'archive-01');expect(archived.state().assignments).toEqual([id(1)]);expect(archived.sql.findIndex(s=>s.includes('lock_explorers_taxonomy_catalog'))).toBeLessThan(archived.sql.findIndex(s=>s.startsWith('SELECT status')));
 const replaced=harness();await expect(replaced.repo.replaceRecommendationEntity(id(99),id(90),1,id(81),'replace-01')).rejects.toMatchObject({status:404});expect(replaced.sql.findIndex(s=>s.includes('lock_explorers_taxonomy_catalog'))).toBeLessThan(replaced.sql.findIndex(s=>s.startsWith('SELECT status')));expect(replaced.writes).toHaveLength(0);
});
