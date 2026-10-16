import {beforeEach,describe,it,expect,vi} from 'vitest';
import {ProductsClient} from '../productsClient';
import {productViewModel} from '../productsViewModel';
import {readProductsOwnerContent} from '../explorersAdapter';
import useAuthStore from '../../../../store/store';

vi.mock('../productsClient',()=>({ProductsClient:{readCompleteOwner:vi.fn(),observeRecommendation:vi.fn()}}));
// productViewModel stays real so the numeric conversions below are the ones the UI gets;
// only complete() is stubbed, for the orchestration cases.
vi.mock('../productsViewModel',async orig=>({...(await orig() as object),productsViewModel:{complete:vi.fn(()=>({lists:[]}))}}));

const id=(n:number)=>`00000000-0000-4000-8000-00000000000${n}`;
const facts={productUrl:'https://example.com/widget',brand:'Acme',logoUrl:null,description:'Notes',specifications:{Weight:'1kg'},imageUrls:['https://example.com/a.png']};
const detail=(offer:unknown,over:Record<string,unknown>={})=>({id:id(1),entityId:id(1),category:'products',entity:{kind:'product'},displayTitle:'Widget',userRating:4,note:null,effectiveProductDetails:facts,productOffer:offer,...over} as never);
const membership=(over:Record<string,unknown>={})=>({recommendationId:id(1),collectionId:id(2),displayOrder:0,...over} as never);

describe('numeric conversions for the current UI',()=>{
 // The ticket's distinction: zero is a price, null is unrecorded, and the conversion to
 // the number the legacy type declares must not collapse one into the other.
 it('converts zero to 0 and keeps unknown as null',()=>{
  expect(productViewModel(detail({price:'0.00',currencyCode:'USD',buyUrl:null}),membership()).price).toBe(0);
  expect(productViewModel(detail({price:'0',currencyCode:null,buyUrl:null}),membership()).price).toBe(0);
  expect(productViewModel(detail({price:null,currencyCode:'USD',buyUrl:null}),membership()).price).toBeNull();
  expect(productViewModel(detail({price:null,currencyCode:null,buyUrl:null}),membership()).price).toBeNull();
 });

 it('converts an exact decimal without inventing precision',()=>{
  expect(productViewModel(detail({price:'19.90',currencyCode:'USD',buyUrl:null}),membership()).price).toBe(19.9);
  expect(productViewModel(detail({price:'1234.56',currencyCode:'EUR',buyUrl:null}),membership()).price).toBe(1234.56);
  expect(productViewModel(detail({price:'100',currencyCode:'JPY',buyUrl:null}),membership()).price).toBe(100);
 });

 it('reports an unknown currency as unknown rather than defaulting to USD',()=>{
  const row=productViewModel(detail({price:'19.90',currencyCode:null,buyUrl:null}),membership());
  expect(row.currency).toBeNull();
  expect(row.price).toBe(19.9);
 });

 it('carries the merchant and buy links through unchanged',()=>{
  const row=productViewModel(detail({price:null,currencyCode:null,buyUrl:'https://example.com/buy'}),membership());
  expect(row).toMatchObject({product_url:facts.productUrl,buy_url:'https://example.com/buy',brand:'Acme',product_category:null});
  expect(row.specifications).toEqual({Weight:'1kg'});
  expect(row.images).toEqual(['https://example.com/a.png']);
 });

 it('models an absent specification map and image list as null, not as empties',()=>{
  const row=productViewModel(detail({price:null,currencyCode:null,buyUrl:null},{effectiveProductDetails:{...facts,specifications:{},imageUrls:[]}}),membership());
  expect(row.specifications).toBeNull();expect(row.images).toBeNull();
 });

 it('refuses a broken details row or a broken offer rather than presenting a guess',()=>{
  for(const broken of [undefined,{},{...facts,productUrl:'javascript:alert(1)'}])
   expect(()=>productViewModel(detail({price:null,currencyCode:null,buyUrl:null},{effectiveProductDetails:broken}),membership())).toThrow();
  for(const broken of [undefined,{price:'-1',currencyCode:'USD',buyUrl:null},{price:'10.00',currencyCode:'XYZ',buyUrl:null},{price:'100.50',currencyCode:'JPY',buyUrl:null}])
   expect(()=>productViewModel(detail(broken),membership())).toThrow();
 });

 it('does not pin a row through a membership of another collection',()=>{
  const offer={price:null,currencyCode:null,buyUrl:null},pin={recommendationId:id(1),collectionId:id(2),position:0};
  expect(productViewModel(detail(offer),membership(),pin).is_pinned).toBe(true);
  expect(productViewModel(detail(offer),membership({collectionId:id(4)}),pin)).toMatchObject({is_pinned:false,pin_order:null});
 });
});

describe('owner read orchestration',()=>{
 beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});});
 const observed=(n:number)=>({revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:Array.from({length:n},(_,i)=>({id:String(i),revision:1}))});

 it('never returns a view built on a category observation that changed under it',async()=>{
  const first=observed(1);
  vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValueOnce(first as never).mockResolvedValueOnce({...first,revision:'2'} as never);
  vi.mocked(ProductsClient.observeRecommendation).mockResolvedValue({detail:{revision:1,categoryRevision:'1'}} as never);
  await expect(readProductsOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('rejects a detail whose revision or category revision does not match',async()=>{
  for(const detail of [{revision:2,categoryRevision:'1'},{revision:1,categoryRevision:'2'}]){
   vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
   vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
   vi.mocked(ProductsClient.observeRecommendation).mockResolvedValue({detail} as never);
   await expect(readProductsOwnerContent()).rejects.toMatchObject({status:409});
  }
 });

 it('rejects owner epoch drift during detail completion',async()=>{
  vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(ProductsClient.observeRecommendation).mockImplementation(async()=>{useAuthStore.setState({generation:2});return {detail:{revision:1,categoryRevision:'1'}} as never;});
  await expect(readProductsOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('holds a four-reader maximum and returns the authentic final observation',async()=>{
  const snapshot=observed(12);vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValue(snapshot as never);
  let active=0,max=0;
  vi.mocked(ProductsClient.observeRecommendation).mockImplementation(async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return {detail:{revision:1,categoryRevision:'1'}} as never;});
  const value=await readProductsOwnerContent();
  expect(value.observation).toBe(snapshot);expect(value.details.size).toBe(12);expect(max).toBeLessThanOrEqual(4);
 });

 it('stops future claims after a terminal failure and preserves the first error',async()=>{
  vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValue(observed(5) as never);
  const pending:Array<{resolve:(v:unknown)=>void;reject:(r:unknown)=>void}>=[];
  vi.mocked(ProductsClient.observeRecommendation).mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve:resolve as (v:unknown)=>void,reject})));
  const sentinel={terminal:'first'};
  const caller=new AbortController(),removed=vi.spyOn(caller.signal,'removeEventListener');
  const work=readProductsOwnerContent(caller.signal);let failure:unknown;const settled=work.catch(error=>{failure=error;});
  await vi.waitFor(()=>expect(pending).toHaveLength(4));
  pending[0].reject(sentinel);
  await settled;
  expect(failure).toBe(sentinel);
  expect(removed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ProductsClient.observeRecommendation).mock.calls.slice(0,4).every(call=>(call[1] as AbortSignal).aborted)).toBe(true);
  pending[1].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(ProductsClient.observeRecommendation).toHaveBeenCalledTimes(4);
  expect(ProductsClient.readCompleteOwner).toHaveBeenCalledTimes(1);
 });

 it('acquires no transport for a preaborted caller and removes its listener',async()=>{
  const caller=new AbortController();caller.abort();const remove=vi.spyOn(caller.signal,'removeEventListener');
  await expect(readProductsOwnerContent(caller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(ProductsClient.observeRecommendation).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);
 });

 it('removes caller forwarding after a successful hydration and brackets with two reads',async()=>{
  vi.mocked(ProductsClient.readCompleteOwner).mockResolvedValue(observed(0) as never);
  const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');
  await readProductsOwnerContent(caller.signal);
  expect(remove).toHaveBeenCalledTimes(1);expect(ProductsClient.readCompleteOwner).toHaveBeenCalledTimes(2);
 });
});
