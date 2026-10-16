import {it,expect,vi} from 'vitest';
// complete() calls the brand assertion, and that brand is a module-private WeakSet no
// fixture can join; stubbing just the assertion exercises the aggregation - the filtering,
// the ordering and the pin matching - which is where the mapping bugs actually live.
vi.mock('../../../../lib/explorersApiClient',async orig=>({...(await orig() as object),assertCompleteMyCategoryContent:vi.fn()}));
const {placeViewModel,collectionViewModel,placesViewModel}=await import('../placesViewModel');
const {emptyPlaceDetails,emptyPlaceContext}=await import('../../../../../../tunes/shared/explorersPlaceContract');

const id=(n:number)=>`00000000-0000-4000-8000-00000000000${n}`;
const photo=id(7),upload=id(8);
const facts=(over:Record<string,unknown>={})=>({...emptyPlaceDetails(),formattedAddress:'1 Example Road',latitude:12.9715987,longitude:77.5945627,
 providerRating:4.5,ratingsCount:1200,providerTypes:['cafe','food'],publicPhone:'+91 80 1234 5678',websiteUrl:'https://example.com',...over});
const context=(over:Record<string,unknown>={})=>({...emptyPlaceContext(),contactName:'Priya',contactNumber:'+91 90000 00000',...over});
const detail=(over:Record<string,unknown>={})=>({id:id(1),entityId:id(1),category:'places',
 entity:{id:id(1),kind:'place',title:'Blue Tokai',origin:'provider',providerPlaceId:'ChIJ_example',details:facts()},
 displayTitle:'Blue Tokai',userRating:9,note:{version:1,format:'quill-html',html:'<p>Best filter coffee</p>'},
 mediaIds:[upload],effectivePlaceDetails:facts(),placeContext:context(),placePhotos:{photoMediaIds:[photo]},placesTaxonomy:{catalogState:'UNCONFIGURED',catalogVersion:0,defaultLocale:null,category:null,subcategory:null,selectionUnavailable:false},...over} as never);
const membership=(over:Record<string,unknown>={})=>({recommendationId:id(1),collectionId:id(2),displayOrder:0,...over} as never);
const snapshot={version:1,name:'Bengaluru',address:'Bengaluru, Karnataka, India',providerPlaceId:'ChIJ_city',latitude:12.9715987,longitude:77.5945627};
const collection=(over:Record<string,unknown>={})=>({id:id(2),accountId:id(3),category:'places',title:'Bengaluru',description:'My personal guide',
 slug:'bengaluru',visibility:'public',publicationState:'published',displayOrder:0,heading:'Top picks',coverMediaId:id(9),revision:1,archived:false,
 categoryRevision:'1',placeLocation:{locationEntityId:id(4),locationSnapshot:snapshot,instagramMediaUrl:'https://example.com/reel'},...over} as never);

it('preserves canonical taxonomy metadata and unavailable selection without invented labels',()=>{
 const taxonomy={catalogState:'CONFIGURED',catalogVersion:7,defaultLocale:'fr',category:{id:id(3),slug:'stable-root',label:'Synthetic root',unavailable:false},subcategory:{id:id(4),slug:'stable-child',label:null,unavailable:true},selectionUnavailable:true};
 const row=placeViewModel(detail({placesTaxonomy:taxonomy}),membership());
 expect(row.placesTaxonomy).toEqual(taxonomy);
 expect(row.recommendation_category).toEqual({...taxonomy.category,documentId:id(3),Category_Name:'Synthetic root'});
 expect(row.recommendation_sub_category).toEqual({...taxonomy.subcategory,documentId:id(4),sub_category:null});
});
it('rejects missing Places taxonomy instead of silently losing an assignment',()=>{
 expect(()=>placeViewModel(detail({placesTaxonomy:undefined}),membership())).toThrow();
});

it('maps every consumed Place_Details key, with photos as owned media routes',()=>{
 const row=placeViewModel(detail(),membership({placePinPosition:0}));
 expect(row.Place_Details).toEqual({
  Place_Id:'ChIJ_example',Place_Name:'Blue Tokai',Title:'Blue Tokai',Place_Address:'1 Example Road',
  Geometry:{lat:12.9715987,lng:77.5945627},Rating:4.5,Rating_Count:1200,
  Photos:[{url:`/api/explorers/v1/media/${photo}/content`}],Place_Types:['cafe','food'],
  Public_Phone:'+91 80 1234 5678',Website:'https://example.com',Price_Level:null,Price_Range:null,
 });
 // The owner's own uploads stay a separate gallery source, as PlaceOverview concatenates them.
 expect(row.Media).toEqual([{documentId:upload,url:`/api/explorers/v1/media/${upload}/content`}]);
 expect(row.media_details?.imageDetails).toEqual([{id:upload,url:`/api/explorers/v1/media/${upload}/content`}]);
 expect(row).toMatchObject({user_recommendation_note:'<p>Best filter coffee</p>',user_rating:9,google_rating:4.5,is_pinned:true,pin_order:0});
});

it('keeps a zero coordinate rather than treating it as missing',()=>{
 // The defect the ticket names: `latitude && longitude` or `Number(v)||null` drops the
 // null island, which is a real point on the equator at the prime meridian.
 const row=placeViewModel(detail({effectivePlaceDetails:facts({latitude:0,longitude:0})}),membership());
 expect(row.Place_Details.Geometry).toEqual({lat:0,lng:0});
});

it('leaves absent coordinates null rather than fabricating (0,0)',()=>{
 const row=placeViewModel(detail({effectivePlaceDetails:facts({latitude:null,longitude:null})}),membership());
 expect(row.Place_Details.Geometry).toBeNull();
});

it('never substitutes the internal entity id for the provider place id',()=>{
 const row=placeViewModel(detail({entity:{id:id(1),kind:'place',title:'Manual spot',origin:'manual',providerPlaceId:null,details:facts()}}),membership());
 expect(row.Place_Details.Place_Id).toBeNull();
});

it('carries the owner their own contact details together with the disclosure they chose',()=>{
 // contactVisibility gates what a reader sees; the owner editing their own row sees it.
 const priv=placeViewModel(detail(),membership());
 expect(priv).toMatchObject({Contact_Name:'Priya',Contact_Number:'+91 90000 00000',Contact_Visibility:'private'});
 const open=placeViewModel(detail({placeContext:context({contactVisibility:'public'})}),membership());
 expect(open.Contact_Visibility).toBe('public');
});

it('maps a person recommendation inside a Places list, with no place facts invented',()=>{
 const person=placeViewModel(detail({
  entity:{id:id(5),kind:'person',title:'Ravi'},
  effectivePlaceDetails:undefined,
  placeContext:context({recommendationType:'person',personProfileUrl:'https://example.com/ravi',personAddress:'Indiranagar'}),
 }),membership());
 expect(person).toMatchObject({Recommendation_Type:'person',person_profile_url:'https://example.com/ravi',person_address:'Indiranagar'});
 expect(person.Place_Details).toMatchObject({Place_Id:null,Place_Address:null,Geometry:null,Rating:null,Place_Types:null});
});

it('refuses a place recommendation whose provider facts are unreadable',()=>{
 for(const broken of [undefined,{},{...facts(),latitude:12.9715987,longitude:null},{...facts(),providerRating:9}])
  expect(()=>placeViewModel(detail({effectivePlaceDetails:broken}),membership())).toThrow();
});

it('refuses a missing or invalid recommendation context rather than defaulting disclosure',()=>{
 // Defaulting here would mean a row with no stored context renders as if a choice had
 // been made, and the only safe-looking default is still a guess about disclosure.
 for(const broken of [undefined,{},{...context(),contactVisibility:'everyone'}])
  expect(()=>placeViewModel(detail({placeContext:broken}),membership())).toThrow();
});

it('refuses wrong category, unsupported entity kind and mismatched identity',()=>{
 for(const changed of [{category:'people'},{entity:{id:id(1),kind:'book',title:'x'}},{id:id(9)}])
  expect(()=>placeViewModel(detail(changed),membership())).toThrow();
});

it('does not pin a row through a membership of another collection',()=>{
 expect(placeViewModel(detail(),membership({placePinPosition:0})).is_pinned).toBe(true);
 expect(placeViewModel(detail(),membership({collectionId:id(4),placePinPosition:null}))).toMatchObject({is_pinned:false,pin_order:null});
});

it('assembles List_Name_Details from the snapshot, the list note and the list cover',()=>{
 const list=collectionViewModel(collection(),[placeViewModel(detail(),membership())],'owner');
 expect(list.List_Name_Details).toEqual({
  note:'My personal guide',thumbnail:`/api/explorers/v1/media/${id(9)}/content`,
  location:{latitude:12.9715987,longitude:77.5945627,address:'Bengaluru, Karnataka, India'},
  place_id:'ChIJ_city',name:'Bengaluru',
 });
 expect(list).toMatchObject({Instagram_Media_URL:'https://example.com/reel',Visibility:true,top_picks_heading:'Top picks'});
 expect(list.recommended_places[0].recommendation_list).toMatchObject({documentId:id(2),slug:'bengaluru'});
});

it('reports no location at all as null and a draft or private list as not visible',()=>{
 const bare=collectionViewModel(collection({description:null,coverMediaId:null,publicationState:'draft',
  placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}),[]);
 expect(bare.List_Name_Details).toBeNull();
 expect(bare).toMatchObject({Visibility:false,cover_image:null});
 expect(collectionViewModel(collection({visibility:'private'}),[]).Visibility).toBe(false);
});

it('keeps a located list distinct from its places even with no places in it',()=>{
 // The location aggregate is the list's own, so an empty list still has its location.
 const list=collectionViewModel(collection(),[]);
 expect(list.recommended_places).toEqual([]);
 expect(list.List_Name_Details?.place_id).toBe('ChIJ_city');
});

it('refuses a list that is not a Places list or arrives without its location aggregate',()=>{
 expect(()=>collectionViewModel(collection({category:'people'}),[])).toThrow();
 expect(()=>collectionViewModel(collection({placeLocation:undefined}),[])).toThrow();
});

it('orders members by list-local pins then display order and drops archived rows',()=>{
 const lists=new Map<string,unknown>([[id(2),{detail:collection()}]]);
 const details=new Map<string,unknown>([
  [id(1),{detail:detail()}],
  [id(5),{detail:detail({id:id(5),entityId:id(5),displayTitle:'Second'})}],
  [id(6),{detail:detail({id:id(6),entityId:id(6)})}],
 ]);
 const view=placesViewModel.complete({
  category:'places',collections:[collection()],
  memberships:[
   {recommendationId:id(5),collectionId:id(2),displayOrder:1,placePinPosition:3},
   {recommendationId:id(1),collectionId:id(2),displayOrder:0,placePinPosition:null},
   {recommendationId:id(6),collectionId:id(2),displayOrder:2,recommendationArchived:true},
  ],
  topPicks:[{recommendationId:id(5),collectionId:id(2),position:3}],
 } as never,lists as never,details as never,'owner');
 expect(view.lists).toHaveLength(1);
 expect(view.lists[0].recommended_places.map(row=>row.documentId)).toEqual([id(5),id(1)]);
 expect(view.lists[0].recommended_places.map(row=>row.is_pinned)).toEqual([true,false]);
 expect(view.lists[0].recommended_places[0].pin_order).toBe(3);
 expect(view.lists[0].account).toMatchObject({documentId:id(3),username:'owner'});
});

it('membership-local pin state wins over category top picks and differs between lists',()=>{
 expect(placeViewModel(detail(),membership({placePinPosition:5})).pin_order).toBe(5);
 expect(placeViewModel(detail(),membership({collectionId:id(3),placePinPosition:null})).is_pinned).toBe(false);
});

it('refuses to map a complete observation with a list or a place missing from hydration',()=>{
 const base={category:'places',collections:[collection()],memberships:[{recommendationId:id(1),collectionId:id(2),displayOrder:0}],topPicks:[]};
 expect(()=>placesViewModel.complete(base as never,new Map() as never,new Map([[id(1),{detail:detail()}]]) as never)).toThrow();
 expect(()=>placesViewModel.complete(base as never,new Map([[id(2),{detail:collection()}]]) as never,new Map() as never)).toThrow();
});

it('refuses a complete observation of another category',()=>{
 expect(()=>placesViewModel.complete({category:'people',collections:[],memberships:[],topPicks:[]} as never,new Map() as never,new Map() as never)).toThrow();
});
