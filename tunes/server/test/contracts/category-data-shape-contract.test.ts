import {describe,expect,it} from 'vitest';
import {productOfferWriteSchema,productSpecificationsWriteSchema,productSpecificationsSchema,whereToBuy} from '../../../shared/explorersProductContract';
import {appEntityDetailsSchema} from '../../../shared/explorersAppContract';
import {gameDetailsSchema,gameCandidateSchema} from '../../../shared/explorersGameContract';
import {personEntityWriteDetailsSchema,emptyPersonDetails} from '../../../shared/explorersPersonContract';
import {createRecommendationSchema} from '../../../shared/explorersContract';

const spec=(n:number)=>Array.from({length:n},(_,i)=>({key:`k${i}`,value:`v${i}`}));
describe('0068 contracts',()=>{
 it('caps written specs at 8 but still reads 200',()=>{
  expect(productSpecificationsWriteSchema.safeParse(spec(8)).success).toBe(true);
  expect(productSpecificationsWriteSchema.safeParse(spec(9)).success).toBe(false);
  expect(productSpecificationsSchema.safeParse(spec(200)).success).toBe(true);
 });
 it('offer carries affiliateDisclosed (default false)',()=>{
  expect(productOfferWriteSchema.parse({price:null,currencyCode:null,buyUrl:'https://shop.example/x'}).affiliateDisclosed).toBe(false);
 });
 it('one link: buyUrl wins, productUrl is the fallback',()=>{
  expect(whereToBuy({buyUrl:null},{productUrl:'https://a.example/p'})).toBe('https://a.example/p');
  expect(whereToBuy({buyUrl:'https://b.example/aff'},{productUrl:'https://a.example/p'})).toBe('https://b.example/aff');
 });
 it('apps otherLinks ≤4 safe urls',()=>{
  const base={appUrl:'https://app.example',developer:null,logoUrl:null,description:null,downloadUrl:null,priceTier:null,platforms:[]};
  expect(appEntityDetailsSchema.safeParse({...base,otherLinks:[{label:'Android',url:'https://play.google.com/store/apps/details?id=x'}]}).success).toBe(true);
  expect(appEntityDetailsSchema.safeParse({...base,otherLinks:Array.from({length:5},()=>({label:'x',url:'https://x.example'}))}).success).toBe(false);
  expect(appEntityDetailsSchema.safeParse({...base,otherLinks:[{label:'x',url:'javascript:alert(1)'}]}).success).toBe(false);
 });
 it('games carry developer',()=>{
  expect(gameDetailsSchema.parse({releaseYear:null,platforms:[],genres:[],developer:'Maddy Makes Games'}).developer).toBe('Maddy Makes Games');
  expect(gameDetailsSchema.parse({releaseYear:null,platforms:[],genres:[]}).developer).toBeNull();
  expect(gameCandidateSchema.safeParse({externalId:'1',title:'Celeste',year:2018,coverUrl:null,platforms:[],genres:[],developer:null}).success).toBe(true);
 });
 it('people: no follower count and no rating on new writes',()=>{
  expect(personEntityWriteDetailsSchema.safeParse({...emptyPersonDetails(),externalFollowerCountText:'10k'}).success).toBe(false);
  const id='00000000-0000-5000-8000-000000000001';
  expect(createRecommendationSchema.safeParse({category:'people',entityId:id,collectionId:id,expectedCollectionRevision:1,userRating:8}).success).toBe(false);
 });
});
