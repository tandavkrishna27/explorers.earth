import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';

// Exact freeze, not a relaxed count. The four Places case identities are pinned
// positionally and by ordered digest. P5-8a removed the four additive pin identities
// together with the pin write surface, so nothing may follow them.
const PLACES_ORIGINAL_CASES=[
  'Places: retained location create edit and reload preserve zero and absent coordinates',
  'Places: complete owner and anonymous pages contain every seeded list and recommendation',
  'Places: owned image bytes disappear after the final public attachment is hidden',
  'Places: foreign owner edits and private contact reads cannot disclose owner data',
] as const;
const PLACES_ORIGINAL_CASE_DIGEST='84df5eeb5645621fcd741566c986decca0f6eeeae3316f9ca50cf498943a0a43';
const ordered=(titles:readonly string[])=>createHash('sha256').update(JSON.stringify(titles)).digest('hex');

describe('private Places fixture boundary',()=>{
  it('storage custody accepts only a direct private fixture child in the temporary directory',async()=>{
    const {assertPlacesStorageDirectory}=await import('../../../scripts/places-browser-support');
    const {join}=await import('node:path');const {tmpdir}=await import('node:os');
    expect(()=>assertPlacesStorageDirectory(join(tmpdir(),'explorers-profile-e2e-abcdef','owned-media'))).not.toThrow();
    for(const path of [join(tmpdir(),'owned-media'),join(tmpdir(),'unowned','owned-media'),join(tmpdir(),'explorers-profile-e2e-abcdef','other'),join(tmpdir(),'explorers-profile-e2e-abcdef','nested','owned-media')])expect(()=>assertPlacesStorageDirectory(path)).toThrow();
  });
  it('analytics reset retains unrelated categories and foreign owners while selecting only owned referenced content',async()=>{
    const {ownedPlacesAnalyticsIds}=await import('../../../scripts/places-browser-support');
    const content=[{id:'collection-a',account_id:'a',category:'places'},{id:'recommendation-a',account_id:'a',category:'products'},{id:'foreign',account_id:'b',category:'places'},{id:'books',account_id:'a',category:'books'}];
    const event=(id:string,account_id:string,category:string,collection_id:string|null,recommendation_id:string|null)=>({id,account_id,category,collection_id,recommendation_id});
    expect(ownedPlacesAnalyticsIds([
      event('owned','a','places','collection-a',null),event('owned-rec','a','products',null,'recommendation-a'),
      event('foreign','b','places','foreign',null),event('wrong-owner','a','places','foreign',null),
      event('wrong-category','a','products','collection-a',null),event('books','a','books','books',null),
      event('profile','a','places',null,null),event('missing','a','places','absent',null),
    ],content,['a'])).toEqual(['owned','owned-rec']);
  });
  it('admits only the two actual Google detail masks and strips the API key from recorded requests',async()=>{
    const {classifyPlacesProviderRequest} = await import('../../../../explorers-earth/e2e/setup/places-provider-transport');
    const url='https://places.googleapis.com/v1/places/fixture-zero-city';
    const header='id,displayName,formattedAddress,types,primaryType,primaryTypeDisplayName,addressComponents,location,rating';
    const query='id,displayName,formattedAddress,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location,photos';
    expect(classifyPlacesProviderRequest({url,method:'GET',headers:{'x-goog-fieldmask':header,'x-goog-api-key':'fixture-google-maps-key'}})).toEqual({method:'GET',path:'/v1/places/fixture-zero-city',queryKeys:[],fieldMask:header,queryFields:null});
    expect(classifyPlacesProviderRequest({url:url+'?fields='+query+'&key=fixture-google-maps-key',method:'GET',headers:{}})).toMatchObject({queryKeys:['fields','key'],queryFields:query});
    for(const patch of [{url:url+'/photos/x/media'},{url:url.replace('fixture-zero-city','unowned')},{method:'POST'},{url:url+'?fields='+query+'&key=secret'},{url:url+'?fields='+query+'&key=fixture-google-maps-key&extra=x'},{headers:{'x-goog-fieldmask':'*','x-goog-api-key':'fixture-google-maps-key'}}])expect(classifyPlacesProviderRequest({url,method:'GET',headers:{'x-goog-fieldmask':header,'x-goog-api-key':'fixture-google-maps-key'},...patch})).toBeNull();
  });
  it('Maps selection uses zero coordinates and releases its option and listener on cleanup',async()=>{
    const {JSDOM}=await import('jsdom');
    const dom=new JSDOM('<div><input /></div>');
    const previous=globalThis.document;globalThis.document=dom.window.document;
    try{
      const {FixtureAutocomplete,clearFixtureListeners}=await import('../../../../explorers-earth/e2e/setup/places-maps-fixture');
      const input=dom.window.document.querySelector('input')!;
      const auto=new FixtureAutocomplete(input);
      let selections=0;const listener=auto.addListener('place_changed',()=>selections++);
      const option=dom.window.document.querySelector('[role=option]') as HTMLElement;
      expect(option.textContent).toBe('Fixture Zero City');option.click();
      expect(selections).toBe(1);expect(auto.getPlace().geometry.location.lat()).toBe(0);expect(auto.getPlace().geometry.location.lng()).toBe(0);
      listener.remove();option.click();expect(selections).toBe(1);
      clearFixtureListeners(auto);expect(dom.window.document.querySelector('[role=option]')).toBeNull();
      clearFixtureListeners(auto);
    }finally{globalThis.document=previous;dom.window.close();}
  },30000);
  it('declares exact lane identities, paired coordinates and complete ordered traversal seeds',async()=>{
    const support = await import('../../../scripts/places-browser-support');
    const plan = support.buildPlacesSeedPlan(support.PLACES_CASES[1]);
    const prefix=support.PLACES_CASES.slice(0,PLACES_ORIGINAL_CASES.length);
    expect(prefix).toEqual([...PLACES_ORIGINAL_CASES]);
    expect(ordered(prefix)).toBe(PLACES_ORIGINAL_CASE_DIGEST);
    expect(ordered(PLACES_ORIGINAL_CASES)).toBe(PLACES_ORIGINAL_CASE_DIGEST);
    for(const [index,title] of PLACES_ORIGINAL_CASES.entries())expect(support.PLACES_CASES[index]).toBe(title);
    expect(support.PLACES_CASES).toHaveLength(PLACES_ORIGINAL_CASES.length);
    expect('PLACES_PIN_CASES' in support).toBe(false);
    expect(new Set(support.PLACES_CASES).size).toBe(support.PLACES_CASES.length);
    expect(support.PLACE_LINK_CASES).toHaveLength(4);
    expect(plan.locations).toHaveLength(53);
    expect(plan.recommendations).toHaveLength(53);
    expect(plan.locations.map(row=>row.displayOrder)).toEqual(Array.from({length:53},(_,i)=>i));
    expect(plan.recommendations.map(row=>row.displayOrder)).toEqual(Array.from({length:53},(_,i)=>i));
    expect(plan.locations[0].snapshot).toMatchObject({latitude:0,longitude:0});
    expect(plan.locations[1].snapshot).toMatchObject({latitude:null,longitude:null});
    expect(new Set(plan.locations.map(row=>row.slug)).size).toBe(53);
    expect(()=>support.buildPlacesSeedPlan('invented')).toThrow();
  });
  it('refuses unowned, undeclared, repeated and stale controller commands',async()=>{
    const {validatePlacesControl,PLACES_CASES} = await import('../../../scripts/places-browser-support');
    const input={remote:'127.0.0.1',host:'127.0.0.1:51000',expectedHost:'127.0.0.1:51000',capability:'a'.repeat(64),expectedCapability:'a'.repeat(64),runId:'b'.repeat(32),expectedRunId:'b'.repeat(32),commit:'c'.repeat(40),expectedCommit:'c'.repeat(40),lane:'places',body:{action:'reset',caseId:PLACES_CASES[0],project:'places-desktop',repeat:0,runId:'b'.repeat(32),commit:'c'.repeat(40)}};
    expect(()=>validatePlacesControl(input)).not.toThrow();
    for(const patch of [{remote:'::1'},{host:'evil'},{capability:'d'.repeat(64)},{expectedRunId:'e'.repeat(32)},{expectedCommit:'f'.repeat(40)}])expect(()=>validatePlacesControl({...input,...patch})).toThrow();
    for(const patch of [{action:'sql'},{project:'place-links-desktop'},{caseId:'invented'},{repeat:1},{foreignId:'x'},{runId:'e'.repeat(32)},{commit:'f'.repeat(40)}])expect(()=>validatePlacesControl({...input,body:{...input.body,...patch}})).toThrow();
    expect(()=>validatePlacesControl({...input,body:{...input.body,action:'observe'}})).toThrow();
    expect(()=>validatePlacesControl({...input,body:{...input.body,action:'observe'},active:{caseId:PLACES_CASES[0],project:'places-desktop'}})).not.toThrow();
  });
  it('preserves the original four seed plans',async()=>{
    const support=await import('../../../scripts/places-browser-support');
    // The original four plans keep their exact shapes, including the previously
    // inlined public page sizes, which are now observed from the seeded locations.
    for(const [index,expected] of ([[0,{locations:2,recommendations:1,pageSizes:[2]}],[1,{locations:53,recommendations:53,pageSizes:[24,24,5]}],
      [2,{locations:2,recommendations:1,pageSizes:[2]}],[3,{locations:2,recommendations:1,pageSizes:[2]}]] as const)) {
      const plan=support.buildPlacesSeedPlan(PLACES_ORIGINAL_CASES[index]);
      expect(plan.locations).toHaveLength(expected.locations);
      expect(plan.recommendations).toHaveLength(expected.recommendations);
      expect(plan.publicPageSizes).toEqual([...expected.pageSizes]);
      expect(plan.traversal).toBe(index===1);
      expect('pinned' in plan).toBe(false);
    }
    // The guard refuses undeclared identities, including the removed additive pin titles.
    for(const unknown of ['invented','Places: additive','Places: additive pinned-first owner traversal and signed seek survive reload and list navigation','Places: retained location create edit and reload preserve zero and absent coordinate',''])
      expect(()=>support.buildPlacesSeedPlan(unknown)).toThrow('Undeclared Places case');
  });
  it('admits only the four declared Places titles through the control guard',async()=>{
    const {validatePlacesControl,PLACES_CASES}=await import('../../../scripts/places-browser-support');
    const base={remote:'127.0.0.1',host:'127.0.0.1:51000',expectedHost:'127.0.0.1:51000',capability:'a'.repeat(64),expectedCapability:'a'.repeat(64),
      runId:'b'.repeat(32),expectedRunId:'b'.repeat(32),commit:'c'.repeat(40),expectedCommit:'c'.repeat(40),lane:'places'};
    const body=(caseId:string)=>({action:'reset',caseId,project:'places-desktop',repeat:0,runId:'b'.repeat(32),commit:'c'.repeat(40)});
    for(const title of PLACES_ORIGINAL_CASES)
      expect(()=>validatePlacesControl({...base,body:body(title)})).not.toThrow();
    // Undeclared titles, the other lane's titles and near-miss spellings stay denied.
    for(const title of ['Places: additive pinned-first owner traversal and signed seek survive reload and list navigation','Places: additive complete70 staged pin order commits in advertised chunks and replays a lost acknowledgement once',
      'Place links: existing Products and People lists attach detach and survive reload','invented',''])
      expect(()=>validatePlacesControl({...base,body:body(title)})).toThrow('Owned Places control denied');
    for(const title of PLACES_ORIGINAL_CASES)
      expect(()=>validatePlacesControl({...base,lane:'place-links',body:body(title)})).toThrow('Owned Places control denied');
    expect(PLACES_CASES.includes('invented' as never)).toBe(false);
  });
});
