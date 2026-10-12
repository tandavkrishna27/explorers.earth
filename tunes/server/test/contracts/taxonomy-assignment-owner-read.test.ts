import {OwnerContentService} from '../../application/ownerContent';
import {it,expect} from 'vitest';
import {readTaxonomyAssignment} from '../../repositories/taxonomyAssignmentRepository';
import {peopleSectorReadSchema,placesTaxonomyReadSchema} from '../../../shared/explorersTaxonomyContract';
import {SqlStatementRecorder,isTransactionControl} from '../helpers/sqlStatementRecorder';
const id=(n:number)=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
it('readback uses approved default label and recommendation/account identity, independent of entity facts',async()=>{
 const calls:any[]=[];
 const db={async query(sql:string,params:any[]){calls.push([sql,params]);return {rows:sql.includes('FROM taxonomy_catalogs')?[{state:'CONFIGURED',version:3,default_locale:'hi'}]:[{id:id(1),slug:'stable-root',parent_id:null,active:true,label:'क्षेत्र'}]};}};
 const result=await readTaxonomyAssignment(db as any,id(90),id(99),'people');
 expect(result).toEqual({peopleSector:{catalogState:'CONFIGURED',catalogVersion:3,defaultLocale:'hi',selectionUnavailable:false,sector:{id:id(1),slug:'stable-root',label:'क्षेत्र',unavailable:false}}});
 expect(calls[1][1]).toEqual([id(90),id(99),'people','hi']);expect(calls.some(c=>c[0].includes('entities'))).toBe(false);
});
it('inactive ancestors and unconfigured existing assignments are explicit and strict',async()=>{
 for(const state of ['CONFIGURED','UNCONFIGURED']){
 const db={async query(sql:string){return {rows:sql.includes('FROM taxonomy_catalogs')?[{state,version:state==='CONFIGURED'?1:0,default_locale:state==='CONFIGURED'?'en':null}]:[{id:id(1),slug:'root',parent_id:null,active:false,label:state==='CONFIGURED'?'Root':null},{id:id(2),slug:'child',parent_id:id(1),parent_active:false,active:true,label:'Child'}]};}};
 const result=await readTaxonomyAssignment(db as any,id(90),id(99),'places');
 expect(result.placesTaxonomy?.selectionUnavailable).toBe(true);expect(result.placesTaxonomy?.subcategory?.unavailable).toBe(true);
 expect(placesTaxonomyReadSchema.safeParse({...result.placesTaxonomy,unexpected:true}).success).toBe(false);
 }
 expect(peopleSectorReadSchema.safeParse({catalogState:'UNCONFIGURED',catalogVersion:0,defaultLocale:null,sector:null,selectionUnavailable:false}).success).toBe(true);
});

/**
 * Structural keys for the owner recommendation read.
 *
 * The old key for the recommendation row was `sql.startsWith('SELECT r.id,r.account_id')`,
 * assembled at runtime from the `recommendationProjection` constant in
 * application/ownerContent.ts - invisible to a literal grep, and OVER-MATCHING: the list
 * read (ownerContent.ts:178) and the single read (:234) share that projection, so in an
 * `else if` chain whichever came first answered both. Both are now keyed on their own
 * FROM/WHERE structure, which tells them apart without touching production SQL:
 * the single read is `FROM recommendations r WHERE r.id=$1 AND r.account_id=$2`, the list
 * read carries `AS page_order`. The recorder also rejects any statement that two keys
 * match, so a future over-match is an error rather than a wrong branch answering.
 */
const ownerReadRules={
 membership:(sql:string)=>sql.includes('FROM account_memberships'),
 recommendationSingle:(sql:string)=>sql.includes('FROM recommendations r WHERE r.id=$1 AND r.account_id=$2'),
 recommendationList:(sql:string)=>/FROM recommendations r\b/.test(sql)&&sql.includes('AS page_order'),
 sizeBound:(sql:string)=>sql.includes('FROM recommendations r JOIN entities e')&&sql.includes('AS title_bytes'),
 detail:(sql:string)=>sql.includes('FROM recommendations r JOIN entities e')&&sql.includes('AS override_schema_version'),
 personEntity:(sql:string)=>sql.includes('FROM entities e')&&sql.includes('person_entity_details'),
 taxonomyCatalog:(sql:string)=>sql.includes('FROM taxonomy_catalogs'),
 assignedTaxonomy:(sql:string)=>sql.includes('FROM recommendation_taxonomy r'),
};
const ownerReadStructural=(sql:string)=>!isTransactionControl(sql)&&(
 /FROM recommendations r\b/.test(sql)||/FROM entities e LEFT JOIN person_entity_details/.test(sql)
 ||sql.includes('FROM taxonomy_catalogs')||sql.includes('FROM recommendation_taxonomy r')||sql.includes('FROM account_memberships'));
function ownerHarness(category:'people'|'places'='people',oversize=false){
 const calls:any[]=[];const seen=new SqlStatementRecorder(ownerReadRules,ownerReadStructural);
 const db={release(){},async query(sql:string,p:any[]=[]){calls.push([sql,p]);const kind=seen.kind(sql);let rows:any[]=[];
 if(kind==='membership')rows=[{status:'active',role:'owner',session_version:'1',blocked_at:null}];
 else if(kind==='recommendationSingle')rows=[{id:p[0],account_id:p[1],entity_id:id(80),category,user_rating:null,publication_state:'draft',revision:2,archived_at:null}];
 else if(kind==='sizeBound')rows=[{bytes:oversize?1048577:0,title_bytes:12}];
 else if(kind==='detail')rows=[{note:null,entity_id:id(80),kind:'person',title:'Shared person',display_values:{},override_schema_version:null,category_revision:'4'}];
 else if(kind==='personEntity')rows=[{id:id(80),kind:'person',title:'Shared person',origin:'manual',suppressed:false}];
 else if(kind==='taxonomyCatalog')rows=[{state:'CONFIGURED',version:3,default_locale:'en'}];
 else if(kind==='assignedTaxonomy')rows=[{id:p[1]===id(99)?id(1):id(2),slug:p[1]===id(99)?'first-sector':'second-sector',parent_id:null,active:true,label:'Sector'}];
 return {rows:seen.serve(kind,rows),rowCount:rows.length};}};
 return {service:new OwnerContentService({query:db.query,connect:async()=>db} as any,'owner-read-fixture'),calls,seen};
}
const owner=(account:string)=>({userId:id(98),accountId:account,role:'owner' as const,credential:{kind:'oauth' as const,grantId:id(97),scopes:['recommendations:read']}});
it('actual editable owner hydration reloads distinct recommendation-local selections on one shared person entity',async()=>{
 const h=ownerHarness();const first:any=await h.service.getRecommendation(owner(id(99)),id(90),{},true);const second:any=await h.service.getRecommendation(owner(id(96)),id(91),{},true);
 expect(first.peopleSector?.sector?.id).toBe(id(1));expect(second.peopleSector?.sector?.id).toBe(id(2));expect(first.entityId).toBe(second.entityId);
 const core=await h.service.getRecommendation(owner(id(99)),id(90));expect(core).not.toHaveProperty('peopleSector');
 h.seen.assertExercised([],['membership','recommendationSingle','sizeBound','detail','personEntity','taxonomyCatalog','assignedTaxonomy']);
});
it('actual Places person hydration carries taxonomy independently and keeps owner response budget',async()=>{
 const h=ownerHarness('places');const read:any=await h.service.getRecommendation(owner(id(99)),id(90),{},true);expect(read.entity.kind).toBe('person');expect(read.placesTaxonomy?.category?.slug).toBe('first-sector');
 const bounded=ownerHarness('people',true);await expect(bounded.service.getRecommendation(owner(id(99)),id(90),{},true)).rejects.toMatchObject({status:413});expect(bounded.calls.some(c=>c[0].includes('FROM recommendation_taxonomy r'))).toBe(false);
 // The Places hydration reads the shared person through the detail statement and does not
 // issue the person-entity read, so only the statements this path actually uses are required.
 h.seen.assertExercised([],['membership','recommendationSingle','sizeBound','detail','taxonomyCatalog','assignedTaxonomy']);
 bounded.seen.assertExercised([],['membership','recommendationSingle','sizeBound']);
});
