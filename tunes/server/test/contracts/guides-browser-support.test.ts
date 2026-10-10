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



