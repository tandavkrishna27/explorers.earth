import {z} from 'zod/v3';
import {PUBLIC_RECOMMENDATION_CATEGORIES} from '../server/publicProfile/publicProfilePolicy';
import {bookEntityDetailsSchema,emptyBookDetails} from '../shared/explorersBookContract';
import {movieDetailsSchema,emptyMovieDetails} from '../shared/explorersMovieContract';
import {manualGamePresentationSchema} from '../shared/explorersGameOwnerContract';
import {isProxy} from 'node:util/types';
import {appEntityDetailsSchema} from '../shared/explorersAppContract';
import {productEntityDetailsSchema} from '../shared/explorersProductContract';
import {personEntityDetailsSchema,emptyPersonDetails} from '../shared/explorersPersonContract';
import {placeEntityDetailsSchema,emptyPlaceDetails,placeCollectionDetailsSchema,emptyPlaceCollectionDetails} from '../shared/explorersPlaceContract';
import {guideCollectionDetailsSchema,guideSectionBlocksSchema,guideEmptySectionBlocks} from '../shared/explorersGuideContract';

export const PUBLIC_PARITY_CASES=[
 'Public parity: eight canonical category and nested cold entries render owned positive content',
 'Public parity: category list item catalog and guide continuations preserve every ordered seeded ID',
 'Public parity: same slugs resolve independently for two owners and canonical handles',
 'Public parity: profile category list and item visibility refuse hidden anonymous and foreign reads',
 'Public parity: missing private draft and archived details share the public unavailable response',
 'Public parity: account and category withdrawal deny previously issued continuation cursors',
 'Public parity: unpublish revalidation never returns cached private content as 304',
 'Public parity: logout and account replacement cannot reuse another account public cache',
 'Public parity: cross tab unpublish remains hidden during failed and stale refresh',
 'Public parity: duplicate and wrong account invalidations preserve the correct profile',
 'Public parity: rapid username changes and history never reveal a late previous profile',
 'Public parity: invalid handles and terminal API failures release the cold entry overlay',
 'Public parity: uploaded images videos and ranges obey every media ancestor boundary',
 'Public parity: pinned navigation top picks themes and fallback attribution remain compatible',
 'Public parity: genre subject sector and linked child routes render eligible nested content',
 'Public parity: keyboard focus and long names preserve the baseline public shells',
] as const;
export const PUBLIC_PARITY_PROJECTS=['public-parity-desktop','public-parity-mobile'] as const;
type Category=(typeof PUBLIC_RECOMMENDATION_CATEGORIES)[number];
type Owner='ownerA'|'ownerB';
type Control='private'|'draft'|'archived'|'withheld'|null;
// These names label local fixture data. They are not a proposed production taxonomy.
const subject='Public parity fixture subject';
function typedDetails(category:Category,index:number){
 switch(category){
  case 'books':return bookEntityDetailsSchema.parse({...emptyBookDetails(),subjects:[subject]});
  case 'movies':return movieDetailsSchema.parse({...emptyMovieDetails(),genres:[{providerGenreId:18,name:'Drama'}]});
  case 'games':return manualGamePresentationSchema.parse({version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null});
  case 'apps':return appEntityDetailsSchema.parse({appUrl:`https://example.com/fixture-app-${index}`,developer:'Fixture developer',logoUrl:null,description:'Fixture app',downloadUrl:null,priceTier:'Free',platforms:['Fixture platform']});
  case 'products':return productEntityDetailsSchema.parse({productUrl:`https://example.com/fixture-product-${index}`,brand:'Fixture brand',logoUrl:null,description:'Fixture product',specifications:{},imageUrls:[]});
  case 'people':return personEntityDetailsSchema.parse({...emptyPersonDetails(),headline:'Fixture person'});
  case 'places':return placeEntityDetailsSchema.parse({...emptyPlaceDetails(),latitude:0,longitude:0,formattedAddress:'Fixture location'});
  case 'guides':return guideSectionBlocksSchema.parse({...guideEmptySectionBlocks,tags:['Fixture section'],packingList:{items:[{localId:'water',label:'Fixture water',done:false}]}});
 }
}
function guideDetails(){return guideCollectionDetailsSchema.parse({guideType:'itinerary',multiCity:false,numberOfDays:53,estimatedBudget:null,budgetCurrency:null,budgetType:null,bestTimeToVisit:[],categories:['Fixture guide category'],tags:[],tipsNotes:null,place:{name:'Fixture city',address:null,placeId:null,rating:null,ratingsCount:null,lat:0,lng:0},locationEntityId:null});}
const pages=(limit:12|24)=>({limit,offsets:limit===12?[0,12,24,36,48]:[0,24,48],lengths:limit===12?[12,12,12,12,5]:[24,24,5]});
/** Pure declarations only: no IDs, credentials, resource acquisition or public responses. */
export function buildPublicParitySeedPlan(caseId:string){
 if(!(PUBLIC_PARITY_CASES as readonly string[]).includes(caseId))throw new Error('Unknown public parity case');
 const categories=PUBLIC_RECOMMENDATION_CATEGORIES.map(category=>{
  const list=(owner:Owner,displayOrder:number,control:Control)=>({key:`${owner}-${category}-list-${displayOrder}`,owner,category,title:`Fixture ${owner} ${category} list ${displayOrder}`,slug:`${category}-list-${displayOrder}`,displayOrder,control,visibility:control==='private'?'private' as const:'public' as const,publicationState:control==='draft'?'draft' as const:'published' as const,archived:control==='archived',details:category==='guides'?guideDetails():category==='places'?placeCollectionDetailsSchema.parse(emptyPlaceCollectionDetails()):null});
  const lists=[...Array.from({length:53},(_,i)=>list('ownerA',i,null)),list('ownerA',53,'private'),list('ownerA',54,'draft'),list('ownerA',55,'archived'),list('ownerB',0,null)];
  const targetCollectionKey=lists[0].key;
  const item=(owner:Owner,collectionKey:string,displayOrder:number,control:Control)=>({key:`${collectionKey}-item-${displayOrder}`,owner,collectionKey,entityKey:category==='guides'?null:`${owner}-${category}-entity-${displayOrder}`,title:`Fixture ${owner} ${category} item ${displayOrder}`,displayOrder,control,...(category==='guides'?{}:{publicationState:control==='withheld'?'draft' as const:'published' as const}),archived:category==='guides'&&control==='withheld',details:typedDetails(category,displayOrder+(owner==='ownerB'?1000:0))});
  const items=[...Array.from({length:53},(_,i)=>item('ownerA',targetCollectionKey,i,null)),item('ownerA',targetCollectionKey,53,'withheld'),...lists.slice(53).map(l=>item(l.owner,l.key,0,null))];
  const cursorKind=category==='movies'||category==='games'?'issued-signed-keyset' as const:'offset' as const;
  return {category,targetCollectionKey,lists,items,traversal:{category:{...pages(12),cursorKind},detail:{...pages(category==='books'||category==='places'?24:12),cursorKind},explicitApiDetail:{requestLimit:24 as const,...pages(category==='guides'?12:24),cursorKind},linkedChildren:category==='places'?'ordered-array-no-cursor' as const:null},catalogFacet:category==='books'?{kind:'subject' as const,label:subject,slug:'public-parity-fixture-subject',source:'fixture-label' as const}:category==='movies'?{kind:'genre' as const,label:'Drama',slug:'drama',providerId:18,source:'tmdb-reference' as const}:null};
 });
 return {caseId,qualification:'source-preparation-only' as const,personas:[{key:'ownerA',handle:'public-parity-a'},{key:'ownerB',handle:'public-parity-b'}] as const,anonymous:true as const,categories,links:['products','people'].map(category=>({parentCollectionKey:'ownerA-places-list-0',childCollectionKey:`ownerA-${category}-list-0`})),dependencies:[{feature:'games-catalog-genre' as const,status:'missing' as const,marker:'unsupported-active-manual-games-public-graph'},{feature:'people-sector' as const,status:'missing' as const,marker:'semantic-owner-disposition-and-production-contract'},{feature:'places-taxonomy' as const,status:'missing' as const,marker:'production-taxonomy-contract'},{feature:'individual-place-pins' as const,status:'missing' as const,marker:'individual-place-pin-contract'},{feature:'media-bytes' as const,status:'missing' as const,marker:'owned-fixture-composition-and-byte-acceptance'}]};
}
export type PublicParitySeedPlan=ReturnType<typeof buildPublicParitySeedPlan>;
// First slice accepts prepared declarations only. Materialized DB/session/media custody
// will require a separately reviewed issued manifest; callers cannot confer authority here.
/** Inspect descriptors before Zod or equality reads any property. */
function isPlainJson(value:unknown,ancestors=new Set<object>()):boolean{
 if(value===null||typeof value==='string'||typeof value==='boolean')return true;
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value!=='object'||isProxy(value)||ancestors.has(value))return false;
 const array=Array.isArray(value);
 if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))return false;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 const keys=Reflect.ownKeys(descriptors);
 if(keys.some(key=>typeof key!=='string'))return false;
 if(array){
  const length=descriptors.length;
  if(!length||!('value' in length)||typeof length.value!=='number')return false;
  if(keys.length!==length.value+1)return false;
  for(let i=0;i<length.value;i++)if(!Object.hasOwn(descriptors,String(i)))return false;
 }
 ancestors.add(value);
 for(const key of keys){
  if(array&&key==='length')continue;
  const descriptor=descriptors[key as string];
  if(!descriptor.enumerable||!('value' in descriptor)||!isPlainJson(descriptor.value,ancestors)){ancestors.delete(value);return false;}
 }
 ancestors.delete(value);return true;
}
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):value;}
const preparedManifestSchema=z.object({version:z.literal(1),stage:z.literal('prepared'),caseId:z.enum(PUBLIC_PARITY_CASES),project:z.enum(PUBLIC_PARITY_PROJECTS),repeat:z.literal(0),plan:z.custom<PublicParitySeedPlan>()}).strict().superRefine((value,ctx)=>{
 if(JSON.stringify(canonical(value.plan))!==JSON.stringify(canonical(buildPublicParitySeedPlan(value.caseId))))ctx.addIssue({code:'custom',path:['plan'],message:'Prepared plan differs from exact source declaration'});
});
export const publicParityManifestSchema=z.preprocess((value,ctx)=>{
 if(!isPlainJson(value)){ctx.addIssue({code:'custom',message:'Manifest must contain only plain JSON data properties'});return z.NEVER;}
 return value;
},preparedManifestSchema);

