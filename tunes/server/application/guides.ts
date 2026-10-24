import {randomUUID} from 'node:crypto';
import type {Pool, PoolClient} from 'pg';
import {z} from 'zod/v3';
import {contentIdSchema, type RequestContext} from '../../shared/explorersContract';
import {
 GUIDE_SECTION_PAGE_LIMIT, attachGuideCoverSchema, createGuideSectionSchema, guideAggregateDtoSchema,
 guideEmptySectionBlocks, guideRevisionSchema, reorderGuideSectionsSchema, writeGuideDetailsSchema, writeGuideSectionSchema,
 addGuideDayItemSchema, addGuideDaySchema, guideItemLocalIdSchema, moveGuideDayItemSchema, moveGuideDaySchema,
 setGuideNoteTextSchema, setGuideTimeLabelSchema, type GuideDayItem, type GuideTimeLabel,
} from '../../shared/explorersGuideContract';
import {
 attachGuideCover, countGuideSections, createGuideSection, deleteGuideSection, readGuideCoverMediaId,
 readGuideDetails, readGuideSectionPage, reorderGuideSections, updateGuideSection, writeGuideDetails,
 addGuideDay, addGuideDayItem, clearGuideDay, deleteGuideDay, duplicateGuideDay, moveGuideDay, moveGuideDayItem,
 removeGuideDayItem, setGuideDayItemTimeLabel, setGuideDayNoteText,
} from '../repositories/guideRepository';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import {OWNER_PAGE_BYTES} from './ownerContent';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {parseContent} from './recommendations';

/**
 * Ticket 5.3. The guide aggregate's application boundary.
 *
 * Every write runs in one transaction, because the repository's revision check and its
 * photo-registry sync are only meaningful together: 0050's equality trigger fires at
 * COMMIT, so a write that is split across two transactions is refused by the database
 * rather than being half-applied. This class owns that COMMIT, which is also why the
 * deferred-constraint errors are translated here and not in the repository - by the time
 * they are raised, the repository call has already returned.
 *
 * Reads answer a page of sections rather than all of them, and measure the real bytes
 * before answering. The page limit is a ceiling on count; the byte budget is the actual
 * constraint, since twenty maximal sections would still exceed it.
 */
export class GuideService {
 constructor(private readonly db:Pool) {}

 private async authorized<T>(actor:Actor,operation:string,work:()=>Promise<T>):Promise<T> {
  await authorizeOperation(this.db,actor,operation,actor?.accountId);
  try {return await work();}
  catch(error) {
   if(error instanceof RecommendationFailure)throw error;
   const code=(error as {code?:string}).code,message=(error as {message?:string}).message??'';
   // The registry/JSON equality trigger is deferred, so a desync surfaces from the COMMIT
   // this method owns. It means this process failed to sync the registry, which is a bug
   // here rather than anything the caller can fix, so it is not translated into a 4xx.
   if(code==='23514'&&/photo registry must match/.test(message))throw error;
   if(code==='23505')throw new RecommendationFailure(409,'Content conflicts with an existing resource');
   if(code==='23503'||code==='23514'||code==='22003')throw new RecommendationFailure(422,'Invalid content relation or value');
   throw error;
  }
 }

 /** One transaction per write, rolled back whole on any failure. */
 private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await this.db.connect();
  try {
   await client.query('BEGIN');
   const result=await work(client);
   await client.query('COMMIT');
   return result;
  } catch(error) {
   await client.query('ROLLBACK').catch(()=>undefined);
   throw error;
  } finally {
   client.release();
  }
 }

 /** The guides category content revision, which is what every guide write states. */
 private async revision(accountId:string):Promise<number> {
  return Number((await this.db.query(
   "SELECT coalesce((SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='guides'),0) AS revision",
   [accountId])).rows[0].revision);
 }

 private async requireGuide(accountId:string,collectionId:string):Promise<void> {
  const row=(await this.db.query("SELECT 1 FROM collections c WHERE c.id=$1 AND c.account_id=$2 AND c.category='guides'",
   [collectionId,accountId])).rows[0];
  if(!row)throw new RecommendationFailure(404,'Resource unavailable');
 }

 /**
  * The guide's own fields, its cover and one page of sections, all at one revision.
  *
  * The revision is read last, after the sections, so a guide edited mid-read reports the
  * NEWER revision rather than an older one. A reader that then writes against it is
  * refused with a 409 and re-reads, which is the safe direction to be wrong in; reporting
  * the older revision would let that write through against content it had not seen.
  */
 async getAggregate(actor:Actor,collectionId:string,query:unknown={}) {
  return this.authorized(actor,'collections:read',async()=>{
   parseContent(contentIdSchema,collectionId);
   await this.requireGuide(actor.accountId,collectionId);
   const raw=(query??{}) as Record<string,unknown>;
   const cursor=raw.after===undefined?undefined:Number(raw.after);
   if(cursor!==undefined&&(!Number.isInteger(cursor)||cursor<0))throw new RecommendationFailure(422,'Invalid section cursor');
   const limit=raw.limit===undefined?GUIDE_SECTION_PAGE_LIMIT:Number(raw.limit);
   if(!Number.isInteger(limit)||limit<1||limit>GUIDE_SECTION_PAGE_LIMIT)throw new RecommendationFailure(422,'Invalid section page size');
   const details=await readGuideDetails(this.db,collectionId,actor.accountId);
   const page=await readGuideSectionPage(this.db,collectionId,actor.accountId,{afterOrder:cursor,limit});
   const sectionCount=await countGuideSections(this.db,collectionId,actor.accountId);
   const coverMediaId=await readGuideCoverMediaId(this.db,collectionId,actor.accountId);
   const aggregate=guideAggregateDtoSchema.parse({
    collectionId,revision:await this.revision(actor.accountId),
    // A guide with no details row yet reads as an empty guide rather than a 404, because
    // the collection exists the moment it is created and the wizard fills it afterwards.
    details:details??{
     guideType:null,multiCity:false,numberOfDays:null,estimatedBudget:null,budgetCurrency:null,budgetType:null,budgetTier:null,startDate:null,
     bestTimeToVisit:[],categories:[],tags:[],tipsNotes:null,
     place:{name:null,address:null,placeId:null,rating:null,ratingsCount:null,lat:null,lng:null},
     locationEntityId:null,
    },
    coverMediaId,sections:page.sections,sectionCount,
    nextCursor:page.nextCursor===null?null:String(page.nextCursor),
   });
   if(Buffer.byteLength(JSON.stringify({guide:aggregate}),'utf8')>OWNER_PAGE_BYTES)
    throw new RecommendationFailure(413,'Guide exceeds the response byte budget');
   return aggregate;
  });
 }

 async setDetails(actor:Actor,collectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);
   const command=parseContent(writeGuideDetailsSchema,input);
   await this.transaction((client)=>writeGuideDetails(client,collectionId,actor.accountId,command.revision,command.details));
   return this.getAggregate(actor,collectionId);
  });
 }

 async addSection(actor:Actor,collectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);
   const command=parseContent(createGuideSectionSchema,input);
   await this.transaction((client)=>createGuideSection(client,collectionId,actor.accountId,command.revision,
    {title:command.title,description:command.description,blocks:command.blocks,position:command.position}));
   // The new section is the one the caller did not already have. Returning the aggregate
   // alone keeps every guide command's envelope identical, and the caller identifies the
   // addition by difference rather than trusting a second field to agree with it.
   return this.getAggregate(actor,collectionId);
  });
 }

 /**
  * Replaces one section's complete state.
  *
  * Complete, not partial: each micro editor assembles the whole validated block from its
  * own form, so a field that editor does not show cannot arrive as a null that erases what
  * another editor wrote. An empty block is guideEmptySectionBlocks, never an absent key.
  */
 async setSection(actor:Actor,collectionId:string,sectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);parseContent(contentIdSchema,sectionId);
   const command=parseContent(writeGuideSectionSchema,input);
   await this.transaction((client)=>updateGuideSection(client,collectionId,actor.accountId,command.revision,sectionId,
    {title:command.title,description:command.description,blocks:command.blocks}));
   return this.getAggregate(actor,collectionId);
  });
 }

 async removeSection(actor:Actor,collectionId:string,sectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);parseContent(contentIdSchema,sectionId);
   const {revision}=parseContent(guideRevisionSchema,input);
   await this.transaction((client)=>deleteGuideSection(client,collectionId,actor.accountId,revision,sectionId));
   return this.getAggregate(actor,collectionId);
  });
 }

 async reorderSections(actor:Actor,collectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);
   const command=parseContent(reorderGuideSectionsSchema,input);
   await this.transaction((client)=>reorderGuideSections(client,collectionId,actor.accountId,command.revision,command.sectionIds));
   return this.getAggregate(actor,collectionId);
  });
 }

 /**
  * Attaches a cover.
  *
  * The previous asset is NOT retired here. It is reported back so that retiring the bytes
  * is a separate later decision, once this cover is committed - which is the difference
  * from the Strapi path, where the delete was its own call issued before the upload and
  * committed independently, so a failed upload left the guide with no image.
  */
 async setCover(actor:Actor,collectionId:string,input:unknown,_context:RequestContext) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);
   const command=parseContent(attachGuideCoverSchema,input);
   // The previous asset id is deliberately not returned to the browser: retiring those
   // bytes is a server-side decision taken later, and handing a client an id it has no
   // authority to delete only invites it to try.
   await this.transaction((client)=>attachGuideCover(client,collectionId,actor.accountId,command.revision,command.mediaId));
   return this.getAggregate(actor,collectionId);
  });
 }

 private command<S extends z.ZodTypeAny>(actor:Actor,collectionId:string,ids:string[],schema:S,input:unknown,
  work:(client:PoolClient,command:z.infer<S>)=>Promise<unknown>) {
  return this.authorized(actor,'collections:write',async()=>{
   parseContent(contentIdSchema,collectionId);for(const id of ids)parseContent(contentIdSchema,id);
   const command=parseContent(schema,input);
   await this.transaction((client)=>work(client,command));
   return this.getAggregate(actor,collectionId);
  });
 }
 private localId(value:string){return parseContent(guideItemLocalIdSchema,value);}

 /** A list item is resolved from the owner's own data; the client sends only the reference. */
 private async listItem(client:PoolClient,accountId:string,input:{recommendationId:string;collectionId:string|null},timeLabel:GuideTimeLabel|null):Promise<GuideDayItem>{
  const row=(await client.query(`SELECT r.id,r.category,e.title,
    to_jsonb(pe) - 'entity_id' AS place,
    c.id AS collection_id,c.title AS collection_title
   FROM recommendations r JOIN entities e ON e.id=r.entity_id
   LEFT JOIN place_entity_details pe ON pe.entity_id=e.id
   LEFT JOIN LATERAL (SELECT c.id,c.title FROM collection_items i JOIN collections c ON c.id=i.collection_id
     WHERE i.recommendation_id=r.id AND i.account_id=r.account_id AND ($3::uuid IS NULL OR c.id=$3) AND c.archived_at IS NULL
     ORDER BY c.display_order LIMIT 1) c ON true
   WHERE r.id=$1 AND r.account_id=$2 AND r.archived_at IS NULL`,[input.recommendationId,accountId,input.collectionId])).rows[0];
  if(!row||(input.collectionId!==null&&!row.collection_id))throw new RecommendationFailure(404,'Resource unavailable');
  const lat=row.place?.latitude,lng=row.place?.longitude;
  return {kind:'listItem',localId:randomUUID(),timeLabel,
   ref:{recommendationId:row.id,collectionId:row.collection_id??null,category:row.category},
   snapshot:{title:String(row.title).slice(0,500),collectionTitle:row.collection_title??null,
    geometry:lat!=null&&lng!=null?{location:{lat:Number(lat),lng:Number(lng)}}:null}};
 }

 addDay(actor:Actor,id:string,input:unknown,_c:RequestContext){return this.command(actor,id,[],addGuideDaySchema,input,(c,cmd)=>addGuideDay(c,id,actor.accountId,cmd.revision,{at:cmd.at,title:cmd.title}));}
 moveDay(actor:Actor,id:string,sectionId:string,input:unknown,_c:RequestContext){return this.command(actor,id,[sectionId],moveGuideDaySchema,input,(c,cmd)=>moveGuideDay(c,id,actor.accountId,cmd.revision,sectionId,cmd.toIndex));}
 duplicateDay(actor:Actor,id:string,sectionId:string,input:unknown,_c:RequestContext){return this.command(actor,id,[sectionId],guideRevisionSchema,input,(c,cmd)=>duplicateGuideDay(c,id,actor.accountId,cmd.revision,sectionId));}
 clearDay(actor:Actor,id:string,sectionId:string,input:unknown,_c:RequestContext){return this.command(actor,id,[sectionId],guideRevisionSchema,input,(c,cmd)=>clearGuideDay(c,id,actor.accountId,cmd.revision,sectionId));}
 deleteDay(actor:Actor,id:string,sectionId:string,input:unknown,_c:RequestContext){return this.command(actor,id,[sectionId],guideRevisionSchema,input,(c,cmd)=>deleteGuideDay(c,id,actor.accountId,cmd.revision,sectionId));}
 addDayItem(actor:Actor,id:string,sectionId:string,input:unknown,_c:RequestContext){
  return this.command(actor,id,[sectionId],addGuideDayItemSchema,input,async(c,cmd)=>{
   const source=cmd.item;
   const localId=randomUUID();
   const item:GuideDayItem=source.kind==='place'?{kind:'place',localId,timeLabel:source.timeLabel,place:{...source.place,localId}}
    :source.kind==='note'?{kind:'note',localId,timeLabel:source.timeLabel,text:source.text}
    :await this.listItem(c,actor.accountId,source.ref,source.timeLabel);
   await addGuideDayItem(c,id,actor.accountId,cmd.revision,sectionId,item,cmd.at);
  });
 }
 moveDayItem(actor:Actor,id:string,sectionId:string,localId:string,input:unknown,_c:RequestContext){
  return this.command(actor,id,[sectionId],moveGuideDayItemSchema,input,(c,cmd)=>moveGuideDayItem(c,id,actor.accountId,cmd.revision,
   {fromSectionId:sectionId,localId:this.localId(localId),toSectionId:cmd.toSectionId,toIndex:cmd.toIndex}));
 }
 setTimeLabel(actor:Actor,id:string,sectionId:string,localId:string,input:unknown,_c:RequestContext){
  return this.command(actor,id,[sectionId],setGuideTimeLabelSchema,input,(c,cmd)=>setGuideDayItemTimeLabel(c,id,actor.accountId,cmd.revision,sectionId,this.localId(localId),cmd.timeLabel));
 }
 setNoteText(actor:Actor,id:string,sectionId:string,localId:string,input:unknown,_c:RequestContext){
  return this.command(actor,id,[sectionId],setGuideNoteTextSchema,input,(c,cmd)=>setGuideDayNoteText(c,id,actor.accountId,cmd.revision,sectionId,this.localId(localId),cmd.text));
 }
 removeDayItem(actor:Actor,id:string,sectionId:string,localId:string,input:unknown,_c:RequestContext){
  return this.command(actor,id,[sectionId],guideRevisionSchema,input,(c,cmd)=>removeGuideDayItem(c,id,actor.accountId,cmd.revision,sectionId,this.localId(localId)));
 }
}

export {guideEmptySectionBlocks};
