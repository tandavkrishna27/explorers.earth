import { expect, it } from 'vitest';
import * as wire from '../../shared/explorersContract';
import { editableOwnerRecommendationSchema } from '../../shared/explorersOwnerContentContract';
import { publicRecommendationDetailSchema } from '../../shared/explorersPublicContentContract';
import { emptyBookDetails } from '../../shared/explorersBookContract';

it('normalizes manual titles without merging identity and counts Unicode code points',()=>{
 const schema=(wire as any).resolveManualEntitySchema;
 expect(schema).toBeDefined();
 for(const category of ['books','movies','games','apps','products','people'])expect(schema.parse({kind:'manual',category,details:{title:'  😀  A  '}}).details.title).toBe('😀  A');
 expect(schema.parse({kind:'manual',category:'books',details:{title:'😀'.repeat(500)}}).details.title).toHaveLength(1000);
 for(const title of ['', '  ',null,'😀'.repeat(501),'A\nB','A\tB','A\u007fB','A\ud800B'])expect(schema.safeParse({kind:'manual',category:'books',details:{title}}).success).toBe(false);
 for(const extra of [{entityId:'x'},{accountId:'x'},{provider:'google_books'}])expect(schema.safeParse({kind:'manual',category:'books',details:{title:'A'},...extra}).success).toBe(false);
 expect(schema.safeParse({kind:'manual',category:'places',details:{title:'A'}}).success).toBe(false);
 expect(schema.safeParse({kind:'manual',category:'books',details:{title:'A',facts:{}}}).success).toBe(false);
});
it('distinguishes sparse absence, whole reset and explicit null while rejecting invalid overrides',()=>{
 const base={expectedRevision:1};
 for(const displayOverrides of [{},{title:null},{title:'  😀  '}]){
  const parsed=wire.updateRecommendationSchema.parse({...base,displayOverrides}) as any;
  expect(parsed.displayOverrides).toEqual(displayOverrides.title==='  😀  '?{title:'😀'}:displayOverrides);
 }
 for(const displayOverrides of [null,{title:''},{title:'\n'},{title:'A\u0000B'},{title:'\udfff'},{title:'😀'.repeat(501)},{title:'A',accountId:'x'}])expect(wire.updateRecommendationSchema.safeParse({...base,displayOverrides}).success).toBe(false);
 for(const title of [' A ','A\nB','A\ud800B'])expect(wire.displayOverridesReadSchema.safeParse({title}).success).toBe(false);
});
it('keeps compatible canonical reads while allowing nullable effective public presentation',()=>{
 const entity={id:'00000000-0000-4000-8000-000000000001',kind:'book',title:'😀'.repeat(500)};
 expect(wire.entityCoreDtoSchema.safeParse(entity).success).toBe(true);
 expect(wire.entityCoreDtoSchema.safeParse({...entity,title:'Old\nTitle'}).success).toBe(true);
 expect(wire.entityCoreDtoSchema.parse({...entity,title:'  Old\nTitle  '}).title).toBe('Old\nTitle');
 const dto={version:'explorers-public-content/v1',recommendation:{id:entity.id,kind:'book',title:null,userRating:null,note:null}};
 expect(publicRecommendationDetailSchema.safeParse(dto).success).toBe(true);
 expect(publicRecommendationDetailSchema.safeParse({...dto,recommendation:{...dto.recommendation,title:'😀'.repeat(501)}}).success).toBe(false);
 expect(editableOwnerRecommendationSchema.innerType().shape).toHaveProperty('displayTitle');
});
it('admits only typed Book additions and excludes them from every non-Book public detail',()=>{
 const recommendation={id:'00000000-0000-4000-8000-000000000001',title:'Public',kind:'book',userRating:null,note:null};
 const additions={bookDetails:emptyBookDetails(),bookContext:{buyLinks:[]},bookCovers:{cover:null,thumbnail:null}};
 const response=(values:Record<string,unknown>)=>({version:'explorers-public-content/v1',recommendation:{...recommendation,...values}});
 expect(publicRecommendationDetailSchema.parse(response(additions))).toEqual(response(additions));
 for(const kind of ['place','movie','game','app','product','person']){
  const typedKind=kind==='game'?{kind,gamePresentation:{version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null}}:{kind};
  expect(publicRecommendationDetailSchema.safeParse(response(typedKind)).success).toBe(true);
  for(const [field,value] of Object.entries(additions))expect(publicRecommendationDetailSchema.safeParse(response({...typedKind,[field]:value})).success).toBe(false);
 }
 expect(publicRecommendationDetailSchema.safeParse(response({kind:'game'})).success).toBe(false);
 for(const gamePresentation of [{},{version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null,secret:'private'}])expect(publicRecommendationDetailSchema.safeParse(response({kind:'game',gamePresentation})).success).toBe(false);
 for(const extra of [{accountId:recommendation.id},{entityId:recommendation.id},{displayOverrides:{title:'raw'}},{provenance:{provider:'google_books'}},{storageKey:'private/object'}])
  expect(publicRecommendationDetailSchema.safeParse(response({...additions,...extra})).success).toBe(false);
 for(const bad of [{bookDetails:{...emptyBookDetails(),secret:'private'}},{bookContext:{buyLinks:[{name:'Unsafe',url:'javascript:alert(1)'}]}},{bookCovers:{cover:null,thumbnail:null,rawUrl:'https://private.invalid'}}])
  expect(publicRecommendationDetailSchema.safeParse(response({...additions,...bad})).success).toBe(false);
});
