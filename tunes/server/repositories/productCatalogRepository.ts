import type {Pool,PoolClient} from 'pg';
import {productEntityDtoSchema,productEntityDetailsSchema,productOfferSchema,canonicalAmount,currencyCodeSchema,
 emptyProductOffer,type ProductEntityDetails,type ProductOffer} from '../../shared/explorersProductContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

// Ticket 4.4. Products has no provider, so like Apps there is no entity_identifiers join,
// no provenance and no candidate import: every fact here was entered by an owner.
//
// The split that matters: product_entity_details is the shared catalog row, and the offer
// in product_recommendation_context belongs to one recommendation. Writing an offer never
// touches the entity, so one owner's price change cannot reach another owner's
// recommendation of the same product.

export async function insertProductDetails(db:PoolClient,entityId:string,d:ProductEntityDetails){
 await db.query(`INSERT INTO product_entity_details(entity_id,product_url,brand,logo_url,description,specifications,image_urls) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,
  [entityId,d.productUrl,d.brand,d.logoUrl,d.description,JSON.stringify(d.specifications),d.imageUrls]);
}

export async function readProductEntity(db:Pick<Pool,'query'>,id:string){
 const bounds=(await db.query('SELECT octet_length(to_json(d)::text) AS bytes FROM product_entity_details d WHERE entity_id=$1',[id])).rows[0];
 if(Number(bounds?.bytes??0)>16384)throw new RecommendationFailure(413,'Product facts exceed the read bound');
 const row=(await db.query(`SELECT e.id,e.kind,e.title,e.origin,d.* FROM entities e LEFT JOIN product_entity_details d ON d.entity_id=e.id WHERE e.id=$1`,[id])).rows[0];
 if(!row)throw new Error('Product catalog unavailable');
 // product_url is NOT NULL in 0044, so a missing details row is a broken state rather
 // than an empty default - there is nothing to fall back to.
 if(!row.entity_id)throw new RecommendationFailure(409,'Product entity has no typed details');
 const details=productEntityDetailsSchema.parse({productUrl:row.product_url,brand:row.brand,logoUrl:row.logo_url,
  description:row.description,specifications:row.specifications??{},imageUrls:row.image_urls??[]});
 return productEntityDtoSchema.parse({id:row.id,kind:row.kind,title:row.title,origin:row.origin,details});
}

/**
 * The offer. An absent row is a real state - unknown price, unknown currency, no buy link
 * - so this returns the empty offer rather than failing, which is the opposite of the
 * entity details above and is the distinction the ticket turns on.
 *
 * price is read as text so the exact decimal survives; a JS number could not hold it.
 */
export async function readProductOffer(db:Pick<Pool,'query'>,recommendationId:string,accountId:string):Promise<ProductOffer>{
 const row=(await db.query<{price:string|null;currency_code:string|null;buy_url:string|null}>(
  'SELECT price::text AS price,currency_code,buy_url FROM product_recommendation_context WHERE recommendation_id=$1 AND account_id=$2',
  [recommendationId,accountId])).rows[0];
 if(!row)return emptyProductOffer();
 const currencyCode=row.currency_code===null?null:currencyCodeSchema.parse(row.currency_code);
 return productOfferSchema.parse({
  // Zero survives as zero: only null means unknown, and "0.000000" is not null.
  price:row.price===null?null:canonicalAmount(row.price,currencyCode),
  currencyCode,buyUrl:row.buy_url,
 });
}

/**
 * Replaces the whole offer in one statement, so a price change and a currency change can
 * never be observed half-applied. The offer is keyed on the recommendation, so this can
 * only ever affect the one recommendation named.
 */
export async function writeProductOffer(db:PoolClient,recommendationId:string,accountId:string,offer:ProductOffer){
 const parsed=productOfferSchema.safeParse(offer);
 if(!parsed.success)throw new RecommendationFailure(422,'Invalid product offer');
 const value=parsed.data;
 await db.query(`INSERT INTO product_recommendation_context(recommendation_id,account_id,price,currency_code,buy_url)
   VALUES($1,$2,$3::numeric,$4,$5)
   ON CONFLICT(recommendation_id) DO UPDATE SET price=EXCLUDED.price,currency_code=EXCLUDED.currency_code,buy_url=EXCLUDED.buy_url`,
  [recommendationId,accountId,value.price,value.currencyCode,value.buyUrl]);
}

// An owner's display override re-presents a shared entity. productUrl is absent from the
// override vocabulary by design, so it can never be replaced here.
export function effectiveProductDetails(details:ProductEntityDetails,overrides:Record<string,unknown>){
 const result={...details};
 for(const key of Object.keys(details))if(key!=='productUrl'&&Object.hasOwn(overrides,key))(result as any)[key]=overrides[key];
 return productEntityDetailsSchema.parse(result);
}
