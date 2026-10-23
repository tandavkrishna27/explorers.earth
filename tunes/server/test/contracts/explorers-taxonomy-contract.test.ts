import {describe, expect, it} from 'vitest';
import {taxonomyImportSchema, placesTaxonomyAssignmentSchema, taxonomyCatalogQuerySchema, curatedTermAssignmentSchema, taxonomyCatalogCategorySchema} from '../../../shared/explorersTaxonomyContract';

const id=(n:number)=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
const term=(n:number,parentId:string|null=null)=>({id:id(n),category:'places' as const,slug:`term-${n}`,parentId,position:n,active:true,labels:{en:`Term ${n}`,hi:`श्रेणी ${n}`}});
const catalog=()=>({version:'explorers-taxonomy-import/v1',catalogVersion:1,category:'places',defaultLocale:'en',terms:[term(1),term(2,id(1))],sourceMappings:[{sourceHost:'cms.example.org',entityKind:'recommendationCategories',documentId:'legacy-root',termId:id(1)}],legacySlugMappings:[]});
it('accepts complete nonASCII Places roots/direct children and explicit assignments',()=>{
 expect(taxonomyImportSchema.parse(catalog()).terms).toHaveLength(2);
 expect(placesTaxonomyAssignmentSchema.parse({categoryTermId:id(1),subcategoryTermId:id(2)}).subcategoryTermId).toBe(id(2));
 expect(placesTaxonomyAssignmentSchema.safeParse({categoryTermId:null,subcategoryTermId:id(2)}).success).toBe(false);
 expect(placesTaxonomyAssignmentSchema.safeParse({categoryTermId:id(1)}).success).toBe(false);
 expect(placesTaxonomyAssignmentSchema.safeParse({categoryTermId:id(1),subcategoryTermId:id(1)}).success).toBe(false);
});
it('rejects duplicate identities slugs and source mappings before writes',()=>{
 for(const mutate of [
  (x:ReturnType<typeof catalog>)=>x.terms.push({...term(3),id:id(1)}),
  (x:ReturnType<typeof catalog>)=>x.terms.push({...term(3),slug:'term-1'}),
  (x:ReturnType<typeof catalog>)=>x.sourceMappings.push({...x.sourceMappings[0],termId:id(2)}),
 ]){const x=catalog();mutate(x);expect(taxonomyImportSchema.safeParse(x).success).toBe(false);}
});
it('rejects orphan crosscategory cycles and unsupported depth',()=>{
 const variants=[
  {...term(2),parentId:id(99)},
  {...term(2),category:'people'},
  {...term(2),parentId:id(2)},
 ];
 for(const changed of variants){const x=catalog();expect(taxonomyImportSchema.safeParse({...x,terms:[x.terms[0],changed]}).success).toBe(false);}
 const x=catalog();expect(taxonomyImportSchema.safeParse({...x,terms:[...x.terms,term(3,id(2))]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,terms:[term(1,id(2)),term(2,id(1))]}).success).toBe(false);
});
it('requires actual default labels and rejects dangling source/legacy references',()=>{
 const x=catalog();
 expect(taxonomyImportSchema.safeParse({...x,defaultLocale:'fr'}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,sourceMappings:[{...x.sourceMappings[0],termId:id(99)}]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,legacySlugMappings:[{legacySlug:'old-sector',termId:id(99)}]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,legacySlugMappings:[{legacySlug:'old-sector',termId:id(1)},{legacySlug:'old-sector',termId:id(2)}]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,legacySlugMappings:[{legacySlug:'term-1',termId:id(2)}]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,legacySlugMappings:[{legacySlug:'term-1',termId:id(1)}]}).success).toBe(true);
});
it('People imports permit only root sectors and exact category terms',()=>{
 const x=catalog();const people={...x,category:'people',terms:x.terms.map(t=>({...t,category:'people',parentId:null}))};
 expect(taxonomyImportSchema.safeParse(people).success).toBe(true);
 expect(taxonomyImportSchema.safeParse({...people,terms:people.terms.map((t,i)=>({...t,parentId:i?id(1):null}))}).success).toBe(false);
});
it('does not impose a catalog product cap or silently synthesize metadata',()=>{
 const x=catalog();const terms=Array.from({length:335},(_,i)=>term(i+1));
 expect(taxonomyImportSchema.parse({...x,terms}).terms).toHaveLength(335);
 expect(taxonomyImportSchema.safeParse({...x,terms:x.terms.map(({active:_,...t})=>t)}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,unexpected:true}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,terms:[{...term(1),labels:{en:'',invalid_locale:'bad'}}]}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,terms:[{...term(1),labels:{en:'\ud800'}}]}).success).toBe(false);
});
it('rejects case-equivalent UUID aliases in identities and references',()=>{
 const x=catalog();const upper=id(1).toUpperCase();
 expect(taxonomyImportSchema.safeParse({...x,terms:[term(1),{...term(3),id:upper}]}).success).toBe(false);
 expect(placesTaxonomyAssignmentSchema.safeParse({categoryTermId:id(1),subcategoryTermId:upper}).success).toBe(false);
 expect(taxonomyImportSchema.safeParse({...x,sourceMappings:[{...x.sourceMappings[0],termId:upper}]}).success).toBe(false);
});

import {createRecommendationSchema,updateRecommendationSchema} from '../../../shared/explorersContract';
it('actual command inputs preserve omission and reject wrong category or incomplete selection',()=>{
 const base={category:'places',entityId:id(90),collectionId:id(91),expectedCollectionRevision:1};
 expect(createRecommendationSchema.parse(base)).not.toHaveProperty('placesTaxonomy');
 expect(createRecommendationSchema.parse({...base,placesTaxonomy:{categoryTermId:null,subcategoryTermId:null}}).placesTaxonomy).toEqual({categoryTermId:null,subcategoryTermId:null});
 expect(createRecommendationSchema.safeParse({...base,peopleSectorTermId:null}).success).toBe(false);
 expect(createRecommendationSchema.safeParse({...base,category:'people',placesTaxonomy:{categoryTermId:null,subcategoryTermId:null}}).success).toBe(false);
 expect(updateRecommendationSchema.parse({expectedRevision:1,peopleSectorTermId:null}).peopleSectorTermId).toBeNull();
 expect(updateRecommendationSchema.safeParse({expectedRevision:1,placesTaxonomy:{categoryTermId:id(1)}}).success).toBe(false);
});

const flatUuid=(n:number)=>`00000000-0000-5000-8000-${String(n).padStart(12,'0')}`;
const flatTerm=(n:number,category:string,parentId:string|null=null)=>({id:flatUuid(n),category,slug:`t-${n}`,parentId,position:n,active:true,labels:{en:`T ${n}`}});
const flat=(category:string,terms:unknown[])=>({version:'explorers-taxonomy-import/v1',catalogVersion:1,category,defaultLocale:'en',terms,sourceMappings:[],legacySlugMappings:[]});

describe('curated flat catalogs (S2, DS-07)',()=>{
 it.each(['books','games','apps','products'])('accepts a flat %s import',category=>{
  expect(taxonomyImportSchema.safeParse(flat(category,[flatTerm(1,category),flatTerm(2,category)])).success).toBe(true);
 });
 it.each(['books','games','apps','products'])('refuses a parented %s term',category=>{
  expect(taxonomyImportSchema.safeParse(flat(category,[flatTerm(1,category),flatTerm(2,category,flatUuid(1))])).success).toBe(false);
 });
 it('never imports movies (configured in place by 0067)',()=>{
  expect(taxonomyImportSchema.safeParse(flat('movies',[flatTerm(1,'movies')])).success).toBe(false);
 });
 it('reads all seven catalogs',()=>{
  for(const category of ['places','people','movies','books','games','apps','products'])
   expect(taxonomyCatalogQuerySchema.parse({category}).category).toBe(category);
  expect(taxonomyCatalogCategorySchema.safeParse('guides').success).toBe(false);
 });
 it('curated assignment is one canonical uuid or null',()=>{
  expect(curatedTermAssignmentSchema.safeParse(flatUuid(1)).success).toBe(true);
  expect(curatedTermAssignmentSchema.safeParse(null).success).toBe(true);
  expect(curatedTermAssignmentSchema.safeParse(id(1).toUpperCase()).success).toBe(false);
 });
});
