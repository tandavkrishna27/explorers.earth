import {it,expect,vi} from 'vitest';
// complete() is the only part of the mapping that calls the brand assertion, and that
// brand is a module-private WeakSet no fixture can join. Games left complete() untested
// for that reason; stubbing just the assertion exercises the aggregation - the filtering,
// the ordering and the pin matching - which is where the mapping bugs actually live.
vi.mock('../../../../lib/explorersApiClient',async orig=>({...(await orig() as object),assertCompleteMyCategoryContent:vi.fn()}));
const {appViewModel,collectionViewModel,appsViewModel}=await import('../appsViewModel');

const id=(n:number)=>`00000000-0000-4000-8000-00000000000${n}`;
const shot=id(7);
const details={appUrl:'https://example.com/app',developer:'Dev',logoUrl:null,description:'A tool',downloadUrl:null,priceTier:'Free',platforms:['iOS','Web']};
const detail=(over:Record<string,unknown>={})=>({id:id(1),entityId:id(1),category:'apps',entity:{kind:'app'},displayTitle:'Tool',userRating:4,note:null,effectiveAppDetails:details,appScreenshots:{screenshotMediaIds:[shot]},...over} as never);
const membership=(over:Record<string,unknown>={})=>({recommendationId:id(1),collectionId:id(2),displayOrder:0,...over} as never);
const collection={id:id(2),accountId:id(3),title:'Daily drivers',description:null,slug:'daily',visibility:'public',publicationState:'published',displayOrder:0,heading:'Top apps',coverMediaId:null} as never;

it('serves screenshots as owned media routes and never an owner-typed address',()=>{
 const row=appViewModel(detail(),membership(),{recommendationId:id(1),collectionId:id(2),position:0});
 expect(row.screenshots).toEqual([`/api/explorers/v1/media/${shot}/content`]);
 expect(row).toMatchObject({app_url:details.appUrl,price_tier:'Free',platforms:['iOS','Web'],app_category:null,is_pinned:true,pin_order:0});
});

it('models an absent platform list and absent screenshots as null, not as empty arrays',()=>{
 const row=appViewModel(detail({effectiveAppDetails:{...details,platforms:[]},appScreenshots:{screenshotMediaIds:[]}}),membership());
 expect(row.platforms).toBeNull();expect(row.screenshots).toBeNull();
});

it('refuses a broken details row rather than presenting a half-written app',()=>{
 // app_url is NOT NULL in 0043, so an unparseable details object is a broken state.
 for(const broken of [undefined,{},{...details,appUrl:'javascript:alert(1)'},{...details,priceTier:'Cheap'}])
  expect(()=>appViewModel(detail({effectiveAppDetails:broken}),membership())).toThrow();
});

it('refuses wrong category, wrong entity kind and mismatched recommendation identity',()=>{
 for(const changed of [{category:'games'},{entity:{kind:'book'}},{id:id(9)}])
  expect(()=>appViewModel(detail(changed),membership())).toThrow();
});

it('does not pin a row through a membership of another collection',()=>{
 const pin={recommendationId:id(1),collectionId:id(2),position:0};
 expect(appViewModel(detail(),membership(),pin).is_pinned).toBe(true);
 expect(appViewModel(detail(),membership({collectionId:id(4)}),pin)).toMatchObject({is_pinned:false,pin_order:null});
});

it('stamps every row with its own list and treats draft or private as not visible',()=>{
 const list=collectionViewModel({...(collection as object),publicationState:'draft'} as never,[appViewModel(detail(),membership())]);
 expect(list.Visibility).toBe(false);
 expect(list.recommended_apps[0].app_list).toMatchObject({documentId:id(2),slug:'daily'});
 expect(collectionViewModel(collection,[]).top_apps_heading).toBe('Top apps');
});

it('orders members by display order, drops archived rows and applies only the matching pin',()=>{
 const details2=new Map<string,unknown>([[id(1),{detail:detail()}],[id(5),{detail:detail({id:id(5),entityId:id(5),displayTitle:'Second'})}],[id(6),{detail:detail({id:id(6),entityId:id(6)})}]]);
 const view=appsViewModel.complete({
  category:'apps',collections:[collection],
  memberships:[
   {recommendationId:id(5),collectionId:id(2),displayOrder:1},
   {recommendationId:id(1),collectionId:id(2),displayOrder:0},
   {recommendationId:id(6),collectionId:id(2),displayOrder:2,recommendationArchived:true},
  ],
  topPicks:[{recommendationId:id(5),collectionId:id(2),position:3}],
 } as never,details2 as never,'owner');
 expect(view.lists).toHaveLength(1);
 expect(view.lists[0].recommended_apps.map(row=>row.documentId)).toEqual([id(1),id(5)]);
 expect(view.lists[0].recommended_apps.map(row=>row.is_pinned)).toEqual([false,true]);
 expect(view.lists[0].recommended_apps[1].pin_order).toBe(3);
 expect(view.lists[0].account).toMatchObject({documentId:id(3),username:'owner'});
});

it('refuses to map a complete observation with a detail missing from the hydration map',()=>{
 expect(()=>appsViewModel.complete({category:'apps',collections:[collection],memberships:[{recommendationId:id(1),collectionId:id(2),displayOrder:0}],topPicks:[]} as never,new Map() as never)).toThrow();
});

it('refuses a complete observation of another category',()=>{
 expect(()=>appsViewModel.complete({category:'games',collections:[],memberships:[],topPicks:[]} as never,new Map() as never)).toThrow();
});
