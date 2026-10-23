import {z} from 'zod/v3';
import {amountPrecisionProblem,isKnownCurrency} from './currency';
// Ticket 5.3. Guides are account-owned collections with *ordered sections*, and a section
// is a structured block, not a recommendation of an entity.
//
// The one thing to understand before changing anything here: a guide section's places are
// denormalised Google Places snapshots carried inside the section's own blocks. They are
// NOT `recommendations` rows and they are NOT `collection_items` rows. A guide therefore
// never writes either table, which is why migration 0029's CHECK constraints on
// `recommendations.category` and `collection_items.category` legitimately omit 'guides' and
// are left exactly as they are. Those constraints are not an obstacle to this ticket; under
// this design they *enforce* its central invariant - that a guide cannot be flattened into
// ordinary item rows. Widening them would delete that guarantee in exchange for nothing.
// (`collections.category` already admits 'guides', so the parent needs no change either.)
//
// A guide's sections reference places by provider id and keep their own copy of the facts,
// because an itinerary is a record of what the author arranged. If a place later closes or
// is renamed, day three of a published guide must still say what it said. That is the
// opposite of the Places category, where a shared entity is the single source of truth, and
// the two models are deliberately different.

// ---------------------------------------------------------------------------------------
// GEOMETRY IS NESTED HERE. THIS IS NOT THE PLACES SHAPE.
//
// `DayPlace.geometry` is `{location:{lat,lng}}`, because that is the Google Places response
// shape and it is what every Guides component, map and itinerary view reads today. The
// Places category uses a FLAT `{lat,lng}` for its own `Geometry`, and during 5.1 emitting
// the nested form there typechecked and silently broke every map. Flattening it here would
// do the same damage in the other direction. Keep each category's shape as its consumers
// read it, and do not "harmonise" them.
// ---------------------------------------------------------------------------------------

const text=(max:number)=>z.string().trim().max(max).refine(v=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(v),'Invalid text');
const filled=(max:number)=>text(max).refine(v=>v.length>0,'Required text');
const coordinate=(max:number)=>z.number().refine(Number.isFinite,'Invalid coordinate').refine(v=>Math.abs(v)<=max,'Coordinate out of range');
// Money is stored and transported as an exact decimal string, never a float. A budget is
// summed across a day and a trip, and binary floats do not add up. The view model converts
// to the number the existing budget components expect; storage stays exact so a re-read
// never drifts.
//
// Three fraction digits because KWD, BHD and the other three-digit currencies need them;
// the currency's own minor units (./currency) bound the amount, not this pattern.
const money=z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,3})?$/,'Invalid amount');
// A guide's estimated budget is numeric(14,3) since 0061: up to eleven integer digits and three
// decimals, so KWD, BHD and OMR amounts are stored exactly. The currency's own minor units
// (amountPrecisionProblem) narrow that further per currency.
const estimatedBudgetAmount=z.string().regex(/^(0|[1-9][0-9]{0,10})(\.[0-9]{1,3})?$/,'Invalid amount');
// Reading accepts any stored three-letter code (see the write schemas below for what a new
// write may use): a guide saved with a code outside today's table must still open.
const currency=z.string().regex(/^[A-Z]{3}$/,'Invalid currency');
// The regexes above cap the scale at three; the currency's own minor units are the real bound.
const moneyProblem=(amount:string|null,code:string|null):string|null=>
 amount===null||code===null?null:amountPrecisionProblem(amount,code);
// ISO 4217 is three uppercase letters; the provider id is Google's opaque place id.
const providerPlaceId=z.string().trim().min(1).max(512).regex(/^[A-Za-z0-9_\-]+$/,'Invalid place id');

export const GUIDE_SECTION_BLOCK_VERSION='guide-section-blocks/v2' as const;
export const guideSectionBlockVersionSchema=z.literal(GUIDE_SECTION_BLOCK_VERSION);

export const travelModeSchema=z.enum(['walk','drive','bike','public_transit','taxi','auto','ferry','flight']);

// A photo on an itinerary place. `mediaId` replaces Strapi's numeric upload id and
// `documentId`: the bytes are an owned media asset, served through the media content route,
// so the gallery costs nothing per render and survives a provider outage. The dimensions
// and aspect ratio are kept because the itinerary lays out before the image loads.
//
// There is deliberately no `url`. A URL stored next to the id is a second source of truth
// that goes stale the moment an asset is replaced; the reader builds it from `mediaId`.
// There is also no `photosLoading`: that is a transient client flag and persisting it would
// restore a spinner that never stops.
export const guideActivityPhotoSchema=z.object({
 mediaId:z.string().uuid(),
 fileName:text(300).nullable(),
 width:z.number().int().min(1).max(100000).nullable(),
 height:z.number().int().min(1).max(100000).nullable(),
 aspectRatio:z.string().regex(/^[1-9][0-9]{0,3}:[1-9][0-9]{0,3}$/,'Invalid aspect ratio').nullable(),
}).strict();

// One place on one day. `placeId` is the provider's id and is what deduplicates a place
// across the timeline, the budget and the transport segments; `localId` is the author's
// stable handle for this *entry*, because the same cafe can legitimately appear twice in a
// day and the two entries must stay distinguishable when reordered.
export const guideDayPlaceSchema=z.object({
 localId:filled(100),
 placeId:providerPlaceId,
 name:filled(500),
 formattedAddress:text(1000).nullable(),
 // Nested. See the banner above - do not flatten.
 geometry:z.object({location:z.object({lat:coordinate(90),lng:coordinate(180)}).strict()}).strict().nullable(),
 types:z.array(filled(100)).max(32),
 tips:text(4000).nullable(),
 photos:z.array(guideActivityPhotoSchema).max(10),
 priceLevel:z.number().int().min(0).max(4).nullable(),
 priceRange:text(200).nullable(),
 // The legacy free-text budget. Retained because existing guides carry it and it is the
 // only record of what the author wrote; new edits set budgetAmount/budgetCurrency.
 customBudget:text(200).nullable(),
 budgetAmount:money.nullable(),
 budgetCurrency:currency.nullable(),
 // Provenance. An AI-suggested place that was never confirmed against the provider must
 // stay visibly unverified rather than being presented as fact.
 source:z.enum(['google','ai-unverified','manual']),
 verified:z.boolean(),
}).strict().superRefine((v,ctx)=>{
 if((v.budgetAmount===null)!==(v.budgetCurrency===null))ctx.addIssue({code:'custom',message:'An amount needs its currency',path:['budgetCurrency']});
 const budgetProblem=moneyProblem(v.budgetAmount,v.budgetCurrency);
 if(budgetProblem)ctx.addIssue({code:'custom',message:budgetProblem,path:['budgetAmount']});
 if(v.source==='ai-unverified'&&v.verified)ctx.addIssue({code:'custom',message:'An unverified place cannot claim verification',path:['verified']});
});

// Transport between two consecutive places, keyed by their entry handles rather than their
// provider ids, so a day that visits the same place twice still routes correctly.
export const guideTransportSegmentSchema=z.object({
 fromLocalId:filled(100),toLocalId:filled(100),mode:travelModeSchema,
 distanceKm:z.number().min(0).max(100000).nullable(),
 estimatedMinutes:z.number().int().min(0).max(100000).nullable(),
}).strict().refine(v=>v.fromLocalId!==v.toLocalId,{message:'A segment cannot start and end at the same entry',path:['toLocalId']});

const segment=z.array(guideDayPlaceSchema).max(40);
export const guideTimelineSchema=z.object({morning:segment,afternoon:segment,evening:segment}).strict();
export const guideTransportSchema=z.object({segments:z.array(guideTransportSegmentSchema).max(200)}).strict();
export const guideStaySchema=z.object({accommodations:z.array(guideDayPlaceSchema).max(20)}).strict();
export const guideActivitiesSchema=z.object({activities:z.array(guideDayPlaceSchema).max(60)}).strict();

// The budget is a projection of the timeline, so it carries only what the budget table
// needs. It is stored rather than derived because an author may price an entry the
// timeline has no price for, and recomputing it would discard that.
export const guideBudgetPlaceSchema=z.object({
 localId:filled(100),placeId:providerPlaceId,name:filled(500),
 priceLevel:z.number().int().min(0).max(4).nullable(),priceRange:text(200).nullable(),
 customBudget:text(200).nullable(),budgetAmount:money.nullable(),budgetCurrency:currency.nullable(),
}).strict().superRefine((v,ctx)=>{
 if((v.budgetAmount===null)!==(v.budgetCurrency===null))ctx.addIssue({code:'custom',message:'An amount needs its currency',path:['budgetCurrency']});
 const problem=moneyProblem(v.budgetAmount,v.budgetCurrency);
 if(problem)ctx.addIssue({code:'custom',message:problem,path:['budgetAmount']});
});
const budgetSegment=z.array(guideBudgetPlaceSchema).max(40);
export const guideBudgetSchema=z.object({morning:budgetSegment,afternoon:budgetSegment,evening:budgetSegment}).strict();

// GD-23. A day is ONE ordered list. Position is the array index; the only time data is an
// optional label on the item. Labels are lowercase canonical values; the UI renders them.
export const GUIDE_TIME_LABELS=['morning','afternoon','evening','night'] as const;
export const GUIDE_DAY_ITEM_LIMIT=120;
const clockTime=/^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const guideTimeLabelSchema=z.union([z.enum(GUIDE_TIME_LABELS),z.string().regex(clockTime,'Invalid time')]);
export type GuideTimeLabel=z.infer<typeof guideTimeLabelSchema>;

/** What a person typed ('9:30', 'Morning', '9.30pm') to a canonical label, or null. */
export function normalizeTimeLabel(raw:string):GuideTimeLabel|null{
 const value=raw.trim().toLowerCase();
 if((GUIDE_TIME_LABELS as readonly string[]).includes(value))return value as GuideTimeLabel;
 const match=/^([0-9]{1,2})(?:[:.]([0-5][0-9]))?\s*(am|pm)?$/.exec(value);
 if(!match)return null;
 let hour=Number(match[1]);const minute=match[2]??'00',meridiem=match[3];
 if(meridiem){if(hour<1||hour>12)return null;hour=(hour%12)+(meridiem==='pm'?12:0);}
 else if(match[2]===undefined)return null;
 if(hour>23)return null;
 return `${String(hour).padStart(2,'0')}:${minute}`;
}

const itemLocalId=filled(100);
export const guideItemCategorySchema=z.enum(['places','movies','books','games','apps','products','people']);
// A list item stays in its list (GD-08). The ref says which; the snapshot is what the day
// shows if the source is later renamed or removed, and removing the day item never touches it.
export const guideListItemRefSchema=z.object({
 recommendationId:z.string().uuid(),collectionId:z.string().uuid().nullable(),category:guideItemCategorySchema,
}).strict();
export const guideListItemSnapshotSchema=z.object({
 title:filled(500),collectionTitle:text(200).nullable(),
 geometry:z.object({location:z.object({lat:coordinate(90),lng:coordinate(180)}).strict()}).strict().nullable(),
}).strict();
const label=guideTimeLabelSchema.nullable();
export const guideDayItemSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('place'),localId:itemLocalId,timeLabel:label,place:guideDayPlaceSchema}).strict(),
 z.object({kind:z.literal('listItem'),localId:itemLocalId,timeLabel:label,ref:guideListItemRefSchema,snapshot:guideListItemSnapshotSchema}).strict(),
 z.object({kind:z.literal('note'),localId:itemLocalId,timeLabel:label,text:filled(2000)}).strict(),
]).superRefine((v,ctx)=>{
 if(v.kind==='place'&&v.place.localId!==v.localId)ctx.addIssue({code:'custom',message:'A place item and its place share one localId',path:['place','localId']});
});
export type GuideDayItem=z.infer<typeof guideDayItemSchema>;
export const guideBudgetEntriesSchema=z.object({entries:z.array(guideBudgetPlaceSchema).max(GUIDE_DAY_ITEM_LIMIT)}).strict();

export type GuideLegacySlot='morning'|'afternoon'|'evening';
const LEGACY_SLOTS:readonly GuideLegacySlot[]=['morning','afternoon','evening'];
/** Unlabelled and morning read as morning; night as evening; a clock time by its hour. */
export function legacySlotOf(timeLabel:GuideTimeLabel|null):GuideLegacySlot{
 if(timeLabel===null||timeLabel==='morning')return 'morning';
 if(timeLabel==='afternoon')return 'afternoon';
 if(timeLabel==='evening'||timeLabel==='night')return 'evening';
 const hour=Number(timeLabel.slice(0,2));
 return hour<12?'morning':hour<17?'afternoon':'evening';
}
/** The v1 slot view, for the public guide views and the pre-WP9 modals. Notes and list refs have no place and are skipped. */
export function legacyTimelineFromItems(items:readonly GuideDayItem[]):Record<GuideLegacySlot,GuideDayPlace[]>{
 const out:Record<GuideLegacySlot,GuideDayPlace[]>={morning:[],afternoon:[],evening:[]};
 for(const item of items)if(item.kind==='place')out[legacySlotOf(item.timeLabel)].push(item.place);
 return out;
}
export function legacyBudgetFromEntries(entries:readonly GuideBudgetPlace[],items:readonly GuideDayItem[]):Record<GuideLegacySlot,GuideBudgetPlace[]>{
 const slot=new Map(items.map(item=>[item.localId,legacySlotOf(item.timeLabel)]));
 const out:Record<GuideLegacySlot,GuideBudgetPlace[]>={morning:[],afternoon:[],evening:[]};
 for(const entry of entries)out[slot.get(entry.localId)??'morning'].push(entry);
 return out;
}
/**
 * A legacy editor saved a slot timeline. Rebuild items WITHOUT losing what slots cannot say:
 * notes and list refs keep their place, surviving places keep an exact label when they stayed
 * in the same slot, the places fill the old place positions in the timeline's order, and new
 * places are appended labelled with their slot.
 */
export function mergeLegacyTimeline(previous:readonly GuideDayItem[],timeline:Record<GuideLegacySlot,readonly GuideDayPlace[]>):GuideDayItem[]{
 const incoming=LEGACY_SLOTS.flatMap(slot=>timeline[slot].map(place=>({slot,place})));
 const previousPlaces=new Map(previous.filter(i=>i.kind==='place').map(i=>[i.localId,i]));
 const surviving=incoming.filter(e=>previousPlaces.has(e.place.localId));
 const fresh=incoming.filter(e=>!previousPlaces.has(e.place.localId));
 const kept=new Set(surviving.map(e=>e.place.localId));
 const out:GuideDayItem[]=[];let cursor=0;
 for(const item of previous){
  if(item.kind!=='place'){out.push(item);continue;}
  if(!kept.has(item.localId))continue;
  const next=surviving[cursor++];const before=previousPlaces.get(next.place.localId)!;
  const timeLabel=legacySlotOf(before.timeLabel)===next.slot?before.timeLabel:next.slot;
  out.push({kind:'place',localId:next.place.localId,timeLabel,place:next.place});
 }
 for(const e of fresh)out.push({kind:'place',localId:e.place.localId,timeLabel:e.slot,place:e.place});
 return out;
}
export function budgetEntriesFromLegacy(budget:Record<GuideLegacySlot,readonly GuideBudgetPlace[]>):GuideBudgetPlace[]{
 return LEGACY_SLOTS.flatMap(slot=>[...budget[slot]]);
}

export const guideMapDetailsSchema=z.object({
 center:z.object({lat:coordinate(90),lng:coordinate(180)}).strict().nullable(),
 zoom:z.number().int().min(0).max(24).nullable(),
}).strict();

// Packing and pre-trip tasks are checklists the author ticks off, so the done flag is part
// of the content rather than per-viewer state.
export const guideChecklistItemSchema=z.object({localId:filled(100),label:filled(500),done:z.boolean()}).strict();
export const guideChecklistSchema=z.object({items:z.array(guideChecklistItemSchema).max(200)}).strict();

const tags=z.array(filled(100)).max(50);

// Every block of a section, at one version. The version is stored with the row and checked
// on read: a section written by a future schema is refused rather than silently read as a
// partially-understood object, which is the failure the ticket calls out. Each block is
// present and complete - an empty section is empty arrays, never a missing key, so a reader
// never has to distinguish "no places" from "this version had no timeline".
export const guideSectionBlocksSchema=z.object({
 version:guideSectionBlockVersionSchema,
 items:z.array(guideDayItemSchema).max(GUIDE_DAY_ITEM_LIMIT),
 transport:guideTransportSchema,
 stay:guideStaySchema,
 activities:guideActivitiesSchema,
 budget:guideBudgetEntriesSchema,
 mapDetails:guideMapDetailsSchema.nullable(),
 packingList:guideChecklistSchema,
 preTasks:guideChecklistSchema,
 tags,
}).strict()
 // Transport must route between entries this section actually contains, or a reordered day
 // silently keeps a segment to a place that is no longer in it.
 .superRefine((v,ctx)=>{
  const itemIds=v.items.map(i=>i.localId);
  if(new Set(itemIds).size!==itemIds.length)ctx.addIssue({code:'custom',message:'Duplicate day item',path:['items']});
  const present=new Set([...itemIds,...v.activities.activities.map(p=>p.localId),...v.stay.accommodations.map(p=>p.localId)]);
  v.transport.segments.forEach((s,index)=>{
   if(!present.has(s.fromLocalId)||!present.has(s.toLocalId))
    ctx.addIssue({code:'custom',message:'Transport segment refers to an entry this section does not contain',path:['transport','segments',index]});
  });
  for(const entry of v.budget.entries)if(!present.has(entry.localId))
   ctx.addIssue({code:'custom',message:'Budget entry refers to an entry this section does not contain',path:['budget']});
  if(new TextEncoder().encode(JSON.stringify(v)).length>262144)ctx.addIssue({code:'custom',message:'Section too large',path:['items']});
 });

export const guideEmptySectionBlocks:GuideSectionBlocks=Object.freeze({
 version:GUIDE_SECTION_BLOCK_VERSION,items:[],transport:{segments:[]},stay:{accommodations:[]},
 activities:{activities:[]},budget:{entries:[]},mapDetails:null,packingList:{items:[]},preTasks:{items:[]},tags:[],
}) as GuideSectionBlocks;

// The guide's own place. Kept as a snapshot plus an optional canonical identity, for the
// same reason Places lists keep theirs: the snapshot is what the header renders, the link
// is who the place is, and conflating them lets a renamed city rewrite published guides.
export const guideSinglePlaceSnapshotSchema=z.object({
 name:text(500).nullable(),address:text(1000).nullable(),placeId:providerPlaceId.nullable(),
 rating:z.number().min(0).max(5).nullable(),ratingsCount:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
 lat:coordinate(90).nullable(),lng:coordinate(180).nullable(),
}).strict().refine(v=>(v.lat===null)===(v.lng===null),{message:'Coordinates must both be present or both absent',path:['lat']});

// A multi-city guide's place is a ROUTE, not a point.
//
// Found while migrating EditJourneyRouteModal, which writes Place_Details as
// {starting, ending, intermediateCities, isMultiCity} - so modelling the guide's place as
// a single snapshot would have silently dropped every multi-city itinerary's route on the
// first save. The two forms share the column; `multiCity` on the details says which to
// expect, and a reader that wants one checks for it rather than guessing from shape.
//
// Note the geometry here is FLAT {lat,lng}: that is what formatPlaceDetails writes and
// what the journey display reads. A day place inside a section nests it, because that is
// the Google Places response shape. Three shapes in one feature, each matching its own
// consumers, and none of them safe to "harmonise".
const journeyStopSchema=z.object({
 Place_Id:z.string().trim().max(512),Place_Name:text(500),Place_Address:text(1000),
 Geometry:z.object({lat:coordinate(90),lng:coordinate(180)}).strict().nullable(),
}).strict();
export const guideJourneySnapshotSchema=z.object({
 starting:journeyStopSchema,ending:journeyStopSchema,
 intermediateCities:z.array(journeyStopSchema.extend({
  id:filled(100),hasDate:z.boolean(),date:z.string().max(40).optional(),
 }).strict()).max(50),
 isMultiCity:z.literal(true),
}).strict();

// An empty object is a guide whose place has never been set, which is how a guide starts.
export const guidePlaceSnapshotSchema=z.union([
 z.object({}).strict(),guideSinglePlaceSnapshotSchema,guideJourneySnapshotSchema,
]);

export const guideTypeSchema=z.enum(['itinerary','city','experience','collection']);
export const guideBudgetTypeSchema=z.enum(['per-person','total']);
// The trip's spending level, which needs no amount. Not budget_type: that qualifies an
// estimated amount and is meaningless without one.
export const guideBudgetTierSchema=z.enum(['backpacker','budget','mid-range','luxury','ultra-luxury']);

// The labels the guide wizard and every guide surface show. Theme is the wizard's name for
// a guide built around a subject rather than a day plan, which is the canonical collection
// type; the tiers keep the legacy enum spelling the existing filters and labels key on.
export const GUIDE_TYPE_LABELS={itinerary:'Itinerary',city:'City',experience:'Experience',collection:'Theme'} as const;
export const GUIDE_BUDGET_TIER_LABELS={backpacker:'Backpacker',budget:'Budget','mid-range':'Mid_Range',luxury:'Luxury','ultra-luxury':'Ultra_Luxury'} as const;
export type GuideBudgetTier=z.infer<typeof guideBudgetTierSchema>;
/** A wizard or legacy label (or a canonical value) to the canonical guide type, or null. */
export function guideTypeFromLabel(label:string|null|undefined):z.infer<typeof guideTypeSchema>|null{
 if(!label)return null;
 for(const [value,text] of Object.entries(GUIDE_TYPE_LABELS))if(text===label||value===label)return value as z.infer<typeof guideTypeSchema>;
 return null;
}
/** A wizard tier label (or a canonical value) to the canonical tier, or null. */
export function guideBudgetTierFromLabel(label:string|null|undefined):GuideBudgetTier|null{
 if(!label)return null;
 for(const [value,text] of Object.entries(GUIDE_BUDGET_TIER_LABELS))if(text===label||value===label)return value as GuideBudgetTier;
 return null;
}

// The parent guide's own fields. Title, description, slug, visibility, display order and
// pin order live on the collection itself and are not repeated here.
export const guideCollectionDetailsSchema=z.object({
 guideType:guideTypeSchema.nullable(),
 multiCity:z.boolean(),
 numberOfDays:z.number().int().min(1).max(365).nullable(),
 estimatedBudget:estimatedBudgetAmount.nullable(),
 budgetCurrency:currency.nullable(),
 budgetType:guideBudgetTypeSchema.nullable(),
 // Optional in the wizard. Defaults to null so a writer that predates the tier still parses.
 budgetTier:guideBudgetTierSchema.nullable().default(null),
 // GD-05. Day N's date is startDate + N-1, so adding a day extends the dates (GD-24) and
 // moving a day keeps dates on positions (GD-28) with no per-day date to keep in sync.
 startDate:z.string().regex(/^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/,'Invalid date').nullable().default(null),
 bestTimeToVisit:z.array(filled(100)).max(24),
 categories:z.array(filled(100)).max(24),
 tags,
 // Free-form authored tips. Rich text, so it is the one field a malicious author could use
 // to smuggle markup into the public renderer; the public projection sanitises it there
 // rather than trusting storage.
 tipsNotes:z.union([z.record(z.unknown()),z.array(z.unknown())]).nullable(),
 place:guidePlaceSnapshotSchema,
 locationEntityId:z.string().uuid().nullable(),
}).strict().superRefine((v,ctx)=>{
 if((v.estimatedBudget===null)!==(v.budgetCurrency===null))ctx.addIssue({code:'custom',message:'A budget needs its currency',path:['budgetCurrency']});
 const estimateProblem=moneyProblem(v.estimatedBudget,v.budgetCurrency);
 if(estimateProblem)ctx.addIssue({code:'custom',message:estimateProblem,path:['estimatedBudget']});
 if(v.estimatedBudget===null&&v.budgetType!==null)ctx.addIssue({code:'custom',message:'A budget type needs a budget',path:['budgetType']});
 if(new TextEncoder().encode(JSON.stringify(v)).length>65536)ctx.addIssue({code:'custom',message:'Guide details too large',path:['tipsNotes']});
});

// ---- reads -----------------------------------------------------------------------------

const revision=z.number().int().positive().safe();
export const guideSectionDtoSchema=z.object({
 id:z.string().uuid(),collectionId:z.string().uuid(),
 title:text(200),description:text(20000).nullable(),
 displayOrder:z.number().int().nonnegative(),
 blocks:guideSectionBlocksSchema,
 archived:z.boolean(),
 createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
}).strict();

// How many sections a guide may hold. guide_sections.display_order is bounded to the same
// number in 0050, so the two cannot disagree.
export const GUIDE_SECTION_LIMIT=200;
// How many travel in one response. A section may be 256KB and the owner page budget is
// 4MB, so all 200 cannot travel together - twenty is the largest page that leaves room for
// the parent. The service still measures the real bytes and answers 413 rather than
// trusting this number, because twenty maximal sections would still exceed the budget.
export const GUIDE_SECTION_PAGE_LIMIT=20;

// The aggregate the owner editor reads: the parent's guide fields, its cover, and a page of
// sections in order, all at ONE revision. The revision belongs to the guide rather than to
// each section, because every micro editor saves against the current state of the whole
// guide, and a per-section revision would let two modals disagree about what "current"
// means. sectionCount is the whole guide's count rather than the page's, so the editor can
// say "8 sections" without walking every page.
export const guideAggregateDtoSchema=z.object({
 collectionId:z.string().uuid(),revision,
 details:guideCollectionDetailsSchema,
 coverMediaId:z.string().uuid().nullable(),
 sections:z.array(guideSectionDtoSchema).max(GUIDE_SECTION_PAGE_LIMIT),
 sectionCount:z.number().int().nonnegative().max(GUIDE_SECTION_LIMIT),
 nextCursor:z.string().min(1).max(4096).nullable(),
}).strict().superRefine((v,ctx)=>{
 if(v.sections.some(s=>s.collectionId!==v.collectionId))ctx.addIssue({code:'custom',message:'Section belongs to another guide',path:['sections']});
 const orders=v.sections.map(s=>s.displayOrder);
 if(new Set(orders).size!==orders.length)ctx.addIssue({code:'custom',message:'Duplicate section order',path:['sections']});
 if(orders.some((o,i)=>i>0&&o<=orders[i-1]))ctx.addIssue({code:'custom',message:'Sections must be strictly ordered',path:['sections']});
 if(v.sections.length>v.sectionCount)ctx.addIssue({code:'custom',message:'Page holds more sections than the guide has',path:['sectionCount']});
 // A page that already carries every section has nothing left to continue to, and a
 // lingering cursor there is how a reader ends up looping forever.
 if(v.nextCursor!==null&&v.sections.length===v.sectionCount)ctx.addIssue({code:'custom',message:'A complete page cannot continue',path:['nextCursor']});
});

// ---- writes ----------------------------------------------------------------------------

// Every write states the revision it was composed against. A stale revision is refused
// with 409 and changes nothing, which is what lets eight separate micro editors edit one
// guide without overwriting each other.
const at=z.object({revision}).strict();
/** A command that carries only the revision it was composed against. */
export const guideRevisionSchema=at;

// What a new write may name as a currency. Reads stay lenient (see `currency`), so an old
// guide with a code outside the table still opens; saving it asks the author to pick a
// real one, with a message that says so.
const unsupportedCurrency=(codes:ReadonlyArray<string|null>,ctx:z.RefinementCtx,path:(string|number)[])=>{
 const bad=codes.find(code=>code!==null&&!isKnownCurrency(code));
 if(bad)ctx.addIssue({code:'custom',message:`${bad} is not a supported currency`,path});
};

export const writeGuideDetailsSchema=at.extend({details:guideCollectionDetailsSchema}).strict()
 .superRefine((v,ctx)=>unsupportedCurrency([v.details.budgetCurrency],ctx,['details','budgetCurrency']));

// A section write carries complete validated block state. There is no partial block patch:
// assembling the whole block from the form is what stops a missing field in one modal from
// becoming a null that erases what another modal wrote.
const writeGuideSectionBase=at.extend({
 title:text(200),description:text(20000).nullable(),blocks:guideSectionBlocksSchema,
}).strict();
// Every budgetCurrency in the section's blocks, wherever the block puts it: timeline entries
// and the budget projection both carry one, and a new write must be able to name either.
const budgetCurrencies=(node:unknown,found:string[]=[]):string[]=>{
 if(Array.isArray(node))node.forEach(item=>budgetCurrencies(item,found));
 else if(node&&typeof node==='object')for(const [key,value] of Object.entries(node)){
  if(key==='budgetCurrency'&&typeof value==='string')found.push(value);else budgetCurrencies(value,found);
 }
 return found;
};
const checkSectionCurrencies=(v:{blocks:unknown},ctx:z.RefinementCtx)=>unsupportedCurrency(budgetCurrencies(v.blocks),ctx,['blocks']);
export const writeGuideSectionSchema=writeGuideSectionBase.superRefine(checkSectionCurrencies);

export const createGuideSectionSchema=writeGuideSectionBase.extend({
 // Where to insert. Omitted appends, which is what the wizard does.
 position:z.number().int().nonnegative().max(GUIDE_SECTION_LIMIT-1).optional(),
}).strict().superRefine(checkSectionCurrencies);

// A reorder names the complete new order, not a move. The server rejects any list that is
// not exactly the guide's current section set, so a reorder composed against a guide
// someone else has added a section to fails loudly instead of dropping that section.
export const reorderGuideSectionsSchema=at.extend({sectionIds:z.array(z.string().uuid()).min(1).max(GUIDE_SECTION_LIMIT)}).strict()
 .refine(v=>new Set(v.sectionIds).size===v.sectionIds.length,{message:'Duplicate section',path:['sectionIds']});

export const attachGuideCoverSchema=at.extend({mediaId:z.string().uuid()}).strict();

export type GuideSectionBlocks=z.infer<typeof guideSectionBlocksSchema>;
export type GuideDayPlace=z.infer<typeof guideDayPlaceSchema>;
export type GuideActivityPhoto=z.infer<typeof guideActivityPhotoSchema>;
export type GuideTransportSegment=z.infer<typeof guideTransportSegmentSchema>;
export type GuideBudgetPlace=z.infer<typeof guideBudgetPlaceSchema>;
export type GuideCollectionDetails=z.infer<typeof guideCollectionDetailsSchema>;
export type GuidePlaceSnapshot=z.infer<typeof guidePlaceSnapshotSchema>;
export type GuideSectionDto=z.infer<typeof guideSectionDtoSchema>;
export type GuideAggregateDto=z.infer<typeof guideAggregateDtoSchema>;
export type WriteGuideDetails=z.input<typeof writeGuideDetailsSchema>;
export type WriteGuideSection=z.input<typeof writeGuideSectionSchema>;
export type CreateGuideSection=z.input<typeof createGuideSectionSchema>;
export type ReorderGuideSections=z.input<typeof reorderGuideSectionsSchema>;
export type TravelMode=z.infer<typeof travelModeSchema>;
