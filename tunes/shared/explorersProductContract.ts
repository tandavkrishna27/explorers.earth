import {z} from 'zod/v3';
// Ticket 4.4. Products has two halves that must not be confused:
//
//  - productEntityDetails are catalog facts about the thing, shared by everyone who
//    recommends it.
//  - productOffer is one creator's recorded price, currency and buy link, carried per
//    recommendation. A's offer changing must never change B's recommendation of the same
//    product, which is why the offer is not on the entity.
//
// Money is an exact decimal string end to end. The wire never carries a float, because a
// float cannot represent "19.90" and the ticket requires the stored and wire values to be
// exactly that. 0044 stores numeric(20,6).
//
// Zero and unknown are different facts: "0.00" is free, null is "not recorded". Neither
// may collapse into the other anywhere in the chain.

const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
export const productTitleSchema=text(1000).refine(v=>v.length>0&&Array.from(v).length<=500&&!/[\u0000-\u001f\u007f]/.test(v),'Invalid title');
// Identical to safeAppUrlSchema and safeBookUrlSchema: http(s) only, no embedded
// credentials, no explicit port. 0044 carries the scheme CHECK too.
export const safeProductUrlSchema=z.string().max(2048).url().refine(v=>{try{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.port;}catch{return false;}},'Invalid URL');

/**
 * The supported currencies and their ISO 4217 minor units.
 *
 * This is the set the product actually offers - AddProductPage's ALLOWED_CURRENCIES - not
 * all of ISO 4217, and it is pinned here rather than derived from Intl. Intl's currency
 * data varies with the host's ICU build, so a validation gate built on it would accept or
 * reject differently on different machines; an owner's saved price is not something to
 * leave to the runtime's locale data. An unknown three-letter code is rejected at the API
 * boundary, which a default-to-two-digits rule could not do.
 *
 * The version string exists so that adding a currency is a visible, dated change.
 */
export const CURRENCY_METADATA_VERSION='iso-4217/product-supported-v1' as const;
export const SUPPORTED_CURRENCIES={USD:2,EUR:2,GBP:2,INR:2,JPY:0,AUD:2,CAD:2,SGD:2} as const;
export type SupportedCurrency=keyof typeof SUPPORTED_CURRENCIES;
export const currencyCodeSchema=z.enum(Object.keys(SUPPORTED_CURRENCIES) as [SupportedCurrency,...SupportedCurrency[]]);
export const currencyMinorUnits=(code:SupportedCurrency)=>SUPPORTED_CURRENCIES[code];

/**
 * An exact decimal amount as a string. Bounded to fit numeric(20,6): at most fourteen
 * integer digits and six fraction digits. No sign, no exponent, no leading zeroes - "0"
 * and "0.00" are both accepted and both mean free, and neither is normalised away here,
 * because the stored scale is the owner's and the ticket asserts exact round-trips.
 */
export const productAmountSchema=z.string().regex(/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/,'Invalid amount');
export const amountScale=(amount:string)=>{const at=amount.indexOf('.');return at<0?0:amount.length-at-1;};

/**
 * One canonical wire form for a stored amount, used by the repository and asserted by the
 * tests, so there is exactly one rule rather than a reader and a writer disagreeing.
 *
 * numeric(20,6) is a fixed-scale column: PostgreSQL returns "19.90" as "19.900000". Those
 * are the same number but not the same string, and the ticket requires exact decimal
 * values on the wire, so the padding has to be resolved somewhere explicit.
 *
 * The rule: drop the fraction's trailing zeros, then - if the currency is known - pad back
 * to exactly that currency's minor units. So "19.900000" is "19.90" in USD and "20" is
 * "20.00"; a JPY amount keeps no fraction at all. With an unknown currency there is no
 * minor-unit authority to pad to, so the minimal exact form is returned.
 *
 * This never changes the value, only how many trailing zeros are written, and zero stays
 * zero: "0.000000" is "0.00" in USD and "0" with no currency - never null.
 */
export function canonicalAmount(amount:string,currencyCode:SupportedCurrency|null):string{
 const parsed=productAmountSchema.safeParse(amount);
 if(!parsed.success)throw new Error('Invalid stored amount');
 const [whole,fraction='']=amount.split('.');
 const trimmed=fraction.replace(/0+$/,'');
 if(currencyCode===null)return trimmed?`${whole}.${trimmed}`:whole;
 const units=currencyMinorUnits(currencyCode);
 if(trimmed.length>units)throw new Error(`Stored amount exceeds ${currencyCode} minor units`);
 return units===0?whole:`${whole}.${trimmed.padEnd(units,'0')}`;
}

const offerFields={
 price:productAmountSchema.nullable(),
 currencyCode:currencyCodeSchema.nullable(),
 buyUrl:safeProductUrlSchema.nullable(),
};
/**
 * A currency may be unknown while an amount is known - there is no implicit USD - but a
 * known currency constrains the amount's precision: JPY has no minor unit, so "100.50"
 * is not a yen price and is refused rather than silently rounded.
 */
export const productOfferSchema=z.object(offerFields).strict().superRefine((value,ctx)=>{
 if(value.price!==null&&value.currencyCode!==null&&amountScale(value.price)>currencyMinorUnits(value.currencyCode))
  ctx.addIssue({code:z.ZodIssueCode.custom,path:['price'],message:`Amount exceeds ${value.currencyCode} minor units`});
});

// Specifications are a bounded string->string map, not an arbitrary metadata bag: 0044
// rejects a non-string value at the database as well.
export const productSpecificationsSchema=z.record(text(200).refine(v=>v.length>0,'Invalid key'),text(2000).refine(v=>v.length>0,'Invalid value'))
 .refine(v=>Object.keys(v).length<=200,'Too many specifications');

const fields={
 productUrl:safeProductUrlSchema,
 brand:text(200).nullable(),
 logoUrl:safeProductUrlSchema.nullable(),
 description:text(8192).nullable(),
 specifications:productSpecificationsSchema,
 imageUrls:z.array(safeProductUrlSchema).max(20),
};
export const productEntityDetailsSchema=z.object(fields).strict().refine(v=>new TextEncoder().encode(JSON.stringify(v)).length<=16384,'Product details too large');

// A display override re-presents a *shared* entity for one owner, so productUrl is
// excluded: it is what the product is, and letting one owner point a shared entity at a
// different merchant page would change the thing rather than how it reads. Apps excludes
// appUrl and Books excludes its provider rating for the same reason.
const {productUrl:_identity,...overridable}=fields;
export const productDisplayFieldsSchema=z.object(overridable).partial().strict();

export const productEntityDtoSchema=z.object({id:z.string().uuid(),kind:z.literal('product'),title:z.string().trim().refine(v=>v.length>0&&Array.from(v).length<=500),details:productEntityDetailsSchema,origin:z.literal('manual')}).strict();
export const resolveManualProductSchema=z.object({kind:z.literal('manual'),category:z.literal('products'),details:z.object(fields).partial().extend({title:productTitleSchema,productUrl:safeProductUrlSchema}).strict()}).strict();

export type ProductEntityDetails=z.infer<typeof productEntityDetailsSchema>;
export type ProductEntityDto=z.infer<typeof productEntityDtoSchema>;
export type ProductOffer=z.infer<typeof productOfferSchema>;
export type ProductSpecifications=z.infer<typeof productSpecificationsSchema>;

// productUrl has no empty value, so an absent product has no representable details row,
// exactly as with an App's appUrl. An absent *offer*, by contrast, is a real state and is
// all nulls - unknown price, unknown currency, no buy link.
export const emptyProductOffer=():ProductOffer=>({price:null,currencyCode:null,buyUrl:null});
export const emptyProductDisplayFields=():z.infer<typeof productDisplayFieldsSchema>=>({});
