import {describe,it,expect,vi} from 'vitest';
import {resolveEntitySchema} from '../../../shared/explorersContract';
import {publicGamesProjection,discardGamePublicResult} from '../../publicProfile/publicGamesProjection';
import {PublicProfileService} from '../../publicProfile/publicProfileService';
import {CatalogService} from '../../application/catalog';
import {editableOwnerRecommendationSchema} from '../../../shared/explorersOwnerContentContract';
import {readManualGamePresentation} from '../../repositories/gameManualRepository';
import {publicRecommendationDetailSchema} from '../../../shared/explorersPublicContentContract';
import {decisionForRoute} from '../../policies/musicSurfacePolicy';
import {SqlStatementRecorder} from '../helpers/sqlStatementRecorder';
import {gamesPublicRules,gamesPublicStructural,gamesNativeReply} from '../helpers/publicGamesStatementRules';

describe('Games manual native boundaries',()=>{
 it('admits exact paired membership methods/source only and denies ALL and invented methods',()=>{
  const route={source:'tunes/server/routes/explorersRecommendationRoutes.ts',classification:'canonical-explorers-owner',path:'/api/explorers/v1/collections/:id/memberships/:recommendationId'};
  for(const method of ['POST','DELETE'])expect(decisionForRoute({...route,method})).toBe('explorers-owner');
  for(const method of ['ALL','PATCH','GET','PUT'])expect(decisionForRoute({...route,method})).not.toBe('explorers-owner');
  expect(decisionForRoute({...route,method:'POST',source:'tunes/server/routes/retired.ts'})).not.toBe('explorers-owner');
 });
 it('admits only the exact catalog Games GET and source while ALL stays retired',()=>{
  const route={method:'GET',path:'/api/explorers/v1/catalog/games',classification:'canonical-explorers-owner',source:'tunes/server/routes/explorersCatalogRoutes.ts'};
  expect(decisionForRoute(route)).toBe('explorers-owner');
  for(const changed of [{method:'ALL'},{method:'POST'},{source:'tunes/server/routes/retired.ts'},{path:route.path+'/extra'}])expect(decisionForRoute({...route,...changed})).not.toBe('explorers-owner');
 });
 const id='00000000-0000-4000-8000-000000000001',mediaId='00000000-0000-4000-8000-000000000002';
 const presentation={version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[{mediaId,url:`/api/explorers/v1/media/${mediaId}/content`}],coverMediaId:mediaId};
 const editable={id,accountId:id,entityId:id,category:'games',userRating:null,publicationState:'draft',revision:1,mediaIds:[mediaId],archived:false,pin:null,categoryRevision:'1',note:null,entity:{id,kind:'game',title:'Manual'},displayOverrides:{},displayTitle:'Manual',gamePresentation:presentation};
 it('accepts public manual Game presentation only on a Game detail',()=>{
  const detail={version:'explorers-public-content/v1',recommendation:{id,title:'Manual',kind:'game',userRating:null,note:null,gamePresentation:presentation}};
  expect(publicRecommendationDetailSchema.safeParse(detail).success).toBe(true);
  expect(publicRecommendationDetailSchema.safeParse({...detail,recommendation:{...detail.recommendation,kind:'app'}}).success).toBe(false);
  expect(publicRecommendationDetailSchema.safeParse({...detail,recommendation:{...detail.recommendation,gamePresentation:undefined}}).success).toBe(false);
 });
 it('projects actual manual origin and ready owned uploads in canonical order',async()=>{
  const query=vi.fn().mockResolvedValueOnce({rows:[{origin:'manual',kind:'game'}]}).mockResolvedValueOnce({rows:[{media_id:mediaId,asset_id:mediaId,status:'ready',purpose:'recommendation',account_id:id,asset_account_id:id,display_order:0}]});
  expect(await readManualGamePresentation({query} as any,id,id)).toEqual(presentation);
  expect(query.mock.calls[0][1]).toEqual([id,id]);expect(query.mock.calls[1][0]).toContain('ORDER BY rm.display_order,m.id');
 });
 it('requires matching manual presentation with exact uploaded gallery and first cover',()=>{
  expect(editableOwnerRecommendationSchema.safeParse(editable).success).toBe(true);
  for(const gamePresentation of [{...presentation,coverMediaId:null},{...presentation,images:[]},{...presentation,providerExternalId:'42'},{...presentation,images:[{mediaId,url:'https://images.igdb.com/forged'}]},{...presentation,images:[...presentation.images,...presentation.images]}])
   expect(editableOwnerRecommendationSchema.safeParse({...editable,gamePresentation}).success).toBe(false);
  expect(editableOwnerRecommendationSchema.safeParse({...editable,gamePresentation:undefined}).success).toBe(false);
  expect(editableOwnerRecommendationSchema.safeParse({...editable,category:'apps',entity:{id,kind:'app',title:'Manual'}}).success).toBe(false);
 });
 it('denies IGDB resolve before idempotency writes or a Book provider fallback',async()=>{
  const query=vi.fn(async()=>({rows:[{status:'active',role:'owner',session_version:'1',blocked_at:null}]}));
  const books={resolve:vi.fn(),search:vi.fn()};
  const service=new CatalogService({query} as any,books as any,{} as any);
  const actor={accountId:'00000000-0000-4000-8000-000000000001',userId:'user',role:'owner',credential:{kind:'oauth',scopes:['entities:resolve']}} as const;
  await expect(service.resolveEntity(actor as any,{kind:'provider',category:'games',provider:'igdb',externalKind:'game',externalId:'42'})).rejects.toMatchObject({status:503,code:'PROVIDER_UNAVAILABLE'});
  expect(query).toHaveBeenCalledTimes(1);expect(books.resolve).not.toHaveBeenCalled();
 });
 it('validates the unavailable search boundary without provider execution',async()=>{
  const query=vi.fn(async()=>({rows:[{status:'active',role:'owner',session_version:'1',blocked_at:null}]}));
  const service=new CatalogService({query} as any,{} as any,{} as any);
  const actor={accountId:id,userId:'user',role:'owner',credential:{kind:'oauth',scopes:['entities:resolve']}} as any;
  for(const input of [{},{query:'  '},{query:['Game']},{query:'Game',limit:'25'},{query:'Game',token:'fake'},{query:'Game',cursor:['x']}])await expect(service.searchGames(actor,input)).rejects.toMatchObject({status:422});
  await expect(service.searchGames(actor,{query:' Game ',limit:'24'})).rejects.toMatchObject({status:503,code:'PROVIDER_UNAVAILABLE'});
  expect(query).toHaveBeenCalledTimes(7);
 });
 it('accepts only the strict IGDB identity selector so unavailable can be truthful',()=>{
  const selector={kind:'provider',category:'games',provider:'igdb',externalKind:'game',externalId:'42'};
  expect(resolveEntitySchema.safeParse(selector).success).toBe(true);
  for(const extra of [{title:'Forged'},{providerFacts:{}},{genres:[1]},{sourceUrl:'https://example.invalid'}])
   expect(resolveEntitySchema.safeParse({...selector,...extra}).success).toBe(false);
  for(const externalId of ['0','-1','042','1.5'])expect(resolveEntitySchema.safeParse({...selector,externalId}).success).toBe(false);
 });
 for(const method of ['category','detail'] as const){
  it(`${method} does not return cached Games rows after privacy is revoked`,async()=>{
   let visible=true;
   const resolveAccount=vi.fn(async()=>({documentId:id,public_profile:'Yes',public_games:visible?'Yes':'No'}));
   const seen=new SqlStatementRecorder(gamesPublicRules,gamesPublicStructural);
   const query=vi.fn(async(sql:string)=>{const kind=seen.kind(sql);return gamesNativeReply(sql,kind,seen.serve(kind,kind==='scope'?[{id,handle:'owner',account_revision:'1',content_revision:'1'}]:[]));});
   const pool={query,connect:async()=>({query,release:vi.fn()})};
   const resolveCategory=vi.fn(async(_u:any,_c:any,_l:any,_cursor:any,operation:any)=>publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5),operation));
   const resolveDetail=vi.fn(async(_u:any,_c:any,_slug:any,_l:any,_cursor:any,operation:any)=>publicGamesProjection(pool as any,'owner',12,undefined,undefined,'test-only-'.repeat(5),operation));
   const service=new PublicProfileService({resolveAccount,resolveCategory,resolveDetail});
   const read=()=>method==='category'?service.category('owner','games',12):service.detail('owner','games','list',12);
   const result=await read();expect(result).toMatchObject({version:'explorers-manual-games-page/v1',gameLists:[]});discardGamePublicResult(result);visible=false;
   expect(await read()).toBeUndefined();
   expect(resolveAccount.mock.calls.length).toBeGreaterThanOrEqual(3);
   expect((method==='category'?resolveCategory:resolveDetail).mock.calls).toHaveLength(1);
   // Vacuity guard: the scope read must actually have been answered, and no structural
   // Games statement may have reached the mock's `[]` fallback. Without this, a column
   // added to the shared public account-scope SELECT list would make the projection
   // return an empty page and this privacy assertion would pass having read nothing.
   seen.assertExercised(['lists'],['scope']);
  });
 }
});

