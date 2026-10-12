import {it,expect} from 'vitest';
import {PUBLIC_PARITY_CASES,PUBLIC_PARITY_PROJECTS,buildPublicParitySeedPlan,publicParityManifestSchema} from '../../../scripts/public-parity-browser-support';
import {SqlStatementRecorder,isPublicAccountScope,isTransactionControl} from '../helpers/sqlStatementRecorder';
it('preserves exact source identities and deterministic complete ordered positive sets',()=>{
 expect(PUBLIC_PARITY_CASES).toHaveLength(16);
 expect(PUBLIC_PARITY_PROJECTS).toEqual(['public-parity-desktop','public-parity-mobile']);
 expect(()=>buildPublicParitySeedPlan('unknown')).toThrow();
 const plan=buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0]);
 expect(buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0])).toEqual(plan);
 expect(plan.categories).toHaveLength(8);
 for(const c of plan.categories){
  expect(c.lists.filter(l=>l.owner==='ownerA'&&l.control===null)).toHaveLength(53);
  expect(c.items.filter(i=>i.collectionKey===c.targetCollectionKey&&i.control===null).map(i=>i.displayOrder)).toEqual(Array.from({length:53},(_,i)=>i));
  expect(c.lists.filter(l=>l.owner==='ownerA'&&l.control!==null).map(l=>l.control)).toEqual(['private','draft','archived']);
  expect(c.lists.find(l=>l.owner==='ownerB')?.slug).toBe(c.lists[0].slug);
  expect(c.lists.find(l=>l.owner==='ownerB')?.title).not.toBe(c.lists[0].title);
 }
 expect(plan.dependencies.every(d=>d.status==='missing')).toBe(true);
 expect(plan.qualification).toBe('source-preparation-only');
});
it('strict prepared manifest refuses secrets authority altered facts and wrong order',()=>{
 const m={version:1,stage:'prepared',caseId:PUBLIC_PARITY_CASES[0],project:PUBLIC_PARITY_PROJECTS[0],repeat:0,plan:buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0])};
 expect(publicParityManifestSchema.safeParse(m).success).toBe(true);
 for(const key of ['databaseUrl','pool','sessionCookie','capability','storagePath'])expect(publicParityManifestSchema.safeParse({...m,[key]:'caller value'}).success).toBe(false);
 const reversed=structuredClone(m);reversed.plan.categories[0].items.reverse();
 expect(publicParityManifestSchema.safeParse(reversed).success).toBe(false);
 const changed=structuredClone(m);changed.plan.categories[0].items[0].details={fabricated:true} as never;
 expect(publicParityManifestSchema.safeParse(changed).success).toBe(false);
});

it('rejects non JSON values without invoking accessors',()=>{
 const base=()=>({version:1,stage:'prepared',caseId:PUBLIC_PARITY_CASES[0],project:PUBLIC_PARITY_PROJECTS[0],repeat:0,plan:buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0])});
 let invoked=0;
 for(const decorate of [
  (v:any)=>Object.defineProperty(v.plan,'secret',{value:'hidden',enumerable:false}),
  (v:any)=>Object.defineProperty(v.plan,'qualification',{get:()=>{invoked++;return 'source-preparation-only';},enumerable:true}),
  (v:any)=>Object.defineProperty(v,'plan',{get:()=>{invoked++;return base().plan;},enumerable:true}),
  (v:any)=>{v.plan[Symbol('secret')]='hidden';},
  (v:any)=>{v.plan.secret=()=>{};},
  (v:any)=>{v.plan.secret=undefined;},
  (v:any)=>{v.plan.secret=NaN;},
  (v:any)=>{v.plan.secret=Infinity;},
  (v:any)=>{Object.setPrototypeOf(v.plan,{secret:'inherited'});},
  (v:any)=>{v.plan.secret=v.plan;},
  (v:any)=>{v.plan.categories[0].items[0]=new Date();},
 ]){const value=base();decorate(value);expect(()=>publicParityManifestSchema.safeParse(value)).not.toThrow();expect(publicParityManifestSchema.safeParse(value).success).toBe(false);}
 expect(invoked).toBe(0);
});
it('uses canonical publication controls rather than item visibility',()=>{
 for(const c of buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0]).categories){
  for(const i of c.items.filter(i=>i.control===null)){expect(i).not.toHaveProperty('visibility');if(c.category!=='guides')expect(i).toHaveProperty('publicationState','published');expect(i.archived).toBe(false);}
  const withheld=c.items.find(i=>i.control==='withheld')!;
  expect(withheld).not.toHaveProperty('visibility');
  if(c.category==='guides')expect(withheld.archived).toBe(true);else expect(withheld).toHaveProperty('publicationState','draft');
 }
});
it('uses active manual Games contract and leaves unsupported Games genre pending',()=>{
 const plan=buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0]);const games=plan.categories.find(c=>c.category==='games')!;
 expect(games.items[0].details).toEqual({version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null});
 expect(games.catalogFacet).toBe(null);
 expect(plan.dependencies).toContainEqual({feature:'games-catalog-genre',status:'missing',marker:'unsupported-active-manual-games-public-graph'});
});
it('records browser detail limits separately from explicit API traversal',()=>{
 const plan=buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0]);
 for(const c of plan.categories){expect(c.traversal.detail.limit).toBe(['books','places'].includes(c.category)?24:12);expect(c.traversal.explicitApiDetail.requestLimit).toBe(24);expect(c.traversal.explicitApiDetail.limit).toBe(c.category==='guides'?12:24);}
});

it('matches actual public Guides response windows when request limit is 24',async()=>{
 const {publicGuidesProjection}=await import('../../publicProfile/publicGuidesProjection');
 const plan=buildPublicParitySeedPlan(PUBLIC_PARITY_CASES[0]);
 const guides=plan.categories.find(c=>c.category==='guides')!;
 const seed=guides.items.filter(i=>i.control===null&&i.collectionKey===guides.targetCollectionKey);
 const observed={id:'fixture-account',handle:'public-parity-a',account_revision:'1',content_revision:'1'};
 const requests:number[][]=[];
 /**
  * Structural keys, not SELECT-list prefixes. `SELECT a.id,a.handle` is the public
  * account-scope SELECT list shared by nine projection files; keying on it is how
  * 343df2dd silently emptied a Places mock. The scope read is keyed on
  * creator_accounts + the guides category-settings join + `a.handle_key=lower($1)`, and
  * the guide list on `FROM collections c` + `c.category='guides'`. The recorder's
  * `unmatched` makes any structural statement that reaches the `[]` fallback fatal, and
  * the positive counters make an empty answer on either read fatal too - without them
  * the pagination assertions below could pass over an empty projection.
  */
 const seen=new SqlStatementRecorder({
  sections:sql=>sql.includes('FROM guide_sections'),
  scope:sql=>isPublicAccountScope(sql,'guides'),
  guideList:sql=>sql.includes('FROM collections c')&&sql.includes("c.category='guides'"),
 },sql=>!isTransactionControl(sql)&&/FROM (creator_accounts a|collections c|guide_sections gs)\b/.test(sql));
 const query=async(sql:string,parameters?:unknown[])=>{
  const kind=seen.kind(sql);
  if(kind==='sections'){
   const limit=Number(parameters![2]),offset=Number(parameters![3]);requests.push([limit,offset]);
   return {rows:seen.serve(kind,seed.slice(offset,offset+limit).map(i=>({id:i.key,title:i.title,description:null,display_order:i.displayOrder,block_version:'guide-section-blocks/v1',blocks:i.details})))};
  }
  if(kind==='scope')return {rows:seen.serve(kind,[observed])};
  if(kind==='guideList')return {rows:seen.serve(kind,[{id:guides.targetCollectionKey,title:'Fixture guide',slug:'guides-list-0',pin_order:null,estimated_budget:null}])};
  return {rows:[]};
 };
 const pool={query,connect:async()=>({query,release:()=>{}})};
 const lengths:number[]=[],ids:string[]=[],cursors:(string|null)[]=[];
 let cursor:string|undefined;
 do{
  const page=await publicGuidesProjection(pool as never,'public-parity-a',24,cursor,'guides-list-0');
  lengths.push(page.guides[0].guide_sections.length);
  ids.push(...page.guides[0].guide_sections.map((s:{documentId:string})=>s.documentId));
  const next=page.guides[0].guide_sections_next_cursor;cursors.push(next);cursor=next??undefined;
 }while(cursor);
 expect(lengths).toEqual([12,12,12,12,5]);
 expect(cursors).toEqual(['o12','o24','o36','o48',null]);
 expect(ids).toEqual(seed.map(i=>i.key));
 expect(requests).toEqual([[13,0],[13,12],[13,24],[13,36],[13,48]]);
 seen.assertExercised([],['scope','guideList','sections']);
 expect(guides.traversal.explicitApiDetail).toEqual({requestLimit:24,limit:12,offsets:[0,12,24,36,48],lengths,cursorKind:'offset'});
});

