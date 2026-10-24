import {accountDtoSchema} from '../shared/explorersContract';
import {z} from 'zod/v3';
import {editableOwnerRecommendationSchema} from '../shared/explorersOwnerContentContract';
import {PUBLIC_RECOMMENDATION_CATEGORIES} from '../server/publicProfile/publicProfilePolicy';
import {bookEntityDetailsSchema,emptyBookDetails} from '../shared/explorersBookContract';
import {movieDetailsSchema,emptyMovieDetails} from '../shared/explorersMovieContract';
import {manualGamePresentationSchema} from '../shared/explorersGameOwnerContract';
import {isProxy} from 'node:util/types';
import {appEntityDetailsSchema} from '../shared/explorersAppContract';
import {productEntityDetailsSchema} from '../shared/explorersProductContract';
import {personEntityDetailsSchema,emptyPersonDetails} from '../shared/explorersPersonContract';
import {placeEntityDetailsSchema,emptyPlaceDetails,placeCollectionDetailsSchema,emptyPlaceCollectionDetails} from '../shared/explorersPlaceContract';
import {guideCollectionDetailsSchema,guideSectionBlocksSchema,guideEmptySectionBlocks,guideActivityPhotoSchema} from '../shared/explorersGuideContract';

export const PUBLIC_PARITY_CASES=Object.freeze([
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
] as const);
export const PUBLIC_PARITY_PROJECTS=Object.freeze(['public-parity-desktop','public-parity-mobile'] as const);
type Category=(typeof PUBLIC_RECOMMENDATION_CATEGORIES)[number];
type Owner='ownerA'|'ownerB';
type Control='private'|'draft'|'archived'|'withheld'|null;
// These names label local fixture data. They are not a proposed production taxonomy.
const subject='Public parity fixture subject';
function typedDetails(category:Category,index:number){
 switch(category){
  case 'books':return bookEntityDetailsSchema.parse({...emptyBookDetails(),subjects:[subject]});
  case 'movies':return movieDetailsSchema.parse(emptyMovieDetails());
  case 'games':return manualGamePresentationSchema.parse({version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null});
  case 'apps':return appEntityDetailsSchema.parse({appUrl:`https://example.com/fixture-app-${index}`,developer:'Fixture developer',logoUrl:null,description:'Fixture app',downloadUrl:null,priceTier:'Free',platforms:['Fixture platform']});
  case 'products':return productEntityDetailsSchema.parse({productUrl:`https://example.com/fixture-product-${index}`,brand:'Fixture brand',logoUrl:null,description:'Fixture product',specifications:{},imageUrls:[]});
  case 'people':return personEntityDetailsSchema.parse({...emptyPersonDetails(),headline:'Fixture person'});
  case 'places':return placeEntityDetailsSchema.parse({...emptyPlaceDetails(),latitude:0,longitude:0,formattedAddress:'Fixture location'});
  case 'guides':return guideSectionBlocksSchema.parse({...guideEmptySectionBlocks,items:[{kind:'place',localId:'public-parity-photo-activity',timeLabel:'morning',place:{localId:'public-parity-photo-activity',placeId:'public-parity-manual-place',name:'Fixture manual activity',formattedAddress:null,geometry:null,types:[],tips:null,photos:[],priceLevel:null,priceRange:null,customBudget:null,budgetAmount:null,budgetCurrency:null,source:'manual',verified:false}}],tags:['Fixture section'],packingList:{items:[{localId:'water',label:'Fixture water',done:false}]}});
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
 return {caseId,qualification:'source-preparation-only' as const,personas:[{key:'ownerA',handle:'public-parity-a'},{key:'ownerB',handle:'public-parity-b'}] as const,anonymous:true as const,categories,links:(['products','people'] as const).map(category=>({category,parentCollectionKey:'ownerA-places-list-0',childCollectionKey:`ownerA-${category}-list-0`})),dependencies:[{feature:'games-catalog-genre' as const,status:'missing' as const,marker:'unsupported-active-manual-games-public-graph'},{feature:'people-sector' as const,status:'configured-empty' as const,marker:'reviewed-real-people-empty-v1-no-positive-sector'},{feature:'places-taxonomy' as const,status:'reviewed-input' as const,marker:'reviewed-real-places335-v1'},{feature:'individual-place-pins' as const,status:'reviewed-contract' as const,marker:'canonical-individual-place-pin-contract'},{feature:'media-bytes' as const,status:'missing' as const,marker:'owned-fixture-composition-and-byte-acceptance'}]};
}
export type PublicParitySeedPlan=ReturnType<typeof buildPublicParitySeedPlan>;
// First slice accepts prepared declarations only. Materialized DB/session/media custody
// will require a separately reviewed issued manifest; callers cannot confer authority here.
/** Inspect descriptors before Zod or equality reads any property. */
function isPlainJson(value:unknown,ancestors=new Set<object>(),depth=0,budget={nodes:0}):boolean{
 if(depth>64||++budget.nodes>100000)return false;
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
  if(!descriptor.enumerable||!('value' in descriptor)||!isPlainJson(descriptor.value,ancestors,depth+1,budget)){ancestors.delete(value);return false;}
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

export const PEOPLE_CASES=Object.freeze([
 'People: native manual list and typed person create edit and reload preserve nullable facts and notes',
 'People: same-name records and matching account handles remain distinct without identity authority',
 'People: shared-person presentation and immutable handle preserve owner isolation and stale drafts',
 'People: native draft publication and public detail retain explicit social fields without private owner data',
 'People: pre-suppressed public omission preserves the original owner record and eligible control',
 'People: configured-empty sector input preserves ordinary recommendations and refuses unknown public sectors',
] as const);
export const PEOPLE_PROJECTS=Object.freeze(['people-desktop','people-mobile'] as const);
export function buildPeopleSeedPlan(caseId:string){
 if(!(PEOPLE_CASES as readonly string[]).includes(caseId))throw Error('Unknown People case');
 const entities=['same-name-a','same-name-b','matching-account-handle','shared-person','pre-suppressed','eligible-control'].map(key=>({key,title:key.startsWith('same-name')?'Alex Lee':`Fixture ${key}`,details:personEntityDetailsSchema.parse({...emptyPersonDetails(),...(key==='eligible-control'?{socialUrls:{website:'https://example.test/person'},headline:'Explicit social presentation'}:{})}),handleSource:key==='matching-account-handle'?'ownerB' as const:null,suppressed:key==='pre-suppressed'}));
 const recommendations=entities.map((entity,index)=>({key:`ownerA-${entity.key}`,owner:'ownerA' as const,collectionKey:'ownerA-people-list-0',entityKey:entity.key,title:entity.title,displayOrder:index,publicationState:'published' as const,archived:false,sectorTermId:null}));
 return {caseId,qualification:'source-preparation-only' as const,personas:[{key:'ownerA',handle:'public-parity-a'},{key:'ownerB',handle:'public-parity-b'}] as const,entities,recommendations:[...recommendations,{...recommendations[3],key:'ownerB-shared-person',owner:'ownerB' as const,collectionKey:'ownerB-people-list-0',displayOrder:0}],lists:[{category:'people' as const,key:'ownerA-people-list-0',owner:'ownerA' as const,title:'Fixture ownerA people list 0',slug:'people-list-0',displayOrder:0,visibility:'public' as const,publicationState:'published' as const,archived:false},{category:'people' as const,key:'ownerB-people-list-0',owner:'ownerB' as const,title:'Fixture ownerB people list 0',slug:'people-list-0',displayOrder:0,visibility:'public' as const,publicationState:'published' as const,archived:false}],taxonomy:{state:'CONFIGURED' as const,version:1 as const,defaultLocale:'en' as const,terms:[],sourceMappings:[],positiveSector:'unavailable-input-configured-empty' as const}};
}
export type PeopleSeedPlan=ReturnType<typeof buildPeopleSeedPlan>;
const issuedUuid=z.string().uuid(),issuedRevision=z.number().int().positive().safe(),issuedText=z.string().min(1).max(2048),issuedHash=z.string().regex(/^[a-f0-9]{64}$/),issuedOrder=z.number().int().nonnegative().safe();
const issuedPersonaBinding=z.object({userId:z.string().min(1).max(200),accountId:issuedUuid,handle:z.string().regex(/^[a-z][a-z0-9-]{2,29}$/)}).strict();
const issuedBindings=z.object({ownerA:issuedPersonaBinding,ownerB:issuedPersonaBinding}).strict();
const issuedPersonas=z.object({ownerA:issuedPersonaBinding.extend({accountRevision:issuedRevision,displayName:accountDtoSchema.shape.displayName,status:z.enum(['active','suspended','pending_deletion','deleted']),publicProfile:z.boolean()}).strict(),ownerB:issuedPersonaBinding.extend({accountRevision:issuedRevision,displayName:accountDtoSchema.shape.displayName,status:z.enum(['active','suspended','pending_deletion','deleted']),publicProfile:z.boolean()}).strict()}).strict();
const issuedIdentity={version:z.literal(1),runId:z.string().regex(/^[a-f0-9]{32}$/),commit:z.string().regex(/^[a-f0-9]{40}$/),family:z.enum(['public-parity','people']),caseId:z.enum([...PUBLIC_PARITY_CASES,...PEOPLE_CASES]),project:z.enum([...PUBLIC_PARITY_PROJECTS,...PEOPLE_PROJECTS]),repeat:z.literal(0),generation:z.literal(1),epoch:z.number().int().min(1).max(44),origin:z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{3,4}$/).refine(value=>Number(new URL(value).port)<=65535)};
const rowBase={key:issuedText,id:issuedUuid,accountId:issuedUuid};
const issuedListBase={...rowBase,category:z.enum(PUBLIC_RECOMMENDATION_CATEGORIES),pinOrder:issuedOrder.nullable(),revision:issuedRevision,title:issuedText,slug:z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),displayOrder:issuedOrder,control:z.enum(['private','draft','archived']).nullable(),visibility:z.enum(['public','private']),publicationState:z.enum(['published','draft']),archived:z.boolean()};
const issuedItemBase={...rowBase,collectionId:issuedUuid,entityKey:issuedText.nullable(),entityId:issuedUuid.nullable(),revision:issuedRevision,title:issuedText,displayOrder:issuedOrder,control:z.enum(['withheld']).nullable(),publicationState:z.enum(['published','draft']).nullable(),archived:z.boolean(),sectorTermId:issuedUuid.nullable()};
const creationLineageSchema=z.object({operation:z.enum(['createCollection','createRecommendation','resolvePersonEntity']),receiptId:issuedUuid,accountId:issuedUuid}).strict();
function categorySchema(category:Category,observed=false){
 const lineage={creation:observed?creationLineageSchema.optional():z.never().optional()};
 const details=category==='books'?bookEntityDetailsSchema:category==='movies'?movieDetailsSchema:category==='games'?manualGamePresentationSchema:category==='apps'?appEntityDetailsSchema:category==='products'?productEntityDetailsSchema:category==='people'?personEntityDetailsSchema:category==='places'?placeEntityDetailsSchema:guideSectionBlocksSchema;
 return z.object({category:z.literal(category),categoryVisible:z.object({ownerA:z.boolean(),ownerB:z.boolean()}).strict(),traversal:z.custom<PublicParitySeedPlan['categories'][number]['traversal']>().nullable(),catalogFacet:z.object({kind:z.enum(['subject','genre']),label:issuedText,slug:issuedText,source:z.enum(['fixture-label','tmdb-reference']),providerId:z.number().int().positive().nullable(),entityIds:z.object({ownerA:z.array(issuedUuid).max(53),ownerB:z.array(issuedUuid).max(53)}).strict()}).strict().nullable(),accountRevisions:z.object({ownerA:z.object({contentRevision:z.string().regex(/^[0-9]+$/),pinRevision:category==='places'||category==='guides'?z.null():issuedRevision.nullable()}).strict(),ownerB:z.object({contentRevision:z.string().regex(/^[0-9]+$/),pinRevision:category==='places'||category==='guides'?z.null():issuedRevision.nullable()}).strict()}).strict(),lists:z.array(z.object({...issuedListBase,...lineage,details:category==='guides'?guideCollectionDetailsSchema:category==='places'?placeCollectionDetailsSchema:z.null()}).strict()).max(57),entities:z.array(z.object({key:issuedText,id:issuedUuid,...lineage,kind:z.literal(category==='people'?'person':category==='places'?'place':category.slice(0,-1)),origin:z.enum(['manual','provider']),title:issuedText,details,suppressed:z.boolean()}).strict()).max(55),items:z.array(z.object({...issuedItemBase,...lineage,...(observed?{collectionId:issuedUuid.nullable(),displayOrder:issuedOrder.nullable()}:{}),details,editable:category==='guides'?z.null():editableOwnerRecommendationSchema}).strict()).max(58)}).strict();
}
const categorySchemas=PUBLIC_RECOMMENDATION_CATEGORIES.map(category=>categorySchema(category));
const observedCategorySchemas=PUBLIC_RECOMMENDATION_CATEGORIES.map(category=>categorySchema(category,true));
const observedCategorySchema=z.union(observedCategorySchemas as [typeof observedCategorySchemas[number],typeof observedCategorySchemas[number],...typeof observedCategorySchemas[number][]]);
const issuedCategorySchema=z.union(categorySchemas as [typeof categorySchemas[number],typeof categorySchemas[number],...typeof categorySchemas[number][]]);
const mediaAttachmentSchema=z.object({accountId:issuedUuid,category:z.enum(PUBLIC_RECOMMENDATION_CATEGORIES).nullable(),collectionId:issuedUuid.nullable(),subresourceId:issuedUuid.nullable(),slot:z.enum(['collection-cover','recommendation-media','guide-cover','guide-section-photo','feed-media']),position:issuedOrder,photo:guideActivityPhotoSchema.optional()}).strict().superRefine((row,context)=>{if((row.slot==='guide-section-photo')!==(row.photo!==undefined))context.addIssue({code:'custom',message:'Guide photo metadata mismatch'});if(row.slot==='feed-media'?(row.category!==null||row.collectionId!==null||row.subresourceId!==null):(row.category===null||row.collectionId===null||['recommendation-media','guide-section-photo'].includes(row.slot)&&row.subresourceId===null))context.addIssue({code:'custom',message:'Native media ancestry mismatch'})});
const issuedMediaSchema=z.object({id:issuedUuid,accountId:issuedUuid,purpose:z.enum(['profile','background','feed','recommendation','collection','guide']),status:z.literal('ready'),mimeType:z.enum(['image/png','video/mp4']),byteLength:issuedRevision,sha256:issuedHash,keyPath:issuedText.refine(value=>!value.startsWith('/')&&!value.includes('\\')&&!value.includes(':')&&!value.split('/').some(part=>!part||part==='.'||part==='..')),variant:z.literal('original'),environment:z.literal('local'),contentUrl:issuedText,attachments:z.array(mediaAttachmentSchema).min(1).max(8)}).strict();
const configuredEmpty=z.object({state:z.literal('CONFIGURED'),version:z.literal(1),defaultLocale:z.literal('en'),termCount:z.literal(0),mappingCount:z.literal(0),inputHash:z.literal('a91c358a4490341cd2341fd9ae1d4371eca217c9ed4730caf09cb1d500cf9c63'),positiveSector:z.literal('unavailable-input-configured-empty')}).strict();
const issuedManifestBody=z.object({...issuedIdentity,stage:z.literal('issued'),personas:issuedPersonas,categories:z.array(issuedCategorySchema).min(1).max(8),links:z.array(z.object({accountId:issuedUuid,locationCollectionId:issuedUuid,childCollectionId:issuedUuid,childCategory:z.enum(['products','people'])}).strict()).max(2),media:z.array(issuedMediaSchema).max(32),taxonomy:z.object({people:configuredEmpty,places:z.object({state:z.literal('CONFIGURED'),version:z.literal(1),defaultLocale:z.literal('en'),termCount:z.literal(335),mappingCount:z.literal(335),inputHash:z.literal('c62c0eecd00db1cd13372d14ea984804e62d410e868bcb16d8093cbdd9084678')}).strict().nullable()}).strict()}).strict();
export type PublicParityIssuedManifest=z.infer<typeof issuedManifestBody>;
export type PublicParityExpectedManifest=z.infer<typeof issuedExpectedSchema>;
const issuedExpectedSchema=z.object({...issuedIdentity,personas:issuedBindings}).strict().superRefine((value,context)=>{const valid=value.family==='public-parity'?(PUBLIC_PARITY_CASES as readonly string[]).includes(value.caseId)&&(PUBLIC_PARITY_PROJECTS as readonly string[]).includes(value.project):(PEOPLE_CASES as readonly string[]).includes(value.caseId)&&(PEOPLE_PROJECTS as readonly string[]).includes(value.project);if(!valid)context.addIssue({code:'custom',message:'Expected family identity mismatch'});for(const key of ['userId','accountId','handle'] as const)if(value.personas.ownerA[key]===value.personas.ownerB[key])context.addIssue({code:'custom',message:'Independent issued personas required'})});
function jsonData<T extends z.ZodTypeAny>(schema:T){
 // Zod probes top-level then/constructor before preprocessing. Gate descriptors
 // outside Zod so a Proxy or executable property cannot run during safeParse.
 const error=()=>new z.ZodError([{code:'custom',path:[],message:'Plain data manifest required'}]);
 const freeze=(row:any):any=>{if(row&&typeof row==='object'){for(const child of Object.values(row))freeze(child);Object.freeze(row)}return row};
 const safeParse=(value:unknown):z.SafeParseReturnType<unknown,z.output<T>>=>{if(!isPlainJson(value))return {success:false,error:error()};const result=schema.safeParse(value);return result.success?{success:true,data:freeze(structuredClone(result.data))}:result};
 return Object.freeze({safeParse,parse(value:unknown):z.output<T>{const result=safeParse(value);if(!result.success)throw result.error;return result.data}});
}
/** Validates expected data before native work; it never issues custody approval. */
export const publicParityExpectedManifestSchema=jsonData(issuedExpectedSchema);
function projectedItemDetails(category:Category,baseline:unknown,row:{id:string;accountId:string;collectionId:string|null},media:PublicParityIssuedManifest['media']):unknown{
 const attached=media.flatMap(asset=>asset.attachments.filter(a=>a.accountId===row.accountId&&a.category===category&&a.collectionId===row.collectionId&&a.subresourceId===row.id).map(a=>({asset,a}))).sort((x,y)=>x.a.position-y.a.position);
 if(category==='games'){const images=attached.filter(x=>x.a.slot==='recommendation-media').map(x=>({mediaId:x.asset.id,url:`/api/explorers/v1/media/${x.asset.id}/content`}));return {...baseline as object,images,coverMediaId:images[0]?.mediaId??null}}
 if(category==='guides'){const blocks=structuredClone(baseline) as z.infer<typeof guideSectionBlocksSchema>;const first=blocks.items[0];if(first?.kind!=='place')throw new Error('Guide parity seed has no place item');first.place.photos=attached.filter(x=>x.a.slot==='guide-section-photo').map(x=>x.a.photo!);return blocks}
 return baseline;
}
/** DATA validation only. Root's private issuer and protected session channel grant custody. */
export const publicParityIssuedManifestSchema=jsonData(z.object({expected:issuedExpectedSchema,manifest:issuedManifestBody}).strict().superRefine(({expected,manifest:m},context)=>{
 const issue=(path:(string|number)[])=>context.addIssue({code:'custom',path,message:'Issued native graph differs from protected source declaration'}),equal=(a:unknown,b:unknown,path:(string|number)[])=>{if(JSON.stringify(canonical(a))!==JSON.stringify(canonical(b)))issue(path)};
 for(const key of Object.keys(issuedIdentity) as (keyof typeof issuedIdentity)[])equal(m[key],expected[key],['manifest',key]);
 const publicFamily=expected.family==='public-parity';if(publicFamily?!(PUBLIC_PARITY_CASES as readonly string[]).includes(expected.caseId)||!(PUBLIC_PARITY_PROJECTS as readonly string[]).includes(expected.project):!(PEOPLE_CASES as readonly string[]).includes(expected.caseId)||!(PEOPLE_PROJECTS as readonly string[]).includes(expected.project))issue(['expected','family']);
 for(const owner of ['ownerA','ownerB'] as const){const {accountRevision,displayName,status,publicProfile,...binding}=m.personas[owner];equal(binding,expected.personas[owner],['manifest','personas',owner]);if(status!=='active'||publicProfile!==true)issue(['manifest','personas',owner]);}
 for(const key of ['userId','accountId','handle'] as const)if(new Set(['ownerA','ownerB'].map(owner=>expected.personas[owner as Owner][key])).size!==2)issue(['expected','personas']);
 const ids=new Set<string>(),collections=new Map<string,{id:string;accountId:string}>(),items=new Map<string,{id:string;accountId:string;collectionId:string}>();
 const seed=publicFamily?buildPublicParitySeedPlan(expected.caseId):buildPeopleSeedPlan(expected.caseId);
 const expectedCategories=publicFamily?(seed as PublicParitySeedPlan).categories.map(c=>c.category):['people'];equal(m.categories.map(c=>c.category),expectedCategories,['manifest','categories']);
 m.categories.forEach((graph,index)=>{
  const category=graph.category,plan=publicFamily?(seed as PublicParitySeedPlan).categories[index]:null,people=seed as PeopleSeedPlan;
  equal(graph.categoryVisible,{ownerA:true,ownerB:true},['manifest','categories',index,'categoryVisible']);equal(graph.traversal,plan?.traversal??null,['manifest','categories',index,'traversal']);
  const lists=plan?plan.lists:people.lists.map(row=>({...row,control:null,details:null}));equal(graph.lists.map(row=>row.key),lists.map(row=>row.key),['manifest','categories',index,'lists']);
  for(const [position,row]of graph.lists.entries()){const wanted=lists[position];if(!wanted){issue(['manifest','categories',index,'lists',position]);continue}const {id,accountId,revision,...facts}=row;equal(accountId,m.personas[wanted.owner].accountId,['manifest','categories',index,'lists',position,'accountId']);const {owner,key,...planFacts}=wanted;equal(facts,{key,...planFacts,pinOrder:null},['manifest','categories',index,'lists',position]);if(ids.has(id))issue(['manifest','categories',index,'lists',position,'id']);ids.add(id);collections.set(key,{id,accountId});}
  const rows=plan?plan.items:people.recommendations.map(row=>({...row,control:null,details:people.entities.find(entity=>entity.key===row.entityKey)!.details}));equal(graph.items.map(row=>row.key),rows.map(row=>row.key),['manifest','categories',index,'items']);
  const entities=new Map<string,{title:string;details:unknown;suppressed:boolean}>();if(plan){for(const row of plan.items)if(row.entityKey)entities.set(row.entityKey,{title:row.title,details:row.details,suppressed:false})}else for(const entity of people.entities)entities.set(entity.key,{title:entity.title,details:entity.handleSource?{...entity.details,usernameHandle:m.personas[entity.handleSource].handle}:entity.details,suppressed:entity.suppressed});
  equal(graph.entities.map(row=>row.key),[...entities.keys()],['manifest','categories',index,'entities']);const entityIds=new Map<string,string>();for(const row of graph.entities){const wanted=entities.get(row.key);if(!wanted){issue(['manifest','categories',index,'entities']);continue}equal({title:row.title,details:row.details,suppressed:row.suppressed},wanted,['manifest','categories',index,'entities',row.key]);if(ids.has(row.id))issue(['manifest','categories',index,'entities',row.key,'id']);ids.add(row.id);entityIds.set(row.key,row.id);}
  for(const [position,row]of graph.items.entries()){const wanted=rows[position];if(!wanted){issue(['manifest','categories',index,'items',position]);continue}if(row.editable&&(row.editable.id!==row.id||row.editable.accountId!==row.accountId||row.editable.entityId!==row.entityId||row.editable.category!==category||row.editable.revision!==row.revision||row.editable.archived!==row.archived||row.editable.publicationState!==row.publicationState||row.editable.note!==null||row.editable.userRating!==null||Object.keys(row.editable.displayOverrides).length!==0))issue(['manifest','categories',index,'items',position,'editable']);const parent=collections.get(wanted.collectionKey),expectedEntity=wanted.entityKey?entityIds.get(wanted.entityKey):null;equal(row.accountId,m.personas[wanted.owner].accountId,['manifest','categories',index,'items',position,'accountId']);equal(row.collectionId,parent?.id,['manifest','categories',index,'items',position,'collectionId']);equal(row.entityId,expectedEntity,['manifest','categories',index,'items',position,'entityId']);equal({key:row.key,entityKey:row.entityKey,title:row.title,displayOrder:row.displayOrder,control:row.control,publicationState:row.publicationState,archived:row.archived,details:row.details,sectorTermId:row.sectorTermId},{key:wanted.key,entityKey:wanted.entityKey,title:wanted.title,displayOrder:wanted.displayOrder,control:wanted.control,publicationState:category==='guides'?null:wanted.publicationState,archived:wanted.archived,details:projectedItemDetails(category,category==='people'&&wanted.entityKey?entities.get(wanted.entityKey)?.details:wanted.details,row,m.media),sectorTermId:null},['manifest','categories',index,'items',position]);if(ids.has(row.id))issue(['manifest','categories',index,'items',position,'id']);ids.add(row.id);items.set(row.key,{id:row.id,accountId:row.accountId,collectionId:row.collectionId!});}
  const facet=plan?.catalogFacet;equal(graph.catalogFacet,facet?{...facet,providerId:'providerId'in facet?facet.providerId:null,entityIds:Object.fromEntries((['ownerA','ownerB'] as const).map(owner=>[owner,[...new Set(graph.items.filter(row=>row.accountId===m.personas[owner].accountId&&row.control===null&&!row.archived&&row.publicationState==='published'&&graph.lists.some(parent=>parent.id===row.collectionId&&parent.visibility==='public'&&parent.publicationState==='published'&&!parent.archived)).map(row=>row.entityId))]]))}:null,['manifest','categories',index,'catalogFacet']);
 });
 const links=publicFamily?(seed as PublicParitySeedPlan).links.map(link=>({accountId:m.personas.ownerA.accountId,locationCollectionId:collections.get(link.parentCollectionKey)?.id,childCollectionId:collections.get(link.childCollectionKey)?.id,childCategory:link.category})):[];equal(m.links,links,['manifest','links']);if(publicFamily?m.taxonomy.places===null:m.taxonomy.places!==null)issue(['manifest','taxonomy','places']);
 for(const media of m.media){if(ids.has(media.id))issue(['manifest','media','id']);ids.add(media.id);if(!['ownerA','ownerB'].some(owner=>m.personas[owner as Owner].accountId===media.accountId))issue(['manifest','media','accountId']);equal(media.contentUrl,`${m.origin}/api/explorers/v1/media/${media.id}/content`,['manifest','media','contentUrl']);if(media.mimeType==='video/mp4'&&(media.purpose!=='feed'||media.attachments.some(a=>a.slot!=='feed-media')))issue(['manifest','media','purpose']);for(const a of media.attachments){if(a.accountId!==media.accountId||a.photo&&a.photo.mediaId!==media.id)issue(['manifest','media','attachments']);if(a.slot==='feed-media'){if(media.purpose!=='feed')issue(['manifest','media','purpose']);continue}const graph=m.categories.find(c=>c.category===a.category),parent=graph?.lists.find(row=>row.id===a.collectionId),child=a.subresourceId===null?null:graph?.items.find(row=>row.id===a.subresourceId);if(!parent||parent.accountId!==media.accountId||a.subresourceId!==null&&(!child||child.collectionId!==parent.id||child.accountId!==media.accountId))issue(['manifest','media','attachments']);}}
 if(expected.caseId===PUBLIC_PARITY_CASES[12]&&(!m.media.some(row=>row.mimeType==='image/png')||!m.media.some(row=>row.mimeType==='video/mp4')||!m.media.some(row=>row.attachments.length>=2)))issue(['manifest','media']);
}).transform(({manifest})=>manifest));

const observedMediaSchema=issuedMediaSchema.extend({attachments:z.array(mediaAttachmentSchema).max(8)}).strict();
export const publicParityObservationRowSchemas=Object.freeze({persona:issuedPersonas,category:observedCategorySchema,media:observedMediaSchema});
const observationBody=issuedManifestBody.extend({stage:z.literal('observed'),categories:z.array(observedCategorySchema).min(1).max(8),media:z.array(observedMediaSchema).max(32)}).strict();
export type PublicParityObservation=z.infer<typeof observationBody>;
/** Fresh root-owned native observation. Mutation facts are not reconstructed from browser assertions. */
export const publicParityObservationSchema=jsonData(z.object({expected:issuedExpectedSchema,observation:observationBody}).strict().superRefine(({expected,observation:o},context)=>{
 const refuse=()=>context.addIssue({code:'custom',message:'Observation scope differs from protected issued identity'});
 for(const key of Object.keys(issuedIdentity) as (keyof typeof issuedIdentity)[])if(o[key]!==expected[key])refuse();
 for(const owner of ['ownerA','ownerB'] as const)for(const key of ['userId','accountId'] as const)if(o.personas[owner][key]!==expected.personas[owner][key])refuse();
 const accounts=new Set(Object.values(expected.personas).map(persona=>persona.accountId)),ids=new Set<string>(),parents=new Map<string,string>();
 if(expected.family==='people'&&(o.categories.length!==1||o.categories[0].category!=='people')||expected.family==='public-parity'&&JSON.stringify(o.categories.map(c=>c.category))!==JSON.stringify(PUBLIC_RECOMMENDATION_CATEGORIES))refuse();
 const receipts=new Set<string>();const seed=expected.family==='people'?buildPeopleSeedPlan(expected.caseId):buildPublicParitySeedPlan(expected.caseId);
 for(const graph of o.categories){
  const plan=expected.family==='people'?seed as PeopleSeedPlan:(seed as PublicParitySeedPlan).categories.find(c=>c.category===graph.category)!;
  const knownLists=new Set(plan.lists.map(row=>row.key)),knownItems=new Set(('recommendations'in plan?plan.recommendations:plan.items).map(row=>row.key)),knownEntities=new Set('entities'in plan?plan.entities.map(row=>row.key):plan.items.flatMap(row=>row.entityKey?[row.entityKey]:[]));
  for(const [kind,rows,known,operation]of [['list',graph.lists,knownLists,'createCollection'],['entity',graph.entities,knownEntities,'resolvePersonEntity'],['item',graph.items,knownItems,'createRecommendation']]as const)for(const row of rows){
   if(known.has(row.key)){if(row.creation!==undefined)refuse();continue}
   const proof=row.creation;if(expected.family!=='people'||graph.category!=='people'||row.key!==`created-${kind}:${row.id}`||!proof||proof.operation!==operation||!accounts.has(proof.accountId)||'accountId'in row&&row.accountId!==proof.accountId||receipts.has(proof.receiptId))refuse();else receipts.add(proof.receiptId);
  }
  const entities=new Set(graph.entities.map(row=>row.id));for(const row of [...graph.lists,...graph.entities,...graph.items]){if(ids.has(row.id))refuse();ids.add(row.id)}for(const row of graph.lists){if(!accounts.has(row.accountId))refuse();parents.set(row.id,row.accountId)}for(const row of graph.items){if(!accounts.has(row.accountId)||(row.collectionId===null?graph.category==='guides'||!row.archived||row.displayOrder!==null:row.displayOrder===null||parents.get(row.collectionId)!==row.accountId)||(graph.category==='guides'?row.entityId!==null||row.entityKey!==null:(!row.entityId||!entities.has(row.entityId)||graph.entities.find(entity=>entity.id===row.entityId)?.key!==row.entityKey)))refuse();if(row.editable&&(row.editable.id!==row.id||row.editable.accountId!==row.accountId||row.editable.entityId!==row.entityId||row.editable.category!==graph.category||row.editable.revision!==row.revision||row.editable.archived!==row.archived||row.editable.publicationState!==row.publicationState))refuse();}}
 for(const link of o.links)if(!accounts.has(link.accountId)||parents.get(link.locationCollectionId)!==link.accountId||parents.get(link.childCollectionId)!==link.accountId)refuse();
 for(const media of o.media){if(ids.has(media.id)||!accounts.has(media.accountId)||media.contentUrl!==`${o.origin}/api/explorers/v1/media/${media.id}/content`)refuse();ids.add(media.id);if(media.mimeType==='video/mp4'&&(media.purpose!=='feed'||media.attachments.some(a=>a.slot!=='feed-media')))refuse();for(const a of media.attachments){if(a.accountId!==media.accountId||a.photo&&a.photo.mediaId!==media.id)refuse();if(a.slot==='feed-media'){if(media.purpose!=='feed')refuse();continue}const graph=o.categories.find(row=>row.category===a.category),parent=graph?.lists.find(row=>row.id===a.collectionId),child=a.subresourceId===null?null:graph?.items.find(row=>row.id===a.subresourceId);if(!parent||parent.accountId!==media.accountId||a.subresourceId!==null&&(!child||child.collectionId!==parent.id||child.accountId!==media.accountId))refuse();}}
}).transform(({observation})=>observation));
export type PublicParityMaterializedReset=Readonly<{manifest:PublicParityIssuedManifest;sessions:Readonly<Record<'ownerA'|'ownerB',Readonly<{cookie:string}>>>}>;

export type PublicParityPrivateObservation=Readonly<{observation:PublicParityObservation;replacementSessions?:Readonly<{ownerA:Readonly<{cookie:string}>}>}>;
