import {it,expect,vi} from 'vitest';
// complete() is the only part of the mapping that calls the brand assertion, and that
// brand is a module-private WeakSet no fixture can join. Stubbing just the assertion
// exercises the aggregation - the filtering, the ordering and the pin matching.
vi.mock('../../../../lib/explorersApiClient',async orig=>({...(await orig() as object),assertCompleteMyCategoryContent:vi.fn()}));
const {collectionViewModel,productsViewModel}=await import('../productsViewModel');

const id=(n:number)=>`00000000-0000-4000-8000-00000000000${n}`;
const facts={productUrl:'https://example.com/widget',brand:'Acme',logoUrl:null,description:null,specifications:{},imageUrls:[]};
const offer={price:'19.90',currencyCode:'USD',buyUrl:null};
const detail=(over:Record<string,unknown>={})=>({id:id(1),entityId:id(1),category:'products',entity:{kind:'product'},displayTitle:'Widget',userRating:null,note:null,effectiveProductDetails:facts,productOffer:offer,...over} as never);
const collection={id:id(2),accountId:id(3),title:'Gear',description:null,slug:'gear',visibility:'public',publicationState:'published',displayOrder:0,heading:'Top products',coverMediaId:null} as never;

it('stamps every row with its own list and treats draft or private as not visible',()=>{
 const list=collectionViewModel({...(collection as object),publicationState:'draft'} as never,[{documentId:id(1)} as never]);
 expect(list.Visibility).toBe(false);
 expect(list.recommended_products[0].product_list).toMatchObject({documentId:id(2),slug:'gear'});
 expect(collectionViewModel(collection,[]).top_products_heading).toBe('Top products');
});

it('orders members by display order, drops archived rows and applies only the matching pin',()=>{
 const details=new Map<string,unknown>([
  [id(1),{detail:detail()}],
  [id(5),{detail:detail({id:id(5),entityId:id(5),displayTitle:'Second',productOffer:{price:'0.00',currencyCode:'USD',buyUrl:null}})}],
  [id(6),{detail:detail({id:id(6),entityId:id(6)})}],
 ]);
 const view=productsViewModel.complete({
  category:'products',collections:[collection],
  memberships:[
   {recommendationId:id(5),collectionId:id(2),displayOrder:1},
   {recommendationId:id(1),collectionId:id(2),displayOrder:0},
   {recommendationId:id(6),collectionId:id(2),displayOrder:2,recommendationArchived:true},
  ],
  topPicks:[{recommendationId:id(5),collectionId:id(2),position:3}],
 } as never,details as never,'owner');
 expect(view.lists).toHaveLength(1);
 expect(view.lists[0].recommended_products.map(row=>row.documentId)).toEqual([id(1),id(5)]);
 expect(view.lists[0].recommended_products.map(row=>row.is_pinned)).toEqual([false,true]);
 expect(view.lists[0].recommended_products[1].pin_order).toBe(3);
 // The zero-priced row keeps its zero through the aggregation.
 expect(view.lists[0].recommended_products.map(row=>row.price)).toEqual([19.9,0]);
 expect(view.lists[0].account).toMatchObject({documentId:id(3),username:'owner'});
});

it('refuses to map a complete observation with a detail missing from the hydration map',()=>{
 expect(()=>productsViewModel.complete({category:'products',collections:[collection],memberships:[{recommendationId:id(1),collectionId:id(2),displayOrder:0}],topPicks:[]} as never,new Map() as never)).toThrow();
});

it('refuses a complete observation of another category',()=>{
 expect(()=>productsViewModel.complete({category:'apps',collections:[],memberships:[],topPicks:[]} as never,new Map() as never)).toThrow();
});
