import {describe, expect, it} from 'vitest';
import {guideCollectionDetailsSchema, guideSectionBlocksSchema} from '../../../shared/explorersGuideContract';

// Independent title oracle: do not construct request identity from helper exports.
const CASES = [
  'Guides: complete non-ASCII wizard metadata and creator categories survive reload',
  'Guides: retained section editors preserve every untouched block after reload',
  'Guides: stale sections retain drafts and wrong guide owner matches missing',
  'Guides: section reorder deletion and archive preserve exact persisted scope',
  'Guides: complete owner and public guide pages retain every section and filter order',
  'Guides: native cover failure preserves old bytes and fresh retry replaces cover',
  'Guides: native section photo import persists metadata and public views after reload',
  'Guides: publication pin and ancestor withdrawal enforce cold public media access',
] as const;
const PROJECTS = ['guides-desktop', 'guides-mobile'] as const;
const variants = [
  {guides:0, sections:[], roles:[]},
  {guides:1, sections:[1], roles:[]},
  {guides:2, sections:[1,1], roles:[]},
  {guides:2, sections:[4,1], roles:[]},
  {guides:54, sections:[53,...Array(53).fill(0)], roles:[]},
  {guides:1, sections:[1], roles:['old-cover','replacement-cover','independent-cover']},
  {guides:1, sections:[1], roles:['direct-timeline','direct-stay','activity-import']},
  {guides:2, sections:[1,1], roles:['shared-section','sole-withdrawal']},
] as const;
const support = () => import('../../../scripts/guides-browser-support');
const clone = <T>(value:T):T => structuredClone(value);
const runId='b'.repeat(32), commit='c'.repeat(40);
const request = (caseId:string=CASES[0], project:string=PROJECTS[0], action='reset', generation=0) => ({
  remote:'127.0.0.1', host:'127.0.0.1:51000', expectedHost:'127.0.0.1:51000',
  method:'POST', path:'/control', capability:'a'.repeat(64), expectedCapability:'a'.repeat(64),
  runId, expectedRunId:runId, commit, expectedCommit:commit, currentGeneration:generation,
  active:null as null | {caseId:string;project:string;repeat:number;generation:number},
  body:{version:1, action, runId, commit, caseId, project, repeat:0, generation},
});

describe('private Guides fixture boundary: inventory, finite seed plans and pure admission',()=>{
  it('declares the exact independent eight titles, two projects and sixteen unique identities',async()=>{
    const s=await support();
    expect(s.GUIDES_CASES).toEqual(CASES); expect(s.GUIDES_PROJECTS).toEqual(PROJECTS);
    expect(new Set(s.GUIDES_CASES).size).toBe(8); expect(new Set(s.GUIDES_PROJECTS).size).toBe(2);
    const identities=s.GUIDES_CASES.flatMap((caseId:string)=>s.GUIDES_PROJECTS.map((project:string)=>[caseId,project,0]));
    expect(identities).toEqual(CASES.flatMap(caseId=>PROJECTS.map(project=>[caseId,project,0])));
    expect(new Set(identities.map((identity:unknown)=>JSON.stringify(identity))).size).toBe(16);
  });
  it.each(['invented', '', CASES[0]+' renamed'])('rejects unknown seed title %s',async caseId=>{
    const s=await support(); expect(()=>s.buildGuidesSeedPlan(caseId)).toThrow();
  });
  it.each(CASES.map((caseId,index)=>({caseId,index})))('builds fresh complete finite variant $index',async({caseId,index})=>{
    const s=await support(); const plan=s.buildGuidesSeedPlan(caseId), expected=variants[index];
    expect(Object.keys(plan).sort()).toEqual(['caseId','guides','mediaRoles','photoBindings','sections','traversal']);
    expect(plan.caseId).toBe(caseId);
    const own=plan.guides.filter((g:any)=>g.owner==='ownerA');
    expect(own).toHaveLength(expected.guides);
    expect(plan.guides.filter((g:any)=>g.owner==='ownerB')).toHaveLength(1);
    expect(plan.guides.every((g:any)=>['ownerA','ownerB'].includes(g.owner))).toBe(true);
    expect(new Set(plan.guides.map((g:any)=>g.key)).size).toBe(plan.guides.length);
    expect(new Set(plan.sections.map((g:any)=>g.key)).size).toBe(plan.sections.length);
    for(const guide of plan.guides){
      expect(Object.keys(guide).sort()).toEqual(['archived','details','displayOrder','key','owner','publicationState','slug','title','visibility']);
      expect(guideCollectionDetailsSchema.safeParse(guide.details).success).toBe(true);
      expect(guide.details.locationEntityId).toBeNull();
      expect(['public','private']).toContain(guide.visibility);
      expect(['draft','published']).toContain(guide.publicationState);
      expect(typeof guide.archived).toBe('boolean');
      expect(typeof guide.title).toBe('string'); expect(guide.title.length).toBeGreaterThan(0);
    }
    expect(plan.guides.filter((g:any)=>g.archived).map((g:any)=>g.key)).toEqual(index===3?[own[1].key]:[]);
    expect(own.map((g:any)=>g.displayOrder)).toEqual(Array.from({length:expected.guides},(_,i)=>i));
    expect(own.map((g:any)=>plan.sections.filter((section:any)=>section.guideKey===g.key).length)).toEqual(expected.sections);
    for(const section of plan.sections){
      expect(Object.keys(section).sort()).toEqual(['archived','blocks','description','displayOrder','guideKey','key','title']);
      expect(plan.guides.some((g:any)=>g.key===section.guideKey)).toBe(true);
      expect(guideSectionBlocksSchema.safeParse(section.blocks).success).toBe(true);
      expect(typeof section.archived).toBe('boolean');
    }
    for(const guide of plan.guides){
      const sections=plan.sections.filter((section:any)=>section.guideKey===guide.key);
      expect(sections.map((section:any)=>section.displayOrder)).toEqual(sections.map((_:unknown,i:number)=>i));
    }
    expect(plan.sections.filter((section:any)=>plan.guides.find((g:any)=>g.key===section.guideKey)?.owner==='ownerB')).toHaveLength(1);
    for(const binding of plan.photoBindings){
      expect(Object.keys(binding).sort()).toEqual(['block','entryIndex','roleKey','sectionKey']);
      expect(plan.sections.some((section:any)=>section.key===binding.sectionKey)).toBe(true);
      expect(plan.mediaRoles.some((role:any)=>role.key===binding.roleKey)).toBe(true);
      expect(['timeline.morning','stay.accommodations','activities.activities']).toContain(binding.block);
      expect(Number.isSafeInteger(binding.entryIndex) && binding.entryIndex>=0).toBe(true);
      const section=plan.sections.find((row:any)=>row.key===binding.sectionKey);
      const guide=plan.guides.find((row:any)=>row.key===section.guideKey);
      const role=plan.mediaRoles.find((row:any)=>row.key===binding.roleKey);
      expect(guide.owner).toBe(role.owner);
      const [block,field]=binding.block.split('.');
      expect(section.blocks[block][field][binding.entryIndex]).toBeDefined();
    }
    expect(plan.mediaRoles.map((r:any)=>r.key)).toEqual(expected.roles);
    expect(new Set(plan.mediaRoles.map((r:any)=>r.key)).size).toBe(expected.roles.length);
    for(const role of plan.mediaRoles){
      expect(Object.keys(role).sort()).toEqual(['key','owner','purpose']);
      expect(role.purpose).toBe(role.key.includes('cover')?'collection':'guide');
      expect(role.owner).toBe(role.key==='independent-cover'?'ownerB':'ownerA');
    }
    const original=clone(plan), next=s.buildGuidesSeedPlan(caseId);
    expect(next).toEqual(original); expect(next).not.toBe(plan);
    if(plan.guides.length){plan.guides[0].details.tags.push('mutation');plan.guides[0].title='mutation';}
    if(plan.sections.length) plan.sections[0].blocks.tags.push('mutation');
    plan.mediaRoles.push({key:'mutation',owner:'ownerA',purpose:'guide'});
    expect(next).toEqual(original); expect(s.buildGuidesSeedPlan(caseId)).toEqual(original);
  });
  it('pins finite isolation, rich metadata, photo role bindings and all three traversal conventions',async()=>{
    const s=await support(); const plans=CASES.map(c=>s.buildGuidesSeedPlan(c));
    expect(plans[2].guides.filter((g:any)=>g.owner==='ownerA')).toHaveLength(2);
    expect(plans[3].guides.filter((g:any)=>g.owner==='ownerA').map((g:any)=>g.archived)).toEqual([false,true]);
    const rich=plans[1]; const details=rich.guides.find((g:any)=>g.owner==='ownerA').details;
    expect(JSON.stringify(details)).toMatch(/[^\u0000-\u007f]/);
    expect(details.estimatedBudget).toBe('1234.50'); expect(details.budgetCurrency).toBe('INR');
    const blocks=rich.sections[0].blocks;
    for(const values of [blocks.timeline.morning,blocks.timeline.afternoon,blocks.timeline.evening,blocks.transport.segments,blocks.stay.accommodations,blocks.activities.activities,blocks.budget.morning,blocks.budget.afternoon,blocks.budget.evening,blocks.packingList.items,blocks.preTasks.items,blocks.tags]) expect(values.length).toBeGreaterThan(0);
    expect(blocks.timeline.morning[0].geometry).toEqual({location:{lat:0,lng:0}});
    const traversal=plans[4], ownerA=traversal.guides.filter((g:any)=>g.owner==='ownerA');
    const eligible=ownerA.filter((g:any)=>g.visibility==='public' && g.publicationState==='published' && !g.archived);
    expect(eligible).toHaveLength(53);
    expect(ownerA.filter((g:any)=>g.visibility==='private')).toHaveLength(1);
    expect(ownerA.every((g:any)=>!g.archived)).toBe(true);
    expect(eligible.map((g:any)=>g.key)).toEqual(ownerA.slice(0,53).map((g:any)=>g.key));
    expect(eligible[0].key).toBe(traversal.traversal.selectedGuideKey);
    expect(traversal.sections.filter((row:any)=>row.guideKey===eligible[0].key)).toHaveLength(53);
    const foreign=traversal.guides.find((g:any)=>g.owner==='ownerB');
    expect(foreign.title).toBe(eligible[0].title);
    expect(foreign).toMatchObject({visibility:'public',publicationState:'published',archived:false});
    expect(plans[4].traversal).toEqual({guideCount:53,sectionCount:53,selectedGuideKey:plans[4].guides[0].key,
      publicDetail:{limit:12,lengths:[12,12,12,12,5],offsets:[0,12,24,36,48],cursors:['o12','o24','o36','o48',null]},
      publicCategory:{limit:24,lengths:[24,24,5]},ownerSections:{limit:20,lengths:[20,20,13],after:[undefined,19,39],cursors:[19,39,null]}});
    expect(plans.filter((_:unknown,i:number)=>i!==4).every((p:any)=>p.traversal===null)).toBe(true);
    expect(plans[6].photoBindings.map((b:any)=>b.roleKey)).toEqual(['direct-timeline','direct-stay']);
    expect(plans[6].photoBindings.map((b:any)=>b.block)).toEqual(['timeline.morning','stay.accommodations']);
    expect(plans[7].photoBindings.filter((b:any)=>b.roleKey==='shared-section')).toHaveLength(2);
    expect(plans[7].photoBindings.filter((b:any)=>b.roleKey==='sole-withdrawal')).toHaveLength(1);
    const shared=plans[7].photoBindings.filter((b:any)=>b.roleKey==='shared-section');
    expect(new Set(shared.map((b:any)=>b.sectionKey)).size).toBe(2);
    const bindingGuide=(plan:any,binding:any)=>plan.guides.find((g:any)=>g.key===plan.sections.find((section:any)=>section.key===binding.sectionKey).guideKey);
    const withdrawalOwn=plans[7].guides.filter((g:any)=>g.owner==='ownerA');
    expect(shared.map((b:any)=>bindingGuide(plans[7],b).key).sort()).toEqual(withdrawalOwn.map((g:any)=>g.key).sort());
    expect(bindingGuide(plans[7],plans[7].photoBindings.find((b:any)=>b.roleKey==='sole-withdrawal')).key).toBe(withdrawalOwn[0].key);
    const photoSection=plans[6].sections.find((section:any)=>plans[6].guides.find((g:any)=>g.key===section.guideKey).owner==='ownerA');
    expect(plans[6].photoBindings.every((b:any)=>b.sectionKey===photoSection.key)).toBe(true);
  });
  it.each(CASES.flatMap(caseId=>PROJECTS.map(project=>({caseId,project}))))('admits reset and observe for $caseId / $project without mutating trusted state',async({caseId,project})=>{
    const {validateGuidesControl}=await support(); const initial=request(caseId,project);
    expect(validateGuidesControl(initial)).toEqual(initial.body);
    const active={caseId,project,repeat:0,generation:7};
    for(const action of ['reset','observe']){
      const input={...request(caseId,project,action,7),active}; const before=clone(input);
      expect(validateGuidesControl(input)).toEqual(input.body); expect(input).toEqual(before);
    }
    const switched={...request(caseId,project==='guides-mobile'?'guides-desktop':'guides-mobile','reset',7),active};
    expect(validateGuidesControl(switched)).toEqual(switched.body);
    const otherCase={...request(CASES[(CASES.indexOf(caseId as typeof CASES[number])+1)%CASES.length],project,'reset',7),active};
    expect(validateGuidesControl(otherCase)).toEqual(otherCase.body);
    const compensated=request(caseId,project,'reset',7);
    expect(validateGuidesControl(compensated)).toEqual(compensated.body);
  });
  it('rejects transport, private authority, malformed identity and strict envelope violations',async()=>{
    const {validateGuidesControl}=await support();
    const patches=[{method:'GET'},{path:'/control/'},{remote:'::1'},{remote:'127.0.0.2'},
      {host:'localhost:51000'},{host:'127.0.0.1:1023',expectedHost:'127.0.0.1:1023'},
      {host:'127.0.0.1:65536',expectedHost:'127.0.0.1:65536'}, {host:'127.0.0.1:51000.5',expectedHost:'127.0.0.1:51000.5'},
      {host:'127.0.0.1:51001'},{capability:'a'.repeat(63)},{capability:'A'.repeat(64)},
      {capability:'g'.repeat(64)},{capability:'d'.repeat(64)}, {expectedCapability:'d'.repeat(64)},
      {expectedCapability:'a'.repeat(65)},{runId:'b'.repeat(31)},{runId:'B'.repeat(32)},
      {expectedRunId:'d'.repeat(32)},{commit:'c'.repeat(39)},{commit:'C'.repeat(40)},{expectedCommit:'d'.repeat(40)},
      {expectedRunId:'g'.repeat(32)},{expectedCommit:'g'.repeat(40)},{extra:true}];
    for(const patch of patches) expect(()=>validateGuidesControl({...request(),...patch})).toThrow();
    for(const malformed of ['a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64),''])expect(()=>validateGuidesControl({...request(),capability:malformed,expectedCapability:malformed})).toThrow();
    for(const [field,values] of [['runId',['b'.repeat(31),'B'.repeat(32),'g'.repeat(32),'']],['commit',['c'.repeat(39),'C'.repeat(40),'g'.repeat(40),'']]] as const){
      for(const malformed of values){const input:any=request();input[field]=malformed;input[field==='runId'?'expectedRunId':'expectedCommit']=malformed;input.body[field]=malformed;expect(()=>validateGuidesControl(input)).toThrow();}
    }
    for(const key of Object.keys(request())){const input:any=request();delete input[key];expect(()=>validateGuidesControl(input)).toThrow();}
    for(const port of [1024,65535]){const input={...request(),host:`127.0.0.1:${port}`,expectedHost:`127.0.0.1:${port}`};expect(validateGuidesControl(input)).toEqual(input.body);}
  });
  it('rejects omitted or extra body fields, unsupported commands and stale or cross-identity observations',async()=>{
    const {validateGuidesControl}=await support();
    const patches=[{version:2},{action:'sql'},{action:'close'},{action:'start'},{action:'mutate'},
      {caseId:'invented'},{project:'places-desktop'},{repeat:1},{repeat:-1}, {repeat:'0'},
      {generation:-1},{generation:0.5},{generation:Number.MAX_SAFE_INTEGER+1},{generation:'0'},
      {runId:'d'.repeat(32)},{commit:'d'.repeat(40)}, {ownerId:'x'},{mediaId:'x'},{category:'guides'},
      {sql:'SELECT 1'},{quantity:53},{session:true},{accountGate:true}];
    for(const patch of patches)expect(()=>validateGuidesControl({...request(),body:{...request().body,...patch}})).toThrow();
    for(const key of Object.keys(request().body)){const input:any=request();delete input.body[key];expect(()=>validateGuidesControl(input)).toThrow();}
    expect(()=>validateGuidesControl(request(CASES[0],PROJECTS[0],'observe'))).toThrow();
    const active={caseId:CASES[0],project:PROJECTS[0],repeat:0,generation:2};
    for(const patch of [{caseId:CASES[1]},{project:PROJECTS[1]},{repeat:1},{generation:1},{generation:3}]){
      const input={...request(CASES[0],PROJECTS[0],'observe',2),active};
      expect(()=>validateGuidesControl({...input,body:{...input.body,...patch}})).toThrow();
    }
    for(const action of ['reset','observe']){
      const input={...request(CASES[0],PROJECTS[0],action,2),active};
      expect(()=>validateGuidesControl({...input,body:{...input.body,generation:1}})).toThrow();
      expect(()=>validateGuidesControl({...input,currentGeneration:3})).toThrow();
    }
    for(const malformed of [-1,0.5,Number.MAX_SAFE_INTEGER+1,'0',NaN,Infinity]){
      for(const action of ['reset','observe']){
        const input:any=request(CASES[0],PROJECTS[0],action);input.currentGeneration=malformed;input.body.generation=malformed;
        input.active={caseId:CASES[0],project:PROJECTS[0],repeat:0,generation:malformed};
        expect(()=>validateGuidesControl(input)).toThrow();
        if(action==='reset'){input.active=null;expect(()=>validateGuidesControl(input)).toThrow();}
      }
    }
    for(const generation of [-1,0.5,Number.MAX_SAFE_INTEGER+1])expect(()=>validateGuidesControl({...request(),currentGeneration:generation})).toThrow();
    for(const patch of [{extra:true},{repeat:1},{generation:1}])expect(()=>validateGuidesControl({...request(CASES[0],PROJECTS[0],'observe',2),active:{...active,...patch}})).toThrow();
  });
});




import {guideActivityPhotoSchema, GUIDE_SECTION_LIMIT, GUIDE_SECTION_PAGE_LIMIT} from '../../../shared/explorersGuideContract';

// Synthetic UUIDs below exercise validator relations only; no canonical allocation is claimed.
const KNOWN_GUIDES_BYTES = {
  'old-cover': {base64:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR42mP8z4AdMDEMKQkAzUEBD7t4NqoAAAAASUVORK5CYII=',byteLength:74,sha256:'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2',mimeType:'image/png'},
  'replacement-cover': {base64:'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFUlEQVR42mNkYPjPgA0wMeAAg1MCAMtDAQ9w2TiCAAAAAElFTkSuQmCC',byteLength:78,sha256:'737a59b1d4ed37b6cd836d483eff2ad8b0183d5a8078e355e7bb30a91c746f82',mimeType:'image/png'},
  'activity-import': {base64:'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDAREAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDu6/h8/wA4j//Z',byteLength:633,sha256:'040d3d472c846ce1e2ea09b361b3224c5723a591f305797217e20b98778d9f1c',mimeType:'image/jpeg'},
} as const;

function syntheticGuidesManifest(plan:any, project:string=PROJECTS[0], generation=1):any {
  const ids=Array.from({length:200},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
  const bindings={ownerA:{userId:'auth|owner-a',accountId:ids[0],handle:'guide-owner-a'},ownerB:{userId:'auth|owner-b',accountId:ids[1],handle:'guide-owner-b'},ownerC:{userId:'auth|owner-c',accountId:ids[2],handle:'guide-owner-c'}};
  const expected={version:1,runId,commit,caseId:plan.caseId,project,repeat:0,generation,personas:clone(bindings)};
  const personas=Object.fromEntries(Object.entries(bindings).map(([key,value],i)=>[key,{...value,accountRevision:[7,13,29][i]}]));
  const guides=plan.guides.map((row:any,i:number)=>{const {owner,...rest}=clone(row);return {...rest,id:ids[10+i],accountId:(bindings as any)[owner].accountId,category:'guides',collectionRevision:31+i,categoryContentRevision:owner==='ownerA'?47:59};});
  const sections=plan.sections.map((row:any,i:number)=>{const {guideKey,...rest}=clone(row);const parent=guides.find((g:any)=>g.key===guideKey);return {...rest,id:ids[80+i],collectionId:parent.id,accountId:parent.accountId};});
  const fixtureBytes:any={};
  const media=plan.mediaRoles.filter((r:any)=>r.key!=='activity-import').map((role:any,i:number)=>{
    const fixtureId=role.key==='replacement-cover'?'replacement-cover':'old-cover'; const known=KNOWN_GUIDES_BYTES[fixtureId];
    fixtureBytes[fixtureId]=new Uint8Array(Buffer.from(known.base64,'base64'));
    const id=ids[150+i],accountId=(bindings as any)[role.owner].accountId;
    return {key:role.key,id,accountId,purpose:role.purpose,status:'ready',variant:'original',environment:'local',keyPath:`local/${accountId}/${id}`,mimeType:known.mimeType,byteLength:known.byteLength,sha256:known.sha256,contentUrl:`/api/explorers/v1/media/${id}/content`,fixtureId};
  });
  if(plan.mediaRoles.some((r:any)=>r.key==='activity-import'))fixtureBytes['activity-import']=new Uint8Array(Buffer.from(KNOWN_GUIDES_BYTES['activity-import'].base64,'base64'));
  const attachments:any[]=[];
  for(const binding of plan.photoBindings){const section=sections.find((s:any)=>s.key===binding.sectionKey),asset=media.find((m:any)=>m.key===binding.roleKey);const [block,field]=binding.block.split('.');section.blocks[block][field][binding.entryIndex].photos=[{mediaId:asset.id,fileName:`${binding.roleKey}.png`,width:8,height:8,aspectRatio:'1:1'}];attachments.push({slot:'section-photo',guideId:section.collectionId,sectionId:section.id,accountId:section.accountId,mediaId:asset.id});}
  for(const key of ['old-cover','independent-cover']){const asset=media.find((m:any)=>m.key===key);if(asset){const guide=guides.find((g:any)=>g.accountId===asset.accountId);attachments.push({slot:'cover',guideId:guide.id,accountId:guide.accountId,mediaId:asset.id});}}
  const own=guides.filter((g:any)=>g.accountId===bindings.ownerA.accountId&&g.visibility==='public'&&g.publicationState==='published'&&!g.archived);
  const traversal=plan.traversal?{guideCount:53,sectionCount:53,publicDetail:{limit:12,lengths:[12,12,12,12,5],offsets:[0,12,24,36,48],cursors:['o12','o24','o36','o48',null]},publicCategory:{limit:24,lengths:[24,24,5]},ownerSections:{limit:20,lengths:[20,20,13],requests:[{},{after:19},{after:39}],cursors:[19,39,null],wireCursors:['19','39',null]}}:null;
  const expectedPublic={eligibleGuideIds:own.map((g:any)=>g.id),selectedGuideId:traversal?own[0].id:null,orderedSectionIds:traversal?sections.filter((s:any)=>s.collectionId===own[0].id).map((s:any)=>s.id):[],roleMediaIds:Object.fromEntries(plan.mediaRoles.map((r:any)=>[r.key,media.find((m:any)=>m.key===r.key)?.id??null])),traversal};
  return {expected,manifest:{version:1,runId,commit,caseId:plan.caseId,project,repeat:0,generation,personas,guides,sections,media,attachments,expectedPublic},fixtureBytes};
}

describe('private Guides run-bound initial manifest and known media bytes',()=>{
  it('admits all sixteen frozen initial identities and independently bound later generation',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();
    for(const caseId of CASES)for(const project of PROJECTS)for(const generation of [1,17]){const input=syntheticGuidesManifest(s.buildGuidesSeedPlan(caseId),project,generation),before=clone(input);expect(s.guidesManifestSchema.parse(input)).toEqual(input.manifest);expect(input).toEqual(before);}
  });
  it('refuses strict trusted envelopes and self-consistent wrong runtime identities',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[1]));
    for(const scope of ['expected','manifest'])for(const key of Object.keys(base[scope])){const x=clone(base);delete x[scope][key];expect(s.guidesManifestSchema.safeParse(x).success).toBe(false);}
    for(const field of ['runId','commit','caseId','project','repeat','generation']){const x=clone(base);x.manifest[field]=({runId:'d'.repeat(32),commit:'e'.repeat(40),caseId:CASES[2],project:PROJECTS[1],repeat:1,generation:2} as any)[field];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const generation of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity]){const x=clone(base);x.expected.generation=x.manifest.generation=generation;expect(s.guidesManifestSchema.safeParse(x).success).toBe(false);}
    for(const key of ['expected','manifest','fixtureBytes']){const x=clone(base);delete x[key];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const scope of ['expected','manifest']){const x=clone(base);x[scope].extra=undefined;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    expect(()=>s.guidesManifestSchema.parse({...base,extra:true})).toThrow();expect(()=>s.guidesManifestSchema.parse(s.buildGuidesSeedPlan(CASES[1]))).toThrow();
    for(const [field,value] of [['version',2],['runId','G'.repeat(32)],['commit','G'.repeat(40)],['caseId','invented'],['project','invented'],['repeat',1]]){const x=clone(base);x.expected[field as string]=x.manifest[field as string]=value;expect(s.guidesManifestSchema.safeParse(x).success,`matching malformed authority ${field}`).toBe(false);}
    const rebound=clone(base);rebound.manifest.runId='d'.repeat(32);rebound.manifest.guides[0].id='20000000-0000-4000-8000-000000000001';rebound.manifest.sections[0].collectionId=rebound.manifest.guides[0].id;rebound.manifest.expectedPublic.eligibleGuideIds[0]=rebound.manifest.guides[0].id;expect(()=>s.guidesManifestSchema.parse(rebound)).toThrow();
  });
  it('binds all personas and keeps independent positive observed revision domains',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[2]));expect(s.guidesManifestSchema.parse(base)).toEqual(base.manifest);
    for(const field of ['userId','accountId','handle']){const x=clone(base);x.manifest.personas.ownerB[field]=x.manifest.personas.ownerA[field];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();const y=clone(base);y.manifest.personas.ownerA[field]=y.manifest.personas.ownerC[field];expect(()=>s.guidesManifestSchema.parse(y)).toThrow();}
    for(const value of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1])for(const field of ['accountRevision','collectionRevision','categoryContentRevision']){const x=clone(base);(field==='accountRevision'?x.manifest.personas.ownerA:x.manifest.guides[0])[field]=value;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const [field,value] of [['userId','auth|fresh-owner-a'],['handle','fresh-owner-a']]){const x=clone(base);x.manifest.personas.ownerA[field]=value;expect(()=>s.guidesManifestSchema.parse(x),`unique persona authority ${field}`).toThrow();}
    const reboundAccount=clone(base),oldAccount=reboundAccount.manifest.personas.ownerA.accountId,freshAccount='20000000-0000-4000-8000-000000000009';reboundAccount.manifest.personas.ownerA.accountId=freshAccount;for(const row of [...reboundAccount.manifest.guides,...reboundAccount.manifest.sections,...reboundAccount.manifest.media,...reboundAccount.manifest.attachments])if(row.accountId===oldAccount){row.accountId=freshAccount;if('keyPath' in row)row.keyPath=`local/${freshAccount}/${row.id}`;}expect(()=>s.guidesManifestSchema.parse(reboundAccount),'unique consistently rebound account authority').toThrow();
    const ownedAccount=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[5]));const ownedOld=ownedAccount.manifest.personas.ownerA.accountId;ownedAccount.manifest.personas.ownerA.accountId=freshAccount;for(const row of [...ownedAccount.manifest.guides,...ownedAccount.manifest.sections,...ownedAccount.manifest.media,...ownedAccount.manifest.attachments])if(row.accountId===ownedOld){row.accountId=freshAccount;if('keyPath' in row)row.keyPath=`local/${freshAccount}/${row.id}`;}expect(()=>s.guidesManifestSchema.parse(ownedAccount),'unique media account with matching object keys and attachments').toThrow();
    const swapped=clone(base);[swapped.manifest.personas.ownerA,swapped.manifest.personas.ownerB]=[swapped.manifest.personas.ownerB,swapped.manifest.personas.ownerA];expect(()=>s.guidesManifestSchema.parse(swapped)).toThrow();
    const revision=clone(base);revision.manifest.guides[1].categoryContentRevision++;expect(()=>s.guidesManifestSchema.parse(revision)).toThrow();
    for(const accountId of [base.manifest.personas.ownerB.accountId,base.manifest.personas.ownerC.accountId]){const x=clone(base);x.manifest.guides[0].accountId=accountId;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
  });
  it('requires exact guide keys initial properties visibility and owner control',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[4]));
    for(const field of ['key','id','displayOrder']){const x=clone(base);x.manifest.guides[1][field]=x.manifest.guides[0][field];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const patch of [{title:'changed'},{slug:'changed'},{visibility:'private'},{publicationState:'draft'},{archived:true},{category:'books'}]){const x=clone(base);Object.assign(x.manifest.guides[0],patch);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const index of [0,53,54]){const x=clone(base);x.manifest.guides.splice(index,1);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    const extra=clone(base);extra.manifest.guides.push(clone(extra.manifest.guides[0]));expect(()=>s.guidesManifestSchema.parse(extra)).toThrow();
    const content=clone(base);content.manifest.guides[0].details.tags=['different'];expect(()=>s.guidesManifestSchema.parse(content)).toThrow();
  });
  it('requires section keys order parent references and account scope',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[3]));
    for(const field of ['key','id','displayOrder']){const x=clone(base);x.manifest.sections[1][field]=x.manifest.sections[0][field];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const patch of [{collectionId:base.manifest.guides[2].id},{collectionId:'20000000-0000-4000-8000-000000000001'},{accountId:base.manifest.personas.ownerB.accountId},{displayOrder:-1},{displayOrder:200},{title:'changed'},{description:'changed'},{archived:true}]){const x=clone(base);Object.assign(x.manifest.sections[0],patch);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    const missing=clone(base);missing.manifest.sections.pop();expect(()=>s.guidesManifestSchema.parse(missing)).toThrow();const extra=clone(base);extra.manifest.sections.push(clone(extra.manifest.sections[0]));expect(()=>s.guidesManifestSchema.parse(extra)).toThrow();expect(s.guidesManifestSchema.parse(base)).toEqual(base.manifest);
  });
  it('delegates complete blocks geometry money photo and byte ceilings to shared contracts',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[6]));
    expect(guideActivityPhotoSchema.safeParse(base.manifest.sections[0].blocks.timeline.morning[0].photos[0]).success).toBe(true);expect(GUIDE_SECTION_LIMIT).toBe(200);expect(base.manifest.sections[0].blocks.timeline.morning[0].geometry).toEqual({location:{lat:0,lng:0}});expect(base.manifest.guides[0].details.estimatedBudget).toBe('1234.50');expect(s.guidesManifestSchema.parse(base)).toEqual(base.manifest);
    const normalized=clone(base);normalized.manifest.guides[0].details.tags[0]=`  ${base.manifest.guides[0].details.tags[0]}  `;normalized.manifest.sections[0].blocks.tags[0]=`  ${base.manifest.sections[0].blocks.tags[0]}  `;expect(guideCollectionDetailsSchema.parse(normalized.manifest.guides[0].details)).toEqual(base.manifest.guides[0].details);expect(guideSectionBlocksSchema.parse(normalized.manifest.sections[0].blocks)).toEqual(base.manifest.sections[0].blocks);const normalizedBefore=clone(normalized);expect(s.guidesManifestSchema.parse(normalized)).toEqual(base.manifest);expect(normalized).toEqual(normalizedBefore);
    const largeDetails=clone(base);largeDetails.manifest.guides[0].details.tipsNotes={text:'旅'.repeat(22000)};const detailRefusal=guideCollectionDetailsSchema.safeParse(largeDetails.manifest.guides[0].details);expect(detailRefusal.success,'shared details UTF-8 byte ceiling').toBe(false);if(!detailRefusal.success)expect(detailRefusal.error.issues.some(issue=>issue.path.join('.')==='tipsNotes')).toBe(true);const manifestDetailRefusal=s.guidesManifestSchema.safeParse(largeDetails);expect(manifestDetailRefusal.success,'manifest delegated details byte ceiling').toBe(false);if(!detailRefusal.success&&!manifestDetailRefusal.success)for(const issue of detailRefusal.error.issues.filter(issue=>issue.path.join('.')==='tipsNotes'))expect(manifestDetailRefusal.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:issue.code,path:['manifest','guides',0,'details',...issue.path]})]));
    const largeBlocks=clone(base);largeBlocks.manifest.sections[0].blocks.activities.activities=Array.from({length:30},(_,i)=>({...clone(base.manifest.sections[0].blocks.activities.activities[0]),localId:`large-${i}`,tips:'旅'.repeat(3000)}));const blockRefusal=guideSectionBlocksSchema.safeParse(largeBlocks.manifest.sections[0].blocks);expect(blockRefusal.success,'shared section UTF-8 byte ceiling within entry limits').toBe(false);if(!blockRefusal.success)expect(blockRefusal.error.issues.some(issue=>issue.path.join('.')==='timeline')).toBe(true);const manifestBlockRefusal=s.guidesManifestSchema.safeParse(largeBlocks);expect(manifestBlockRefusal.success,'manifest delegated section byte ceiling').toBe(false);if(!blockRefusal.success&&!manifestBlockRefusal.success)for(const issue of blockRefusal.error.issues.filter(issue=>issue.path.join('.')==='timeline'))expect(manifestBlockRefusal.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:issue.code,path:['manifest','sections',0,'blocks',...issue.path]})]));
    for(const coordinate of ['lat','lng']){const x=clone(base);x.manifest.guides[0].details.place[coordinate]=null;const sharedCoordinateRefusal=guideCollectionDetailsSchema.safeParse(x.manifest.guides[0].details);expect(sharedCoordinateRefusal.success,`shared parent ${coordinate} coordinate pair`).toBe(false);const manifestCoordinateRefusal=s.guidesManifestSchema.safeParse(x);expect(manifestCoordinateRefusal.success,`manifest delegated parent ${coordinate} coordinate pair`).toBe(false);if(!sharedCoordinateRefusal.success&&!manifestCoordinateRefusal.success){expect(sharedCoordinateRefusal.error.issues.length).toBeGreaterThan(0);for(const issue of sharedCoordinateRefusal.error.issues)expect(manifestCoordinateRefusal.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:issue.code,path:['manifest','guides',0,'details',...issue.path]})]));}}
    for(const mutate of [(x:any)=>x.manifest.sections[0].blocks.version='v2',(x:any)=>delete x.manifest.sections[0].blocks.budget,(x:any)=>x.manifest.sections[0].blocks.timeline.morning[0].geometry={lat:0,lng:0},(x:any)=>delete x.manifest.sections[0].blocks.timeline.morning[0].geometry.location.lng,(x:any)=>x.manifest.sections[0].blocks.timeline.morning[0].geometry.location.lat=Infinity,(x:any)=>x.manifest.sections[0].blocks.timeline.morning[0].geometry.location.lng=181,(x:any)=>x.manifest.sections[0].blocks.timeline.morning[0].budgetCurrency=null,(x:any)=>x.manifest.sections[0].blocks.transport.segments[0].fromLocalId='dangling',(x:any)=>x.manifest.sections[0].blocks.budget.morning[0].localId='dangling',(x:any)=>x.manifest.sections[0].blocks.timeline.morning[0].photos[0].mediaId='bad',(x:any)=>x.manifest.media[0].byteLength=5242881]){const x=clone(base);mutate(x);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
  });
  it('binds known actual media bytes MIME digest length and original object metadata',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[5]));const {createHash}=await import('node:crypto');
    for(const [id,bytes] of Object.entries(base.fixtureBytes) as [keyof typeof KNOWN_GUIDES_BYTES,Uint8Array][]){expect(bytes.byteLength).toBe(KNOWN_GUIDES_BYTES[id].byteLength);expect(createHash('sha256').update(bytes).digest('hex')).toBe(KNOWN_GUIDES_BYTES[id].sha256);}expect(base.fixtureBytes['old-cover']).not.toEqual(base.fixtureBytes['replacement-cover']);
    for(const patch of [{fixtureId:'unknown'},{sha256:'0'.repeat(64)},{byteLength:75},{mimeType:'image/jpeg'},{sha256:'A'.repeat(64)},{byteLength:0},{purpose:'guide'},{status:'pending'},{variant:'thumb'},{environment:'production'},{accountId:base.manifest.personas.ownerB.accountId},{id:'20000000-0000-4000-8000-000000000001'},{keyPath:'local/wrong'},{contentUrl:'/wrong'}]){const x=clone(base);Object.assign(x.manifest.media[0],patch);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const bytes of [new Uint8Array(),new Uint8Array(5242881),base.fixtureBytes['old-cover'].slice(0,73)]){const x=clone(base);x.fixtureBytes['old-cover']=bytes;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    const changed=clone(base);changed.fixtureBytes['old-cover'][40]^=1;const changedDigest=createHash('sha256').update(changed.fixtureBytes['old-cover']).digest('hex');for(const row of changed.manifest.media.filter((row:any)=>row.fixtureId==='old-cover'))row.sha256=changedDigest;expect(()=>s.guidesManifestSchema.parse(changed)).toThrow();
    const missing=clone(base);missing.manifest.media.pop();expect(()=>s.guidesManifestSchema.parse(missing)).toThrow();const extra=clone(base);extra.manifest.media.push(clone(extra.manifest.media[0]));expect(()=>s.guidesManifestSchema.parse(extra)).toThrow();const exchanged=clone(base);[exchanged.manifest.media[0].key,exchanged.manifest.media[1].key]=[exchanged.manifest.media[1].key,exchanged.manifest.media[0].key];expect(()=>s.guidesManifestSchema.parse(exchanged)).toThrow();
    const malformedPhotoAsset=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[6]));expect(s.guidesManifestSchema.parse(malformedPhotoAsset)).toEqual(malformedPhotoAsset.manifest);const previousPhotoId=malformedPhotoAsset.manifest.media[0].id,malformedPhotoId='bad';malformedPhotoAsset.manifest.media[0].id=malformedPhotoId;malformedPhotoAsset.manifest.media[0].keyPath=`local/${malformedPhotoAsset.manifest.media[0].accountId}/${malformedPhotoId}`;malformedPhotoAsset.manifest.media[0].contentUrl=`/api/explorers/v1/media/${malformedPhotoId}/content`;malformedPhotoAsset.manifest.expectedPublic.roleMediaIds['direct-timeline']=malformedPhotoId;for(const attachment of malformedPhotoAsset.manifest.attachments)if(attachment.mediaId===previousPhotoId)attachment.mediaId=malformedPhotoId;for(const section of malformedPhotoAsset.manifest.sections)for(const entry of [...section.blocks.timeline.morning,...section.blocks.timeline.afternoon,...section.blocks.timeline.evening,...section.blocks.stay.accommodations,...section.blocks.activities.activities])for(const photo of entry.photos)if(photo.mediaId===previousPhotoId)photo.mediaId=malformedPhotoId;let malformedPhotoResult:any;expect(()=>{malformedPhotoResult=s.guidesManifestSchema.safeParse(malformedPhotoAsset);},'malformed owned photo UUID safeParse returns without throwing').not.toThrow();expect(malformedPhotoResult.success).toBe(false);if(!malformedPhotoResult.success)expect(malformedPhotoResult.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'invalid_string',validation:'uuid',path:['manifest','media',0,'id']})]));
  });
  it('requires exact cover and photo registry membership and independent seed role locations',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();
    for(const index of [5,6,7]){const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[index]));for(const mutate of [(x:any)=>x.manifest.attachments.pop(),(x:any)=>x.manifest.attachments.push(clone(x.manifest.attachments[0])),(x:any)=>x.manifest.attachments[0].mediaId='20000000-0000-4000-8000-000000000001',(x:any)=>x.manifest.attachments[0].accountId=x.manifest.personas.ownerC.accountId,(x:any)=>x.manifest.media[0].purpose=index===5?'guide':'collection']){const x=clone(base);mutate(x);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}}
    const missingShared=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[7]));missingShared.manifest.sections[1].blocks.timeline.morning[0].photos=[];missingShared.manifest.attachments=missingShared.manifest.attachments.filter((a:any)=>a.sectionId!==missingShared.manifest.sections[1].id);expect(()=>s.guidesManifestSchema.parse(missingShared)).toThrow();
    const photo=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[6]));const repeated=clone(photo);repeated.manifest.sections[0].blocks.timeline.morning[0].photos.push(clone(repeated.manifest.sections[0].blocks.timeline.morning[0].photos[0]));expect(s.guidesManifestSchema.parse(repeated)).toEqual(repeated.manifest);
    const swapped=clone(photo);[swapped.manifest.sections[0].blocks.timeline.morning[0].photos,swapped.manifest.sections[0].blocks.stay.accommodations[0].photos]=[swapped.manifest.sections[0].blocks.stay.accommodations[0].photos,swapped.manifest.sections[0].blocks.timeline.morning[0].photos];expect(()=>s.guidesManifestSchema.parse(swapped)).toThrow();
    for(const [block,field] of [['timeline','morning'],['timeline','afternoon'],['timeline','evening'],['stay','accommodations'],['activities','activities']]){const x=clone(photo);x.manifest.sections[1].blocks[block][field][0].photos=[clone(photo.manifest.sections[0].blocks.timeline.morning[0].photos[0])];expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    const surplus=clone(photo);surplus.manifest.attachments.push({...surplus.manifest.attachments[0],sectionId:surplus.manifest.sections[1].id,guideId:surplus.manifest.sections[1].collectionId,accountId:surplus.manifest.sections[1].accountId});expect(()=>s.guidesManifestSchema.parse(surplus)).toThrow();
    const sole=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[7]));const source=clone(sole.manifest.sections[0].blocks.stay.accommodations[0].photos);sole.manifest.sections[1].blocks.stay.accommodations[0].photos=source;sole.manifest.attachments.push({slot:'section-photo',sectionId:sole.manifest.sections[1].id,guideId:sole.manifest.sections[1].collectionId,accountId:sole.manifest.sections[1].accountId,mediaId:source[0].mediaId});expect(()=>s.guidesManifestSchema.parse(sole)).toThrow();
  });
  it('keeps activity import as known JPEG source bytes with no preseeded native asset',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[6]));const {createHash}=await import('node:crypto');expect(base.fixtureBytes['activity-import'].byteLength).toBe(633);expect(createHash('sha256').update(base.fixtureBytes['activity-import']).digest('hex')).toBe(KNOWN_GUIDES_BYTES['activity-import'].sha256);expect(base.manifest.expectedPublic.roleMediaIds['activity-import']).toBeNull();expect(base.manifest.media.map((m:any)=>m.key)).toEqual(['direct-timeline','direct-stay']);expect(s.guidesManifestSchema.parse(base)).toEqual(base.manifest);
    const preseeded=clone(base),activityId='20000000-0000-4000-8000-000000000010',activityAccount=preseeded.manifest.personas.ownerA.accountId,jpeg=KNOWN_GUIDES_BYTES['activity-import'];preseeded.manifest.media.push({key:'activity-import',id:activityId,accountId:activityAccount,purpose:'guide',status:'ready',variant:'original',environment:'local',keyPath:`local/${activityAccount}/${activityId}`,mimeType:jpeg.mimeType,byteLength:jpeg.byteLength,sha256:jpeg.sha256,contentUrl:`/api/explorers/v1/media/${activityId}/content`,fixtureId:'activity-import'});preseeded.manifest.expectedPublic.roleMediaIds['activity-import']=activityId;expect(()=>s.guidesManifestSchema.parse(preseeded),'distinct known JPEG asset with consistent role map is forbidden for source-only role').toThrow();
    for(const mutate of [(x:any)=>x.manifest.expectedPublic.roleMediaIds['activity-import']=x.manifest.media[0].id,(x:any)=>x.manifest.media.push({...x.manifest.media[0],key:'activity-import'}),(x:any)=>delete x.fixtureBytes['activity-import'],(x:any)=>x.fixtureBytes['activity-import']=x.fixtureBytes['old-cover']]){const x=clone(base);mutate(x);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
  });
  it('requires complete ordered fifty-three traversal membership and public owner scope',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[4]));expect(base.manifest.expectedPublic.eligibleGuideIds).toHaveLength(53);expect(base.manifest.expectedPublic.orderedSectionIds).toHaveLength(53);
    for(const field of ['eligibleGuideIds','orderedSectionIds'])for(const mutate of [(a:any[])=>a.splice(50),(a:any[])=>a[1]=a[0],(a:any[])=>a.reverse()]){const x=clone(base);mutate(x.manifest.expectedPublic[field]);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const id of [base.manifest.guides[1].id,base.manifest.guides[53].id,base.manifest.guides[54].id]){const x=clone(base);x.manifest.expectedPublic.selectedGuideId=id;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    for(const id of [base.manifest.guides[53].id,base.manifest.guides[54].id]){const x=clone(base);x.manifest.expectedPublic.eligibleGuideIds[52]=id;expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
    const non=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[1]));non.manifest.expectedPublic.selectedGuideId=non.manifest.guides[0].id;expect(()=>s.guidesManifestSchema.parse(non)).toThrow();
  });
  it('separates public pagination numeric repository cursors and JSON safe owner wire expectations',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[4]));const t=base.manifest.expectedPublic.traversal;expect(t.ownerSections.limit).toBe(GUIDE_SECTION_PAGE_LIMIT);expect(t.ownerSections).toEqual({limit:20,lengths:[20,20,13],requests:[{},{after:19},{after:39}],cursors:[19,39,null],wireCursors:['19','39',null]});expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    for(const mutate of [(t:any)=>t.publicDetail.lengths[4]=6,(t:any)=>t.publicDetail.offsets[1]=13,(t:any)=>t.publicDetail.cursors[4]='o53',(t:any)=>t.publicDetail.cursors[0]='12',(t:any)=>t.publicCategory.lengths[2]=6,(t:any)=>t.publicCategory.nextCursor='o24',(t:any)=>t.ownerSections.cursors[0]='19',(t:any)=>t.ownerSections.requests[1].after=20,(t:any)=>t.ownerSections.requests[0].after=undefined,(t:any)=>t.ownerSections.wireCursors[0]=19,(t:any)=>t.ownerSections.wireCursors[2]='39']){const x=clone(base);mutate(x.manifest.expectedPublic.traversal);expect(()=>s.guidesManifestSchema.parse(x)).toThrow();}
  });
  it('preserves inputs strict output and refuses envelope byte credential and directory leaks',async()=>{
    const s:any=await support();expect(s.guidesManifestSchema).toBeDefined();const base=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[6])),before=clone(base);const output=s.guidesManifestSchema.parse(base);expect(base).toEqual(before);expect(output).toEqual(base.manifest);expect(Object.keys(output).sort()).toEqual(['version','runId','commit','caseId','project','repeat','generation','personas','guides','sections','media','attachments','expectedPublic'].sort());
    for(const scope of ['expected','manifest','personas','guide','section','media','attachment','public','bytes'])for(const key of ['capability','password','directory','extra']){const x=clone(base);const target=scope==='personas'?x.manifest.personas.ownerA:scope==='guide'?x.manifest.guides[0]:scope==='section'?x.manifest.sections[0]:scope==='media'?x.manifest.media[0]:scope==='attachment'?x.manifest.attachments[0]:scope==='public'?x.manifest.expectedPublic:scope==='bytes'?x.fixtureBytes:x[scope];target[key]=undefined;const invalidBefore=clone(x),result=s.guidesManifestSchema.safeParse(x);expect(result.success).toBe(false);if(!result.success)expect(result.error.issues.some((issue:any)=>issue.path.length>0)).toBe(true);expect(x).toEqual(invalidBefore);}
    const traversalBase=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[4])),coverBase=syntheticGuidesManifest(s.buildGuidesSeedPlan(CASES[5]));
    for(const [label,baseline,path] of [['cover attachment',coverBase,['manifest','attachments',0]],['expected persona map',base,['expected','personas']],['expected persona record',base,['expected','personas','ownerA']],['runtime persona map',base,['manifest','personas']],['role map',base,['manifest','expectedPublic','roleMediaIds']],['traversal',traversalBase,['manifest','expectedPublic','traversal']],['detail page',traversalBase,['manifest','expectedPublic','traversal','publicDetail']],['category page',traversalBase,['manifest','expectedPublic','traversal','publicCategory']],['owner page',traversalBase,['manifest','expectedPublic','traversal','ownerSections']],['owner initial request',traversalBase,['manifest','expectedPublic','traversal','ownerSections','requests',0]],['owner continuation request',traversalBase,['manifest','expectedPublic','traversal','ownerSections','requests',1]]] as const)for(const value of [true,undefined]){const x=clone(baseline);let target:any=x;for(const part of path)target=target[part];target.extra=value;expect(s.guidesManifestSchema.safeParse(x).success,`${label} unknown ${value===undefined?'undefined':'defined'} field`).toBe(false);}
    for(const value of [true,undefined])for(const scope of ['expected','manifest','personas','guide','section','media','attachment','public','bytes']){const x=clone(base);const target=scope==='personas'?x.manifest.personas.ownerA:scope==='guide'?x.manifest.guides[0]:scope==='section'?x.manifest.sections[0]:scope==='media'?x.manifest.media[0]:scope==='attachment'?x.manifest.attachments[0]:scope==='public'?x.manifest.expectedPublic:scope==='bytes'?x.fixtureBytes:x[scope];target.extra=value;expect(s.guidesManifestSchema.safeParse(x).success,`${scope} strict extra ${String(value)}`).toBe(false);}
    for(const scope of ['expected','manifest'])for(const owner of ['ownerA','ownerB','ownerC']){const x=clone(base);delete x[scope].personas[owner];expect(s.guidesManifestSchema.safeParse(x).success,`missing ${scope} persona ${owner}`).toBe(false);for(const field of Object.keys(base[scope].personas[owner])){const y=clone(base);delete y[scope].personas[owner][field];expect(s.guidesManifestSchema.safeParse(y).success,`missing ${scope} ${owner} ${field}`).toBe(false);}}
    const unneeded=clone(base);unneeded.fixtureBytes['replacement-cover']=new Uint8Array(Buffer.from(KNOWN_GUIDES_BYTES['replacement-cover'].base64,'base64'));expect(s.guidesManifestSchema.safeParse(unneeded).success,'known but unneeded fixture identity').toBe(false);
    for(const key of Object.keys(base.fixtureBytes)){const x=clone(base);delete x.fixtureBytes[key];expect(s.guidesManifestSchema.safeParse(x).success,`required byte identity ${key}`).toBe(false);}
    for(const key of Object.keys(base.manifest.expectedPublic.roleMediaIds)){const x=clone(base);delete x.manifest.expectedPublic.roleMediaIds[key];expect(s.guidesManifestSchema.safeParse(x).success,`required role map key ${key}`).toBe(false);}const extraRole=clone(base);extraRole.manifest.expectedPublic.roleMediaIds['extra-role']=null;expect(s.guidesManifestSchema.safeParse(extraRole).success,'surplus role map key').toBe(false);
    for(const key of ['expected','fixtureBytes','capability','password','directory'])expect(output).not.toHaveProperty(key);
  });
});
