import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod/v3';
import {guideCollectionDetailsSchema, guideSectionBlocksSchema, type GuideDayPlace} from '../shared/explorersGuideContract';

export const GUIDES_CASES = [
  'Guides: complete non-ASCII wizard metadata and creator categories survive reload',
  'Guides: retained section editors preserve every untouched block after reload',
  'Guides: stale sections retain drafts and wrong guide owner matches missing',
  'Guides: section reorder deletion and archive preserve exact persisted scope',
  'Guides: complete owner and public guide pages retain every section and filter order',
  'Guides: native cover failure preserves old bytes and fresh retry replaces cover',
  'Guides: native section photo import persists metadata and public views after reload',
  'Guides: publication pin and ancestor withdrawal enforce cold public media access',
] as const;
export const GUIDES_PROJECTS = ['guides-desktop', 'guides-mobile'] as const;

const sectionCounts = [[], [1], [1,1], [4,1], [53,...Array(53).fill(0)], [1], [1], [1,1]];

function details() {
  return guideCollectionDetailsSchema.parse({
    guideType:'itinerary', multiCity:false, numberOfDays:3,
    estimatedBudget:'1234.50', budgetCurrency:'INR', budgetType:'per-person',
    bestTimeToVisit:['अक्टूबर'], categories:['culture','food'], tags:['यात्रा','café'],
    tipsNotes:[{type:'paragraph',children:[{text:'सुबह की सैर — café'}]}],
    place:{name:'कोलकाता',address:'भारत',placeId:'guide_city',rating:4.5,ratingsCount:12,lat:0,lng:0},
    locationEntityId:null,
  });
}

function place(localId:string):GuideDayPlace {
  return {localId,placeId:`guide_${localId}`,name:`सैर ${localId}`,formattedAddress:'भारत',
    geometry:{location:{lat:0,lng:0}},types:['point_of_interest'],tips:'Bring water',photos:[],
    priceLevel:1,priceRange:'₹100',customBudget:'tea',budgetAmount:'100.00',budgetCurrency:'INR',
    source:'manual',verified:false};
}

function blocks() {
  const morning=place('morning'), afternoon=place('afternoon'), evening=place('evening');
  const budget=(p:GuideDayPlace)=>({localId:p.localId,placeId:p.placeId,name:p.name,
    priceLevel:p.priceLevel,priceRange:p.priceRange,customBudget:p.customBudget,
    budgetAmount:p.budgetAmount,budgetCurrency:p.budgetCurrency});
  return guideSectionBlocksSchema.parse({version:'guide-section-blocks/v1',
    timeline:{morning:[morning],afternoon:[afternoon],evening:[evening]},
    transport:{segments:[{fromLocalId:'morning',toLocalId:'afternoon',mode:'walk',distanceKm:1,estimatedMinutes:20}]},
    stay:{accommodations:[place('stay')]},activities:{activities:[place('activity')]},
    budget:{morning:[budget(morning)],afternoon:[budget(afternoon)],evening:[budget(evening)]},
    mapDetails:{center:{lat:0,lng:0},zoom:12},
    packingList:{items:[{localId:'water',label:'Water bottle',done:false}]},
    preTasks:{items:[{localId:'reserve',label:'Reserve room',done:true}]},tags:['दिन','café']});
}

export function buildGuidesSeedPlan(caseId:string) {
  const index=GUIDES_CASES.findIndex(title=>title===caseId);
  if(index<0) throw new Error('Unknown Guides case');
  const makeGuide=(owner:'ownerA'|'ownerB',displayOrder:number)=>({
    key:`${owner}-guide-${displayOrder}`,owner,title:`यात्रा ${displayOrder+1}`,
    slug:`guide-${displayOrder+1}`,displayOrder,archived:owner==='ownerA' && index===3 && displayOrder===1,
    visibility:owner==='ownerA' && index===4 && displayOrder===53?'private' as const:'public' as const,
    publicationState:'published' as const,details:details(),
  });
  const guides=[...sectionCounts[index].map((_,i)=>makeGuide('ownerA',i)),makeGuide('ownerB',0)];
  const sections=guides.flatMap(guide=>{
    const count=guide.owner==='ownerB'?1:sectionCounts[index][guide.displayOrder];
    return Array.from({length:count},(_,displayOrder)=>({
      key:`${guide.key}-section-${displayOrder}`,guideKey:guide.key,title:`दिन ${displayOrder+1}`,
      description:'सैर और भोजन',displayOrder,archived:false,blocks:blocks(),
    }));
  });
  const roleKeys=index===5?['old-cover','replacement-cover','independent-cover']:
    index===6?['direct-timeline','direct-stay','activity-import']:
    index===7?['shared-section','sole-withdrawal']:[];
  const mediaRoles=roleKeys.map(key=>({key,owner:key==='independent-cover'?'ownerB' as const:'ownerA' as const,
    purpose:key.includes('cover')?'collection' as const:'guide' as const}));
  // Bindings are declarations; actual media IDs are allocated by later resource work.
  const binding=(roleKey:string,guideIndex:number,block:'timeline.morning'|'stay.accommodations')=>({
    roleKey,sectionKey:`ownerA-guide-${guideIndex}-section-0`,block,entryIndex:0,
  });
  const photoBindings=index===6?[binding('direct-timeline',0,'timeline.morning'),binding('direct-stay',0,'stay.accommodations')]:
    index===7?[binding('shared-section',0,'timeline.morning'),binding('shared-section',1,'timeline.morning'),binding('sole-withdrawal',0,'stay.accommodations')]:[];
  const traversal=index===4?{guideCount:53,sectionCount:53,selectedGuideKey:guides[0].key,
    publicDetail:{limit:12,lengths:[12,12,12,12,5],offsets:[0,12,24,36,48],cursors:['o12','o24','o36','o48',null]},
    publicCategory:{limit:24,lengths:[24,24,5]},
    ownerSections:{limit:20,lengths:[20,20,13],after:[undefined,19,39],cursors:[19,39,null]}}:null;
  return {caseId,guides,sections,mediaRoles,photoBindings,traversal};
}

const generation=z.number().int().nonnegative().safe();
const runId=z.string().regex(/^[a-f0-9]{32}$/);
const commit=z.string().regex(/^[a-f0-9]{40}$/);
const capability=z.string().regex(/^[a-f0-9]{64}$/);
const host=z.string().regex(/^127\.0\.0\.1:[1-9][0-9]{3,4}$/).refine(value=>{
  const port=Number(value.slice('127.0.0.1:'.length));
  return port>=1024 && port<=65535;
});
const identity={caseId:z.enum(GUIDES_CASES),project:z.enum(GUIDES_PROJECTS),repeat:z.literal(0),generation};
const bodySchema=z.object({version:z.literal(1),action:z.enum(['reset','observe']),runId,commit,...identity}).strict();
const envelopeSchema=z.object({remote:z.literal('127.0.0.1'),host,expectedHost:host,
  method:z.literal('POST'),path:z.literal('/control'),capability,expectedCapability:capability,
  runId,expectedRunId:runId,commit,expectedCommit:commit,currentGeneration:generation,
  active:z.object(identity).strict().nullable(),body:bodySchema}).strict();

export function validateGuidesControl(input:unknown) {
  // Parse both request and independently trusted authority before comparing credentials.
  const value=envelopeSchema.parse(input);
  if(value.host!==value.expectedHost || value.runId!==value.expectedRunId ||
    value.commit!==value.expectedCommit || value.body.runId!==value.expectedRunId ||
    value.body.commit!==value.expectedCommit ||
    !timingSafeEqual(Buffer.from(value.capability,'hex'),Buffer.from(value.expectedCapability,'hex')))
    throw new Error('Invalid Guides control authority');
  if(value.body.generation!==value.currentGeneration ||
    (value.active!==null && value.active.generation!==value.currentGeneration))
    throw new Error('Stale Guides control generation');
  if(value.body.action==='observe' && (value.active===null ||
    value.active.caseId!==value.body.caseId || value.active.project!==value.body.project ||
    value.active.repeat!==value.body.repeat)) throw new Error('Inactive Guides identity');
  return value.body;
}
