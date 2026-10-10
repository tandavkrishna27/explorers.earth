import {createHash, createHmac, randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import * as nativePath from 'node:path';
import {z} from 'zod/v3';
import {guideCollectionDetailsSchema, guideSectionBlocksSchema, guideActivityPhotoSchema, guideSectionDtoSchema, GUIDE_SECTION_LIMIT, GUIDE_SECTION_PAGE_LIMIT, type GuideDayPlace} from '../shared/explorersGuideContract';
import {ownerCollectionDtoSchema} from '../shared/explorersOwnerContentContract';
import type {Pool, PoolClient} from 'pg';
import type {createCanonicalApp} from '../server/auth/canonicalApp';
import type {ExplorersAuthConfig} from '../server/auth/betterAuth';
import type {LocalObjectStorage} from '../server/services/objectStorage';
import type {OwnedUatDatabaseAuthority} from './music-uat-database';

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

// Private, in-memory custody envelope for the initial materialized seed snapshot.
const manifestRevision=z.number().int().positive().safe();
const uuid=z.string().uuid();
const personaBinding=z.object({userId:z.string().min(1),accountId:uuid,handle:z.string().min(1)}).strict();
const personaBindings=z.object({ownerA:personaBinding,ownerB:personaBinding,ownerC:personaBinding}).strict();
const runtimePersona=personaBinding.extend({accountRevision:manifestRevision}).strict();
const manifestIdentity={version:z.literal(1),runId,commit,caseId:z.enum(GUIDES_CASES),project:z.enum(GUIDES_PROJECTS),repeat:z.literal(0),generation:manifestRevision};
const manifestGuide=z.object({key:z.string().min(1),id:uuid,accountId:uuid,category:z.literal('guides'),
  title:guideSectionDtoSchema.shape.title,slug:z.string().min(1),displayOrder:z.number().int().nonnegative().safe(),
  collectionRevision:manifestRevision,categoryContentRevision:manifestRevision,visibility:z.enum(['public','private']),
  publicationState:z.enum(['draft','published']),archived:z.boolean(),details:guideCollectionDetailsSchema}).strict();
const manifestSection=z.object({key:z.string().min(1),id:uuid,collectionId:uuid,accountId:uuid,
  title:guideSectionDtoSchema.shape.title,description:guideSectionDtoSchema.shape.description,
  displayOrder:z.number().int().nonnegative().max(GUIDE_SECTION_LIMIT-1),archived:z.boolean(),blocks:guideSectionBlocksSchema}).strict();
const knownGuideFixtures={
  'old-cover':{byteLength:74,sha256:'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2',mimeType:'image/png'},
  'replacement-cover':{byteLength:78,sha256:'737a59b1d4ed37b6cd836d483eff2ad8b0183d5a8078e355e7bb30a91c746f82',mimeType:'image/png'},
  'activity-import':{byteLength:633,sha256:'040d3d472c846ce1e2ea09b361b3224c5723a591f305797217e20b98778d9f1c',mimeType:'image/jpeg'},
} as const;
const fixtureId=z.enum(['old-cover','replacement-cover','activity-import']);
const manifestMedia=z.object({key:z.string().min(1),id:uuid,accountId:uuid,purpose:z.enum(['collection','guide']),
  status:z.literal('ready'),variant:z.literal('original'),environment:z.literal('local'),keyPath:z.string(),
  mimeType:z.enum(['image/png','image/jpeg']),byteLength:z.number().int().positive().max(5242880),
  sha256:z.string().regex(/^[a-f0-9]{64}$/),contentUrl:z.string(),fixtureId}).strict();
const attachmentFields={guideId:uuid,accountId:uuid,mediaId:uuid};
const manifestAttachment=z.discriminatedUnion('slot',[
  z.object({slot:z.literal('cover'),...attachmentFields}).strict(),
  z.object({slot:z.literal('section-photo'),...attachmentFields,sectionId:uuid}).strict(),
]);
const traversalSchema=z.object({guideCount:z.literal(53),sectionCount:z.literal(53),
  publicDetail:z.object({limit:z.literal(12),lengths:z.array(z.number()),offsets:z.array(z.number()),cursors:z.array(z.string().nullable())}).strict(),
  publicCategory:z.object({limit:z.literal(24),lengths:z.array(z.number())}).strict(),
  ownerSections:z.object({limit:z.literal(GUIDE_SECTION_PAGE_LIMIT),lengths:z.array(z.number()),
    requests:z.tuple([z.object({}).strict(),z.object({after:z.literal(19)}).strict(),z.object({after:z.literal(39)}).strict()]),
    cursors:z.array(z.number().nullable()),wireCursors:z.array(z.string().nullable())}).strict(),
}).strict();
const manifestSchema=z.object({...manifestIdentity,
  personas:z.object({ownerA:runtimePersona,ownerB:runtimePersona,ownerC:runtimePersona}).strict(),
  guides:z.array(manifestGuide),sections:z.array(manifestSection),media:z.array(manifestMedia),attachments:z.array(manifestAttachment),
  expectedPublic:z.object({eligibleGuideIds:z.array(uuid),selectedGuideId:uuid.nullable(),orderedSectionIds:z.array(uuid),
    roleMediaIds:z.record(uuid.nullable()),traversal:traversalSchema.nullable()}).strict(),
}).strict();

export const guidesManifestSchema=z.object({expected:z.object({...manifestIdentity,personas:personaBindings}).strict(),
  manifest:manifestSchema,
  fixtureBytes:z.object({'old-cover':z.instanceof(Uint8Array).optional(),'replacement-cover':z.instanceof(Uint8Array).optional(),'activity-import':z.instanceof(Uint8Array).optional()}).strict(),
}).strict().superRefine(({expected,manifest:m,fixtureBytes},ctx)=>{
  const issue=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
  const equal=(actual:unknown,wanted:unknown,path:(string|number)[])=>{
    // Object key order is immaterial; array order is part of the fixture contract.
    const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?
      Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
    if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(wanted)))issue(path,'Initial snapshot mismatch');
  };
  for(const key of Object.keys(manifestIdentity) as (keyof typeof manifestIdentity)[])equal(m[key],expected[key],['manifest',key]);
  const owners=['ownerA','ownerB','ownerC'] as const;
  for(const owner of owners){const {accountRevision,...binding}=m.personas[owner];equal(binding,expected.personas[owner],['manifest','personas',owner]);}
  for(const field of ['userId','accountId','handle'] as const)if(new Set(owners.map(o=>expected.personas[o][field])).size!==3)issue(['expected','personas'],'Duplicate persona binding');
  const plan=buildGuidesSeedPlan(expected.caseId);
  const unique=(rows:{key:string,id:string}[],kind:string)=>{
    for(const field of ['key','id'] as const)if(new Set(rows.map(r=>r[field])).size!==rows.length)issue(['manifest',kind],'Duplicate '+field);
  };
  unique(m.guides,'guides');unique(m.sections,'sections');unique(m.media,'media');
  equal(m.guides.map(g=>g.key).sort(),plan.guides.map(g=>g.key).sort(),['manifest','guides']);
  equal(m.sections.map(s=>s.key).sort(),plan.sections.map(s=>s.key).sort(),['manifest','sections']);
  const guidesByKey=new Map(m.guides.map(g=>[g.key,g]));
  for(const [i,g] of m.guides.entries()){
    const seed=plan.guides.find(row=>row.key===g.key);if(!seed)continue;
    const {owner,...properties}=seed;
    const {id,accountId,category,collectionRevision,categoryContentRevision,...actual}=g;
    equal(actual,properties,['manifest','guides',i]);equal(accountId,expected.personas[owner].accountId,['manifest','guides',i,'accountId']);
    if(m.sections.filter(s=>s.collectionId===id).length>GUIDE_SECTION_LIMIT)issue(['manifest','sections'],'Too many sections');
  }
  for(const owner of owners){const rows=m.guides.filter(g=>g.accountId===expected.personas[owner].accountId);
    if(new Set(rows.map(g=>g.displayOrder)).size!==rows.length)issue(['manifest','guides'],'Duplicate account guide order');
    if(new Set(rows.map(g=>g.categoryContentRevision)).size>1)issue(['manifest','guides'],'Inconsistent category revision');
  }
  const roles=plan.mediaRoles.filter(r=>r.key!=='activity-import');
  equal(m.media.map(r=>r.key).sort(),roles.map(r=>r.key).sort(),['manifest','media']);
  const mediaByRole=new Map(m.media.map(r=>[r.key,r]));
  const needed=new Set(plan.mediaRoles.map(r=>r.key==='replacement-cover'?'replacement-cover':r.key==='activity-import'?'activity-import':'old-cover'));
  equal(Object.keys(fixtureBytes).sort(),[...needed].sort(),['fixtureBytes']);
  for(const id of needed){const bytes=fixtureBytes[id as keyof typeof fixtureBytes],known=knownGuideFixtures[id as keyof typeof knownGuideFixtures];
    if(!bytes||bytes.byteLength!==known.byteLength||createHash('sha256').update(bytes).digest('hex')!==known.sha256)issue(['fixtureBytes',id],'Known fixture bytes mismatch');
  }
  for(const [i,row] of m.media.entries()){
    const role=roles.find(r=>r.key===row.key);if(!role)continue;
    const id=role.key==='replacement-cover'?'replacement-cover':'old-cover';
    equal(row.fixtureId,id,['manifest','media',i,'fixtureId']);
    for(const field of ['byteLength','sha256','mimeType'] as const)equal(row[field],knownGuideFixtures[id][field],['manifest','media',i,field]);
    equal(row.purpose,role.purpose,['manifest','media',i,'purpose']);equal(row.accountId,expected.personas[role.owner].accountId,['manifest','media',i,'accountId']);
    equal(row.keyPath,`local/${row.accountId}/${row.id}`,['manifest','media',i,'keyPath']);equal(row.contentUrl,`/api/explorers/v1/media/${row.id}/content`,['manifest','media',i,'contentUrl']);
  }
  const wantedAttachments:z.infer<typeof manifestAttachment>[]=[];
  for(const [i,s] of m.sections.entries()){
    const seed=plan.sections.find(row=>row.key===s.key);if(!seed)continue;
    const parent=guidesByKey.get(seed.guideKey);if(!parent){issue(['manifest','sections',i,'collectionId'],'Missing parent');continue;}
    equal(s.collectionId,parent.id,['manifest','sections',i,'collectionId']);equal(s.accountId,parent.accountId,['manifest','sections',i,'accountId']);
    const {guideKey,blocks:seedBlocks,...properties}=seed;
    const {id,collectionId,accountId,blocks:actualBlocks,...actual}=s;
    equal(actual,properties,['manifest','sections',i]);
    if(new Set(m.sections.filter(row=>row.collectionId===s.collectionId).map(row=>row.displayOrder)).size!==m.sections.filter(row=>row.collectionId===s.collectionId).length)issue(['manifest','sections',i,'displayOrder'],'Duplicate parent section order');
    const expectedBlocks=structuredClone(seedBlocks);
    for(const binding of plan.photoBindings.filter(b=>b.sectionKey===s.key)){
      const asset=mediaByRole.get(binding.roleKey);if(!asset)continue;
      const photoResult=guideActivityPhotoSchema.safeParse({mediaId:asset.id,fileName:`${binding.roleKey}.png`,width:8,height:8,aspectRatio:'1:1'});
      if(!photoResult.success){
        const [block,field]=binding.block.split('.');
        for(const sharedIssue of photoResult.error.issues)ctx.addIssue({...sharedIssue,path:['manifest','sections',i,'blocks',block,field,binding.entryIndex,'photos',0,...sharedIssue.path]});
        continue;
      }
      const photo=photoResult.data;
      if(binding.block==='timeline.morning')expectedBlocks.timeline.morning[binding.entryIndex].photos=[photo];
      else expectedBlocks.stay.accommodations[binding.entryIndex].photos=[photo];
    }
    // Legal repetition of an identical photo does not create another attachment.
    const normalizedBlocks=structuredClone(actualBlocks);
    const entries=[...normalizedBlocks.timeline.morning,...normalizedBlocks.timeline.afternoon,...normalizedBlocks.timeline.evening,...normalizedBlocks.stay.accommodations,...normalizedBlocks.activities.activities];
    const ids=new Set<string>();
    for(const entry of entries){entry.photos=entry.photos.filter((photo,j,all)=>all.findIndex(p=>JSON.stringify(p)===JSON.stringify(photo))===j);for(const photo of entry.photos)ids.add(photo.mediaId);}
    equal(normalizedBlocks,expectedBlocks,['manifest','sections',i,'blocks']);
    for(const mediaId of ids){const asset=m.media.find(row=>row.id===mediaId);
      if(!asset||asset.accountId!==s.accountId||asset.purpose!=='guide')issue(['manifest','sections',i,'blocks'],'Invalid photo ownership');
      wantedAttachments.push({slot:'section-photo',guideId:s.collectionId,sectionId:s.id,accountId:s.accountId,mediaId});
    }
  }
  for(const roleKey of ['old-cover','independent-cover']){const asset=mediaByRole.get(roleKey);if(!asset)continue;
    const guide=guidesByKey.get(roleKey==='old-cover'?'ownerA-guide-0':'ownerB-guide-0');
    if(guide)wantedAttachments.push({slot:'cover',guideId:guide.id,accountId:guide.accountId,mediaId:asset.id});
  }
  const attachmentOrder=(a:z.infer<typeof manifestAttachment>)=>`${a.slot}/${a.guideId}/${'sectionId' in a?a.sectionId:''}/${a.mediaId}`;
  equal([...m.attachments].sort((a,b)=>attachmentOrder(a).localeCompare(attachmentOrder(b))),wantedAttachments.sort((a,b)=>attachmentOrder(a).localeCompare(attachmentOrder(b))),['manifest','attachments']);
  const eligible=plan.guides.filter(g=>g.owner==='ownerA'&&g.visibility==='public'&&g.publicationState==='published'&&!g.archived).map(g=>guidesByKey.get(g.key)?.id);
  const selected=plan.traversal?guidesByKey.get(plan.traversal.selectedGuideKey)?.id:null;
  equal(m.expectedPublic.eligibleGuideIds,eligible,['manifest','expectedPublic','eligibleGuideIds']);
  equal(m.expectedPublic.selectedGuideId,selected,['manifest','expectedPublic','selectedGuideId']);
  equal(m.expectedPublic.orderedSectionIds,plan.traversal?plan.sections.filter(s=>s.guideKey===plan.traversal!.selectedGuideKey).map(s=>m.sections.find(row=>row.key===s.key)?.id):[],['manifest','expectedPublic','orderedSectionIds']);
  equal(m.expectedPublic.roleMediaIds,Object.fromEntries(plan.mediaRoles.map(r=>[r.key,r.key==='activity-import'?null:mediaByRole.get(r.key)?.id])),['manifest','expectedPublic','roleMediaIds']);
  equal(m.expectedPublic.traversal,plan.traversal?{guideCount:53,sectionCount:53,publicDetail:plan.traversal.publicDetail,publicCategory:plan.traversal.publicCategory,
    ownerSections:{limit:GUIDE_SECTION_PAGE_LIMIT,lengths:[20,20,13],requests:[{},{after:19},{after:39}],cursors:[19,39,null],wireCursors:['19','39',null]}}:null,['manifest','expectedPublic','traversal']);
}).transform(value=>value.manifest);

export type GuidesManifest=z.infer<typeof guidesManifestSchema>;

// Lexical shape only; the resource owner must separately establish real custody.
export function assertGuidesStoragePath(path:unknown, expectedTemporaryRoot:unknown):void {
  const canonicalLocal=(value:unknown):value is string=>{
    if(typeof value!=='string'||value.length<1||value.length>4096||value.includes('\0')||
      !nativePath.isAbsolute(value)||nativePath.normalize(value)!==value) return false;
    if(nativePath.sep==='\\') return /^[A-Za-z]:\\/.test(value)&&!value.includes('/')&&!value.slice(2).includes(':')&&
      value.slice(3).split('\\').every(component=>!/[. ]$/.test(component));
    return !value.includes('\\')&&!value.startsWith('//');
  };
  if(!canonicalLocal(path)||!canonicalLocal(expectedTemporaryRoot)) throw new Error('Invalid Guides storage path');
  const privateRoot=nativePath.dirname(path);
  if(nativePath.basename(path)!=='owned-media'||path!==nativePath.join(privateRoot,'owned-media')||
    !/^explorers-profile-e2e-[A-Za-z0-9]+$/.test(nativePath.basename(privateRoot))||
    nativePath.dirname(privateRoot)!==expectedTemporaryRoot||
    privateRoot!==nativePath.join(expectedTemporaryRoot,nativePath.basename(privateRoot)))
    throw new Error('Invalid Guides storage path');
}

const resetRowString=z.string().min(1).max(128);
const resetObjectKey=z.string().min(1).max(1024);
const resetPersona=z.object({userId:z.string().min(1).max(200).refine(value=>value.trim()===value),accountId:uuid}).strict();
const resetTrackedMedia=z.object({id:uuid,accountId:uuid,purpose:z.enum(['collection','guide']),
  variant:z.literal('original'),environment:z.literal('local'),key:resetObjectKey}).strict();
const resetOwnership=z.object({runId,commit,
  personas:z.object({ownerA:resetPersona,ownerB:resetPersona,ownerC:resetPersona}).strict(),
  trackedMedia:z.array(resetTrackedMedia)}).strict();
const resetSnapshot=z.object({runId,commit,
  collections:z.array(z.object({id:uuid,accountId:uuid,category:resetRowString}).strict()),
  analytics:z.array(z.object({id:uuid,accountId:uuid,category:resetRowString,
    collectionId:uuid.nullable(),recommendationId:uuid.nullable()}).strict()),
  media:z.array(z.object({id:uuid,accountId:uuid,purpose:resetRowString,status:resetRowString}).strict()),
  objects:z.array(z.object({mediaId:uuid,accountId:uuid,variant:resetRowString,
    environment:resetRowString,key:resetObjectKey}).strict()),
}).strict();
type GuidesResetReferences={analyticsIds:string[];media:z.infer<typeof resetTrackedMedia>[]};

// These independently verified rows do not establish attachment or deletion authority.
export function selectOwnedGuidesResetReferences(snapshot:unknown, ownership:unknown):GuidesResetReferences {
  const rows=resetSnapshot.parse(snapshot), authority=resetOwnership.parse(ownership);
  if(rows.runId!==authority.runId||rows.commit!==authority.commit) throw new Error('Invalid Guides reset authority');
  const personas=Object.values(authority.personas);
  const unique=(keys:string[])=>{
    if(new Set(keys).size!==keys.length) throw new Error('Duplicate Guides reset identity');
  };
  unique(personas.map(persona=>persona.userId));unique(personas.map(persona=>persona.accountId));
  unique(rows.collections.map(row=>row.id));unique(rows.analytics.map(row=>row.id));
  unique(rows.media.map(row=>row.id));
  const objectIdentity=(row:{mediaId:string;variant:string;environment:string})=>JSON.stringify([row.mediaId,row.variant,row.environment]);
  unique(rows.objects.map(objectIdentity));unique(authority.trackedMedia.map(row=>row.id));
  unique(authority.trackedMedia.map(row=>row.key));
  const accounts=new Set(personas.map(persona=>persona.accountId));
  for(const tracked of authority.trackedMedia){
    if(!accounts.has(tracked.accountId)||tracked.key!==`local/${tracked.accountId}/${tracked.id}`)
      throw new Error('Invalid Guides tracked media authority');
  }
  const collections=new Map(rows.collections.map(row=>[row.id,row]));
  const assets=new Map(rows.media.map(row=>[row.id,row]));
  const objects=new Map(rows.objects.map(row=>[objectIdentity(row),row]));
  const analyticsIds=rows.analytics.filter(event=>{
    const collection=event.collectionId===null?undefined:collections.get(event.collectionId);
    return event.category==='guides'&&event.recommendationId===null&&accounts.has(event.accountId)&&
      collection?.category==='guides'&&collection.accountId===event.accountId;
  }).map(event=>event.id).sort();
  const media=authority.trackedMedia.filter(tracked=>{
    const asset=assets.get(tracked.id), object=objects.get(objectIdentity({mediaId:tracked.id,...tracked}));
    return asset?.accountId===tracked.accountId&&asset.purpose===tracked.purpose&&asset.status==='ready'&&
      object?.accountId===tracked.accountId&&object.key===tracked.key;
  }).map(tracked=>({...tracked})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  return {analyticsIds,media};
}

// Private fixture controller. Parent custody, canonical-request quiescence and
// eventual process supervision are prerequisites outside this helper's authority.
type ControlOwner='ownerA'|'ownerB'|'ownerC';
type ControlThree<T>={ownerA:T;ownerB:T;ownerC:T};
type ControlOptions={pool:Pool;composed:ReturnType<typeof createCanonicalApp>;config:ExplorersAuthConfig;
  runId:string;commit:string;authority:OwnedUatDatabaseAuthority;
  personas:ControlThree<{userId:string;cookie:string;handle:string}>;
  expectedTemporaryRoot:string;disposableDirectory:string;
  storage:{directory:string;instance:Pick<LocalObjectStorage,'environment'|'putOwned'|'get'|'delete'>};
  port:number;apiOrigin:string};
type ControlDependencies={fs:Pick<typeof import('node:fs/promises'),'lstat'|'realpath'|'mkdir'>;
  createServer:typeof import('node:http').createServer;fetch:typeof globalThis.fetch;
  guideRepository:Pick<typeof import('../server/repositories/guideRepository'),
    'writeGuideDetails'|'createGuideSection'|'attachGuideCover'|'readGuideDetails'>};
type ControlHandle={version:1;url:string;capability:string;runId:string;commit:string;close:()=>Promise<void>};
type ControlCommand=z.infer<typeof bodySchema>;
type ControlRow=Record<string,unknown>;
type ControlLedger={id:string;accountId:string;purpose:'collection'|'guide';variant:'original';environment:'local';key:string;
  phase:'pending-put'|'committed'|'detached-cleanup';settled:boolean;removed:boolean;rollbackKnown:boolean};
type CleanupFailure='listener'|'drain'|'authority'|'custody'|'storage';
const controlOwners=['ownerA','ownerB','ownerC'] as const;
const controlSurfaces=['profile_media','profile_feed_items','collection_media','recommendation_media',
  'guide_section_photos','recommendation_book_covers','recommendation_movie_media'] as const;
const controlAdmissionMs=180000,controlGraceMs=125000,controlResponseBytes=8*1024*1024;
const controlUuid=uuid.refine(v=>v===v.toLowerCase());
const controlNat=z.number().int().nonnegative().safe();
const controlPositive=controlNat.refine(v=>v>0);
const controlText=(maximum=65536)=>z.string().refine(v=>Buffer.byteLength(v,'utf8')<=maximum);
const controlTime=z.string().datetime();
const controlHash=z.string().regex(/^[a-f0-9]{64}$/);
const controlPersona=z.object({userId:z.string().min(1).max(200).refine(v=>v.trim()===v),
  cookie:z.string().min(1).max(8192).refine(v=>!/[\r\n]/.test(v)),
  handle:z.string().min(1).max(200).refine(v=>v.trim()===v)}).strict();
const controlAuthority=z.object({runId,commit,owned:z.literal(true),database:z.string(),
  port:z.number().int().min(56000).max(60999),containerId:controlHash,
  imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),
  contextHost:z.string().min(1).max(1024).refine(v=>!/[\x00-\x1f\x7f]/.test(v))}).strict();
const livePersonaSchema=z.object({userId:controlPersona.shape.userId,accountId:controlUuid,handle:controlPersona.shape.handle,
  accountRevision:controlPositive,status:z.enum(['active','suspended','pending_deletion','deleted']),
  publicProfile:z.boolean(),guidesPublic:z.boolean(),guidesContentRevision:controlNat}).strict();
const liveGuideSchema=z.object({id:controlUuid,accountId:controlUuid,category:z.literal('guides'),
  title:ownerCollectionDtoSchema.shape.title,description:controlText().nullable(),
  slug:z.string().min(1).max(200).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),displayOrder:controlNat,
  revision:controlPositive,categoryContentRevision:controlPositive,visibility:z.enum(['public','private']),
  publicationState:z.enum(['draft','published']),pinOrder:controlNat.nullable(),archivedAt:controlTime.nullable(),
  details:guideCollectionDetailsSchema.nullable()}).strict();
const liveSectionSchema=z.object({id:controlUuid,collectionId:controlUuid,accountId:controlUuid,
  title:guideSectionDtoSchema.shape.title,description:guideSectionDtoSchema.shape.description,
  displayOrder:controlNat.max(199),blocks:guideSectionBlocksSchema,archivedAt:controlTime.nullable(),
  createdAt:controlTime,updatedAt:controlTime}).strict();
const liveMediaSchema=z.object({id:controlUuid,accountId:controlUuid,purpose:z.enum(['collection','guide']),
  status:z.enum(['uploading','ready','pending_delete','deleted','failed']),mimeType:controlText(128),byteLength:controlNat,
  sha256:controlHash.nullable(),originalFilename:controlText().nullable(),width:controlPositive.nullable(),
  height:controlPositive.nullable(),alternativeText:controlText().nullable(),caption:controlText().nullable(),
  readyAt:controlTime.nullable(),deletedAt:controlTime.nullable()}).strict().refine(v=>
    (v.width===null)===(v.height===null)&&(v.status!=='ready'||v.sha256!==null));
const liveObjectSchema=z.object({mediaId:controlUuid,accountId:controlUuid,variant:z.enum(['original','thumbnail','display']),
  environment:z.enum(['local','qa','prod']),key:controlText(1024),mimeType:controlText(128),byteLength:controlNat,
  sha256:controlHash,storageVersionId:controlText().nullable(),deletedAt:controlTime.nullable()}).strict();
class ControlOverflow extends Error {}
function controlInteger(value:unknown,positive=false):number {
  if(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)){
    const n=BigInt(value);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Invalid stored integer');value=Number(n);
  }
  return (positive?controlPositive:controlNat).parse(value);
}
function controlDate(value:unknown):string|null {
  if(value===null)return null;
  return controlTime.parse(value instanceof Date?value.toISOString():value);
}
function controlDigest(value:unknown):string|null {
  return value===null?null:controlHash.parse(Buffer.isBuffer(value)?value.toString('hex'):value);
}
function controlUnique(rows:ControlRow[],field:string){
  const keys=rows.map(r=>r[field]);if(new Set(keys).size!==keys.length)throw new Error('Duplicate stored identity');
}
function controlSort<T extends object>(rows:T[],fields:(keyof T)[]):T[]{
  return rows.sort((a,b)=>{for(const field of fields){const x=a[field]??'',y=b[field]??'';
    const order=typeof x==='number'&&typeof y==='number'?x-y:String(x)<String(y)?-1:String(x)>String(y)?1:0;
    if(order)return order;}return 0;});
}
function controlCleanupError(unsettled:boolean,failures:Iterable<CleanupFailure>):Error {
  const selected=new Set(failures);
  return Object.assign(new Error('Guides control cleanup failed'),{name:'GuidesControlCleanupError',
    code:'GUIDES_CONTROL_CLEANUP_FAILED',unsettled,
    failures:(['listener','drain','authority','custody','storage'] as const).filter(v=>selected.has(v))});
}
function controlRecord(value:unknown):ControlRow {
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid control interface');
  return value as ControlRow;
}
function controlMethods(value:unknown,names:string[]):void {
  const record=controlRecord(value);if(names.some(name=>typeof record[name]!=='function'))throw new Error('Incomplete control interface');
}
function controlOptions(options:ControlOptions,dependencies?:ControlDependencies):void {
  const data=controlRecord(options);
  const keys=['pool','composed','config','runId','commit','authority','personas','expectedTemporaryRoot','disposableDirectory','storage','port','apiOrigin'];
  if(Object.keys(data).length!==keys.length||keys.some(k=>!(k in data)))throw new Error('Invalid control options');
  runId.parse(options.runId);commit.parse(options.commit);controlAuthority.parse(options.authority);
  if(options.authority.runId!==options.runId||options.authority.commit!==options.commit||
    options.authority.database!==`music_uat_${options.runId}`)throw new Error('Invalid control authority');
  z.object({ownerA:controlPersona,ownerB:controlPersona,ownerC:controlPersona}).strict().parse(options.personas);
  for(const field of ['userId','handle'] as const)if(new Set(controlOwners.map(o=>options.personas[o][field])).size!==3)throw new Error('Duplicate persona');
  z.object({directory:z.string(),instance:z.unknown()}).strict().parse(options.storage);
  controlMethods(options.storage.instance,['putOwned','get','delete']);
  if(options.storage.instance.environment!=='local')throw new Error('Invalid storage environment');
  assertGuidesStoragePath(options.storage.directory,options.expectedTemporaryRoot);
  if(nativePath.dirname(options.storage.directory)!==options.disposableDirectory)throw new Error('Invalid disposable directory');
  z.number().int().min(1024).max(65535).parse(options.port);
  const origin=new URL(options.apiOrigin);
  if(options.apiOrigin!==`http://127.0.0.1:${origin.port}`||Number(origin.port)<1024||Number(origin.port)>65535||
    options.apiOrigin===`http://127.0.0.1:${options.port}`)throw new Error('Invalid API origin');
  controlMethods(options.pool,['query','connect']);
  const composed=controlRecord(options.composed);controlRecord(composed.auth);
  const config=controlRecord(options.config);
  if(typeof config.baseURL!=='string'||typeof config.secret!=='string'||config.secret.length===0)throw new Error('Invalid auth configuration');
  if(dependencies!==undefined){
    const d=controlRecord(dependencies);
    if(Object.keys(d).length!==4||typeof d.createServer!=='function'||typeof d.fetch!=='function')throw new Error('Incomplete dependencies');
    controlMethods(d.fs,['lstat','realpath','mkdir']);
    controlMethods(d.guideRepository,['writeGuideDetails','createGuideSection','attachGuideCover','readGuideDetails']);
  }
}

export async function startGuidesControl(options:ControlOptions,dependencies?:ControlDependencies):Promise<ControlHandle> {
  controlOptions(options,dependencies);
  const deps=dependencies??{fs:await import('node:fs/promises'),createServer:(await import('node:http')).createServer,
    fetch:globalThis.fetch,guideRepository:await import('../server/repositories/guideRepository')};
  const {pool,storage,config}=options,host=`127.0.0.1:${options.port}`,capability=randomBytes(32).toString('hex');
  let currentGeneration=0,active:z.infer<typeof identitySchema>|null=null,busy=false,terminal=false,closing=false,
    cleanupExpired=false,attempts=0,unresolved=false;
  let server:ReturnType<ControlDependencies['createServer']>|undefined,closePromise:Promise<void>|undefined;
  const pending=new Set<Promise<unknown>>(),admitted=new Set<Promise<unknown>>(),failures=new Set<CleanupFailure>(),ledger:ControlLedger[]=[];
  const custody=new Map<string,{dev:number|bigint;ino:number|bigint}>();
  const bindings={} as ControlThree<z.infer<typeof personaBinding>>;
  const fence=()=>{if(terminal||closing)throw new Error('Control unavailable');};
  function tracked<T>(promise:Promise<T>):Promise<T>{
    pending.add(promise);void promise.then(()=>pending.delete(promise),()=>pending.delete(promise));return promise;
  }
  async function bounded<T>(promise:Promise<T>,ms:number,onTimeout:()=>void):Promise<T>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(new Error('Control deadline'));},ms);});
    try{return await Promise.race([promise,deadline]);}finally{clearTimeout(timer);}
  }
  async function step<T>(promise:Promise<T>,cleanup=false):Promise<T>{const result=await tracked(promise);
    if(cleanup){if(cleanupExpired)throw new Error('Cleanup admission expired');}else fence();return result;}
  async function query(db:PoolClient,sql:string,values:unknown[]=[]){return step(db.query(sql,values));}
  async function acquire():Promise<PoolClient>{
    const promise=tracked(pool.connect());
    void promise.then(client=>{if(terminal||closing)client.release(true);},()=>undefined);
    const client=await bounded(promise,controlAdmissionMs,()=>{terminal=true;});fence();return client;
  }
  async function checkDatabase(db:PoolClient,cleanup=false){
    const rows=(cleanup?await tracked(db.query('SELECT current_database() AS database')):await query(db,'SELECT current_database() AS database')).rows;
    if(rows.length!==1||rows[0].database!==options.authority.database)throw new Error('Database authority changed');
  }
  async function checkBindings(db:PoolClient,security=false,cleanup=false):Promise<ControlRow[]> {
    const sql=`SELECT b.user_id,b.account_id,a.handle,a.revision AS account_revision,a.status,a.public_profile,
      s.is_public AS guides_public,coalesce(cs.revision,0)::text AS guides_content_revision${security?',u.blocked_at':''}
      FROM initial_account_bindings b JOIN creator_accounts a ON a.id=b.account_id
      JOIN account_category_settings s ON s.account_id=a.id AND s.category='guides'
      LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='guides'
      ${security?'JOIN user_security_state u ON u.user_id=b.user_id':''} WHERE b.user_id=ANY($1::text[])`;
    const values=[controlOwners.map(o=>options.personas[o].userId)];
    const rows=(cleanup?await tracked(db.query(sql,values)):await query(db,sql,values)).rows as ControlRow[];
    if(rows.length!==3)throw new Error('Account authority changed');
    for(const owner of controlOwners){const p=bindings[owner],row=rows.find(r=>r.user_id===p.userId);
      if(!row||row.account_id!==p.accountId||(security&&(row.status!=='active'||row.blocked_at!==null)))throw new Error('Account authority changed');}
    controlUnique(rows,'account_id');return rows;
  }
  async function statPath(path:string,kind:'directory'|'file',remember=false,absent=false,cleanup=false):Promise<boolean>{
    let stat:Awaited<ReturnType<ControlDependencies['fs']['lstat']>>;
    try{stat=await step(deps.fs.lstat(path),cleanup);}catch(error){
      if(absent&&controlRecord(error).code==='ENOENT')return false;throw error;
    }
    if(stat.isSymbolicLink()||!(kind==='directory'?stat.isDirectory():stat.isFile())||await step(deps.fs.realpath(path),cleanup)!==path)throw new Error('Storage custody changed');
    const old=custody.get(path);
    if(old&&(old.dev!==stat.dev||old.ino!==stat.ino))throw new Error('Storage identity changed');
    if(remember&&!old)custody.set(path,{dev:stat.dev,ino:stat.ino});return true;
  }
  async function directoryChain(path:string,remember=false,cleanup=false){
    const chain=[path];while(chain[0]!==nativePath.parse(chain[0]).root)chain.unshift(nativePath.dirname(chain[0]));
    for(const part of chain)await statPath(part,'directory',remember,false,cleanup);
  }
  async function makeDirectory(path:string){
    try{await step(deps.fs.mkdir(path,{recursive:false,mode:0o700}));}
    catch(error){if(controlRecord(error).code!=='EEXIST')throw error;}
    await statPath(path,'directory',true);
  }
  async function keyCustody(entry:ControlLedger,operation:'put'|'get'|'delete',cleanup=false){
    try{
      await directoryChain(options.disposableDirectory,false,cleanup);await statPath(storage.directory,'directory',false,false,cleanup);
      let parent=storage.directory;
      for(const part of ['local',entry.accountId]){parent=nativePath.join(parent,part);
        if(operation==='put'&&!custody.has(parent))await makeDirectory(parent);else await statPath(parent,'directory',false,false,cleanup);}
      const target=nativePath.join(parent,entry.id);
      const exists=await statPath(target,'file',false,true,cleanup);
      if(operation==='put'&&exists||operation==='get'&&!exists)throw new Error('Invalid storage target');
    }catch(error){terminal=true;failures.add('custody');throw error;}
  }
  async function canonical(path:string,cookie:string,init:RequestInit={}):Promise<ControlRow>{
    fence();const abort=new AbortController();
    let wrapperFailed=false;
    const promise=(async()=>{
      let response:Response;
      try{response=await tracked(deps.fetch(`${options.apiOrigin}/api/explorers/v1/${path}`,{...init,
        headers:{Cookie:cookie,...init.headers},redirect:'error',signal:abort.signal}));}
      catch(error){wrapperFailed=true;throw error;}
      fence();if(response.status!==200)throw new Error('Canonical request refused');
      return controlRecord(await step(response.json()));
    })();
    try{return await bounded(promise,10000,()=>{abort.abort();unresolved=true;});}
    catch(error){if(wrapperFailed)unresolved=true;throw error;}
  }
  function accountDto(response:ControlRow){
    const row=controlRecord(response.account);return {id:controlUuid.parse(row.id),revision:controlInteger(row.revision,true)};
  }
  async function stopListener(){
    if(!server)return;
    const target=server;
    try{
      const done=new Promise<void>((resolve,reject)=>{
        target.close(error=>{if(error&&Reflect.get(error,'code')!=='ERR_SERVER_NOT_RUNNING')reject(error);else resolve();});
        target.closeIdleConnections();target.closeAllConnections();
      });await tracked(done);
    }catch{failures.add('listener');}
  }
  async function drain(){
    while(pending.size||admitted.size)await Promise.allSettled([...pending,...admitted]);
    if(unresolved)throw new Error('Unresolved physical work');
  }
  async function cleanup():Promise<void>{
    const work=(async()=>{await Promise.all([stopListener(),drain()]);
      if(cleanupExpired||unresolved||failures.has('custody')||failures.has('storage'))return;
      const leftovers=ledger.filter(e=>!e.removed&&e.settled&&(e.phase==='detached-cleanup'||e.phase==='pending-put'&&e.rollbackKnown));
      if(!leftovers.length)return;
      const acquisition=tracked(pool.connect());
      void acquisition.then(client=>{if(cleanupExpired)client.release(true);},()=>undefined);
      const db=await acquisition;if(cleanupExpired)return;
      let begun=false,destroy=false,commitStarted=false;
      try{
        await step(db.query('BEGIN'),true);begun=true;
        await step(db.query("SET LOCAL statement_timeout='10000ms'"),true);
        await step(db.query("SET LOCAL lock_timeout='5000ms'"),true);
        try{await checkDatabase(db,true);await checkBindings(db,false,true);}
        catch(error){failures.add('authority');throw error;}
        commitStarted=true;await step(db.query('COMMIT'),true);begun=false;
        for(const entry of leftovers)await deleteKey(entry,true);
      }catch{destroy=true;
        if(begun){if(commitStarted)unresolved=true;else try{await step(db.query('ROLLBACK'),true);}catch{unresolved=true;}}
        if(!failures.size)failures.add('authority');
      }finally{db.release(destroy);}
    })();
    try{await bounded(work,controlGraceMs,()=>{cleanupExpired=true;});}
    catch{cleanupExpired=true;failures.add('drain');}
    if(pending.size||admitted.size||unresolved){failures.add('drain');cleanupExpired=true;}
    if(failures.size)throw controlCleanupError(pending.size>0||admitted.size>0||unresolved,failures);
  }
  const close=():Promise<void>=>{if(!closePromise){closing=true;closePromise=cleanup();void closePromise.catch(()=>undefined);}return closePromise;};
  async function revision(db:PoolClient,accountId:string){
    const row=(await query(db,"SELECT coalesce((SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='guides'),0)::text AS revision",[accountId])).rows[0];
    return controlInteger(row?.revision);
  }
  async function snapshot(db:PoolClient,analytics=false){
    const ids=controlOwners.map(o=>bindings[o].accountId);
    const capped=async(sql:string,values:unknown[],cap:number)=>{const rows=(await query(db,sql,values)).rows as ControlRow[];
      if(rows.length>cap)throw new ControlOverflow();return rows;};
    const collections=await capped(`SELECT c.*,coalesce(cs.revision,0)::text AS category_content_revision FROM collections c
      LEFT JOIN account_category_content_state cs ON cs.account_id=c.account_id AND cs.category=c.category
      WHERE c.account_id=ANY($1::uuid[]) AND c.category='guides' LIMIT 257`,[ids],256);
    const sections=await capped(`SELECT s.* FROM guide_sections s JOIN collections c ON c.id=s.collection_id AND c.account_id=s.account_id
      WHERE s.account_id=ANY($1::uuid[]) AND c.category='guides' LIMIT 1025`,[ids],1024);
    const media=await capped("SELECT * FROM media_assets WHERE account_id=ANY($1::uuid[]) AND purpose IN ('collection','guide') LIMIT 257",[ids],256);
    const objects=await capped(`SELECT o.*,a.account_id FROM media_objects o JOIN media_assets a ON a.id=o.media_id
      WHERE a.account_id=ANY($1::uuid[]) AND a.purpose IN ('collection','guide') LIMIT 769`,[ids],768);
    const covers=await capped(`SELECT m.*,c.id AS guide_id FROM collection_media m JOIN collections c ON c.id=m.collection_id AND c.account_id=m.account_id
      WHERE m.account_id=ANY($1::uuid[]) AND c.category='guides' AND m.slot='cover' LIMIT 2049`,[ids],2048);
    const photos=await capped(`SELECT p.*,s.collection_id AS guide_id FROM guide_section_photos p
      JOIN guide_sections s ON s.id=p.section_id AND s.account_id=p.account_id
      JOIN collections c ON c.id=s.collection_id AND c.account_id=s.account_id
      WHERE p.account_id=ANY($1::uuid[]) AND c.category='guides' LIMIT 2049`,[ids],2048);
    if(covers.length+photos.length>2048)throw new ControlOverflow();
    const events=analytics?await capped("SELECT id,account_id,category,collection_id,recommendation_id FROM analytics_events WHERE account_id=ANY($1::uuid[]) AND category='guides' LIMIT 4097",[ids],4096):[];
    for(const collection of collections)if(sections.filter(s=>s.collection_id===collection.id).length>200)throw new ControlOverflow();
    return {collections,sections,media,objects,covers,photos,events};
  }
  async function observeRows(db:PoolClient){
    const accounts=await checkBindings(db),rows=await snapshot(db);
    const personas={} as ControlThree<z.infer<typeof livePersonaSchema>>;
    for(const owner of controlOwners){const p=bindings[owner],r=accounts.find(a=>a.account_id===p.accountId)!;
      personas[owner]=livePersonaSchema.parse({userId:p.userId,accountId:p.accountId,handle:r.handle,
        accountRevision:controlInteger(r.account_revision,true),status:r.status,publicProfile:r.public_profile,
        guidesPublic:r.guides_public,guidesContentRevision:controlInteger(r.guides_content_revision)});}
    for(const [list,field] of [[rows.collections,'id'],[rows.sections,'id'],[rows.media,'id']] as const)controlUnique(list,field);
    const objectKeys=rows.objects.map(o=>JSON.stringify([o.media_id,o.variant]));
    if(new Set(objectKeys).size!==objectKeys.length)throw new Error('Duplicate object primary key');
    const guides=[] as z.infer<typeof liveGuideSchema>[];
    for(const r of rows.collections)guides.push(liveGuideSchema.parse({id:r.id,accountId:r.account_id,category:r.category,
      title:r.title,description:r.description,slug:r.slug,displayOrder:controlInteger(r.display_order),revision:controlInteger(r.revision,true),
      categoryContentRevision:controlInteger(r.category_content_revision,true),visibility:r.visibility,publicationState:r.publication_state,
      pinOrder:r.pin_order===null?null:controlInteger(r.pin_order),archivedAt:controlDate(r.archived_at),
      details:await step(deps.guideRepository.readGuideDetails(db,controlUuid.parse(r.id),controlUuid.parse(r.account_id)))}));
    const sections=rows.sections.map(r=>{
      if(r.block_version!=='guide-section-blocks/v1')throw new Error('Unsupported blocks');
      controlText().nullable().parse(r.description);
      return liveSectionSchema.parse({id:r.id,collectionId:r.collection_id,accountId:r.account_id,title:r.title,description:r.description,
        displayOrder:controlInteger(r.display_order),blocks:r.blocks,archivedAt:controlDate(r.archived_at),createdAt:controlDate(r.created_at),updatedAt:controlDate(r.updated_at)});
    });
    const media=rows.media.map(r=>liveMediaSchema.parse({id:r.id,accountId:r.account_id,purpose:r.purpose,status:r.status,
      mimeType:r.mime_type,byteLength:controlInteger(r.byte_size),sha256:controlDigest(r.content_sha256),originalFilename:r.original_filename,
      width:r.width_px===null?null:controlInteger(r.width_px,true),height:r.height_px===null?null:controlInteger(r.height_px,true),
      alternativeText:r.alternative_text,caption:r.caption,readyAt:controlDate(r.ready_at),deletedAt:controlDate(r.deleted_at)}));
    const objects=rows.objects.map(r=>liveObjectSchema.parse({mediaId:r.media_id,accountId:r.account_id,variant:r.variant,
      environment:r.storage_environment,key:r.object_key,mimeType:r.mime_type,byteLength:controlInteger(r.byte_size),
      sha256:controlDigest(r.content_sha256),storageVersionId:r.storage_version_id,deletedAt:controlDate(r.deleted_at)}));
    const attachments:z.infer<typeof manifestAttachment>[]=[
      ...rows.covers.map(r=>manifestAttachment.parse({slot:'cover',guideId:r.guide_id,accountId:r.account_id,mediaId:r.media_id})),
      ...rows.photos.map(r=>manifestAttachment.parse({slot:'section-photo',guideId:r.guide_id,sectionId:r.section_id,accountId:r.account_id,mediaId:r.media_id}))];
    const attachmentKeys=attachments.map(r=>JSON.stringify([r.slot,r.guideId,'sectionId'in r?r.sectionId:null,r.mediaId]));
    if(new Set(attachmentKeys).size!==attachmentKeys.length)throw new Error('Duplicate attachment');
    for(const s of sections){const g=guides.find(g=>g.id===s.collectionId);
      if(!g||g.accountId!==s.accountId)throw new Error('Dangling section');
      const ids=new Set([...s.blocks.timeline.morning,...s.blocks.timeline.afternoon,...s.blocks.timeline.evening,
        ...s.blocks.stay.accommodations,...s.blocks.activities.activities].flatMap(p=>p.photos.map(p=>p.mediaId)));
      const registered=attachments.filter(r=>r.slot==='section-photo'&&r.sectionId===s.id).map(r=>r.mediaId);
      if(ids.size!==registered.length||registered.some(id=>!ids.has(id)))throw new Error('Photo registry mismatch');}
    for(const a of attachments){const g=guides.find(g=>g.id===a.guideId),m=media.find(m=>m.id===a.mediaId);
      if(!g||!m||g.accountId!==a.accountId||m.accountId!==a.accountId||
        a.slot==='section-photo'&&!sections.some(s=>s.id===a.sectionId&&s.collectionId===a.guideId&&s.accountId===a.accountId))throw new Error('Dangling attachment');}
    for(const o of objects)if(!media.some(m=>m.id===o.mediaId&&m.accountId===o.accountId))throw new Error('Dangling object');
    return {personas,guides:controlSort(guides,['accountId','displayOrder','id']),sections:controlSort(sections,['accountId','collectionId','displayOrder','id']),
      media:controlSort(media,['accountId','id']),objects:controlSort(objects,['accountId','mediaId','variant','environment']),
      attachments:controlSort(attachments,['accountId','guideId','slot','mediaId']).sort((a,b)=>{
        const fields=[a.accountId,a.guideId,a.slot,'sectionId'in a?a.sectionId:'',a.mediaId],other=[b.accountId,b.guideId,b.slot,'sectionId'in b?b.sectionId:'',b.mediaId];
        for(let i=0;i<fields.length;i++)if(fields[i]!==other[i])return fields[i]<other[i]?-1:1;return 0;})};
  }
  function serialized(value:unknown){const json=JSON.stringify(value);if(Buffer.byteLength(json)>controlResponseBytes)throw new ControlOverflow();return json;}
  async function begin(db:PoolClient,readOnly=false){
    await query(db,readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
    await query(db,"SET LOCAL statement_timeout='10000ms'");await query(db,"SET LOCAL lock_timeout='5000ms'");
    await checkDatabase(db);
  }
  async function retire(db:PoolClient,entry:ControlLedger):Promise<boolean>{
    const assets=(await query(db,'SELECT * FROM media_assets WHERE id=$1 FOR UPDATE',[entry.id])).rows;
    const objects=(await query(db,'SELECT o.*,a.account_id FROM media_objects o JOIN media_assets a ON a.id=o.media_id WHERE o.media_id=$1 FOR UPDATE OF o',[entry.id])).rows;
    const asset=assets[0],object=objects[0];
    if(assets.length!==1||objects.length!==1||asset.account_id!==entry.accountId||asset.purpose!==entry.purpose||asset.status!=='ready'||
      asset.deleted_at!==null||!object||object.variant!=='original'||object.storage_environment!=='local'||object.object_key!==entry.key||object.account_id!==entry.accountId||object.deleted_at!==null)return false;
    let referenced=false;
    for(const surface of controlSurfaces)if((await query(db,`SELECT media_id FROM ${surface} WHERE media_id=$1 LIMIT 1`,[entry.id])).rows.length)referenced=true;
    if(referenced)return false;
    await query(db,"DELETE FROM media_objects WHERE media_id=$1 AND variant='original' AND storage_environment='local' AND object_key=$2",[entry.id,entry.key]);
    await query(db,"DELETE FROM media_assets WHERE id=$1 AND account_id=$2 AND purpose=$3 AND status='ready'",[entry.id,entry.accountId,entry.purpose]);
    return true;
  }
  async function deleteKey(entry:ControlLedger,cleanup=false){
    if(cleanupExpired)throw new Error('Cleanup admission expired');
    await keyCustody(entry,'delete',cleanup);
    try{await step(storage.instance.delete(entry.key),cleanup);entry.removed=true;}
    catch(error){terminal=true;unresolved=true;failures.add('storage');throw error;}
  }
  async function reset(command:ControlCommand):Promise<string>{
    const db=await acquire(),allocated:ControlLedger[]=[],retired:ControlLedger[]=[];
    let begun=false,commitStarted=false,committed=false,destroy=false;
    const next=currentGeneration+1,plan=buildGuidesSeedPlan(command.caseId),
      result:GuidesManifest={version:1,runId:options.runId,commit:options.commit,caseId:command.caseId,project:command.project,repeat:0,generation:next,
        personas:{} as GuidesManifest['personas'],guides:[],sections:[],media:[],attachments:[],
        expectedPublic:{eligibleGuideIds:[],selectedGuideId:null,orderedSectionIds:[],roleMediaIds:{},traversal:null}};
    try{
      begun=true;await begin(db);await checkBindings(db,true);
      const old=await snapshot(db,true),ids=controlOwners.map(o=>bindings[o].accountId);
      const refs=selectOwnedGuidesResetReferences({runId:options.runId,commit:options.commit,
        collections:old.collections.map(r=>({id:r.id,accountId:r.account_id,category:r.category})),
        analytics:old.events.map(r=>({id:r.id,accountId:r.account_id,category:r.category,collectionId:r.collection_id,recommendationId:r.recommendation_id})),
        media:old.media.map(r=>({id:r.id,accountId:r.account_id,purpose:r.purpose,status:r.status})),
        objects:old.objects.map(r=>({mediaId:r.media_id,accountId:r.account_id,variant:r.variant,environment:r.storage_environment,key:r.object_key}))},
        {runId:options.runId,commit:options.commit,personas:Object.fromEntries(controlOwners.map(o=>[o,{userId:bindings[o].userId,accountId:bindings[o].accountId}])),
          trackedMedia:ledger.filter(e=>e.phase==='committed'&&!e.removed).map(({id,accountId,purpose,variant,environment,key})=>({id,accountId,purpose,variant,environment,key}))});
      if(refs.analyticsIds.length){
        await query(db,'UPDATE analytics_event_receipts SET event_id=NULL,retired_at=coalesce(retired_at,clock_timestamp()) WHERE event_id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])',[refs.analyticsIds,ids]);
        await query(db,'DELETE FROM analytics_events WHERE id=ANY($1::uuid[]) AND account_id=ANY($2::uuid[])',[refs.analyticsIds,ids]);}
      await query(db,"DELETE FROM collections WHERE account_id=ANY($1::uuid[]) AND category='guides'",[ids]);
      for(const owner of controlOwners){const p=bindings[owner];
        await query(db,"UPDATE creator_accounts SET public_profile=true,handle=$2,account_type='Creator',onboarding_status='complete' WHERE id=$1",[p.accountId,p.handle]);
        await query(db,"UPDATE account_category_settings SET is_public=true WHERE account_id=$1 AND category='guides'",[p.accountId]);}
      for(const entry of ledger.filter(e=>e.phase==='committed'&&!e.removed))if(await retire(db,entry))retired.push(entry);
      const fixtureBytes:Partial<Record<keyof typeof knownGuideFixtures,Buffer>>={};
      for(const role of plan.mediaRoles){const fixture=role.key==='replacement-cover'?'replacement-cover':role.key==='activity-import'?'activity-import':'old-cover';
        fixtureBytes[fixture]=controlFixtureBytes(fixture);}
      const roles=plan.mediaRoles.filter(r=>r.key!=='activity-import');
      if(ledger.length+roles.length>256)throw new Error('Ledger budget exhausted');
      for(const role of roles){const id=randomUUID(),accountId=bindings[role.owner].accountId,key=`local/${accountId}/${id}`,
        fixtureId=role.key==='replacement-cover'?'replacement-cover':'old-cover',bytes=fixtureBytes[fixtureId]!,known=knownGuideFixtures[fixtureId];
        const entry:ControlLedger={id,accountId,purpose:role.purpose,variant:'original',environment:'local',key,phase:'pending-put',settled:false,removed:false,rollbackKnown:false};
        ledger.push(entry);allocated.push(entry);await keyCustody(entry,'put');fence();
        const put=storage.instance.putOwned(key,bytes,5000);tracked(put.nativeResult);tracked(put.settlement);
        void put.settlement.then(()=>{entry.settled=true;},()=>undefined);
        await step(put.completion);
        await query(db,"INSERT INTO media_assets(id,account_id,purpose,status,mime_type,byte_size,content_sha256,width_px,height_px,ready_at) VALUES($1,$2,$3,'ready',$4,$5,$6,8,8,now())",[id,accountId,role.purpose,known.mimeType,known.byteLength,Buffer.from(known.sha256,'hex')]);
        await query(db,"INSERT INTO media_objects(media_id,variant,storage_environment,object_key,mime_type,byte_size,content_sha256) VALUES($1,'original','local',$2,$3,$4,$5)",[id,key,known.mimeType,known.byteLength,Buffer.from(known.sha256,'hex')]);
        result.media.push({key:role.key,id,accountId,purpose:role.purpose,status:'ready',variant:'original',environment:'local',keyPath:key,
          mimeType:known.mimeType,byteLength:known.byteLength,sha256:known.sha256,contentUrl:`/api/explorers/v1/media/${id}/content`,fixtureId});}
      for(const seed of plan.guides){const {owner,...properties}=seed,accountId=bindings[owner].accountId;
        const row=(await query(db,`INSERT INTO collections(account_id,category,title,slug,display_order,visibility,publication_state,archived_at)
          VALUES($1,'guides',$2,$3,$4,$5,$6,$7) RETURNING id,revision`,[accountId,seed.title,seed.slug,seed.displayOrder,seed.visibility,seed.publicationState,seed.archived?new Date():null])).rows[0];
        const id=controlUuid.parse(row?.id);
        await step(deps.guideRepository.writeGuideDetails(db,id,accountId,await revision(db,accountId),seed.details));
        result.guides.push({...properties,id,accountId,category:'guides',collectionRevision:controlInteger(row.revision,true),categoryContentRevision:1});}
      for(const seed of plan.sections){const parent=result.guides.find(g=>g.key===seed.guideKey)!;
        const patched=structuredClone(seed.blocks);
        for(const binding of plan.photoBindings.filter(b=>b.sectionKey===seed.key)){const media=result.media.find(m=>m.key===binding.roleKey)!;
          const photo=guideActivityPhotoSchema.parse({mediaId:media.id,fileName:`${binding.roleKey}.png`,width:8,height:8,aspectRatio:'1:1'});
          if(binding.block==='timeline.morning')patched.timeline.morning[binding.entryIndex].photos=[photo];
          else patched.stay.accommodations[binding.entryIndex].photos=[photo];}
        const id=await step(deps.guideRepository.createGuideSection(db,parent.id,parent.accountId,await revision(db,parent.accountId),
          {title:seed.title,description:seed.description,blocks:patched,position:seed.displayOrder}));
        const {guideKey,...properties}=seed;
        result.sections.push({...properties,blocks:patched,id:controlUuid.parse(id),collectionId:parent.id,accountId:parent.accountId});
        const photoIds=new Set([...patched.timeline.morning,...patched.timeline.afternoon,...patched.timeline.evening,...patched.stay.accommodations,...patched.activities.activities].flatMap(p=>p.photos.map(p=>p.mediaId)));
        for(const mediaId of photoIds)result.attachments.push({slot:'section-photo',guideId:parent.id,sectionId:id,accountId:parent.accountId,mediaId});}
      for(const role of ['old-cover','independent-cover']){const media=result.media.find(m=>m.key===role);if(!media)continue;
        const parent=result.guides.find(g=>g.key===(role==='old-cover'?'ownerA-guide-0':'ownerB-guide-0'))!;
        await step(deps.guideRepository.attachGuideCover(db,parent.id,parent.accountId,await revision(db,parent.accountId),media.id));
        result.attachments.push({slot:'cover',guideId:parent.id,accountId:parent.accountId,mediaId:media.id});}
      commitStarted=true;await tracked(db.query('COMMIT'));committed=true;
      for(const entry of allocated)entry.phase='committed';for(const entry of retired)entry.phase='detached-cleanup';fence();
      for(const entry of retired)await deleteKey(entry);
      const live=await observeRows(db);
      if(live.guides.length!==result.guides.length||live.sections.length!==result.sections.length)throw new Error('Seed scope changed');
      for(const guide of result.guides){const row=live.guides.find(g=>g.id===guide.id);if(!row||!row.details)throw new Error('Seed readback missing');
        Object.assign(guide,{accountId:row.accountId,category:row.category,title:row.title,slug:row.slug,displayOrder:row.displayOrder,
          visibility:row.visibility,publicationState:row.publicationState,archived:row.archivedAt!==null,details:row.details,
          collectionRevision:row.revision,categoryContentRevision:row.categoryContentRevision});}
      for(const section of result.sections){const row=live.sections.find(s=>s.id===section.id);if(!row)throw new Error('Seed section missing');
        Object.assign(section,{collectionId:row.collectionId,accountId:row.accountId,title:row.title,description:row.description,
          displayOrder:row.displayOrder,blocks:row.blocks,archived:row.archivedAt!==null});}
      result.attachments=live.attachments;
      for(const entry of allocated){await keyCustody(entry,'get');let bytes:Buffer;
        try{bytes=await step(storage.instance.get(entry.key));}catch(error){unresolved=true;failures.add('storage');throw error;}
        const expected=result.media.find(m=>m.id===entry.id)!,assets=live.media.filter(m=>m.id===entry.id),
          objects=live.objects.filter(o=>o.mediaId===entry.id),asset=assets[0],object=objects[0];
        if(!Buffer.isBuffer(bytes)||bytes.length!==expected.byteLength||createHash('sha256').update(bytes).digest('hex')!==expected.sha256||
          assets.length!==1||!asset||asset.accountId!==entry.accountId||asset.purpose!==entry.purpose||asset.status!=='ready'||asset.deletedAt!==null||
          asset.mimeType!==expected.mimeType||asset.byteLength!==expected.byteLength||asset.sha256!==expected.sha256||
          objects.length!==1||!object||object.accountId!==entry.accountId||object.variant!=='original'||object.environment!=='local'||
          object.mimeType!==expected.mimeType||object.byteLength!==expected.byteLength||object.sha256!==expected.sha256||
          object.key!==entry.key||object.deletedAt!==null)throw new Error('Seed bytes mismatch');}
      const context=await step(options.composed.auth.$context),sessions={} as ControlThree<{cookie:string}>;
      for(const owner of controlOwners){const p=bindings[owner],observed=live.personas[owner];
        const session=await step(context.internalAdapter.createSession(p.userId,false));if(!session)throw new Error('Missing private session');
        const signature=createHmac('sha256',config.secret).update(session.token).digest('base64'),cookie=`${context.authCookies.sessionToken.name}=${session.token}.${signature}`;
        const dto=accountDto(await canonical('me',cookie));
        if(dto.id!==p.accountId||dto.revision!==observed.accountRevision)throw new Error('Session verification failed');
        sessions[owner]={cookie};result.personas[owner]={...p,accountRevision:dto.revision};}
      const eligible=result.guides.filter(g=>g.accountId===bindings.ownerA.accountId&&g.visibility==='public'&&g.publicationState==='published'&&!g.archived);
      const selected=plan.traversal?result.guides.find(g=>g.key===plan.traversal!.selectedGuideKey)!:null;
      result.expectedPublic={eligibleGuideIds:eligible.map(g=>g.id),selectedGuideId:selected?.id??null,
        orderedSectionIds:selected?result.sections.filter(s=>s.collectionId===selected.id).map(s=>s.id):[],
        roleMediaIds:Object.fromEntries(plan.mediaRoles.map(r=>[r.key,r.key==='activity-import'?null:result.media.find(m=>m.key===r.key)!.id])),
        traversal:plan.traversal?traversalSchema.parse({guideCount:53,sectionCount:53,publicDetail:plan.traversal.publicDetail,publicCategory:plan.traversal.publicCategory,
          ownerSections:{limit:GUIDE_SECTION_PAGE_LIMIT,lengths:[20,20,13],requests:[{},{after:19},{after:39}],cursors:[19,39,null],wireCursors:['19','39',null]}}):null};
      const manifest=guidesManifestSchema.parse({expected:{version:1,runId:options.runId,commit:options.commit,
        caseId:command.caseId,project:command.project,repeat:0,generation:next,personas:bindings},manifest:result,fixtureBytes});
      const response=serialized({...command,version:1,action:'reset',generation:next,manifest,sessions});fence();
      currentGeneration=next;active={caseId:command.caseId,project:command.project,repeat:0,generation:next};return response;
    }catch(error){
      if(commitStarted){terminal=true;if(!committed){destroy=true;unresolved=true;}}
      else if(begun){
        try{await tracked(db.query('ROLLBACK'));for(const entry of allocated)entry.rollbackKnown=true;}
        catch{terminal=true;destroy=true;unresolved=true;}
        if(!terminal&&!closing){
          try{await bounded(Promise.all([...pending]),controlGraceMs,()=>{terminal=true;unresolved=true;});
            for(const entry of allocated){if(!entry.settled)throw new Error('Unsettled put');await deleteKey(entry);}}
          catch{terminal=true;}
        }
      }
      throw error;
    }finally{db.release(destroy);}
  }
  async function observe(command:ControlCommand):Promise<string>{
    const db=await acquire();let begun=false,ended=false,commitStarted=false;
    try{begun=true;await begin(db,true);const rows=await observeRows(db),response=serialized({...command,...rows});
      commitStarted=true;await query(db,'COMMIT');ended=true;return response;
    }catch(error){if(commitStarted&&!ended){terminal=true;unresolved=true;}
      else if(begun&&!ended)try{await tracked(db.query('ROLLBACK'));}catch{terminal=true;unresolved=true;}
      throw error;}finally{db.release(terminal);}
  }
  const listener:import('node:http').RequestListener=(request,response)=>{
    const send=(status:number,json:string)=>{if(response.writableEnded)return;
      response.statusCode=status;response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.end(json);};
    const error=(status:number,kind:string)=>send(status,JSON.stringify({version:1,error:kind}));
    void (async()=>{
      let body:ControlCommand;
      try{
        const value=request.headers['x-guides-capability'];
        if(typeof value!=='string'||value!==capability||request.headers.host!==host||request.socket.remoteAddress!=='127.0.0.1'||
          request.method!=='POST'||request.url!=='/control')throw new Error('Denied');
        const headers=request.rawHeaders.filter((_,i)=>i%2===0).filter(h=>h.toLowerCase()==='x-guides-capability');
        if(headers.length!==1)throw new Error('Denied');
        const chunks:Buffer[]=[];let length=0;for await(const chunk of request){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);length+=bytes.length;
          if(length>4096)throw new Error('Denied');chunks.push(bytes);}
        body=bodySchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        // Validate authority independently of admission/generation so malformed
        // credentials stay denied even when closed or stale.
        envelopeSchema.parse({remote:request.socket.remoteAddress,host:request.headers.host,expectedHost:host,method:request.method,path:request.url,
          capability:value,expectedCapability:capability,runId:options.runId,expectedRunId:options.runId,commit:options.commit,expectedCommit:options.commit,
          currentGeneration,active,body});
        if(body.runId!==options.runId||body.commit!==options.commit)throw new Error('Denied');
      }catch{error(403,'denied');return;}
      if(busy||closing||terminal||body.generation!==currentGeneration||body.action==='reset'&&attempts>=64){error(409,'unavailable');return;}
      try{validateGuidesControl({remote:'127.0.0.1',host,expectedHost:host,method:'POST',path:'/control',capability,expectedCapability:capability,
        runId:options.runId,expectedRunId:options.runId,commit:options.commit,expectedCommit:options.commit,currentGeneration,active,body});}
      catch{error(409,'unavailable');return;}
      busy=true;if(body.action==='reset'){attempts++;active=null;}
      const operation=body.action==='reset'?reset(body):observe(body);
      admitted.add(operation);void operation.then(()=>admitted.delete(operation),()=>admitted.delete(operation));
      try{const json=await bounded(operation,controlAdmissionMs,()=>{terminal=true;unresolved=true;});fence();send(200,json);}
      catch(e){error(body.action==='observe'&&e instanceof ControlOverflow?413:500,body.action==='observe'&&e instanceof ControlOverflow?'overflow':'resource-failure');}
      finally{busy=false;}
    })().catch(()=>error(500,'resource-failure'));
  };
  async function startup(){
    await directoryChain(options.expectedTemporaryRoot,true);await directoryChain(options.disposableDirectory,true);await makeDirectory(storage.directory);
    const db=await acquire();
    try{
      await checkDatabase(db);
      for(const owner of controlOwners){const p=options.personas[owner],dto=accountDto(await canonical('me',p.cookie));
        if(controlOwners.some(o=>bindings[o]?.accountId===dto.id))throw new Error('Duplicate account');
        const rows=(await query(db,'SELECT user_id,account_id FROM initial_account_bindings WHERE user_id=$1',[p.userId])).rows;
        if(rows.length!==1||rows[0].user_id!==p.userId||rows[0].account_id!==dto.id)throw new Error('Invalid binding');
        const completed=accountDto(await canonical('account',p.cookie,{method:'PATCH',headers:{Origin:config.baseURL,'Content-Type':'application/json','Idempotency-Key':randomUUID()},
          body:JSON.stringify({expectedRevision:dto.revision,handle:p.handle,displayName:`Guides ${owner}`,accountType:'Creator',onboardingStatus:'complete'})}));
        if(completed.id!==dto.id)throw new Error('Account changed');bindings[owner]={userId:p.userId,accountId:dto.id,handle:p.handle};}
    }finally{db.release();}
    fence();server=deps.createServer({maxHeaderSize:8192},listener);server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=1000;
    const target=server;
    target.on('error',()=>{terminal=true;failures.add('listener');});
    const listening=new Promise<void>((resolve,reject)=>{
      target.once('error',reject);target.once('listening',()=>{if(terminal||closing)void stopListener();resolve();});target.listen(options.port,'127.0.0.1');});
    await step(listening);fence();
    return {version:1 as const,url:`http://${host}/control`,capability,runId:options.runId,commit:options.commit,close};
  }
  try{return await bounded(startup(),controlAdmissionMs,()=>{terminal=true;});}
  catch(error){terminal=true;closing=true;try{await cleanup();}catch(cleanupError){throw cleanupError;}throw new Error('Guides control startup failed');}
}

const identitySchema=z.object(identity).strict();
function controlFixtureBytes(id:keyof typeof knownGuideFixtures):Buffer {
  const base64={
    'old-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',
    'replacement-cover':'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',
    'activity-import':'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',
  }[id];return Buffer.from(base64,'base64');
}
