import {createHash, timingSafeEqual} from 'node:crypto';
import * as nativePath from 'node:path';
import {z} from 'zod/v3';
import {guideCollectionDetailsSchema, guideSectionBlocksSchema, guideActivityPhotoSchema, guideSectionDtoSchema, GUIDE_SECTION_LIMIT, GUIDE_SECTION_PAGE_LIMIT, type GuideDayPlace} from '../shared/explorersGuideContract';

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
