import {describe,it,expect,vi} from 'vitest';
import {publicPlacesProjection} from '../../publicProfile/publicPlacesProjection';
import {publicPeopleSectorProjection,PublicPeopleCursorError,publicPeopleProjection} from '../../publicProfile/publicPeopleProjection';
import {publicAssignedTaxonomy} from '../../publicProfile/publicTaxonomyProjection';
import {parsePublicPeopleSectorRequest} from '../../publicProfile/publicProfileContract';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',term='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const placeRecommendation='ffffffff-ffff-4fff-8fff-ffffffffffff',placeCollectionRevision='5';
/**
 * Places vacuity guard. 343df2dd inserted `c.revision::text AS collection_revision` into
 * the public Places collection SELECT list, which silently stopped matching a mock keyed
 * on the SELECT-list prefix: the branch fell through, `recommendationLists` came back
 * empty, and every Places assertion below stopped exercising the Places path.
 *
 * Two defences, so a future SELECT-list change cannot repeat it:
 *  - the mock keys on the FROM/WHERE structure and on the `/* ... *\/` statement markers,
 *    never on a SELECT list;
 *  - `unmatched` records any structural Places/collection statement that reached the
 *    fallback branch, and `placeRowsServed` records rows actually handed to the
 *    projection, so a guarded test fails loudly instead of passing on an empty page.
 */
function assertPlacesPathExercised(f:{seen:{unmatched:string[];placeListsServed:number;placeRowsServed:number}}){
 expect(f.seen.unmatched).toEqual([]);
 expect(f.seen.placeListsServed).toBeGreaterThan(0);
 expect(f.seen.placeRowsServed).toBeGreaterThan(0);
}
function fixture(options:{unknown?:boolean;inactive?:boolean;alias?:boolean;hide?:boolean;catalogRace?:boolean;count?:number;revision?:string;suppressionRace?:boolean;deep?:boolean;peopleHide?:boolean;account?:string;term?:string;catalogVersion?:string;locale?:string;accountRevision?:string;labelRace?:boolean;assigned?:boolean;placeContent?:boolean;personContact?:boolean;placeRowRace?:boolean}={}){
 let committed=false;const seen={unmatched:[] as string[],placeListsServed:0,placeRowsServed:0,linkedPeopleServed:0};
 const placeRows=options.placeContent?[{id:placeRecommendation,account_id:id,entity_id:term,entity_kind:'place',user_rating:null,note:null,note_bytes:0,display_values:{},override_bytes:0,display_order:0,collection_id:id,collection_title:'Fixture location list',collection_slug:'fixture-location-list',provider_place_id:null,pin_order:null,pin_bucket:1,sort_position:0}]:[];
 const query=vi.fn(async(sql:string,params?:any[])=>{
 if(sql==='COMMIT'){committed=true;return {rows:[]};}
 // Statement markers, keyed before the structural branches that would also match them.
 if(sql.includes('public_places_eligibility_aggregate'))return {rows:[{item_count:String(placeRows.length),pin_count:'0',lane_0:'0',lane_1:'0',lane_2:'0',lane_3:'0'}]};
 if(sql.includes('public_places_current_list'))return {rows:[{id,collection_revision:placeCollectionRevision,category_revision:options.revision??'2'}]};
 // Entity suppression has its own writer: an emptied answer here is a Places row that
 // stopped being eligible after it was projected.
 if(sql.includes('public_places_current_eligibility'))return {rows:options.suppressionRace||options.placeRowRace?[]:placeRows.map(row=>({id:row.id,entity_id:row.entity_id,collection_id:row.collection_id}))};
 if(sql.includes('public_people_current_eligibility'))return {rows:options.suppressionRace?[]:(params?.[1]??[]).map((id:string)=>({id,entity_id:term}))};
 if(sql.includes('WITH eligible')){const all=Array.from({length:options.count??0},(_,n)=>({id:`cccccccc-cccc-4ccc-8ccc-${String(n+1).padStart(12,'0')}`,account_id:id,entity_id:term,user_rating:null,note:null,note_bytes:0,override_bytes:0,display_values:{},display_order:options.deep?100000+n:n,collection_order:options.deep?100000:0,collection_id:id,collection_title:'Fixture list',collection_slug:'fixture-list',pin_order:null}));const start=sql.includes('OFFSET')?(params?.[3]??0):params?.[3]===null||params?.[3]===undefined?0:Math.max(0,Number(params?.[5])-(options.deep?100000:0)+1);return {rows:all.slice(start,start+(params?.[2]??25))};}
 // WP10. Linked lists under a location come from collection_list_links; $3 is the category.
 if(sql.includes('FROM collection_list_links l')&&params?.[2]==='products')return {rows:[]};
 // The public Places collection list: keyed on FROM/WHERE structure, not the SELECT list.
 if(sql.includes('FROM collections c')&&sql.includes("c.category='places'")){seen.placeListsServed++;return {rows:[{id,collection_revision:placeCollectionRevision,title:'Fixture location list',description:null,slug:'fixture-location-list',heading:null,display_order:0,cover_media_id:null}]};}
 if(sql.includes('FROM collections c')&&sql.includes("c.category='people'"))return {rows:[{id,title:'Fixture list',slug:'fixture-list',display_order:0,cover_media_id:null}]};
 // The linked People lists under a location.
 if(sql.includes('FROM collection_list_links l')&&params?.[2]==='people'){seen.linkedPeopleServed++;return {rows:[{id,category:'people',title:'Fixture list',description:null,slug:'fixture-list',heading:null,display_order:0,role:null,link_order:0,direction:'outgoing',cover_media_id:null}]};}
 // The public Places child page.
 if(sql.includes('FROM collection_items ci')&&sql.includes("c.category='places'")){seen.placeRowsServed+=placeRows.length;return {rows:placeRows};}
 if(sql.includes('SELECT r.id,r.account_id,r.entity_id'))return {rows:[{id:term,account_id:id,entity_id:term,user_rating:null,note:null,note_bytes:0,override_bytes:0,display_values:{},display_order:0,collection_id:id,collection_title:'Fixture list',collection_slug:'fixture-list',pin_order:null}]};
 if(sql.includes('FROM recommendation_taxonomy rt'))return {rows:options.assigned?[{id:term,slug:'fixture-sector',parent_id:null,label:'Fixture sector'}]:[]};
 if(sql.includes('FROM entities e'))return {rows:[{id:term,kind:sql.includes('place_entity_details')?'place':'person',title:'Fixture person',origin:'manual',suppressed:false}]};
 if(sql.includes('SELECT media_id FROM recommendation_place_photos'))return {rows:options.placeContent?[{media_id:id}]:[]};
 if(sql.includes('SELECT * FROM place_recommendation_context'))return {rows:options.placeContent?[{recommendation_type:options.personContact?'person':'place',source_of_recommendation:'self',contact_name:options.personContact?'Pierre Dubois':'Private fixture',contact_number:'+1234567890',contact_visibility:'private',place_social_url:null,place_website_url:null,creator_social_url:null,legacy_place_note:null,person_profile_url:null,person_address:null}]:[]};
 if(sql.includes('FROM creator_accounts'))return {rows:committed&&(options.hide||options.peopleHide&&sql.includes("s.category='people'"))?[]:[{id:options.account??id,handle:'alice',account_revision:options.accountRevision??'1',content_revision:options.revision??'2'}]};
 if(sql.includes('FROM taxonomy_catalogs'))return {rows:[{state:'CONFIGURED',version:committed&&options.catalogRace?'2':options.catalogVersion??'1',default_locale:options.locale??'en'}]};
 if(sql.includes("category='people' AND slug="))return {rows:options.unknown||options.alias&&!committed?[]:[{id:options.term??term,slug:'fixture-sector',active:!options.inactive,parent_id:null}]};
 if(sql.includes('taxonomy_legacy_slug_mappings'))return {rows:options.alias?[{id:options.term??term,slug:'fixture-sector',active:true,parent_id:null}]:[]};
 if(sql.includes('SELECT label'))return {rows:[{label:committed&&options.labelRace?'Changed label':'Fixture sector'}]};
 // A structural collection statement reaching here is the 343df2dd failure mode.
 if(sql.includes('FROM collections c')||sql.includes('FROM collection_items ci'))seen.unmatched.push(sql.slice(0,80));
 return {rows:[]};
 });const release=vi.fn();return {pool:{query,connect:async()=>({query,release})} as any,query,release,seen};
}
describe('public People sector resource-free contract',()=>{
 it('A named person recommendation keeps its name public while its private contact number stays withheld',async()=>{const f=fixture({placeContent:true,personContact:true});const result=await publicPlacesProjection(f.pool,'alice',12);assertPlacesPathExercised(f);const place=result!.recommendationLists[0].recommended_places[0];expect(place.Recommendation_Type).toBe('person');expect(place.contact_name).toBe('Pierre Dubois');expect(place.contact_number).toBeNull();expect(JSON.stringify(result)).not.toContain('+1234567890');});
 it('Places linked composition preserves contact denial and owned photo media URLs',async()=>{const f=fixture({placeContent:true});const result=await publicPlacesProjection(f.pool,'alice',12);assertPlacesPathExercised(f);expect(f.seen.linkedPeopleServed).toBeGreaterThan(0);const place=result!.recommendationLists[0].recommended_places[0];expect(place.contact_name).toBeNull();expect(place.contact_number).toBeNull();expect(place.Place_Details.Photos).toEqual([{url:`/api/explorers/v1/media/${id}/content`}]);expect(JSON.stringify(result)).not.toContain('Private fixture');expect(JSON.stringify(result)).not.toContain('+1234567890');});
 it('suppression after linked projection denies Places without revision changes',async()=>{const f=fixture({placeContent:true,suppressionRace:true});expect(await publicPlacesProjection(f.pool,'alice',12)).toBeUndefined();assertPlacesPathExercised(f);});
 // The Places leg on its own: only the projected Place row stops being eligible, so the
 // linked People eligibility cannot be what denies the page.
 it('a projected Place row losing eligibility denies Places on its own',async()=>{const f=fixture({placeContent:true,placeRowRace:true});expect(await publicPlacesProjection(f.pool,'alice',12)).toBeUndefined();assertPlacesPathExercised(f);});
 it('People category becomes private during linked composition and denies Places result',async()=>{const f=fixture({placeContent:true,peopleHide:true});expect(await publicPlacesProjection(f.pool,'alice',12)).toBeUndefined();assertPlacesPathExercised(f);});
 it('suppression after projection denies sector with unchanged revision fences',async()=>{const f=fixture({count:1,suppressionRace:true});expect(await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',12)).toBeUndefined();});
 it('suppression after projection denies existing People lists with unchanged revision fences',async()=>{const f=fixture({suppressionRace:true});expect(await publicPeopleProjection(f.pool,'alice',12)).toBeUndefined();});
 it('seek continuation has no total offset cap and resumes deeply ordered ties',async()=>{const f=fixture({count:30,deep:true});const first=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,undefined,'x'.repeat(32));const payload=JSON.parse(Buffer.from(first!.nextCursor!.split('.')[0],'base64url').toString());expect(payload).not.toHaveProperty('offset');expect(payload.after).toEqual([100000,id,100023,'cccccccc-cccc-4ccc-8ccc-000000000024']);const second=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,first!.nextCursor!,'x'.repeat(32));expect(second!.recommended_people).toHaveLength(6);expect(second!.recommended_people[0].display_order).toBe(100024);});
 it('cold known empty returns canonical page and commits/releases',async()=>{const f=fixture();expect(await publicPeopleSectorProjection(f.pool,'Alice','fixture-sector',24)).toMatchObject({version:'explorers-public-people-sector/v1',canonicalSlug:'fixture-sector',redirectSlug:null,recommended_people:[],nextCursor:null});expect(f.release).toHaveBeenCalledOnce();});
 it('alias empty retains canonical identity and redirect',async()=>{const f=fixture({alias:true});expect(await publicPeopleSectorProjection(f.pool,'alice','old-fixture',12)).toMatchObject({canonicalSlug:'fixture-sector',redirectSlug:'fixture-sector',sector:{documentId:term}});});
 it.each([{unknown:true},{inactive:true},{hide:true},{catalogRace:true}])('unavailable or changed authority fails closed %j',async(options)=>{const f=fixture(options);expect(await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',12)).toBeUndefined();});
 it('rejects tampered continuation with rollback and release',async()=>{const f=fixture();await expect(publicPeopleSectorProjection(f.pool,'alice','fixture-sector',12,'evil','x'.repeat(32))).rejects.toBeInstanceOf(PublicPeopleCursorError);expect(f.query).toHaveBeenCalledWith('ROLLBACK');expect(f.release).toHaveBeenCalledOnce();});
 it('SQL filters eligibility before row rank, distinct recommendations and limit',async()=>{const f=fixture();await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',12);const sql=f.query.mock.calls.find(([s])=>s.includes('WITH eligible'))![0];expect(sql).toContain('PARTITION BY r.id');expect(sql).toContain("c.visibility='public'");expect(sql).toContain('suppressed_at IS NOT NULL');expect(sql).toContain('rt.account_id=r.account_id');expect(sql).toContain('WHERE membership_rank=1');});
 it('pages beyond 24 recommendations sharing one entity and rejects changed fences',async()=>{const f=fixture({count:30});const first=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,undefined,'x'.repeat(32));expect(first!.recommended_people).toHaveLength(24);expect(new Set(first!.recommended_people.map(p=>p.documentId)).size).toBe(24);const next=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,first!.nextCursor!,'x'.repeat(32));expect(next!.recommended_people).toHaveLength(6);expect(next!.nextCursor).toBeNull();await expect(publicPeopleSectorProjection(f.pool,'alice','fixture-sector',12,first!.nextCursor!,'x'.repeat(32))).rejects.toBeInstanceOf(PublicPeopleCursorError);const changed=fixture({revision:'3'});await expect(publicPeopleSectorProjection(changed.pool,'alice','fixture-sector',24,first!.nextCursor!,'x'.repeat(32))).rejects.toBeInstanceOf(PublicPeopleCursorError);});
 it('rejects every changed signed cursor binding including account, username, term, catalog, locale and revision',async()=>{const f=fixture({count:30});const first=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,undefined,'x'.repeat(32));for(const options of [{account:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},{term:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},{catalogVersion:'2'},{locale:'fr'},{accountRevision:'2'},{revision:'3'}])await expect(publicPeopleSectorProjection(fixture(options).pool,'alice','fixture-sector',24,first!.nextCursor!,'x'.repeat(32))).rejects.toBeInstanceOf(PublicPeopleCursorError);await expect(publicPeopleSectorProjection(f.pool,'bob','fixture-sector',24,first!.nextCursor!,'x'.repeat(32))).rejects.toBeInstanceOf(PublicPeopleCursorError);});
 it('alias continuation has the same canonical signed identity',async()=>{const f=fixture({count:30,alias:true});const first=await publicPeopleSectorProjection(f.pool,'alice','fixture-old',24,undefined,'x'.repeat(32));const next=await publicPeopleSectorProjection(f.pool,'alice','fixture-sector',24,first!.nextCursor!,'x'.repeat(32));expect(next!.recommended_people).toHaveLength(6);expect(next!.redirectSlug).toBeNull();});
 it('default label change during projection denies unchanged catalog revision',async()=>{expect(await publicPeopleSectorProjection(fixture({count:1,labelRace:true}).pool,'alice','fixture-sector',12)).toBeUndefined();});
 it('People aliases are exactly equal and stable default labels',async()=>{const result=await publicPeopleProjection(fixture({assigned:true}).pool,'alice',12);const person=result!.personLists[0].recommended_people[0];expect(person.person_category).toEqual({documentId:term,id:term,slug:'fixture-sector',Category_name:'Fixture sector'});expect(person.people_category).toEqual(person.person_category);});
 it('unknown query fields and oversized limit rejected',()=>{expect(()=>parsePublicPeopleSectorRequest({username:'alice',sectorSlug:'fixture',extra:true})).toThrow();expect(()=>parsePublicPeopleSectorRequest({username:'alice',sectorSlug:'fixture',limit:25})).toThrow();});
 it('inactive ancestor cannot project a Places child',async()=>{const db={query:vi.fn(async()=>({rows:[]}))};expect(await publicAssignedTaxonomy(db as any,id,id,'places')).toEqual({root:null,child:null});expect(db.query.mock.calls[0][0]).toContain('p.active AND p.parent_id IS NULL');});
});
