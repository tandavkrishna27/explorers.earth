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

// F0c private verified-row contract; synthetic literals carry no resource authority.
const RESET_A='20000000-0000-4000-8000-000000000001';
const RESET_B='20000000-0000-4000-8000-000000000002';
const RESET_C='20000000-0000-4000-8000-000000000003';
const RESET_FOREIGN='20000000-0000-4000-8000-000000000004';
const RESET_COLLECTION='30000000-0000-4000-8000-000000000001';
const RESET_EVENT='40000000-0000-4000-8000-000000000001';
const RESET_MEDIA='50000000-0000-4000-8000-000000000001';
const RESET_OTHER_MEDIA='50000000-0000-4000-8000-000000000002';
function resetLiteral():any {
  return {
    snapshot:{runId,commit,collections:[{id:RESET_COLLECTION,accountId:RESET_A,category:'guides'}],
      analytics:[{id:RESET_EVENT,accountId:RESET_A,category:'guides',collectionId:RESET_COLLECTION,recommendationId:null}],
      media:[{id:RESET_MEDIA,accountId:RESET_A,purpose:'guide',status:'ready'}],
      objects:[{mediaId:RESET_MEDIA,accountId:RESET_A,variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001'}]},
    ownership:{runId,commit,personas:{ownerA:{userId:'auth|reset-a',accountId:RESET_A},ownerB:{userId:'auth|reset-b',accountId:RESET_B},ownerC:{userId:'auth|reset-c',accountId:RESET_C}},
      trackedMedia:[{id:RESET_MEDIA,accountId:RESET_A,purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001'}]},
  };
}
const RESET_EXPECTED={analyticsIds:['40000000-0000-4000-8000-000000000001'],media:[{id:'50000000-0000-4000-8000-000000000001',accountId:'20000000-0000-4000-8000-000000000001',purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001'}]};

describe('Guides pure custody and independent verified reset rows',()=>{
  it('Guides pure custody: lexical native path acceptance is explicit and resource free',async()=>{
    const s:any=await support();expect(s.assertGuidesStoragePath,'future pure path export setup').toBeTypeOf('function');
    const {sep}=await import('node:path');
    const root=sep==='\\'?'C:\\synthetic-temp':'/synthetic-temp';
    for(const suffix of ['A1','OtherRun29']){const path=root+sep+'explorers-profile-e2e-'+suffix+sep+'owned-media';const before=path;expect(s.assertGuidesStoragePath(path,root)).toBeUndefined();expect(path).toBe(before);}
    const otherRoot=sep==='\\'?'D:\\other-synthetic-temp':'/other-synthetic-temp';expect(s.assertGuidesStoragePath(otherRoot+sep+'explorers-profile-e2e-Z9'+sep+'owned-media',otherRoot)).toBeUndefined();
    // Two correctly shaped run roots are valid; this signature cannot prove exact run identity.
  });
  it('Guides pure custody: lexical aliases traversal and foreign roots refuse',async()=>{
    const s:any=await support();expect(s.assertGuidesStoragePath,'future pure path export setup').toBeTypeOf('function');
    const {sep}=await import('node:path');const root=sep==='\\'?'C:\\synthetic-temp':'/synthetic-temp';
    const privateRoot=root+sep+'explorers-profile-e2e-A1',valid=privateRoot+sep+'owned-media';
    const invalid=[null,undefined,1,{},'', 'owned-media',valid.slice(1),root+sep+'explorers-profile-e2e-'+sep+'owned-media',
      root+sep+'explorers-profile-e2e-A-1'+sep+'owned-media',root+'-sibling'+sep+'explorers-profile-e2e-A1'+sep+'owned-media',
      privateRoot+sep+'wrong',valid+sep,privateRoot+sep+sep+'owned-media',privateRoot+sep+'.'+sep+'owned-media',
      privateRoot+sep+'child'+sep+'..'+sep+'owned-media',valid+sep+'nested',root+sep+'nested'+sep+'explorers-profile-e2e-A1'+sep+'owned-media'];
    if(sep==='\\')invalid.push('C:synthetic-temp\\explorers-profile-e2e-A1\\owned-media','\\\\server\\share\\explorers-profile-e2e-A1\\owned-media','\\\\?\\C:\\synthetic-temp\\explorers-profile-e2e-A1\\owned-media','\\\\.\\C:\\synthetic-temp\\explorers-profile-e2e-A1\\owned-media',valid+':stream',valid.replace('\\owned-media','/owned-media'));
    else invalid.push('/other-temp/explorers-profile-e2e-A1/owned-media','C:\\synthetic-temp\\explorers-profile-e2e-A1\\owned-media');
    for(const path of invalid){const before=clone(path);expect(()=>s.assertGuidesStoragePath(path,root),String(path)).toThrow();expect(path).toEqual(before);}
    for(const badRoot of [null,undefined,1,'','relative',root+sep,root+sep+'.',root+sep+'child'+sep+'..'])expect(()=>s.assertGuidesStoragePath(valid,badRoot)).toThrow();
    if(sep==='\\')for(const aliasRoot of ['C:\\synthetic-temp.','C:\\synthetic-temp ','C:\\synthetic-parent.\\synthetic-temp','C:\\synthetic-parent \\synthetic-temp']){
      const aliasChild=aliasRoot+'\\explorers-profile-e2e-A1\\owned-media';
      expect(()=>s.assertGuidesStoragePath(aliasChild,aliasRoot),'matching component alias root and child: '+aliasRoot).toThrow();
    }
    if(sep==='\\')for(const namespaceRoot of ['\\\\server\\share\\synthetic-temp','\\\\?\\C:\\synthetic-temp','\\\\.\\C:\\synthetic-temp'])expect(()=>s.assertGuidesStoragePath(namespaceRoot+'\\explorers-profile-e2e-A1\\owned-media',namespaceRoot),'matching namespace root and child').toThrow();
  });
  it('Guides pure reset: strict independent run persona and row shapes refuse ambiguity',async()=>{
    const s:any=await support();expect(s.selectOwnedGuidesResetReferences,'future pure selector export setup').toBeTypeOf('function');const base=resetLiteral();
    expect(s.selectOwnedGuidesResetReferences(base.snapshot,base.ownership)).toEqual(RESET_EXPECTED);
    for(const scope of ['snapshot','ownership']){
      for(const field of Object.keys(base[scope])){const x=clone(base);delete x[scope][field];expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
      for(const field of ['runId','commit']){const x=clone(base);x[scope][field]='d'.repeat(field==='runId'?32:40);expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    }
    for(const [field,values] of [['runId',['B'.repeat(32),'g'.repeat(32),'b'.repeat(31)]],['commit',['C'.repeat(40),'g'.repeat(40),'c'.repeat(39)]]] as const)for(const value of values){const x=clone(base);x.snapshot[field]=x.ownership[field]=value;expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    const paths=[['snapshot'],['ownership'],['ownership','personas'],['ownership','personas','ownerA'],['snapshot','collections',0],['snapshot','analytics',0],['snapshot','media',0],['snapshot','objects',0],['ownership','trackedMedia',0]];
    for(const path of paths){for(const value of [undefined,true]){const x=clone(base);let target=x;for(const part of path)target=target[part];target.extra=value;expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}const target=path.reduce((v:any,p)=>v[p],base);for(const field of Object.keys(target)){const x=clone(base);const row=path.reduce((v:any,p)=>v[p],x);delete row[field];expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}}
    for(const owner of ['ownerA','ownerB','ownerC']){const x=clone(base);delete x.ownership.personas[owner];expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const field of ['userId','accountId']){const x=clone(base);x.ownership.personas.ownerB[field]=x.ownership.personas.ownerA[field];expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const userId of ['', ' auth|reset-a','auth|reset-a ', 'x'.repeat(100000)]){const x=clone(base);x.ownership.personas.ownerA.userId=userId;expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const list of ['collections','analytics','media','objects'])for(const conflict of [false,true]){const x=clone(base),row=clone(x.snapshot[list][0]);if(conflict)row.accountId=RESET_B;x.snapshot[list].push(row);expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const list of ['collections','analytics','media','objects']){const x=clone(base);x.snapshot[list][0][list==='objects'?'mediaId':'id']='bad';expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const list of ['collections','analytics','media','objects']){const x=clone(base);x.snapshot[list][0].accountId='bad';expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();const y=clone(base);y.snapshot[list]={};expect(()=>s.selectOwnedGuidesResetReferences(y.snapshot,y.ownership)).toThrow();}
    const badLedger=clone(base);badLedger.ownership.trackedMedia={};expect(()=>s.selectOwnedGuidesResetReferences(badLedger.snapshot,badLedger.ownership)).toThrow();
    const badPersona=clone(base);badPersona.ownership.personas.ownerB.accountId='bad';expect(()=>s.selectOwnedGuidesResetReferences(badPersona.snapshot,badPersona.ownership)).toThrow();
    for(const field of ['category','purpose','status','variant','environment']){const list=field==='category'?'collections':field==='purpose'||field==='status'?'media':'objects';for(const value of ['',1,'x'.repeat(100000)]){const x=clone(base);x.snapshot[list][0][field]=value;expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}}
    for(const field of ['collectionId','recommendationId']){const x=clone(base);x.snapshot.analytics[0][field]='bad';expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    for(const category of ['',1,'x'.repeat(100000)]){const x=clone(base);x.snapshot.analytics[0].category=category;expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    const empty=clone(base);for(const list of ['collections','analytics','media','objects'])empty.snapshot[list]=[];empty.ownership.trackedMedia=[];expect(s.selectOwnedGuidesResetReferences(empty.snapshot,empty.ownership)).toEqual({analyticsIds:[],media:[]});
    for(const value of [null,undefined,[],1]){expect(()=>s.selectOwnedGuidesResetReferences(value,base.ownership)).toThrow();expect(()=>s.selectOwnedGuidesResetReferences(base.snapshot,value)).toThrow();}
  });
  it('Guides pure reset: analytics require exact collection category and account ownership',async()=>{
    const s:any=await support();expect(s.selectOwnedGuidesResetReferences,'future pure selector export setup').toBeTypeOf('function');
    for(const accountId of [RESET_A,RESET_B,RESET_C]){const x=resetLiteral();x.snapshot.collections[0].accountId=x.snapshot.analytics[0].accountId=accountId;expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).analyticsIds).toEqual(['40000000-0000-4000-8000-000000000001']);}
    const mutations=[(x:any)=>x.snapshot.analytics[0].category='books',(x:any)=>x.snapshot.collections[0].category='books',(x:any)=>x.snapshot.analytics[0].collectionId=null,(x:any)=>x.snapshot.analytics[0].collectionId=RESET_B,(x:any)=>x.snapshot.collections=[],(x:any)=>x.snapshot.analytics[0].recommendationId=RESET_B,(x:any)=>{x.snapshot.analytics[0].collectionId=null;x.snapshot.analytics[0].recommendationId=RESET_B;},(x:any)=>x.snapshot.analytics[0].accountId=RESET_B,(x:any)=>x.snapshot.collections[0].accountId=RESET_B,(x:any)=>{x.snapshot.collections[0].accountId=x.snapshot.analytics[0].accountId=RESET_FOREIGN;}];
    for(const mutate of mutations){const x=resetLiteral();mutate(x);expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).analyticsIds).toEqual([]);}
  });
  it('Guides pure reset: media require whole trusted original local ready tuples',async()=>{
    const s:any=await support();expect(s.selectOwnedGuidesResetReferences,'future pure selector export setup').toBeTypeOf('function');
    for(const purpose of ['collection','guide']){const x=resetLiteral();x.snapshot.media[0].purpose=x.ownership.trackedMedia[0].purpose=purpose;expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([{...RESET_EXPECTED.media[0],purpose}]);}
    for(const accountId of [RESET_B,RESET_C]){const x=resetLiteral(),key=`local/${accountId}/${RESET_MEDIA}`;x.snapshot.media[0].accountId=x.snapshot.objects[0].accountId=x.ownership.trackedMedia[0].accountId=accountId;x.snapshot.objects[0].key=x.ownership.trackedMedia[0].key=key;expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([{...RESET_EXPECTED.media[0],accountId,key}]);}
    for(const [ledgerPurpose,assetPurpose] of [['guide','collection'],['collection','guide']]){const x=resetLiteral();x.ownership.trackedMedia[0].purpose=ledgerPurpose;x.snapshot.media[0].purpose=assetPurpose;expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([]);}
    const siblings=resetLiteral();siblings.snapshot.objects.push({mediaId:RESET_MEDIA,accountId:RESET_A,variant:'thumbnail',environment:'local',key:'local/thumbnail/unrelated'},{mediaId:RESET_MEDIA,accountId:RESET_A,variant:'original',environment:'production',key:'production/unrelated'});expect(s.selectOwnedGuidesResetReferences(siblings.snapshot,siblings.ownership).media).toEqual(RESET_EXPECTED.media);siblings.snapshot.objects.reverse();expect(s.selectOwnedGuidesResetReferences(siblings.snapshot,siblings.ownership).media).toEqual(RESET_EXPECTED.media);
    const foreign=resetLiteral();foreign.snapshot.media[0].accountId=foreign.snapshot.objects[0].accountId=foreign.ownership.trackedMedia[0].accountId=RESET_FOREIGN;foreign.snapshot.objects[0].key=foreign.ownership.trackedMedia[0].key='local/20000000-0000-4000-8000-000000000004/50000000-0000-4000-8000-000000000001';expect(()=>s.selectOwnedGuidesResetReferences(foreign.snapshot,foreign.ownership),'otherwise consistent foreign ledger authority').toThrow();foreign.ownership.trackedMedia=[];expect(s.selectOwnedGuidesResetReferences(foreign.snapshot,foreign.ownership).media).toEqual([]);
    for(const [list,patch] of [['media',{accountId:RESET_B}],['media',{purpose:'profile'}],['media',{status:'pending'}],['media',{status:'failed'}],['objects',{accountId:RESET_B}],['objects',{variant:'thumbnail'}],['objects',{environment:'production'}],['objects',{mediaId:RESET_OTHER_MEDIA}],['objects',{key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'}],['objects',{key:'local/../foreign'}]] as const){const x=resetLiteral();Object.assign(x.snapshot[list][0],patch);expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([]);}
    for(const list of ['media','objects']){const x=resetLiteral();x.snapshot[list]=[];expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([]);}
    const untracked=resetLiteral();untracked.ownership.trackedMedia=[];expect(s.selectOwnedGuidesResetReferences(untracked.snapshot,untracked.ownership).media).toEqual([]);
    for(const patch of [{id:'bad'},{accountId:RESET_FOREIGN},{purpose:'profile'},{variant:'thumbnail'},{environment:'production'},{key:'local/../foreign'},{key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'}]){const x=resetLiteral();Object.assign(x.ownership.trackedMedia[0],patch);expect(()=>s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toThrow();}
    const duplicate=resetLiteral();duplicate.ownership.trackedMedia.push(clone(duplicate.ownership.trackedMedia[0]));expect(()=>s.selectOwnedGuidesResetReferences(duplicate.snapshot,duplicate.ownership)).toThrow();
    const mixed=resetLiteral();const second={id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'};mixed.ownership.trackedMedia.push(second);mixed.snapshot.media.push({id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',status:'ready'});mixed.snapshot.objects.push({mediaId:RESET_OTHER_MEDIA,accountId:RESET_A,variant:'original',environment:'local',key:RESET_EXPECTED.media[0].key});mixed.snapshot.objects[0].key=second.key;expect(s.selectOwnedGuidesResetReferences(mixed.snapshot,mixed.ownership).media).toEqual([]);
    const duplicateKey=clone(mixed);duplicateKey.ownership.trackedMedia[1].key=duplicateKey.ownership.trackedMedia[0].key;expect(()=>s.selectOwnedGuidesResetReferences(duplicateKey.snapshot,duplicateKey.ownership)).toThrow();
  });
  it('Guides pure reset: unrelated rows remain excluded while owned native rows survive',async()=>{
    const s:any=await support();expect(s.selectOwnedGuidesResetReferences,'future pure selector export setup').toBeTypeOf('function');const x=resetLiteral();
    x.snapshot.collections.push({id:RESET_B,accountId:RESET_FOREIGN,category:'guides'},{id:RESET_C,accountId:RESET_C,category:'guides'});
    x.snapshot.analytics.push({id:RESET_B,accountId:RESET_FOREIGN,category:'guides',collectionId:RESET_B,recommendationId:null},{id:RESET_C,accountId:RESET_C,category:'guides',collectionId:RESET_C,recommendationId:null});
    x.snapshot.media.push({id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',status:'ready'});
    x.snapshot.objects.push({mediaId:RESET_OTHER_MEDIA,accountId:RESET_A,variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'});
    expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toEqual({analyticsIds:['20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001'],media:RESET_EXPECTED.media});
    // Later native records need verified rows, not finite initial seed membership.
    x.ownership.trackedMedia.push({id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'});
    expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership).media).toEqual([RESET_EXPECTED.media[0],{id:'50000000-0000-4000-8000-000000000002',accountId:'20000000-0000-4000-8000-000000000001',purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'}]);
  });
  it('Guides pure reset: deterministic fresh output preserves inputs and existing generation semantics',async()=>{
    const s:any=await support();expect(s.selectOwnedGuidesResetReferences,'future pure selector export setup').toBeTypeOf('function');const x=resetLiteral(),before=clone(x);
    const first=s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership),second=s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership);
    expect(first).toEqual(RESET_EXPECTED);expect(second).toEqual(RESET_EXPECTED);expect(x).toEqual(before);
    expect(Object.keys(first).sort()).toEqual(['analyticsIds','media']);expect(Object.getPrototypeOf(first)).toBe(Object.prototype);expect(Array.isArray(first.analyticsIds)).toBe(true);expect(Array.isArray(first.media)).toBe(true);
    expect(first).not.toBe(second);expect(first.analyticsIds).not.toBe(second.analyticsIds);expect(first.media).not.toBe(second.media);expect(first.media[0]).not.toBe(second.media[0]);expect(first.media[0]).not.toBe(x.ownership.trackedMedia[0]);expect(Object.getPrototypeOf(first.media[0])).toBe(Object.prototype);
    first.analyticsIds.push(RESET_B);first.media[0].key='mutated';expect(second).toEqual(RESET_EXPECTED);expect(x).toEqual(before);
    for(const list of ['collections','analytics','media','objects'])x.snapshot[list].reverse();x.ownership.trackedMedia.reverse();expect(s.selectOwnedGuidesResetReferences(x.snapshot,x.ownership)).toEqual(RESET_EXPECTED);
    const ordered=resetLiteral();ordered.snapshot.analytics.unshift({id:RESET_C,accountId:RESET_A,category:'guides',collectionId:RESET_COLLECTION,recommendationId:null},{id:RESET_B,accountId:RESET_A,category:'guides',collectionId:RESET_COLLECTION,recommendationId:null});
    const other={id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'};ordered.ownership.trackedMedia.unshift(other);ordered.snapshot.media.unshift({id:RESET_OTHER_MEDIA,accountId:RESET_A,purpose:'guide',status:'ready'});ordered.snapshot.objects.unshift({mediaId:RESET_OTHER_MEDIA,accountId:RESET_A,variant:'original',environment:'local',key:other.key});
    const expectedOrdered={analyticsIds:['20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001'],media:[RESET_EXPECTED.media[0],{id:'50000000-0000-4000-8000-000000000002',accountId:'20000000-0000-4000-8000-000000000001',purpose:'guide',variant:'original',environment:'local',key:'local/20000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000002'}]};expect(s.selectOwnedGuidesResetReferences(ordered.snapshot,ordered.ownership)).toEqual(expectedOrdered);for(const list of ['collections','analytics','media','objects'])ordered.snapshot[list].reverse();ordered.ownership.trackedMedia.reverse();expect(s.selectOwnedGuidesResetReferences(ordered.snapshot,ordered.ownership)).toEqual(expectedOrdered);
    const invalid=clone(before);invalid.snapshot.extra=undefined;const invalidBefore=clone(invalid);expect(()=>s.selectOwnedGuidesResetReferences(invalid.snapshot,invalid.ownership)).toThrow();expect(invalid).toEqual(invalidBefore);
    // Existing 43 tests retain control admission/generation assertions; no transitions live here.
  });
});

// Resource orchestration witnesses use only private in-memory foreign-interface fakes.
// They do not establish PostgreSQL constraints, native settlement, signed-session
// acceptance, byte transport, or filesystem identity on a real host.
import {vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {createHash, createHmac} from 'node:crypto';
import {dirname, join, parse as parsePath, sep} from 'node:path';
import type {Pool, PoolClient, QueryResult} from 'pg';
import type {createServer, IncomingMessage, ServerResponse, RequestListener} from 'node:http';
import type * as FsPromises from 'node:fs/promises';
import type {LocalObjectStorage, OwnedStoragePut} from '../../services/objectStorage';
import type {createCanonicalApp} from '../../auth/canonicalApp';
import type {ExplorersAuthConfig} from '../../auth/betterAuth';
import type {OwnedUatDatabaseAuthority} from '../../../scripts/music-uat-database';
import type * as GuideRepository from '../../repositories/guideRepository';
import type {GuideCollectionDetails, GuideSectionBlocks} from '../../../shared/explorersGuideContract';

type ResourceOwner='ownerA'|'ownerB'|'ownerC';
type ResourceThree<T>={ownerA:T;ownerB:T;ownerC:T};
type ResourceOptions={
  pool:Pool;composed:ReturnType<typeof createCanonicalApp>;config:ExplorersAuthConfig;
  runId:string;commit:string;authority:OwnedUatDatabaseAuthority;
  personas:ResourceThree<{userId:string;cookie:string;handle:string}>;
  expectedTemporaryRoot:string;disposableDirectory:string;
  storage:{directory:string;instance:Pick<LocalObjectStorage,'environment'|'putOwned'|'get'|'delete'>};
  port:number;apiOrigin:string;
};
type ResourceDependencies={
  fs:Pick<typeof FsPromises,'lstat'|'realpath'|'mkdir'>;
  createServer:typeof createServer;fetch:typeof globalThis.fetch;
  guideRepository:Pick<typeof GuideRepository,'writeGuideDetails'|'createGuideSection'|'attachGuideCover'|'readGuideDetails'>;
};
type ResourceHandle={version:1;url:string;capability:string;runId:string;commit:string;close:()=>Promise<void>};
type ResourceStart=(options:ResourceOptions,dependencies?:ResourceDependencies)=>Promise<ResourceHandle>;
type ResourceRow=Record<string,unknown>;
type ResourceEvent={kind:string;sql?:string;values?:readonly unknown[];data?:unknown};
type ResourceReply={status:number;headers:Record<string,string>;body:ResourceRow;chunks:string[]};
type ResourceDeferred<T>={promise:Promise<T>;resolve:(value:T)=>void;reject:(error:unknown)=>void};
function resourceDeferred<T>():ResourceDeferred<T>{
  let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
  const promise=new Promise<T>((ok,no)=>{resolve=ok;reject=no;});
  // Native rejection stays observed even when an operation loses a deadline race.
  void promise.catch(()=>undefined);return {promise,resolve,reject};
}
const RESOURCE_OWNERS:ResourceOwner[]=['ownerA','ownerB','ownerC'];
const resourceId=(n:number)=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
const RESOURCE_ACCOUNTS=[resourceId(1),resourceId(2),resourceId(3)];
const RESOURCE_TIME='2026-10-10T00:00:00.000Z';
const RESOURCE_SURFACES=['profile_media','profile_feed_items','collection_media','recommendation_media',
  'guide_section_photos','recommendation_book_covers','recommendation_movie_media'] as const;
function isResourceRecord(value:unknown):value is ResourceRow{
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function resourceRecord(value:unknown):ResourceRow{
  if(!isResourceRecord(value))throw new Error('Expected private JSON record');return value;
}
function resourceBuffer(value:unknown):Buffer{
  if(!Buffer.isBuffer(value))throw new Error('Expected Buffer');return value;
}
function resourceRows(value:unknown):ResourceRow[]{
  if(!Array.isArray(value))throw new Error('Expected private JSON array');
  return value.map(resourceRecord);
}
function resourceText(value:unknown):string{
  if(typeof value!=='string')throw new Error('Expected string');return value;
}
function resourceNumber(value:unknown):number{
  if(typeof value!=='number')throw new Error('Expected number');return value;
}
async function resourceStartExport():Promise<ResourceStart>{
  const module=await support(),candidate:unknown=Reflect.get(module,'startGuidesControl');
  expect(candidate,'future resource controller export setup').toBeTypeOf('function');
  // Only the missing/new external runtime entry is cast; fake internals stay typed.
  return candidate as ResourceStart;
}
function resourceLeaves(value:unknown):unknown[]{
  return Array.isArray(value)?value.flatMap(resourceLeaves):[value];
}
function resourceError(reply:ResourceReply,status:number,error:string){
  expect(reply.status).toBe(status);expect(reply.body).toEqual({version:1,error});
  expect(reply.headers['cache-control']).toBe('no-store');
  expect(reply.headers['content-type']).toMatch(/^application\/json(?:;|$)/);
  expect(reply.chunks).toHaveLength(1);
}
function resourceCleanup(error:unknown,unsettled:boolean,failures:string[]){
  expect(error).toBeInstanceOf(Error);
  expect(resourceRecord(error).name).toBe('GuidesControlCleanupError');
  expect(resourceRecord(error).message).toBe('Guides control cleanup failed');
  const record=resourceRecord(error);
  expect(record.code).toBe('GUIDES_CONTROL_CLEANUP_FAILED');expect(record.unsettled).toBe(unsettled);
  expect(record.failures).toEqual(failures);
  for(const key of ['code','unsettled','failures'])expect(Object.prototype.propertyIsEnumerable.call(error,key)).toBe(true);
}
async function resourceTurns(count=40){for(let i=0;i<count;i++)await Promise.resolve();}
async function resourceUntil(condition:()=>boolean){
  for(let i=0;i<2000&&!condition();i++)await Promise.resolve();
  expect(condition(),'controlled operation reached its witness barrier').toBe(true);
}
const resourceMutation=(event:ResourceEvent)=>event.kind==='query'&&/^\s*(insert|update|delete)\b/i.test(event.sql??'');
function resourceObserveTransaction(trace:ResourceEvent[],ending:'COMMIT'|'ROLLBACK'){
  const starts=trace.flatMap((event,index)=>event.kind==='query'&&/^\s*BEGIN\b/i.test(event.sql??'')?[index]:[]);
  const ends=trace.flatMap((event,index)=>event.kind==='query'&&new RegExp('^\\s*'+ending+'\\b','i').test(event.sql??'')?[index]:[]);
  expect(starts,'one observation transaction').toHaveLength(1);expect(ends).toHaveLength(1);
  const begin=starts[0],end=ends[0];expect(begin).toBeLessThan(end);
  expect(trace.some(event=>event.kind==='query'&&new RegExp('^\\s*'+(ending==='COMMIT'?'ROLLBACK':'COMMIT')+'\\b','i').test(event.sql??''))).toBe(false);
  const firstRead=trace.findIndex((event,index)=>index>begin&&event.kind==='query'&&/^\s*(SELECT|WITH)\b/i.test(event.sql??''));
  expect(firstRead).toBeGreaterThan(begin);
  const setup=trace.slice(begin,firstRead).filter(event=>event.kind==='query').map(event=>event.sql).join('\n');
  expect(setup,'repeatable-read isolation is independent of read-only').toMatch(/\bREPEATABLE\s+READ\b/i);
  expect(setup,'read-only access is independent of isolation').toMatch(/\bREAD\s+ONLY\b/i);
  for(const [index,event] of trace.entries())if(event.kind==='query'||event.kind==='repository-read-details'){
    expect(index,'every live SQL/repository read belongs to the sole transaction').toBeGreaterThanOrEqual(begin);
    expect(index).toBeLessThanOrEqual(end);
  }
}

function resourceFixture(){
  const events:ResourceEvent[]=[],tables=new Map<string,ResourceRow[]>(),details=new Map<string,GuideCollectionDetails>();
  const files=new Map<string,Buffer>(),nodes=new Map<string,{kind:'directory'|'file'|'link';dev:number;ino:number;canonical:string}>();
  let next=1000,nodeId=1,transaction:Map<string,ResourceRow[]>|undefined;
  let listener:RequestListener|undefined;
  const controlHost='127.0.0.1:51000',apiOrigin='http://127.0.0.1:51001';
  const temporaryRoot=sep==='\\'?'C:\\guides-fake-temp':'/guides-fake-temp';
  const disposableDirectory=join(temporaryRoot,'explorers-profile-e2e-Guides123'),directory=join(disposableDirectory,'owned-media');
  const config:ExplorersAuthConfig={baseURL:apiOrigin,googleCallbackURL:apiOrigin+'/api/auth/callback/google',
    trustedOrigins:[apiOrigin],secret:'private-guide-fake-secret-'.repeat(3),googleClientId:'fake-id',googleClientSecret:'fake-secret'};
  const personas:ResourceThree<{userId:string;cookie:string;handle:string}>={
    ownerA:{userId:'auth|guide-a',cookie:'initial=a',handle:'guide-owner-a'},
    ownerB:{userId:'auth|guide-b',cookie:'initial=b',handle:'guide-owner-b'},
    ownerC:{userId:'auth|guide-c',cookie:'initial=c',handle:'guide-owner-c'},
  };
  const accounts=RESOURCE_OWNERS.map((owner,i)=>({id:RESOURCE_ACCOUNTS[i],user_id:personas[owner].userId,
    handle:personas[owner].handle,revision:String([7,13,29][i]),status:'active',public_profile:true,
    account_type:'Creator',onboarding_status:'complete'}));
  tables.set('creator_accounts',accounts);
  tables.set('initial_account_bindings',accounts.map(row=>({user_id:row.user_id,account_id:row.id})));
  tables.set('user_security_state',accounts.map(row=>({user_id:row.user_id,blocked_at:null})));
  tables.set('account_category_settings',accounts.map(row=>({account_id:row.id,category:'guides',is_public:true})));
  tables.set('account_category_content_state',accounts.map((row,i)=>({account_id:row.id,category:'guides',revision:String([47,59,71][i])})));
  for(const name of ['collections','guide_sections','guide_collection_details','analytics_events','analytics_event_receipts',
    'media_assets','media_objects',...RESOURCE_SURFACES])tables.set(name,[]);
  function ancestors(path:string):string[]{
    const result=[path];while(result[0]!==parsePath(result[0]).root)result.unshift(dirname(result[0]));return result;
  }
  function directoryNode(path:string){nodes.set(path,{kind:'directory',dev:1,ino:nodeId++,canonical:path});}
  for(const path of ancestors(disposableDirectory))directoryNode(path);
  const controls={
    database:'music_uat_'+runId,connectGate:undefined as ResourceDeferred<void>|undefined,
    queryGate:undefined as {match:RegExp;gate:ResourceDeferred<void>}|undefined,
    queryFailure:undefined as RegExp|undefined,
    fetchGate:undefined as {match:RegExp;gate:ResourceDeferred<void>}|undefined,
    fetchFailure:undefined as RegExp|undefined,fetchStatus:200,
    meAccount:undefined as string|undefined,meRevision:undefined as number|undefined,
    sessionAccount:undefined as string|undefined,sessionRevision:undefined as number|undefined,
    sessionFailure:false,listenGate:undefined as ResourceDeferred<void>|undefined,listenFailure:false,
    listenerCloseFailure:false,putGate:undefined as ResourceDeferred<void>|undefined,
    putFailure:false,putNativeFailure:false,putCompletionFailure:false,
    getFailure:false,getCorrupt:false,getTruncated:false,deleteFailure:false,
    repositoryFailure:undefined as 'details'|'section'|'cover'|undefined,
    fsGate:undefined as {match:string;gate:ResourceDeferred<void>}|undefined,
    fsFailure:undefined as string|undefined,
  };
  const rowset=(name:string)=>{const found=tables.get(name);if(!found)throw new Error('Unknown fake table '+name);return found;};
  function snapshotTables(){
    // PostgreSQL bytea is Buffer, unlike structuredClone(Buffer)'s Uint8Array.
    return new Map([...tables].map(([name,rows])=>[name,rows.map(row=>({...clone(row),
      ...(Buffer.isBuffer(row.content_sha256)?{content_sha256:Buffer.from(row.content_sha256)}:{})}))]));
  }
  const owned=(row:ResourceRow)=>RESOURCE_ACCOUNTS.includes(resourceText(row.account_id));
  function categoryRevision(accountId:string):number{
    const row=rowset('account_category_content_state').find(r=>r.account_id===accountId);
    return row?Number(row.revision):0;
  }
  function bump(accountId:string){
    const row=rowset('account_category_content_state').find(r=>r.account_id===accountId);
    if(row)row.revision=String(Number(row.revision)+3);
  }
  function scoped(sql:string,values:readonly unknown[],rows:ResourceRow[]):ResourceRow[]{
    let result=rows;
    const aliases=new Map([...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?:AS\s+)?(?!WHERE\b|ON\b|JOIN\b|ORDER\b|LIMIT\b|FOR\b|LEFT\b|INNER\b)(\w+))?/gi)]
      .map(match=>[match[2]??match[1],match[1]]));
    for(const match of sql.matchAll(/\b(?:(\w+)\.)?(id|account_id|user_id|collection_id|section_id|media_id|event_id|category|purpose)\s*=\s*(?:ANY\s*\(\s*)?\$(\d+)/gi)){
      const wanted=resourceLeaves(values[Number(match[3])-1]),table=aliases.get(match[1]);
      if(wanted.length&&wanted[0]!==undefined)result=result.filter(row=>{
        const column=match[2].toLowerCase();
        const value=column!=='id'?row[column]:table==='collections'?(row.collection_id??row.guide_id??row.id):
          table==='guide_sections'?(row.section_id??row.id):table==='media_assets'?(row.media_id??row.id):row.id;
        return wanted.includes(value);
      });
    }
    if(/\bcategory\s*=\s*'guides'/i.test(sql))result=result.filter(row=>!('category' in row)||row.category==='guides');
    for(const match of sql.matchAll(/\b(category|purpose)\s+IN\s*\(([^)]*)\)/gi)){
      const allowed=[...match[2].matchAll(/'([^']+)'/g)].map(item=>item[1]);
      if(allowed.length)result=result.filter(row=>allowed.includes(resourceText(row[match[1].toLowerCase()])));
    }
    // A requested cap may be literal or parameterized; never silently invent a cap.
    const limit=sql.match(/\bLIMIT\s+(\d+|\$\d+)/i);
    if(limit){const n=limit[1].startsWith('$')?Number(values[Number(limit[1].slice(1))-1]):Number(limit[1]);result=result.slice(0,n);}
    return result;
  }
  function projected(sql:string,rows:ResourceRow[]):ResourceRow[]{
    return rows.map(row=>{
      const result={...row};
      for(const match of sql.matchAll(/(?:\b\w+\.)?(\w+)(?:::\w+)?\s+AS\s+"?(\w+)"?/gi))
        if(match[1] in row)result[match[2]]=row[match[1]];
      for(const match of sql.matchAll(/encode\s*\(\s*(?:\w+\.)?content_sha256\s*,\s*'hex'\s*\)\s+AS\s+"?(\w+)"?/gi))
        result[match[1]]=row.content_sha256===null?null:resourceBuffer(row.content_sha256).toString('hex');
      return result;
    });
  }
  function joinedAccounts(sql:string):ResourceRow[]{
    return rowset('initial_account_bindings').flatMap(binding=>{
      const account=rowset('creator_accounts').find(a=>a.id===binding.account_id);
      if(!account)return [];
      const security=rowset('user_security_state').find(s=>s.user_id===binding.user_id);
      if(/JOIN\s+user_security_state/i.test(sql)&&!security&&!/LEFT\s+JOIN\s+user_security_state/i.test(sql))return [];
      const setting=rowset('account_category_settings').find(s=>s.account_id===account.id&&s.category==='guides');
      return [{...account,...binding,...security,account_id:account.id,account_revision:account.revision,
        guides_public:setting?.is_public,is_public:setting?.is_public,
        guides_content_revision:String(categoryRevision(resourceText(account.id)))}];
    });
  }
  function insert(sql:string,values:readonly unknown[]):ResourceRow[]{
    const match=sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([\s\S]*?)\)\s*(?:RETURNING|ON\s+CONFLICT|;?\s*$)/i);
    if(!match)throw new Error('Fake requires explicit INSERT columns and VALUES, not an injected seed');
    const name=match[1],columns=match[2].split(',').map(s=>s.trim());
    const tokens=match[3].split(/,(?![^()]*\))/).map(s=>s.trim());
    const row:ResourceRow={};
    for(let i=0;i<columns.length;i++){
      const token=tokens[i]??'NULL',param=token.match(/^\$(\d+)/);
      let value:unknown=param?values[Number(param[1])-1]:/^'.*'$/.test(token)?token.slice(1,-1):
        /^null$/i.test(token)?null:/^(true|false)$/i.test(token)?token.toLowerCase()==='true':
        /^(now|clock_timestamp)\(/i.test(token)?new Date(RESOURCE_TIME):Number(token);
      if(/::jsonb/.test(token)&&typeof value==='string')value=JSON.parse(value);
      row[columns[i]]=value;
    }
    if(name==='collections'){
      Object.assign(row,{id:row.id??resourceId(next++),revision:'31',description:row.description??null,
        pin_order:row.pin_order??null,archived_at:row.archived_at??null});
      bump(resourceText(row.account_id));
    }
    if(name==='media_assets')Object.assign(row,{id:row.id??resourceId(next++),width_px:row.width_px??8,height_px:row.height_px??8,
      original_filename:row.original_filename??null,alternative_text:row.alternative_text??null,caption:row.caption??null,
      ready_at:row.ready_at??new Date(RESOURCE_TIME),deleted_at:row.deleted_at??null});
    if(name==='media_objects')Object.assign(row,{storage_version_id:row.storage_version_id??null,deleted_at:row.deleted_at??null});
    if(name==='media_assets'||name==='media_objects'){
      row.byte_size=String(row.byte_size);
      if(typeof row.content_sha256==='string')row.content_sha256=Buffer.from(row.content_sha256,'hex');
    }
    rowset(name).push(row);return [row];
  }
  async function query(sql:string,values:readonly unknown[]=[]):Promise<QueryResult<ResourceRow>>{
    events.push({kind:'query',sql,values:clone(values)});
    if(controls.queryGate?.match.test(sql))await controls.queryGate.gate.promise;
    if(controls.queryFailure?.test(sql))throw new Error('private SQL failure with secrets');
    let rows:ResourceRow[]=[];
    const primary=sql.match(/\bFROM\s+(\w+)/i)?.[1];
    if(/^\s*BEGIN\b/i.test(sql)){expect(transaction,'one transaction, no nested reserve/markReady').toBeUndefined();transaction=snapshotTables();}
    else if(/^\s*COMMIT\b/i.test(sql)){expect(transaction).toBeDefined();transaction=undefined;}
    else if(/^\s*ROLLBACK\b/i.test(sql)){if(transaction){tables.clear();for(const [name,list] of transaction)tables.set(name,list);transaction=undefined;}}
    else if(/^\s*SET\b/i.test(sql)){/* settings are asserted by the test, not simulated */}
    else if(/current_database\s*\(/i.test(sql)){
      rows=[{current_database:controls.database,database:controls.database}];
      const alias=sql.match(/current_database\s*\(\)\s+AS\s+"?(\w+)/i);if(alias)rows[0][alias[1]]=controls.database;
    }
    else if(/^\s*INSERT\b/i.test(sql))rows=insert(sql,values);
    else if(/^\s*UPDATE\s+analytics_event_receipts\b/i.test(sql)){
      for(const row of scoped(sql,values,rowset('analytics_event_receipts'))){row.event_id=null;row.retired_at=row.retired_at??new Date(RESOURCE_TIME);}
    }
    else if(/^\s*UPDATE\b/i.test(sql)){
      const table=sql.match(/UPDATE\s+(\w+)/i)?.[1];if(!table)throw new Error('Unknown update');
      if(table==='user_security_state')throw new Error('Forbidden lifecycle repair');
      rows=scoped(sql,values,rowset(table));
      for(const row of rows){
        for(const match of sql.matchAll(/\b(\w+)\s*=\s*(\$\d+|'[^']*'|true|false|NULL)(?=::|\s*[,W]|\s*$)/gi)){
          if(match[1]==='account_id'||match[1]==='id'||match[1]==='user_id')continue;
          const token=match[2];row[match[1]]=token.startsWith('$')?values[Number(token.slice(1))-1]:
            token.startsWith("'")?token.slice(1,-1):/^null$/i.test(token)?null:token.toLowerCase()==='true';
        }
      }
    }
    else if(/^\s*DELETE\b/i.test(sql)){
      const table=sql.match(/DELETE\s+FROM\s+(\w+)/i)?.[1];if(!table)throw new Error('Unknown delete');
      if(table==='analytics_event_receipts'||table==='user_security_state'||table==='creator_accounts')throw new Error('Forbidden custody deletion');
      rows=scoped(sql,values,rowset(table));tables.set(table,rowset(table).filter(row=>!rows.includes(row)));
      if(table==='collections'){
        const ids=rows.map(row=>row.id);
        const sectionIds=rowset('guide_sections').filter(row=>ids.includes(row.collection_id)).map(row=>row.id);
        tables.set('guide_sections',rowset('guide_sections').filter(row=>!ids.includes(row.collection_id)));
        tables.set('collection_media',rowset('collection_media').filter(row=>!ids.includes(row.collection_id)));
        tables.set('guide_section_photos',rowset('guide_section_photos').filter(row=>!sectionIds.includes(row.section_id)));
        for(const id of ids)details.delete(resourceText(id));
      }
    }
    else if(primary==='initial_account_bindings'||primary==='creator_accounts'&&/JOIN\s+(initial_account_bindings|account_category_settings|account_category_content_state|user_security_state)/i.test(sql))rows=scoped(sql,values,joinedAccounts(sql));
    else if(primary==='user_security_state')rows=scoped(sql,values,rowset('user_security_state'));
    else if(primary==='account_category_content_state'){
      rows=scoped(sql,values,rowset('account_category_content_state'));
      if(/coalesce/i.test(sql)&&rows.length===0)rows=[{revision:'0'}];
    }
    else if(primary==='account_category_settings')rows=scoped(sql,values,rowset('account_category_settings'));
    else if(primary==='creator_accounts')rows=scoped(sql,values,rowset('creator_accounts'));
    else {
      const sources=[...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map(m=>m[1]);
      const surface=sources.find(name=>(RESOURCE_SURFACES as readonly string[]).includes(name));
      const source=surface??sources.find(name=>tables.has(name));
      if(!source)throw new Error('Unrecognized query in explicit resource fake: '+sql);
      const surfaceSources=[...new Set(sources.filter(name=>(RESOURCE_SURFACES as readonly string[]).includes(name)))];
      rows=(surface?surfaceSources.flatMap(name=>rowset(name)):rowset(source)).map(row=>({...row}));
      if(source==='media_objects'){
        expect(sql,'object account authority comes from joined asset, not object row').toMatch(/JOIN\s+media_assets/i);
        rows=rows.flatMap(row=>{
          const asset=rowset('media_assets').find(a=>a.id===row.media_id);
          // Honor the required inner join: missing assets are not selected rows.
          return asset?[{...row,id:row.media_id,account_id:asset.account_id,purpose:asset.purpose}]:[];
        });
      }
      if(surface)rows=rows.flatMap(row=>{
        const photo='section_id' in row,section=photo?rowset('guide_sections').find(s=>s.id===row.section_id&&s.account_id===row.account_id):undefined;
        if(photo&&/JOIN\s+guide_sections\b/i.test(sql)&&!section)return [];
        const collectionId=photo?section?.collection_id:row.collection_id;
        const collection=rowset('collections').find(c=>c.id===collectionId&&c.account_id===row.account_id);
        if(/JOIN\s+collections\b/i.test(sql)&&!collection)return [];
        return [{...row,...(collection?{category:collection.category}:{}),
          ...(photo?{collection_id:collectionId,guide_id:collectionId,slot:'section-photo'}:
            source==='collection_media'?{guide_id:collectionId,slot:'cover'}:{})}];
      });
      if(source==='guide_sections'&&/JOIN\s+collections\b/i.test(sql))rows=rows.flatMap(row=>{
        const parent=rowset('collections').find(c=>c.id===row.collection_id&&c.account_id===row.account_id);
        return parent?[{...row,category:parent.category}]:[];
      });
      if(source==='collections')rows=rows.map(row=>({...row,category_content_revision:String(
        RESOURCE_ACCOUNTS.includes(resourceText(row.account_id))?categoryRevision(resourceText(row.account_id)):99)}));
      rows=scoped(sql,values,rows);
      if(/count\s*\(\s*\*\s*\)/i.test(sql))rows=[{count:String(rows.length)}];
      if(/SELECT\s+EXISTS/i.test(sql)){
        const alias=sql.match(/\)\s+AS\s+"?(\w+)"?\s*;?\s*$/i)?.[1]??'exists',exists=rows.length>0;
        rows=[{[alias]:exists}];
      }
    }
    rows=projected(sql,rows);return {command:sql.trim().split(/\s+/)[0],rowCount:rows.length,oid:0,fields:[],rows};
  }
  const client={query,release:(error?:Error|boolean)=>events.push({kind:'release',data:!!error})};
  // Cast only the narrow implemented foreign interfaces, never fake state or expected DTOs.
  const db=client as unknown as PoolClient;
  const pool={query,connect:async()=>{
    events.push({kind:'connect'});if(controls.connectGate)await controls.connectGate.promise;return db;
  },end:async()=>{events.push({kind:'forbidden-pool-end'});throw new Error('Parent owns pool');}} as unknown as Pool;
  async function fsBarrier(path:string){
    if(controls.fsGate?.match===path)await controls.fsGate.gate.promise;
    if(controls.fsFailure===path)throw new Error('private custody failure');
  }
  const fs={
    lstat:async(path:unknown)=>{
      const name=String(path);events.push({kind:'lstat',data:name});await fsBarrier(name);
      const node=nodes.get(name);if(!node)throw Object.assign(new Error('absent'),{code:'ENOENT'});
      return {dev:node.dev,ino:node.ino,isDirectory:()=>node.kind==='directory',isFile:()=>node.kind==='file',
        isSymbolicLink:()=>node.kind==='link'};
    },
    realpath:async(path:unknown)=>{const name=String(path);events.push({kind:'realpath',data:name});await fsBarrier(name);
      const node=nodes.get(name);if(!node)throw Object.assign(new Error('absent'),{code:'ENOENT'});return node.canonical;},
    mkdir:async(path:unknown,options?:{recursive?:boolean})=>{
      const name=String(path);events.push({kind:'mkdir',data:{path:name,options}});await fsBarrier(name);
      expect(options?.recursive??false,'controller makes directories one component at a time').toBe(false);
      if(nodes.has(name))throw Object.assign(new Error('exists'),{code:'EEXIST'});
      expect(nodes.get(dirname(name))?.kind).toBe('directory');directoryNode(name);
    },
  } as unknown as ResourceDependencies['fs'];
  const storage:ResourceOptions['storage']['instance']={
    environment:'local',
    putOwned:(key,bytes,deadlineMs):OwnedStoragePut=>{
      events.push({kind:'put',data:{key,bytes:Buffer.from(bytes),deadlineMs}});
      expect(deadlineMs).toBe(5000);
      const nativeResult=(async()=>{
        if(controls.putGate)await controls.putGate.promise;
        files.set(key,Buffer.from(bytes));nodes.set(join(directory,...key.split('/')),{kind:'file',dev:1,ino:nodeId++,canonical:join(directory,...key.split('/'))});
        if(controls.putNativeFailure)throw new Error('partial private write');
      })();
      void nativeResult.catch(()=>undefined);
      const completion=controls.putFailure||controls.putCompletionFailure?Promise.reject(new Error('put completion refused')):nativeResult;
      void completion.catch(()=>undefined);
      return {nativeResult,completion,settlement:nativeResult.then(()=>undefined,()=>undefined)};
    },
    get:async(key)=>{
      events.push({kind:'get',data:key});if(controls.getFailure)throw new Error('private get timeout');
      const found=files.get(key);if(!found)throw new Error('Missing fake bytes');
      const result=Buffer.from(found);
      if(controls.getCorrupt)result[0]^=1;
      if(controls.getTruncated)return result.subarray(0,result.length-1);
      return result;
    },
    delete:async(key)=>{
      events.push({kind:'delete',data:key});if(controls.deleteFailure)throw new Error('private delete timeout');
      files.delete(key);nodes.delete(join(directory,...key.split('/')));
    },
  };
  const sessionUsers=new Map<string,string>();
  const context={internalAdapter:{createSession:async(userId:string,remember:boolean)=>{
    events.push({kind:'session',data:{userId,remember}});expect(remember).toBe(false);
    if(controls.sessionFailure)throw new Error('private signing failure');
    const token='fresh-'+resourceId(next++);sessionUsers.set(token,userId);return {token};
  }},authCookies:{sessionToken:{name:'guides.session_token'}}};
  const composed={auth:{$context:Promise.resolve(context)}} as unknown as ReturnType<typeof createCanonicalApp>;
  const fetchFake:typeof globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    const method=init?.method??'GET',headers=new Headers(init?.headers),cookie=headers.get('Cookie')??'';
    events.push({kind:'fetch',data:{url,method,cookie,headers:Object.fromEntries(headers),body:init?.body,signal:init?.signal,redirect:init?.redirect}});
    expect(url.startsWith(apiOrigin+'/api/explorers/v1/')).toBe(true);
    expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);
    if(controls.fetchGate?.match.test(url+' '+method))await controls.fetchGate.gate.promise;
    if(controls.fetchFailure?.test(url+' '+method))throw new Error('private canonical wrapper rejected');
    const token=cookie.startsWith('guides.session_token=')?cookie.slice('guides.session_token='.length).split('.')[0]:undefined;
    let owner=RESOURCE_OWNERS.find(name=>personas[name].cookie===cookie);
    if(token)owner=RESOURCE_OWNERS.find(name=>personas[name].userId===sessionUsers.get(token));
    if(!owner)throw new Error('Unexpected private fake cookie');
    const index=RESOURCE_OWNERS.indexOf(owner),account=rowset('creator_accounts').find(a=>a.id===RESOURCE_ACCOUNTS[index]);
    if(!account)throw new Error('Missing account');
    if(token){
      const expected=createHmac('sha256',config.secret).update(token).digest('base64');
      expect(cookie).toBe('guides.session_token='+token+'.'+expected);
    }
    if(method==='PATCH'){
      expect(headers.get('Origin')).toBe(config.baseURL);
      const body=resourceRecord(JSON.parse(resourceText(init?.body)));
      expect(body.expectedRevision).toBe(Number(account.revision));expect(body.handle).toBe(personas[owner].handle);
      expect(body.accountType).toBe('Creator');expect(body.onboardingStatus).toBe('complete');
      expect(headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
      account.revision=String(Number(account.revision)+2);
    }
    const id=(token?controls.sessionAccount:controls.meAccount)??resourceText(account.id);
    const revision=(token?controls.sessionRevision:controls.meRevision)??Number(account.revision);
    return new Response(JSON.stringify({account:{id,revision,handle:account.handle,status:account.status,
      publicProfile:account.public_profile,accountType:'Creator',onboardingStatus:'complete'}}),
      {status:controls.fetchStatus,headers:{'Content-Type':'application/json'}});
  };
  const server=new EventEmitter() as EventEmitter & {
    headersTimeout:number;requestTimeout:number;keepAliveTimeout:number;
    listen:(...args:unknown[])=>unknown;close:(callback?:(error?:Error)=>void)=>unknown;
    closeIdleConnections:()=>void;closeAllConnections:()=>void;address:()=>{address:string;family:string;port:number};
    listening:boolean;
  };
  Object.assign(server,{headersTimeout:0,requestTimeout:0,keepAliveTimeout:0,listening:false});
  server.listen=(...args)=>{
    events.push({kind:'listen',data:args.filter(a=>typeof a!=='function')});
    const callback=args.find(a=>typeof a==='function');
    void (async()=>{
      if(controls.listenGate)await controls.listenGate.promise;
      if(controls.listenFailure){server.emit('error',new Error('private listener failure'));return;}
      server.listening=true;server.emit('listening');if(typeof callback==='function')callback();
    })();return server;
  };
  server.close=callback=>{
    events.push({kind:'listener-close'});server.listening=false;
    const error=controls.listenerCloseFailure?new Error('private listener close failure'):undefined;
    queueMicrotask(()=>{callback?.(error);server.emit('close');});return server;
  };
  server.closeIdleConnections=()=>events.push({kind:'idle-close'});
  server.closeAllConnections=()=>events.push({kind:'connections-close'});
  server.address=()=>({address:'127.0.0.1',family:'IPv4',port:51000});
  const createServerFake=((...args:unknown[])=>{
    events.push({kind:'create-server',data:args.find(arg=>typeof arg==='object')});
    const found=args.find(arg=>typeof arg==='function');
    if(typeof found!=='function')throw new Error('Controller must supply real request listener');
    listener=found as RequestListener;return server;
  }) as unknown as typeof createServer;
  function revisionWrite(kind:string,clientArg:PoolClient,collectionId:string,accountId:string,revision:number){
    expect(clientArg).toBe(db);
    const prior=events[events.length-1];
    expect(prior.kind,'every repository write rereads current category revision').toBe('query');
    expect(prior.sql).toMatch(/account_category_content_state/);
    expect(resourceLeaves(prior.values)).toContain(accountId);
    expect(revision).toBe(categoryRevision(accountId));
    events.push({kind:'repository-'+kind,data:{collectionId,accountId,revision}});
    if(controls.repositoryFailure===kind)throw new Error('private repository write failed');
  }
  const guideRepository:ResourceDependencies['guideRepository']={
    writeGuideDetails:async(clientArg,collectionId,accountId,revision,value)=>{
      revisionWrite('details',clientArg,collectionId,accountId,revision);
      details.set(collectionId,clone(value));bump(accountId);
    },
    createGuideSection:async(clientArg,collectionId,accountId,revision,input)=>{
      revisionWrite('section',clientArg,collectionId,accountId,revision);
      const id=resourceId(next++);events.push({kind:'returned-section-id',data:id});
      const blocks=clone(input.blocks),row={id,collection_id:collectionId,account_id:accountId,title:input.title,
        description:input.description,display_order:input.position??rowset('guide_sections').filter(r=>r.collection_id===collectionId).length,
        blocks,block_version:'guide-section-blocks/v1',archived_at:null,created_at:new Date(RESOURCE_TIME),updated_at:new Date(RESOURCE_TIME)};
      rowset('guide_sections').push(row);
      const ids=new Set([...blocks.timeline.morning,...blocks.timeline.afternoon,...blocks.timeline.evening,
        ...blocks.stay.accommodations,...blocks.activities.activities].flatMap(p=>p.photos.map(photo=>photo.mediaId)));
      for(const mediaId of ids)rowset('guide_section_photos').push({section_id:id,account_id:accountId,media_id:mediaId});
      bump(accountId);return id;
    },
    attachGuideCover:async(clientArg,collectionId,accountId,revision,mediaId)=>{
      revisionWrite('cover',clientArg,collectionId,accountId,revision);
      rowset('collection_media').push({collection_id:collectionId,account_id:accountId,media_id:mediaId,slot:'cover'});
      bump(accountId);return null;
    },
    readGuideDetails:async(clientArg,collectionId,accountId)=>{
      expect(clientArg).toBe(db);events.push({kind:'repository-read-details',data:{collectionId,accountId}});
      return details.has(collectionId)?clone(details.get(collectionId)!):null;
    },
  };
  const options:ResourceOptions={pool,composed,config,runId,commit,
    authority:{runId,commit,owned:true,database:'music_uat_'+runId,port:56000,
      containerId:'d'.repeat(64),imageId:'sha256:'+'e'.repeat(64),contextHost:'npipe:////./pipe/docker_engine'},
    personas,expectedTemporaryRoot:temporaryRoot,disposableDirectory,storage:{directory,instance:storage},port:51000,apiOrigin};
  const dependencies:ResourceDependencies={fs,createServer:createServerFake,fetch:fetchFake,guideRepository};
  function command(handle:ResourceHandle,action='reset',caseId:string=CASES[0],generation=0){
    return {version:1,action,runId,commit,caseId,project:PROJECTS[0],repeat:0,generation};
  }
  async function dispatch(handle:ResourceHandle,body:unknown,patch:{
    remote?:string;host?:string;capability?:string|string[];method?:string;url?:string;raw?:Buffer;bodyGate?:ResourceDeferred<void>;
  }={}):Promise<ResourceReply>{
    if(!listener)throw new Error('No controller listener');
    const done=resourceDeferred<ResourceReply>(),headers:Record<string,string>={},chunks:string[]=[];
    const raw=patch.raw??Buffer.from(JSON.stringify(body));
    const requestEmitter=new EventEmitter();
    const incoming=Object.assign(requestEmitter,{
      method:patch.method??'POST',url:patch.url??'/control',
      headers:{host:patch.host??controlHost,'x-guides-capability':patch.capability??handle.capability},
      rawHeaders:['Host',patch.host??controlHost,'x-guides-capability',
        typeof patch.capability==='string'?patch.capability:handle.capability],
      socket:{remoteAddress:patch.remote??'127.0.0.1',destroy:()=>events.push({kind:'request-destroy'})},
      destroy:()=>events.push({kind:'request-destroy'}),
      async *[Symbol.asyncIterator](){
        if(patch.bodyGate){events.push({kind:'body-barrier'});await patch.bodyGate.promise;}
        yield raw;
      },
    });
    const response={
      statusCode:200,writableEnded:false,headersSent:false,
      setHeader:(key:string,value:string|number|readonly string[])=>{headers[key.toLowerCase()]=String(value);},
      getHeader:(key:string)=>headers[key.toLowerCase()],
      writeHead:(status:number,values?:Record<string,string>)=>{
        response.statusCode=status;if(values)for(const [key,value] of Object.entries(values))headers[key.toLowerCase()]=value;return response;
      },
      write:(chunk:unknown)=>{chunks.push(Buffer.isBuffer(chunk)?chunk.toString():String(chunk));return true;},
      end:(chunk?:unknown)=>{
        if(chunk!==undefined)chunks.push(Buffer.isBuffer(chunk)?chunk.toString():String(chunk));
        expect(response.writableEnded,'exactly one response end').toBe(false);response.writableEnded=true;
        const text=chunks.join('');events.push({kind:'response',data:{status:response.statusCode,text}});
        try{done.resolve({status:response.statusCode,headers,body:resourceRecord(JSON.parse(text)),chunks});}
        catch(error){done.reject(error);}
        return response;
      },
      on:()=>response,once:()=>response,
    };
    listener(incoming as unknown as IncomingMessage,response as unknown as ServerResponse);
    return done.promise;
  }
  function addMedia(id:string,accountId=RESOURCE_ACCOUNTS[0],purpose='guide',status='ready'){
    const known=KNOWN_GUIDES_BYTES['old-cover'],key='local/'+accountId+'/'+id;
    rowset('media_assets').push({id,account_id:accountId,purpose,status,mime_type:'image/png',byte_size:String(74),
      content_sha256:Buffer.from(known.sha256,'hex'),original_filename:null,width_px:8,height_px:8,alternative_text:null,caption:null,
      ready_at:status==='ready'?new Date(RESOURCE_TIME):null,deleted_at:null});
    rowset('media_objects').push({media_id:id,account_id:accountId,variant:'original',storage_environment:'local',
      object_key:key,mime_type:'image/png',byte_size:'74',content_sha256:Buffer.from(known.sha256,'hex'),storage_version_id:null,deleted_at:null});
    files.set(key,Buffer.from(known.base64,'base64'));
    for(const path of ancestors(join(directory,'local',accountId)))if(!nodes.has(path))directoryNode(path);
    nodes.set(join(directory,...key.split('/')),{kind:'file',dev:1,ino:nodeId++,canonical:join(directory,...key.split('/'))});
    return key;
  }
  function addGuide(id:string,accountId=RESOURCE_ACCOUNTS[0],displayOrder=0,extra:ResourceRow={}){
    const row={id,account_id:accountId,category:'guides',title:'Native guide',description:null,slug:'native-'+id.slice(-4),
      display_order:displayOrder,revision:'97',visibility:'private',publication_state:'draft',pin_order:null,archived_at:null,...extra};
    rowset('collections').push(row);return row;
  }
  return {options,dependencies,controls,events,tables,rowset,details,files,nodes,server,db,command,dispatch,
    addMedia,addGuide,categoryRevision,owned,directoryNode,snapshotTables};
}

describe('private Guides resource controller orchestration against foreign-interface fakes',()=>{
  it('Guides resource custody: lazy entry and strict private options refuse before effects',async()=>{
    const start=await resourceStartExport();
    // A fresh import must not load the default resource adapters or initiate work.
    const imports:string[]=[];
    vi.resetModules();
    vi.doMock('node:http',()=>{imports.push('http');throw new Error('eager resource import');});
    vi.doMock('node:fs/promises',()=>{imports.push('fs');throw new Error('eager resource import');});
    vi.doMock('../../repositories/guideRepository',()=>{imports.push('repository');throw new Error('eager resource import');});
    try{
      await support();expect(imports).toEqual([]);
      const invalidDefault=resourceFixture();
      await expect(start({...invalidDefault.options,runId:'BAD'})).rejects.toBeInstanceOf(Error);
      expect(imports).toEqual([]);expect(invalidDefault.events).toEqual([]);
    }finally{
      vi.doUnmock('node:http');vi.doUnmock('node:fs/promises');vi.doUnmock('../../repositories/guideRepository');
      vi.resetModules();
    }
    const malformed:((f:ReturnType<typeof resourceFixture>)=>void)[]=[
      f=>{f.options.runId='F'.repeat(32);},f=>{f.options.commit='f'.repeat(39);},
      f=>{Object.assign(f.options,{untrusted:true});},
      f=>{f.options.authority.runId='a'.repeat(32);},f=>{f.options.authority.commit='a'.repeat(40);},
      f=>{Object.assign(f.options.authority,{owned:false});},f=>{f.options.authority.database='foreign';},
      f=>{f.options.authority.port=55999;},f=>{f.options.authority.port=61000;},
      f=>{f.options.authority.containerId='D'.repeat(64);},f=>{f.options.authority.imageId='sha256:'+'e'.repeat(63);},
      f=>{f.options.authority.contextHost='bad\nhost';},f=>{f.options.authority.contextHost='a'.repeat(1025);},
      f=>{Object.assign(f.options.authority,{extra:undefined});},
      f=>{f.options.apiOrigin='http://localhost:51001';},f=>{f.options.apiOrigin='http://127.0.0.1:51001/';},
      f=>{f.options.apiOrigin='http://127.0.0.1:51000';},f=>{f.options.apiOrigin='http://u:p@127.0.0.1:51001';},
      f=>{f.options.port=1023;},f=>{f.options.port=65536;},f=>{f.options.port=51000.5;},
      f=>{f.options.storage.directory=join(f.options.disposableDirectory,'other');},
      f=>{f.options.disposableDirectory=join(f.options.expectedTemporaryRoot,'foreign');},
      f=>{Object.assign(f.options.storage.instance,{environment:'prod'});},
      f=>{Reflect.deleteProperty(f.options.storage.instance,'putOwned');},
      f=>{Object.assign(f.options.storage,{extra:true});},
      f=>{f.options.personas.ownerA.userId=' auth|guide-a';},
      f=>{f.options.personas.ownerA.cookie='bad\r\ncookie';},
      f=>{f.options.personas.ownerA.cookie='a'.repeat(8193);},
      f=>{f.options.personas.ownerA.handle='h'.repeat(201);},
      f=>{f.options.personas.ownerB.userId=f.options.personas.ownerA.userId;},
      f=>{f.options.personas.ownerB.handle=f.options.personas.ownerA.handle;},
      f=>{Object.assign(f.options.personas.ownerA,{accountId:RESOURCE_ACCOUNTS[0]});},
      f=>{Object.assign(f.options.personas,{ownerD:{userId:'x',cookie:'x',handle:'x'}});},
    ];
    for(const change of malformed){
      const f=resourceFixture();change(f);
      await expect(start(f.options,f.dependencies)).rejects.toBeInstanceOf(Error);
      expect(f.events,'strict data refusal precedes every IO').toEqual([]);
    }
    for(const missing of ['fs','createServer','fetch','guideRepository']){
      const f=resourceFixture();Reflect.deleteProperty(f.dependencies,missing);
      await expect(start(f.options,f.dependencies)).rejects.toBeInstanceOf(Error);expect(f.events).toEqual([]);
    }
    for(const missing of ['writeGuideDetails','createGuideSection','attachGuideCover','readGuideDetails']){
      const f=resourceFixture();Reflect.deleteProperty(f.dependencies.guideRepository,missing);
      await expect(start(f.options,f.dependencies)).rejects.toBeInstanceOf(Error);expect(f.events).toEqual([]);
    }
    const trusted=resourceFixture(),handle=await start(trusted.options,trusted.dependencies);
    expect(handle).toMatchObject({version:1,url:'http://127.0.0.1:51000/control',runId,commit});
    expect(handle.capability).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(handle).sort()).toEqual(['capability','close','commit','runId','url','version']);
    // The supplied root/instance capability is trusted; its private root is uninspectable.
    await handle.close();expect(trusted.events.some(e=>e.kind==='forbidden-pool-end')).toBe(false);
  });

  it('Guides resource startup: verified bindings and failed startup drain prevent late work',async()=>{
    const start=await resourceStartExport();vi.useFakeTimers();
    try{
      const f=resourceFixture(),handle=await start(f.options,f.dependencies);
      const firstFetch=f.events.findIndex(e=>e.kind==='fetch');
      const dbCheck=f.events.findIndex(e=>/current_database/.test(e.sql??''));
      expect(dbCheck).toBeGreaterThanOrEqual(0);expect(dbCheck).toBeLessThan(firstFetch);
      const fetches=f.events.filter(e=>e.kind==='fetch').map(e=>resourceRecord(e.data));
      expect(fetches.map(e=>e.method)).toEqual(['GET','PATCH','GET','PATCH','GET','PATCH']);
      const idempotency=fetches.filter(e=>e.method==='PATCH').map(e=>resourceRecord(e.headers)['idempotency-key']);
      expect(new Set(idempotency).size).toBe(3);
      for(let i=0;i<3;i++){
        const getIndex=f.events.findIndex(e=>e.kind==='fetch'&&resourceRecord(e.data).cookie===f.options.personas[RESOURCE_OWNERS[i]].cookie);
        const patchIndex=f.events.findIndex((e,index)=>index>getIndex&&e.kind==='fetch'&&resourceRecord(e.data).method==='PATCH');
        const binding=f.events.findIndex((e,index)=>index>getIndex&&index<patchIndex&&/initial_account_bindings/.test(e.sql??''));
        expect(binding).toBeGreaterThan(getIndex);
        expect(resourceLeaves(f.events[binding].values)).toContain(f.options.personas[RESOURCE_OWNERS[i]].userId);
      }
      expect(f.events.find(e=>e.kind==='create-server')?.data).toMatchObject({maxHeaderSize:8192});
      expect(f.server.headersTimeout).toBe(10000);expect(f.server.requestTimeout).toBe(15000);expect(f.server.keepAliveTimeout).toBe(1000);
      const listen=f.events.find(e=>e.kind==='listen')?.data;
      expect(JSON.stringify(listen)).toContain('127.0.0.1');expect(JSON.stringify(listen)).toContain('51000');
      const transportBad=[{remote:'::1'},{host:'localhost:51000'},{capability:'F'.repeat(64)},
        {capability:[handle.capability,handle.capability]},{method:'GET'},{url:'/control?extra=1'},
        {raw:Buffer.alloc(4097,32)}];
      for(const patch of transportBad)resourceError(await f.dispatch(handle,f.command(handle),patch),403,'denied');
      expect(f.events.filter(resourceMutation)).toEqual([]);
      await handle.close();
      for(const bad of ['database','binding','duplicate','revision','redirect'] as const){
        const x=resourceFixture();
        if(bad==='database')x.controls.database='foreign_db';
        if(bad==='binding')x.rowset('initial_account_bindings')[0].account_id=resourceId(900);
        if(bad==='duplicate')x.controls.meAccount=RESOURCE_ACCOUNTS[0];
        if(bad==='revision')x.controls.meRevision=0;
        if(bad==='redirect')x.controls.fetchStatus=302;
        const outcome=start(x.options,x.dependencies).then(()=>({ok:true,error:undefined}),error=>({ok:false,error}));
        await resourceTurns();await vi.advanceTimersByTimeAsync(305000);
        expect((await outcome).ok).toBe(false);expect(x.events.some(e=>e.kind==='listen')).toBe(false);
        if(bad==='database')expect(x.events.some(e=>e.kind==='fetch')).toBe(false);
        if(bad==='binding')expect(x.events.some(e=>e.kind==='fetch'&&resourceRecord(e.data).method==='PATCH')).toBe(false);
      }
      // Admission timeout, then late connect: no query/mutation may start afterward.
      const late=resourceFixture(),acquisition=resourceDeferred<void>();late.controls.connectGate=acquisition;
      const lateResult=start(late.options,late.dependencies).then(()=>undefined,error=>error);
      await resourceUntil(()=>late.events.some(e=>e.kind==='connect'));
      await vi.advanceTimersByTimeAsync(180000);await vi.advanceTimersByTimeAsync(125000);
      resourceCleanup(await lateResult,true,['drain']);
      acquisition.resolve();await resourceTurns();
      expect(late.events.filter(e=>e.kind==='query'||e.kind==='fetch'||e.kind==='listen')).toEqual([]);
      expect(late.events.some(e=>e.kind==='release')).toBe(true);
      // A started onboarding request stays unresolved through cleanup, even after its wrapper rejects.
      for(const endpoint of ['/me GET','/account PATCH']){
        const x=resourceFixture(),gate=resourceDeferred<void>();
        x.controls.fetchGate={match:new RegExp(endpoint),gate};
        const result=start(x.options,x.dependencies).then(()=>undefined,error=>error);
        await resourceUntil(()=>x.events.some(e=>e.kind==='fetch'&&new RegExp(endpoint).test(
          resourceText(resourceRecord(e.data).url)+' '+resourceText(resourceRecord(e.data).method))));
        const launched=x.events.filter(e=>e.kind==='fetch').length;
        const signal=resourceRecord(x.events.filter(e=>e.kind==='fetch').at(-1)!.data).signal;
        await vi.advanceTimersByTimeAsync(10000);
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal instanceof AbortSignal&&signal.aborted,'literal canonical fetch deadline').toBe(true);
        gate.reject(new Error('aborted wrapper, server settlement unknown'));
        await vi.advanceTimersByTimeAsync(180000);await vi.advanceTimersByTimeAsync(125000);
        resourceCleanup(await result,true,['drain']);
        expect(x.events.filter(e=>e.kind==='fetch')).toHaveLength(launched);
        expect(x.events.some(e=>e.kind==='create-server'||e.kind==='listen')).toBe(false);
      }
      // Startup/listen deadline followed by late listen completion never returns a handle.
      const listening=resourceFixture(),listenGate=resourceDeferred<void>();listening.controls.listenGate=listenGate;
      const listenerResult=start(listening.options,listening.dependencies).then(()=>undefined,error=>error);
      await resourceUntil(()=>listening.events.some(e=>e.kind==='listen'));
      await vi.advanceTimersByTimeAsync(180000);await vi.advanceTimersByTimeAsync(125000);
      resourceCleanup(await listenerResult,true,['drain']);
      listenGate.resolve();await resourceTurns();
      expect(listening.events.some(e=>e.kind==='listener-close')).toBe(true);
      const failed=resourceFixture();failed.controls.listenFailure=true;
      const failedResult=start(failed.options,failed.dependencies).then(()=>undefined,error=>error);
      await resourceTurns();await vi.advanceTimersByTimeAsync(305000);
      expect(await failedResult).toBeInstanceOf(Error);
      expect(failed.events.filter(e=>e.kind==='fetch')).toHaveLength(6);
      expect(failed.events.some(e=>e.kind==='listener-close')).toBe(true);
    }finally{vi.useRealTimers();}
  });

  it('Guides resource reset: exact transactional scope and revision reads preserve receipt tombstones',async()=>{
    const start=await resourceStartExport(),f=resourceFixture(),handle=await start(f.options,f.dependencies);
    const guideId=resourceId(700),foreign=resourceId(701),other=resourceId(702),eventId=resourceId(710);
    f.addGuide(guideId);f.addGuide(foreign,resourceId(999));f.addGuide(other,RESOURCE_ACCOUNTS[0],0,{category:'places'});
    f.rowset('analytics_events').push(
      {id:eventId,account_id:RESOURCE_ACCOUNTS[0],category:'guides',collection_id:guideId,recommendation_id:null},
      {id:resourceId(711),account_id:RESOURCE_ACCOUNTS[0],category:'guides',collection_id:guideId,recommendation_id:resourceId(888)},
      {id:resourceId(712),account_id:resourceId(999),category:'guides',collection_id:foreign,recommendation_id:null},
      {id:resourceId(713),account_id:RESOURCE_ACCOUNTS[0],category:'places',collection_id:other,recommendation_id:null});
    f.rowset('analytics_event_receipts').push({id:resourceId(720),account_id:RESOURCE_ACCOUNTS[0],event_id:eventId,retired_at:null},
      {id:resourceId(721),account_id:RESOURCE_ACCOUNTS[0],event_id:resourceId(713),retired_at:null});
    const offset=f.events.length,reply=await f.dispatch(handle,f.command(handle,'reset',CASES[6]));
    expect(reply.status).toBe(200);
    const trace=f.events.slice(offset),queries=trace.filter(e=>e.kind==='query');
    expect(queries.filter(e=>/^\s*BEGIN\b/i.test(e.sql??''))).toHaveLength(1);
    expect(queries.filter(e=>/^\s*COMMIT\b/i.test(e.sql??''))).toHaveLength(1);
    expect(queries.some(e=>/statement_timeout/i.test(e.sql??'')&&JSON.stringify([e.sql,e.values]).includes('10000'))).toBe(true);
    expect(queries.some(e=>/lock_timeout/i.test(e.sql??'')&&JSON.stringify([e.sql,e.values]).includes('5000'))).toBe(true);
    const firstMutation=trace.findIndex(resourceMutation);
    for(const table of ['initial_account_bindings','creator_accounts','user_security_state']){
      const index=trace.findIndex(e=>e.kind==='query'&&new RegExp(table).test(e.sql??''));
      expect(index).toBeGreaterThanOrEqual(0);expect(index).toBeLessThan(firstMutation);
    }
    const security=queries.find(e=>/user_security_state/.test(e.sql??''));
    expect(security?.sql).toMatch(/blocked_at/);
    expect(resourceLeaves(security?.values)).toEqual(expect.arrayContaining(RESOURCE_OWNERS.map(o=>f.options.personas[o].userId)));
    const tombstone=trace.findIndex(e=>/^\s*UPDATE\s+analytics_event_receipts/i.test(e.sql??''));
    const deletion=trace.findIndex(e=>/^\s*DELETE\s+FROM\s+analytics_events/i.test(e.sql??''));
    expect(tombstone).toBeGreaterThan(firstMutation-1);expect(tombstone).toBeLessThan(deletion);
    expect(trace[tombstone].sql).toMatch(/event_id\s*=\s*NULL/i);
    expect(trace[tombstone].sql).toMatch(/retired_at\s*=\s*coalesce/i);
    expect(resourceLeaves(trace[tombstone].values)).toContain(eventId);
    expect(resourceLeaves(trace[tombstone].values)).toEqual(expect.arrayContaining(RESOURCE_ACCOUNTS));
    for(const excluded of [resourceId(711),resourceId(712),resourceId(713)])
      expect(resourceLeaves(trace[tombstone].values)).not.toContain(excluded);
    expect(queries.some(e=>/DELETE\s+FROM\s+analytics_event_receipts/i.test(e.sql??''))).toBe(false);
    expect(f.rowset('analytics_event_receipts')).toHaveLength(2);
    expect(f.rowset('analytics_event_receipts')[0]).toMatchObject({event_id:null});
    expect(f.rowset('analytics_event_receipts')[0].retired_at).not.toBeNull();
    expect(f.rowset('analytics_event_receipts')[1]).toMatchObject({event_id:resourceId(713),retired_at:null});
    expect(f.rowset('collections').map(row=>row.id)).toEqual(expect.arrayContaining([foreign,other]));
    const manifest=resourceRecord(reply.body.manifest),sections=resourceRows(manifest.sections);
    expect(sections.map(row=>row.id)).toEqual(trace.filter(e=>e.kind==='returned-section-id').map(e=>e.data));
    expect(resourceRows(manifest.guides).every(row=>resourceNumber(row.collectionRevision)>1)).toBe(true);
    expect(resourceRows(manifest.media)).toHaveLength(2);
    expect(resourceRows(manifest.media).map(row=>row.key).sort()).toEqual(['direct-stay','direct-timeline']);
    for(const put of trace.filter(e=>e.kind==='put'))expect(resourceRecord(put.data).bytes).toEqual(Buffer.from(KNOWN_GUIDES_BYTES['old-cover'].base64,'base64'));
    const photoIds=f.rowset('guide_section_photos').map(row=>row.section_id);
    expect(photoIds).toEqual(expect.arrayContaining(sections.filter(row=>row.accountId===RESOURCE_ACCOUNTS[0]).map(row=>row.id)));
    await handle.close();
    for(const blocked of ['blocked','missing','suspended','pending_deletion','deleted','binding'] as const){
      const x=resourceFixture(),h=await start(x.options,x.dependencies);
      if(blocked==='blocked')x.rowset('user_security_state')[0].blocked_at=new Date(RESOURCE_TIME);
      if(blocked==='missing')x.tables.set('user_security_state',x.rowset('user_security_state').slice(1));
      if(['suspended','pending_deletion','deleted'].includes(blocked))x.rowset('creator_accounts')[0].status=blocked;
      if(blocked==='binding')x.rowset('initial_account_bindings')[0].account_id=resourceId(999);
      const preserved=clone(x.rowset('user_security_state')),before=x.events.length;
      resourceError(await x.dispatch(h,x.command(h,'reset',CASES[6])),500,'resource-failure');
      expect(x.events.slice(before).filter(resourceMutation)).toEqual([]);
      expect(x.events.slice(before).some(e=>e.kind==='put'||e.kind.startsWith('repository-'))).toBe(false);
      expect(x.rowset('user_security_state')).toEqual(preserved);
      await h.close();
    }
    // Reset overflow is an admitted operation failure: no partial destructive
    // scope, known rollback, unchanged generation and a fresh same-generation retry.
    for(const [table,cap] of [['collections',256],['guide_sections',1024],['media_assets',256],['media_objects',768],
      ['guide_section_photos',2048],['analytics_events',4096]] as const){
      const x=resourceFixture(),h=await start(x.options,x.dependencies),parent=resourceId(910);
      const active=await x.dispatch(h,x.command(h,'reset',CASES[0],0));expect(active.status).toBe(200);
      expect(active.body.generation).toBe(1);
      x.addGuide(parent);x.addMedia(resourceId(911));
      const preserved=x.snapshotTables();
      const emptyBlocks=guideSectionBlocksSchema.parse({version:'guide-section-blocks/v1',
        timeline:{morning:[],afternoon:[],evening:[]},transport:{segments:[]},stay:{accommodations:[]},
        activities:{activities:[]},budget:{morning:[],afternoon:[],evening:[]},mapDetails:null,
        packingList:{items:[]},preTasks:{items:[]},tags:[]});
      const template:ResourceRow=x.rowset(table)[0]??{account_id:RESOURCE_ACCOUNTS[0],category:'guides',
        collection_id:parent,recommendation_id:null,title:'Scoped section',description:null,display_order:0,
        block_version:'guide-section-blocks/v1',blocks:emptyBlocks,archived_at:null,
        created_at:new Date(RESOURCE_TIME),updated_at:new Date(RESOURCE_TIME),
        section_id:resourceId(912),media_id:resourceId(911)};
      if(table==='guide_section_photos'){
        // Deliberately corrupted duplicate registry response, not a valid DB
        // snapshot. Every pair still joins an actual selected section/asset.
        x.rowset('guide_sections').push({id:resourceId(912),account_id:RESOURCE_ACCOUNTS[0],collection_id:parent,
          title:'Scoped section',description:null,display_order:0,block_version:'guide-section-blocks/v1',
          blocks:emptyBlocks,archived_at:null,created_at:new Date(RESOURCE_TIME),updated_at:new Date(RESOURCE_TIME)});
      }
      // The defensive769-object count is also a corrupted duplicate-PK
      // response:256 selected assets × three variants permits at most768 valid
      // rows. Keep all media IDs joined; count refusal must precede mapping.
      const rows=x.rowset(table);rows.length=0;
      for(let i=0;i<=cap;i++)rows.push({...template,id:resourceId(70000+i)});
      const offset=x.events.length;
      resourceError(await x.dispatch(h,x.command(h,'reset',CASES[0],1)),500,'resource-failure');
      const trace=x.events.slice(offset);
      expect(trace.some(resourceMutation)).toBe(false);expect(trace.some(e=>e.kind==='put'||e.kind.startsWith('repository-'))).toBe(false);
      expect(trace.some(e=>/ROLLBACK/i.test(e.sql??''))).toBe(true);
      const selection=trace.find(e=>e.kind==='query'&&new RegExp('\\b'+table+'\\b').test(e.sql??''));
      expect(JSON.stringify([selection?.sql,selection?.values]),'reset selects at most cap+1').toContain(String(cap+1));
      resourceError(await x.dispatch(h,x.command(h,'observe',CASES[0],1)),409,'unavailable');
      x.tables.clear();for(const [name,list] of preserved)x.tables.set(name,list);
      const retry=await x.dispatch(h,x.command(h,'reset',CASES[0],1));
      expect(retry.status).toBe(200);expect(retry.body.generation).toBe(2);
      await h.close();
    }
  });

  it('Guides resource reset: verified private sessions and complete bytes precede publication',async()=>{
    const start=await resourceStartExport(),f=resourceFixture(),handle=await start(f.options,f.dependencies);
    const supplied=clone(f.options.personas),reply=await f.dispatch(handle,f.command(handle,'reset',CASES[5]));
    expect(reply.status).toBe(200);
    expect(Object.keys(reply.body).sort()).toEqual(['action','caseId','commit','generation','manifest','project','repeat','runId','sessions','version']);
    expect(reply.body).toMatchObject({version:1,action:'reset',runId,commit,caseId:CASES[5],project:PROJECTS[0],repeat:0,generation:1});
    const manifest=resourceRecord(reply.body.manifest),sessions=resourceRecord(reply.body.sessions);
    for(const key of ['version','runId','commit','caseId','project','repeat','generation'])expect(manifest[key]).toEqual(reply.body[key]);
    expect(Object.keys(sessions)).toEqual(RESOURCE_OWNERS);
    for(const owner of RESOURCE_OWNERS){
      const cookie=resourceText(resourceRecord(sessions[owner]).cookie);
      expect(Object.keys(resourceRecord(sessions[owner]))).toEqual(['cookie']);
      expect(cookie).toMatch(/^guides\.session_token=fresh-[a-f0-9-]+\./);
      expect(cookie).not.toBe(supplied[owner].cookie);
      const persona=resourceRecord(resourceRecord(manifest.personas)[owner]);
      expect(persona.accountId).toBe(RESOURCE_ACCOUNTS[RESOURCE_OWNERS.indexOf(owner)]);
      expect(persona.accountRevision).toBe(Number(f.rowset('creator_accounts')[RESOURCE_OWNERS.indexOf(owner)].revision));
    }
    expect(f.options.personas).toEqual(supplied);
    expect(JSON.stringify(manifest)).not.toContain('cookie');expect(JSON.stringify(manifest)).not.toContain(handle.capability);
    const commitIndex=f.events.findIndex(e=>/^\s*COMMIT/i.test(e.sql??''));
    const puts=f.events.filter(e=>e.kind==='put');
    expect(puts).toHaveLength(3);
    expect(puts.map(e=>createHash('sha256').update(resourceBuffer(resourceRecord(e.data).bytes)).digest('hex')).sort())
      .toEqual([KNOWN_GUIDES_BYTES['old-cover'].sha256,KNOWN_GUIDES_BYTES['old-cover'].sha256,KNOWN_GUIDES_BYTES['replacement-cover'].sha256].sort());
    expect(f.events.filter(e=>e.kind==='get')).toHaveLength(3);
    expect(f.events.findIndex(e=>e.kind==='get')).toBeGreaterThan(commitIndex);
    expect(f.events.findIndex(e=>e.kind==='session')).toBeGreaterThan(commitIndex);
    const responseIndex=f.events.findIndex(e=>e.kind==='response');
    expect(responseIndex).toBeGreaterThan(f.events.map(e=>e.kind).lastIndexOf('fetch'));
    await handle.close();
    for(const failure of ['bytes','length','read','wrong-account','zero-revision','wrong-revision','session',
      'mime','metadata-length','metadata-hash'] as const){
      const x=resourceFixture(),h=await start(x.options,x.dependencies);
      if(failure==='bytes')x.controls.getCorrupt=true;
      if(failure==='length')x.controls.getTruncated=true;
      if(failure==='read')x.controls.getFailure=true;
      if(failure==='wrong-account')x.controls.sessionAccount=resourceId(999);
      if(failure==='zero-revision')x.controls.sessionRevision=0;
      if(failure==='wrong-revision')x.controls.sessionRevision=777;
      if(failure==='session')x.controls.sessionFailure=true;
      const metadata=failure==='mime'||failure==='metadata-length'||failure==='metadata-hash';
      const commitGate=resourceDeferred<void>();
      if(metadata)x.controls.queryGate={match:/^\s*COMMIT/i,gate:commitGate};
      const operation=x.dispatch(h,x.command(h,'reset',CASES[5]));
      if(metadata){
        await resourceUntil(()=>x.events.some(e=>/^\s*COMMIT/i.test(e.sql??'')));
        const row=x.rowset('media_assets')[0];
        if(failure==='mime')row.mime_type='image/jpeg';
        if(failure==='metadata-length')row.byte_size='75';
        if(failure==='metadata-hash')row.content_sha256=Buffer.alloc(32,0);
        commitGate.resolve();
      }
      resourceError(await operation,500,'resource-failure');
      resourceError(await x.dispatch(h,x.command(h,'observe',CASES[5],0)),409,'unavailable');
      resourceError(await x.dispatch(h,x.command(h,'reset',CASES[5],0)),409,'unavailable');
      expect(x.events.filter(e=>e.kind==='delete'),'postcommit bytes never rollback compensated').toEqual([]);
      await h.close().catch(()=>undefined);
    }
  });

  it('Guides resource observe: canonical live rows and overflow refusal preserve complete ordered scope',async()=>{
    const start=await resourceStartExport(),f=resourceFixture(),handle=await start(f.options,f.dependencies);
    expect((await f.dispatch(handle,f.command(handle,'reset',CASES[1]))).status).toBe(200);
    // Replace persisted seed identities with independent literal IDs; observe
    // must read these current rows instead of reusing a cached reset manifest.
    for(const [accountId,guideId,sectionId,revision] of [
      [RESOURCE_ACCOUNTS[0],resourceId(840),resourceId(842),'41'],
      [RESOURCE_ACCOUNTS[1],resourceId(841),resourceId(843),'43'],
    ] as const){
      const guide=f.rowset('collections').find(row=>row.account_id===accountId)!;
      const previous=resourceText(guide.id),detail=f.details.get(previous)!;
      guide.id=guideId;guide.revision=revision;f.details.delete(previous);f.details.set(guideId,detail);
      const section=f.rowset('guide_sections').find(row=>row.collection_id===previous)!;
      section.id=sectionId;section.collection_id=guideId;
    }
    for(const [index,revision,status,publicProfile,guidesPublic] of [
      [0,'101','active',true,false],[1,'103','suspended',false,true],[2,'107','pending_deletion',false,false],
    ] as const){
      Object.assign(f.rowset('creator_accounts')[index],{revision,status,public_profile:publicProfile});
      f.rowset('account_category_settings')[index].is_public=guidesPublic;
    }
    f.rowset('account_category_content_state')[0].revision='211';
    f.rowset('account_category_content_state')[1].revision='223';
    f.tables.set('account_category_content_state',f.rowset('account_category_content_state').slice(0,2));
    const seedIds=[resourceId(840),resourceId(841)],idA=resourceId(850),idB=resourceId(851),idC=resourceId(852);
    f.addGuide(idB,RESOURCE_ACCOUNTS[1],8,{archived_at:new Date(RESOURCE_TIME),publication_state:'published'});
    f.addGuide(idA,RESOURCE_ACCOUNTS[0],8,{title:'Native changed',description:'persisted',visibility:'private'});
    f.addGuide(idC,RESOURCE_ACCOUNTS[0],7,{description:null});
    const blocks:GuideSectionBlocks=guideSectionBlocksSchema.parse({
      version:'guide-section-blocks/v1',timeline:{morning:[],afternoon:[],evening:[]},transport:{segments:[]},
      stay:{accommodations:[]},activities:{activities:[]},budget:{morning:[],afternoon:[],evening:[]},
      mapDetails:{center:{lat:0,lng:0},zoom:12},packingList:{items:[]},preTasks:{items:[]},tags:[' canonical ']});
    const sectionId=resourceId(860);
    f.rowset('guide_sections').push({id:sectionId,collection_id:idA,account_id:RESOURCE_ACCOUNTS[0],
      title:'  Native section  ',description:'  canonical description  ',display_order:7,
      block_version:'guide-section-blocks/v1',blocks:{...blocks,tags:[' canonical ']},archived_at:new Date(RESOURCE_TIME),
      created_at:new Date(RESOURCE_TIME),updated_at:new Date(RESOURCE_TIME)});
    const canonicalDetails:GuideCollectionDetails=guideCollectionDetailsSchema.parse({
      guideType:'itinerary',multiCity:false,numberOfDays:1,estimatedBudget:'12.00',budgetCurrency:'INR',budgetType:'per-person',
      bestTimeToVisit:[' October '],categories:['culture'],tags:[' canonical '],tipsNotes:null,
      place:{name:' Kolkata ',address:' India ',placeId:'native_city',rating:4.5,ratingsCount:1,lat:0,lng:0},locationEntityId:null});
    f.details.set(idA,canonicalDetails);
    const mediaId=resourceId(870),pendingId=resourceId(871),coverId=resourceId(872);
    f.addMedia(mediaId);f.addMedia(pendingId,RESOURCE_ACCOUNTS[1],'collection','uploading');f.addMedia(coverId,RESOURCE_ACCOUNTS[0],'collection');
    Object.assign(f.rowset('media_assets').find(row=>row.id===pendingId)!,
      {content_sha256:null,width_px:null,height_px:null,original_filename:'pending.png',alternative_text:null,caption:null});
    f.rowset('collection_media').push({collection_id:idC,account_id:RESOURCE_ACCOUNTS[0],media_id:coverId,slot:'cover'});
    const photo={mediaId,fileName:'native.png',width:8,height:8,aspectRatio:'1:1'};
    const storedBlocks=guideSectionBlocksSchema.parse({...blocks,timeline:{morning:[{
      localId:'native-morning',placeId:'native_place',name:'  Native café  ',formattedAddress:' India ',
      geometry:{location:{lat:0,lng:0}},types:['point_of_interest'],tips:' Water ',photos:[photo,photo],
      priceLevel:1,priceRange:'₹100',customBudget:'tea',budgetAmount:'100.00',budgetCurrency:'INR',source:'manual',verified:false,
    }],afternoon:[],evening:[]}});
    storedBlocks.timeline.morning[0].name='  Native café  ';
    f.rowset('guide_sections').find(row=>row.id===sectionId)!.blocks={...storedBlocks,tags:[' canonical ']};
    f.rowset('guide_section_photos').push({section_id:sectionId,account_id:RESOURCE_ACCOUNTS[0],media_id:mediaId});
    const original=f.rowset('media_objects').find(row=>row.media_id===mediaId)!;
    f.rowset('media_objects').push({...original,variant:'thumbnail',storage_environment:'qa',object_key:'qa/native-thumbnail'},
      {...original,variant:'display',storage_environment:'prod',object_key:'prod/native-display'});
    // Negative sentinels: valid foreign Guides, an owned Places collection,
    // other-purpose/foreign assets, and attachments outside selected Guides.
    const foreignAccount=resourceId(999),foreignGuide=resourceId(880),otherGuide=resourceId(882);
    f.addGuide(foreignGuide,foreignAccount);f.addGuide(otherGuide,RESOURCE_ACCOUNTS[0],9,{category:'places'});
    f.rowset('guide_sections').push({id:resourceId(881),collection_id:foreignGuide,account_id:foreignAccount,
      title:'Foreign section',description:null,display_order:0,block_version:'guide-section-blocks/v1',blocks,
      archived_at:null,created_at:new Date(RESOURCE_TIME),updated_at:new Date(RESOURCE_TIME)});
    f.addMedia(resourceId(884),foreignAccount,'guide');f.addMedia(resourceId(885),RESOURCE_ACCOUNTS[0],'profile');
    const foreignBlocks=guideSectionBlocksSchema.parse(storedBlocks);
    foreignBlocks.timeline.morning[0].photos=[{mediaId:resourceId(884),fileName:'foreign.png',width:8,height:8,aspectRatio:'1:1'}];
    f.rowset('guide_sections').find(row=>row.id===resourceId(881))!.blocks=foreignBlocks;
    f.rowset('guide_section_photos').push({section_id:resourceId(881),account_id:foreignAccount,media_id:resourceId(884)});
    f.rowset('collection_media').push({collection_id:otherGuide,account_id:RESOURCE_ACCOUNTS[0],media_id:coverId,slot:'cover'});
    f.rowset('profile_media').push({account_id:RESOURCE_ACCOUNTS[0],media_id:resourceId(885),slot:'profile'});
    for(const table of ['collections','guide_sections','media_assets','media_objects'])f.rowset(table).reverse();
    const before=f.events.length,reply=await f.dispatch(handle,f.command(handle,'observe',CASES[1],1));
    expect(reply.status).toBe(200);
    expect(Object.keys(reply.body).sort()).toEqual(['action','attachments','caseId','commit','generation','guides','media','objects','personas','project','repeat','runId','sections','version']);
    expect(reply.body).toMatchObject({action:'observe',generation:1,runId,commit,caseId:CASES[1]});
    expect(Object.keys(resourceRecord(reply.body.personas))).toEqual(RESOURCE_OWNERS);
    const guides=resourceRows(reply.body.guides),sections=resourceRows(reply.body.sections),media=resourceRows(reply.body.media),objects=resourceRows(reply.body.objects);
    for(const row of guides)expect(Object.keys(row).sort()).toEqual([
      'accountId','archivedAt','category','categoryContentRevision','description','details','displayOrder','id',
      'pinOrder','publicationState','revision','slug','title','visibility'].sort());
    for(const row of sections)expect(Object.keys(row).sort()).toEqual([
      'accountId','archivedAt','blocks','collectionId','createdAt','description','displayOrder','id','title','updatedAt'].sort());
    for(const row of media)expect(Object.keys(row).sort()).toEqual([
      'accountId','alternativeText','byteLength','caption','deletedAt','height','id','mimeType','originalFilename',
      'purpose','readyAt','sha256','status','width'].sort());
    for(const row of objects)expect(Object.keys(row).sort()).toEqual([
      'accountId','byteLength','deletedAt','environment','key','mediaId','mimeType','sha256','storageVersionId','variant'].sort());
    for(const row of Object.values(resourceRecord(reply.body.personas)))expect(Object.keys(resourceRecord(row)).sort()).toEqual([
      'accountId','accountRevision','guidesContentRevision','guidesPublic','handle','publicProfile','status','userId'].sort());
    const ordinal=(a:string,b:string)=>a<b?-1:a>b?1:0;
    const sortRows=(rows:ResourceRow[],fields:string[])=>[...rows].sort((a,b)=>{
      for(const field of fields){const x=a[field]??'',y=b[field]??'';const result=typeof x==='number'&&typeof y==='number'?x-y:ordinal(String(x),String(y));if(result)return result;}return 0;
    });
    expect(guides).toEqual(sortRows(guides,['accountId','displayOrder','id']));
    expect(sections).toEqual(sortRows(sections,['accountId','collectionId','displayOrder','id']));
    expect(media).toEqual(sortRows(media,['accountId','id']));
    expect(objects).toEqual(sortRows(objects,['accountId','mediaId','variant','environment']));
    const attachments=resourceRows(reply.body.attachments);
    expect(attachments).toEqual(sortRows(attachments,['accountId','guideId','slot','sectionId','mediaId']));
    expect(guides.map(row=>row.id)).toEqual([resourceId(840),idC,idA,resourceId(841),idB]);
    expect(sections.map(row=>row.id)).toEqual([resourceId(842),sectionId,resourceId(843)]);
    expect(media.map(row=>row.id)).toEqual([mediaId,coverId,pendingId]);
    expect(objects.map(row=>[row.mediaId,row.variant,row.environment])).toEqual([
      [mediaId,'display','prod'],[mediaId,'original','local'],[mediaId,'thumbnail','qa'],
      [coverId,'original','local'],[pendingId,'original','local'],
    ]);
    expect(attachments).toEqual([
      {slot:'section-photo',guideId:idA,sectionId,accountId:RESOURCE_ACCOUNTS[0],mediaId},
      {slot:'cover',guideId:idC,accountId:RESOURCE_ACCOUNTS[0],mediaId:coverId},
    ]);
    expect(reply.body.personas).toEqual({
      ownerA:{userId:'auth|guide-a',accountId:RESOURCE_ACCOUNTS[0],handle:'guide-owner-a',accountRevision:101,
        status:'active',publicProfile:true,guidesPublic:false,guidesContentRevision:211},
      ownerB:{userId:'auth|guide-b',accountId:RESOURCE_ACCOUNTS[1],handle:'guide-owner-b',accountRevision:103,
        status:'suspended',publicProfile:false,guidesPublic:true,guidesContentRevision:223},
      ownerC:{userId:'auth|guide-c',accountId:RESOURCE_ACCOUNTS[2],handle:'guide-owner-c',accountRevision:107,
        status:'pending_deletion',publicProfile:false,guidesPublic:false,guidesContentRevision:0},
    });
    expect(guides.find(row=>row.id===idA)).toEqual({
      id:idA,accountId:RESOURCE_ACCOUNTS[0],category:'guides',title:'Native changed',description:'persisted',
      slug:'native-0850',displayOrder:8,revision:97,categoryContentRevision:211,visibility:'private',
      publicationState:'draft',pinOrder:null,archivedAt:null,details:canonicalDetails,
    });
    expect(sections.find(row=>row.id===sectionId)).toEqual({
      id:sectionId,collectionId:idA,accountId:RESOURCE_ACCOUNTS[0],title:'Native section',
      description:'canonical description',displayOrder:7,blocks:guideSectionBlocksSchema.parse({...storedBlocks,tags:['canonical']}),
      archivedAt:RESOURCE_TIME,createdAt:RESOURCE_TIME,updatedAt:RESOURCE_TIME,
    });
    expect(media.find(row=>row.id===mediaId)).toEqual({
      id:mediaId,accountId:RESOURCE_ACCOUNTS[0],purpose:'guide',status:'ready',mimeType:'image/png',byteLength:74,
      sha256:'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2',
      originalFilename:null,width:8,height:8,alternativeText:null,caption:null,readyAt:RESOURCE_TIME,deletedAt:null,
    });
    expect(media.find(row=>row.id===pendingId)).toEqual({
      id:pendingId,accountId:RESOURCE_ACCOUNTS[1],purpose:'collection',status:'uploading',mimeType:'image/png',byteLength:74,
      sha256:null,originalFilename:'pending.png',width:null,height:null,alternativeText:null,caption:null,readyAt:null,deletedAt:null,
    });
    expect(objects.find(row=>row.mediaId===mediaId&&row.variant==='original')).toEqual({
      mediaId,accountId:RESOURCE_ACCOUNTS[0],variant:'original',environment:'local',
      key:'local/'+RESOURCE_ACCOUNTS[0]+'/'+mediaId,mimeType:'image/png',byteLength:74,
      sha256:'efd697c3369b86b0b540c0bded797ca813a3984c1a95d7d16644744e252840a2',storageVersionId:null,deletedAt:null,
    });
    expect(attachments.filter(row=>row.sectionId===sectionId)).toEqual([
      {slot:'section-photo',guideId:idA,sectionId,accountId:RESOURCE_ACCOUNTS[0],mediaId},
    ]);
    const observedNative=resourceRecord(resourceRows(resourceRecord(
      resourceRecord(sections.find(row=>row.id===sectionId)!.blocks).timeline).morning)[0]);
    expect(observedNative.name).toBe('Native café');expect(resourceRows(observedNative.photos)).toHaveLength(2);
    expect(guides.map(row=>row.id)).toEqual(expect.arrayContaining([...seedIds,idA,idB,idC]));
    expect(guides.find(row=>row.id===idA)).toMatchObject({title:'Native changed',visibility:'private',publicationState:'draft',details:canonicalDetails});
    expect(guides.find(row=>row.id===idC)?.details).toBeNull();
    expect(guides.find(row=>row.id===idB)?.archivedAt).toBe(RESOURCE_TIME);
    expect(sections.find(row=>row.id===sectionId)).toMatchObject({title:'Native section',description:'canonical description',archivedAt:RESOURCE_TIME,blocks:{tags:['canonical']}});
    expect(media.find(row=>row.id===pendingId)?.status).toBe('uploading');
    expect(objects.filter(row=>row.mediaId===mediaId).map(row=>[row.variant,row.environment])).toEqual([['display','prod'],['original','local'],['thumbnail','qa']]);
    expect(reply.body).not.toHaveProperty('expectedPublic');expect(reply.body).not.toHaveProperty('sessions');
    const readTrace=f.events.slice(before);
    resourceObserveTransaction(readTrace,'COMMIT');
    expect(readTrace.some(resourceMutation)).toBe(false);
    expect(readTrace.some(e=>e.kind==='repository-read-details'&&resourceRecord(e.data).collectionId===idA)).toBe(true);
    for(const mutation of [
      ()=>f.rowset('media_objects').push({...original,storage_environment:'prod'}),
      ()=>{f.rowset('collections').find(row=>row.id===idA)!.revision='9007199254740992';},
      ()=>{f.rowset('collections').find(row=>row.id===idA)!.revision='1.5';},
      ()=>{f.rowset('collections').find(row=>row.id===idA)!.revision='NaN';},
      ()=>{f.rowset('guide_sections').find(row=>row.id===sectionId)!.block_version='guide-section-blocks/v2';},
      ()=>f.rowset('guide_section_photos').push({section_id:sectionId,account_id:RESOURCE_ACCOUNTS[0],media_id:mediaId}),
    ]){
      const saved=f.snapshotTables();mutation();const offset=f.events.length;
      resourceError(await f.dispatch(handle,f.command(handle,'observe',CASES[1],1)),500,'resource-failure');
      resourceObserveTransaction(f.events.slice(offset),'ROLLBACK');
      f.tables.clear();for(const [table,rows] of saved)f.tables.set(table,rows);
      expect((await f.dispatch(handle,f.command(handle,'observe',CASES[1],1))).status).toBe(200);
    }
    for(const [table,cap] of [['collections',256],['guide_sections',1024],['media_assets',256],['media_objects',768],
      ['guide_section_photos',2048]] as const){
      const saved=f.snapshotTables(),rows=f.rowset(table);
      const template=table==='collections'?rows.find(row=>row.id===idA)!:
        table==='guide_sections'?rows.find(row=>row.id===sectionId)!:
        table==='media_assets'?rows.find(row=>row.id===mediaId)!:
        table==='media_objects'?rows.find(row=>row.media_id===mediaId&&row.variant==='original')!:
        rows.find(row=>row.section_id===sectionId)!;
      // Objects769 and registry2049 deliberately duplicate linked primary keys.
      // These are corrupted query responses, not valid relational snapshots;
      // cap+1 refusal precedes mapping/duplicate validation under root's ruling.
      rows.length=0;
      for(let i=0;i<=cap;i++)rows.push({...template,id:resourceId(20000+i)});
      const offset=f.events.length;
      resourceError(await f.dispatch(handle,f.command(handle,'observe',CASES[1],1)),413,'overflow');
      resourceObserveTransaction(f.events.slice(offset),'ROLLBACK');
      const select=f.events.slice(offset).find(e=>e.kind==='query'&&new RegExp('\\b'+table+'\\b').test(e.sql??''));
      expect(JSON.stringify([select?.sql,select?.values]),'cap+1 fetch bound').toContain(String(cap+1));
      f.tables.clear();for(const [name,list] of saved)f.tables.set(name,list);
      expect((await f.dispatch(handle,f.command(handle,'observe',CASES[1],1))).status).toBe(200);
    }
    const saved=f.snapshotTables(),section=f.rowset('guide_sections').find(row=>row.id===sectionId)!;
    for(let i=0;i<201;i++)f.rowset('guide_sections').push({...section,id:resourceId(40000+i),collection_id:idC,display_order:i});
    resourceError(await f.dispatch(handle,f.command(handle,'observe',CASES[1],1)),413,'overflow');
    f.tables.clear();for(const [name,list] of saved)f.tables.set(name,list);
    // Within row/text limits, total valid descriptions exceed the independent 8MiB ceiling.
    for(let i=0;i<140;i++)f.addGuide(resourceId(50000+i),RESOURCE_ACCOUNTS[0],20+i,{description:'x'.repeat(65536)});
    resourceError(await f.dispatch(handle,f.command(handle,'observe',CASES[1],1)),413,'overflow');
    f.tables.clear();for(const [name,list] of saved)f.tables.set(name,list);
    expect((await f.dispatch(handle,f.command(handle,'observe',CASES[1],1))).status).toBe(200);
    await handle.close();
  });

  it('Guides resource ledger: only allocated whole tuples authorize cleanup',async()=>{
    const start=await resourceStartExport();
    for(const retained of ['untracked','foreign','sibling','changed',...RESOURCE_SURFACES]){
      const f=resourceFixture(),handle=await start(f.options,f.dependencies);
      const first=await f.dispatch(handle,f.command(handle,'reset',CASES[5]));expect(first.status).toBe(200);
      const tracked=resourceRows(resourceRecord(first.body.manifest).media)[0],trackedId=resourceText(tracked.id),trackedKey=resourceText(tracked.keyPath);
      const nativeKey=f.addMedia(resourceId(880)),foreignKey=f.addMedia(resourceId(881),resourceId(999));
      if(retained==='foreign')f.rowset('media_assets').find(row=>row.id===trackedId)!.account_id=resourceId(999);
      if(retained==='sibling')f.rowset('media_objects').push({...f.rowset('media_objects').find(row=>row.media_id===trackedId),variant:'thumbnail'});
      if(retained==='changed')f.rowset('media_assets').find(row=>row.id===trackedId)!.status='pending_delete';
      if((RESOURCE_SURFACES as readonly string[]).includes(retained))
        f.rowset(retained).push({id:resourceId(890),account_id:RESOURCE_ACCOUNTS[0],media_id:trackedId,
          collection_id:resourceId(891),section_id:resourceId(892),recommendation_id:resourceId(893)});
      const offset=f.events.length,second=await f.dispatch(handle,f.command(handle,'reset',CASES[0],1));
      expect(second.status).toBe(200);
      const deleted=f.events.slice(offset).filter(e=>e.kind==='delete').map(e=>e.data);
      expect(deleted).not.toContain(nativeKey);expect(deleted).not.toContain(foreignKey);
      if(retained!=='untracked'){expect(deleted).not.toContain(trackedKey);expect(f.files.has(trackedKey)).toBe(true);}
      else {expect(deleted).toContain(trackedKey);expect(f.files.has(trackedKey)).toBe(false);}
      const mediaQueries=f.events.slice(offset).filter(e=>e.kind==='query'&&/media_assets|media_objects/.test(e.sql??''));
      expect(mediaQueries.some(e=>/FOR\s+UPDATE/i.test(e.sql??''))).toBe(true);
      for(const table of RESOURCE_SURFACES)expect(f.events.slice(offset).some(e=>new RegExp(table).test(e.sql??''))).toBe(true);
      expect(f.files.has(nativeKey)).toBe(true);expect(f.files.has(foreignKey)).toBe(true);
      const closeOffset=f.events.length;await handle.close();
      expect(f.events.slice(closeOffset).filter(e=>e.kind==='delete').map(e=>e.data)).not.toEqual(expect.arrayContaining([nativeKey,foreignKey]));
      expect(f.events.some(e=>e.kind==='forbidden-pool-end')).toBe(false);
    }
  });

  it('Guides resource failure: rollback settlement and uncertain commit fence retry',async()=>{
    const start=await resourceStartExport();vi.useFakeTimers();
    try{
      const f=resourceFixture(),h=await start(f.options,f.dependencies);
      f.controls.repositoryFailure='section';
      resourceError(await f.dispatch(h,f.command(h,'reset',CASES[6])),500,'resource-failure');
      const rollback=f.events.findIndex(e=>/^\s*ROLLBACK/i.test(e.sql??''));
      expect(rollback).toBeGreaterThan(f.events.findIndex(e=>e.kind==='put'));
      expect(f.events.findIndex(e=>e.kind==='delete')).toBeGreaterThan(rollback);
      const newKeys=f.events.filter(e=>e.kind==='put').map(e=>resourceRecord(e.data).key);
      expect(f.events.filter(e=>e.kind==='delete').map(e=>e.data).sort()).toEqual([...newKeys].sort());
      resourceError(await f.dispatch(h,f.command(h,'observe',CASES[6],0)),409,'unavailable');
      f.controls.repositoryFailure=undefined;
      const retry=await f.dispatch(h,f.command(h,'reset',CASES[6],0));expect(retry.status).toBe(200);expect(retry.body.generation).toBe(1);
      await h.close();
      for(const failure of ['rollback','commit','compensation','old-delete'] as const){
        const x=resourceFixture(),handle=await start(x.options,x.dependencies);
        let generation=0;
        if(failure==='commit'||failure==='old-delete'){
          expect((await x.dispatch(handle,x.command(handle,'reset',CASES[5]))).status).toBe(200);generation=1;
        }
        if(failure==='rollback'){x.controls.repositoryFailure='section';x.controls.queryFailure=/^\s*ROLLBACK/i;}
        if(failure==='commit')x.controls.queryFailure=/^\s*COMMIT/i;
        if(failure==='compensation'){x.controls.repositoryFailure='section';x.controls.deleteFailure=true;}
        if(failure==='old-delete')x.controls.deleteFailure=true;
        const before=x.events.length,result=x.dispatch(handle,x.command(handle,'reset',CASES[6],generation));
        await resourceTurns();await vi.advanceTimersByTimeAsync(305000);
        resourceError(await result,500,'resource-failure');
        resourceError(await x.dispatch(handle,x.command(handle,'reset',CASES[6],generation)),409,'unavailable');
        const trace=x.events.slice(before);
        if(failure==='commit'){
          expect(trace.filter(e=>e.kind==='delete')).toEqual([]);
          expect(trace.some(e=>e.kind==='release'&&e.data===true)).toBe(true);
          expect(trace.some(e=>/ROLLBACK/.test(e.sql??''))).toBe(false);
          for(const put of x.events.filter(e=>e.kind==='put'))expect(x.files.has(resourceText(resourceRecord(put.data).key))).toBe(true);
        }
        await handle.close().catch(()=>undefined);
      }
      // Completion failure cannot compensate while the native write is pending.
      const pending=resourceFixture(),handle=await start(pending.options,pending.dependencies),putGate=resourceDeferred<void>();
      pending.controls.putGate=putGate;pending.controls.putCompletionFailure=true;
      const operation=pending.dispatch(handle,pending.command(handle,'reset',CASES[6]));
      await resourceUntil(()=>pending.events.some(e=>e.kind==='put'));
      await resourceTurns();expect(pending.events.some(e=>e.kind==='delete')).toBe(false);
      putGate.resolve();await resourceTurns();
      resourceError(await operation,500,'resource-failure');
      expect(pending.events.some(e=>e.kind==='delete')).toBe(true);
      pending.controls.putGate=undefined;pending.controls.putCompletionFailure=false;
      expect((await pending.dispatch(handle,pending.command(handle,'reset',CASES[6]))).body.generation).toBe(1);
      await handle.close();
    }finally{vi.useRealTimers();}
  });

  it('Guides resource lifecycle: admission generations and close share deterministic custody',async()=>{
    const start=await resourceStartExport(),f=resourceFixture(),handle=await start(f.options,f.dependencies);
    resourceError(await f.dispatch(handle,f.command(handle,'observe')),409,'unavailable');
    const gate=resourceDeferred<void>();f.controls.queryGate={match:/^\s*BEGIN/i,gate};
    const first=f.dispatch(handle,f.command(handle,'reset',CASES[1]));
    await resourceUntil(()=>f.events.some(e=>/^\s*BEGIN/i.test(e.sql??'')));
    resourceError(await f.dispatch(handle,f.command(handle,'reset',CASES[1])),409,'unavailable');
    resourceError(await f.dispatch(handle,f.command(handle,'observe',CASES[1])),409,'unavailable');
    gate.resolve();f.controls.queryGate=undefined;expect((await first).body.generation).toBe(1);
    resourceError(await f.dispatch(handle,f.command(handle,'reset',CASES[1],0)),409,'unavailable');
    resourceError(await f.dispatch(handle,{...f.command(handle,'reset',CASES[1],1),extra:true}),403,'denied');
    expect((await f.dispatch(handle,f.command(handle,'observe',CASES[1],1))).status).toBe(200);
    // An earlier body reader must recheck generation after another reset publishes.
    const bodyGate=resourceDeferred<void>(),slow=f.dispatch(handle,f.command(handle,'reset',CASES[1],1),{bodyGate});
    await resourceUntil(()=>f.events.some(e=>e.kind==='body-barrier'));
    const second=await f.dispatch(handle,f.command(handle,'reset',CASES[1],1));expect(second.body.generation).toBe(2);
    const before=f.events.filter(resourceMutation).length;bodyGate.resolve();
    resourceError(await slow,409,'unavailable');expect(f.events.filter(resourceMutation)).toHaveLength(before);
    const close1=handle.close(),close2=handle.close();expect(close1).toBe(close2);await close1;
    resourceError(await f.dispatch(handle,f.command(handle,'reset',CASES[1],2)),409,'unavailable');
    resourceError(await f.dispatch(handle,f.command(handle,'reset',CASES[1],2),{capability:''}),403,'denied');
    const x=resourceFixture(),h=await start(x.options,x.dependencies),commitGate=resourceDeferred<void>();
    x.controls.queryGate={match:/^\s*COMMIT/i,gate:commitGate};
    const op=x.dispatch(h,x.command(h,'reset',CASES[1]));
    await resourceUntil(()=>x.events.some(e=>/^\s*COMMIT/i.test(e.sql??'')));
    const close=h.close();expect(h.close()).toBe(close);commitGate.resolve();
    const late=await op;expect(late.status).not.toBe(200);expect(late.body).not.toHaveProperty('manifest');await close;
    expect(x.events.filter(e=>e.kind==='response').some(e=>resourceRecord(e.data).status===200)).toBe(false);
    for(const failedAttempt of [false,true]){
      const capped=resourceFixture(),control=await start(capped.options,capped.dependencies);
      if(failedAttempt)capped.controls.repositoryFailure='section';
      for(let i=0;i<64;i++){
        const result=await capped.dispatch(control,capped.command(control,'reset',CASES[5],failedAttempt?0:i));
        expect(result.status).toBe(failedAttempt?500:200);
        if(!failedAttempt){
          expect(result.body.generation).toBe(i+1);
          // Retain every committed allocation through a non-Guides attachment.
          for(const media of resourceRows(resourceRecord(result.body.manifest).media))
            capped.rowset('recommendation_book_covers').push({account_id:media.accountId,media_id:media.id,recommendation_id:resourceId(60000+i)});
        }
      }
      const offset=capped.events.length;
      resourceError(await capped.dispatch(control,capped.command(control,'reset',CASES[5],failedAttempt?0:64)),409,'unavailable');
      expect(capped.events.slice(offset).filter(resourceMutation)).toEqual([]);
      expect(capped.events.filter(e=>e.kind==='put').length).toBeLessThanOrEqual(192);
      if(!failedAttempt){
        expect(capped.events.filter(e=>e.kind==='put')).toHaveLength(192);
        expect(capped.files.size).toBe(192);
        expect((await capped.dispatch(control,capped.command(control,'observe',CASES[5],64))).status).toBe(200);
      }
      // The defensive 256-entry ledger guard cannot be reached through this ABI:
      // 64 accepted attempts allocate at most three keys each; no enrollment seam.
      await control.close();
    }
    const listener=resourceFixture(),control=await start(listener.options,listener.dependencies);listener.controls.listenerCloseFailure=true;
    const failedClose=control.close();expect(control.close()).toBe(failedClose);
    resourceCleanup(await failedClose.then(()=>undefined,error=>error),false,['listener']);
    expect(control.close()).toBe(failedClose);
  },20000);

  it('Guides resource custody: directory identity and unsettled IO refuse cleanup success',async()=>{
    const start=await resourceStartExport();vi.useFakeTimers();
    try{
      for(const corruption of ['link','file','alias'] as const){
        const f=resourceFixture(),node=f.nodes.get(f.options.disposableDirectory)!;
        if(corruption==='alias')node.canonical=join(f.options.expectedTemporaryRoot,'aliased-root');else node.kind=corruption;
        await expect(start(f.options,f.dependencies)).rejects.toBeInstanceOf(Error);
        expect(f.events.some(e=>e.kind==='put'||e.kind==='listen')).toBe(false);
      }
      for(const boundary of ['put','get','delete'] as const){
        const f=resourceFixture(),h=await start(f.options,f.dependencies);
        if(boundary==='delete'){
          expect((await f.dispatch(h,f.command(h,'reset',CASES[5]))).status).toBe(200);
          f.nodes.get(f.options.storage.directory)!.ino+=1;
          resourceError(await f.dispatch(h,f.command(h,'reset',CASES[0],1)),500,'resource-failure');
        }else if(boundary==='put'){
          f.nodes.get(f.options.disposableDirectory)!.ino+=1;
          resourceError(await f.dispatch(h,f.command(h,'reset',CASES[5])),500,'resource-failure');
        }else{
          // Change identity during COMMIT so postcommit readback sees replacement.
          const commit=resourceDeferred<void>();f.controls.queryGate={match:/^\s*COMMIT/i,gate:commit};
          const op=f.dispatch(h,f.command(h,'reset',CASES[5]));
          await resourceUntil(()=>f.events.some(e=>/^\s*COMMIT/i.test(e.sql??'')));
          f.nodes.get(f.options.storage.directory)!.ino+=1;commit.resolve();
          resourceError(await op,500,'resource-failure');
        }
        expect(f.events.filter(e=>e.kind===boundary)).toEqual([]);
        await h.close().catch(()=>undefined);
      }
      const f=resourceFixture(),handle=await start(f.options,f.dependencies),gate=resourceDeferred<void>();
      f.controls.putGate=gate;f.controls.putCompletionFailure=true;
      const operation=f.dispatch(handle,f.command(handle,'reset',CASES[6]));
      await resourceUntil(()=>f.events.some(e=>e.kind==='put'));
      const close=handle.close();expect(handle.close()).toBe(close);
      const closeOutcome=close.then(()=>undefined,error=>error);
      await vi.advanceTimersByTimeAsync(125000);
      resourceCleanup(await closeOutcome,true,['drain']);
      expect(handle.close()).toBe(close);expect(f.events.filter(e=>e.kind==='delete')).toEqual([]);
      gate.resolve();await resourceTurns();await vi.advanceTimersByTimeAsync(180000);
      const late=await operation;expect(late.status).not.toBe(200);
      expect(f.events.filter(e=>e.kind==='response').some(e=>resourceRecord(e.data).status===200)).toBe(false);
      expect(f.events.filter(e=>e.kind==='delete')).toEqual([]);
      // Native work can finish after close rejection; neither late completion nor a
      // wrapper timeout retroactively grants successful cleanup or active publication.
      expect(await handle.close().then(()=>undefined,error=>error)).toBe(await closeOutcome);
      const retained=resourceFixture(),h=await start(retained.options,retained.dependencies);
      const nativeKey=retained.addMedia(resourceId(990));
      const seeded=await retained.dispatch(h,retained.command(h,'reset',CASES[5]));expect(seeded.status).toBe(200);
      const committed=resourceRows(resourceRecord(seeded.body.manifest).media).map(row=>resourceText(row.keyPath));
      const offset=retained.events.length;await h.close();
      expect(retained.events.slice(offset).filter(e=>e.kind==='delete')).toEqual([]);
      for(const key of [nativeKey,...committed])expect(retained.files.has(key)).toBe(true);
      expect(retained.events.some(e=>e.kind==='forbidden-pool-end')).toBe(false);
      expect(retained.events.some(e=>e.kind==='mkdir'&&resourceRecord(resourceRecord(e.data).options??{}).recursive===true)).toBe(false);
    }finally{vi.useRealTimers();}
  });
});
