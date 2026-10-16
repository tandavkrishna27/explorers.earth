import type {EditableOwnerRecommendation,OwnerCollectionDto,OwnerMembershipDto} from '../../../../../tunes/shared/explorersOwnerContentContract';
import {productEntityDetailsSchema,productOfferSchema} from '../../../../../tunes/shared/explorersProductContract';
import type {ProductList,RecommendedProduct} from '../types';
import type {CompleteProductsOwnerContent} from './productsClient';
import {ExplorersApiError,type RecommendationObservation,assertCompleteMyCategoryContent} from '../../../lib/explorersApiClient';

// Ticket 4.4. Pure canonical-DTO to feature-type mapping, in its own module so the
// conversions the epic asks for are asserted directly.
//
// This is the display edge the target schema means by "the adapter converts only for
// current display": RecommendedProduct.price is `number | null` and formatPrice calls
// Intl.NumberFormat on it, so the exact decimal string becomes a number exactly here and
// nowhere earlier. Zero and unknown must survive that conversion as different facts -
// Number('0.00') is 0, and null stays null rather than becoming 0.

type Pin={recommendationId:string;collectionId:string;position:number};

export function productViewModel(detail:Readonly<EditableOwnerRecommendation>,membership:Readonly<OwnerMembershipDto>,pin?:Readonly<Pin>):RecommendedProduct{
 if(detail.category!=='products'||detail.entity.kind!=='product'||detail.id!==membership.recommendationId)throw new ExplorersApiError(409,'CONFLICT','Products detail identity changed');
 // product_url is NOT NULL in 0044, so an unparseable details row is a broken state.
 const parsed=productEntityDetailsSchema.safeParse(detail.effectiveProductDetails);
 if(!parsed.success)throw new ExplorersApiError(409,'CONFLICT','Product details are unavailable');
 const offer=productOfferSchema.safeParse(detail.productOffer);
 if(!offer.success)throw new ExplorersApiError(409,'CONFLICT','Product offer is unavailable');
 const facts=parsed.data,recorded=offer.data;
 const selectedPin=pin?.recommendationId===membership.recommendationId&&pin.collectionId===membership.collectionId?pin:undefined;
 return {
  documentId:detail.id,
  product_url:facts.productUrl,
  title:detail.displayTitle??'Untitled product',
  brand:facts.brand,
  // Unknown stays null; zero becomes 0, which is a price.
  price:recorded.price===null?null:Number(recorded.price),
  // No implicit USD: an unknown currency is reported as unknown.
  currency:recorded.currencyCode,
  buy_url:recorded.buyUrl,
  logo_url:facts.logoUrl,
  description:facts.description,
  // The legacy type models an absent map and an absent list as null, not as empties.
  specifications:Object.keys(facts.specifications).length?{...facts.specifications}:null,
  user_recommendation_note:detail.note,
  user_rating:detail.userRating,
  is_pinned:selectedPin!==undefined,
  pin_order:selectedPin?.position??null,
  display_order:membership.displayOrder,
  images:facts.imageUrls.length?[...facts.imageUrls]:null,
  product_list:null,
  // Taxonomy is out of 4.4's scope and has no seeded vocabulary.
  product_category:null,
 };
}

export function collectionViewModel(collection:Readonly<OwnerCollectionDto>,products:RecommendedProduct[],username=''):ProductList{
 return {
  documentId:collection.id,
  List_Name:collection.title,
  list_description:collection.description,
  slug:collection.slug,
  Visibility:collection.visibility==='public'&&collection.publicationState==='published',
  cover_image:null,
  display_order:collection.displayOrder,
  top_products_heading:collection.heading,
  recommended_products:products.map(product=>({...product,product_list:{documentId:collection.id,List_Name:collection.title,slug:collection.slug}})),
  account:{documentId:collection.accountId,username},
 };
}

export type ProductOwnerView={lists:ProductList[]};

export const productsViewModel={
 complete(observed:CompleteProductsOwnerContent,details:ReadonlyMap<string,RecommendationObservation>,username=''):Readonly<ProductOwnerView>{
  assertCompleteMyCategoryContent(observed);
  if(observed.category!=='products')throw new ExplorersApiError(409,'CONFLICT','Products category required');
  return {lists:observed.collections.map(collection=>collectionViewModel(
   collection,
   observed.memberships
    .filter(member=>member.collectionId===collection.id&&!member.collectionArchived&&!member.recommendationArchived)
    .sort((a,b)=>a.displayOrder-b.displayOrder||a.recommendationId.localeCompare(b.recommendationId))
    .map(member=>{
     const observation=details.get(member.recommendationId);
     if(!observation)throw new ExplorersApiError(409,'CONFLICT','Product detail missing while mapping');
     const pin=observed.topPicks?.find(entry=>entry.recommendationId===member.recommendationId);
     return productViewModel(observation.detail as Readonly<EditableOwnerRecommendation>,member,pin);
    }),
   username,
  ))};
 },
};
