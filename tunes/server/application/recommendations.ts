import type { Pool } from 'pg';
import { z } from 'zod/v3';
import { collectionCoreDtoSchema, createCollectionResultSchema, recommendationCoreDtoSchema, createCollectionSchema, updateCollectionSchema,
  createRecommendationSchema, updateRecommendationSchema, reorderCollectionSchema, contentRevisionSchema,
  contentIdSchema, commandKeySchema, topPickCategorySchema, categoryTopPicksInputSchema, categoryTopPicksResultSchema, contentCategorySchema, reorderCategoryListsSchema, categoryListsOrderResultSchema, type RequestContext } from '../../shared/explorersContract';
import type { Actor } from './actor';
import { authorizeOperation } from './authorization';
import { ExplorersRecommendationRepository, RecommendationFailure } from '../repositories/explorersRecommendationRepository';
import { normalizeRichNote } from './richNote';
import {replaceRecommendationEntitySchema} from '../../shared/explorersBookContract';
import {attachListLinkSchema,detachListLinkSchema,setListLinkRoleSchema,listLinkCommandResultSchema} from '../../shared/explorersListLinkContract';
import {makeSampleMineSchema} from '../../shared/explorersSampleContract';
import {gameMembershipCommandSchema,gameMembershipResultSchema} from '../../shared/explorersGameOwnerContract';

export function parseContent<T>(schema:z.ZodType<T,any,any>,input:unknown):T {
  const parsed=schema.safeParse(input);
  if(!parsed.success) {
    // A price the owner can fix says what is wrong with it; every other field keeps the
    // generic message so nothing else about the schema leaks.
    const money=parsed.error.issues.find(issue=>issue.path.includes('productOffer')&&issue.code==='custom');
    throw new RecommendationFailure(422,money?money.message:'Invalid content fields');
  }
  return parsed.data;
}
// LP-08. Lives beside the service, not in shared/: the SPA sends a plain object. The slug
// rule is the collection DTO's own, so a restore accepts exactly what a rename does.
const restoreCollectionSchema=contentRevisionSchema.extend({slug:collectionCoreDtoSchema.shape.slug.optional()}).strict();
/** Shared application boundary for HTTP and future trusted adapters. */
export class RecommendationService {
  private readonly repository:ExplorersRecommendationRepository;
  constructor(private readonly db:Pool) {this.repository=new ExplorersRecommendationRepository(db);}
  private async authorized<T>(actor:Actor,operation:string,work:()=>Promise<T>):Promise<T> {
    await authorizeOperation(this.db,actor,operation,actor?.accountId);
    try {return await work();}
    catch(error) {
      // Deferred FK/kind/media checks execute at COMMIT; transaction helper rolls all
      // data/revision/receipt writes back before this typed client error is returned.
      const code=(error as {code?:string}).code;
      if(code==='23505') throw new RecommendationFailure(409,'Content conflicts with an existing resource');
      if(code==='23503'||code==='23514'||code==='22003') throw new RecommendationFailure(422,'Invalid content relation or value');
      throw error;
    }
  }
  private key(context:RequestContext) {return parseContent(commandKeySchema,context?.idempotencyKey);}
  async gameMembership(actor:Actor,collectionId:string,recommendationId:string,input:unknown,context:RequestContext,attached:boolean){
    return this.authorized(actor,'collections:write',async()=>{
      await authorizeOperation(this.db,actor,'recommendations:write',actor.accountId);
      parseContent(contentIdSchema,collectionId);parseContent(contentIdSchema,recommendationId);
      const command=parseContent(gameMembershipCommandSchema,input);
      return gameMembershipResultSchema.parse(await this.repository.writeGameMembership(actor.accountId,collectionId,recommendationId,command,this.key(context),attached));
    });
  }
  /**
   * WP10 (LNK-01..08). Attach is addressed by the host list; detach and role by the link id.
   * contentIdSchema does not lowercase and S3's repository compares ids exactly, so both ids
   * are lowercased here before they reach storage.
   */
  async attachListLink(actor:Actor,hostCollectionId:string,input:unknown,context:RequestContext){
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,hostCollectionId);
      const body=(input??{}) as {linkedCollectionId?:unknown};
      const command=parseContent(attachListLinkSchema,{...(input as object),hostCollectionId:hostCollectionId.toLowerCase(),
        ...(typeof body.linkedCollectionId==='string'?{linkedCollectionId:body.linkedCollectionId.toLowerCase()}:{})});
      return listLinkCommandResultSchema.parse(await this.repository.writeListLink(actor.accountId,command,this.key(context)));
    });
  }
  /** The :id is the list whose page sent the command (host or linked side); the link id alone selects the row. */
  async detachListLink(actor:Actor,collectionId:string,linkId:string,input:unknown,context:RequestContext){
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,collectionId);
      const command=parseContent(detachListLinkSchema,{...(input as object),linkId:linkId.toLowerCase()});
      return listLinkCommandResultSchema.parse(await this.repository.removeListLink(actor.accountId,command,this.key(context),collectionId.toLowerCase()));
    });
  }
  async setListLinkRole(actor:Actor,collectionId:string,linkId:string,input:unknown,context:RequestContext){
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,collectionId);
      const command=parseContent(setListLinkRoleSchema,{...(input as object),linkId:linkId.toLowerCase()});
      return listLinkCommandResultSchema.parse(await this.repository.setListLinkRole(actor.accountId,command,this.key(context),collectionId.toLowerCase()));
    });
  }
  async setCategoryTopPicks(actor:Actor,category:string,input:unknown,context:RequestContext) {
    return this.topPicks(actor,category,input,context,true);
  }
  async upsertCategoryTopPickOrder(actor:Actor,category:string,input:unknown,context:RequestContext) {
    return this.topPicks(actor,category,input,context,false);
  }
  private async topPicks(actor:Actor,category:string,input:unknown,context:RequestContext,replace:boolean) {
    return this.authorized(actor,'recommendations:write',async()=>categoryTopPicksResultSchema.parse(await this.repository.writeCategoryTopPicks(
      actor.accountId,parseContent(topPickCategorySchema,category),parseContent(categoryTopPicksInputSchema,input),this.key(context),replace)));
  }
  async createCollection(actor:Actor,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      const parsed=parseContent(createCollectionSchema,input);
      // WP10. Lowercased before the receipt and storage, as attachListLink does, so a
      // mixed-case replay of the same create is the same request.
      const command=parsed.attachTo?{...parsed,attachTo:{...parsed.attachTo,hostCollectionId:parsed.attachTo.hostCollectionId.toLowerCase()}}:parsed;
      const result=createCollectionResultSchema.parse(await this.repository.createCollection(actor.accountId,command,this.key(context)));
      if(result.accountId!==actor.accountId||result.category!==command.category||result.revision!==1||
        (command.attachTo===undefined?result.attachedTo!==undefined:
          result.attachedTo?.hostCollectionId.toLowerCase()!==command.attachTo.hostCollectionId.toLowerCase()))throw new RecommendationFailure(422,'Invalid create result');
      return result;
    });
  }
  async updateCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const {expectedRevision,...editable}=parseContent(updateCollectionSchema,input);
      return collectionCoreDtoSchema.parse(await this.repository.updateCollection(actor.accountId,id,expectedRevision,editable,this.key(context)));
    });
  }
  async createRecommendation(actor:Actor,input:unknown,context:RequestContext) {
    return this.authorized(actor,'recommendations:write',async()=>recommendationCoreDtoSchema.parse(await this.repository.createRecommendation(actor.accountId,parseContent(createRecommendationSchema,this.noteInput(input)),this.key(context))));
  }
  private noteInput(input:unknown):unknown {
    if(input&&typeof input==='object'&&!Array.isArray(input)&&Object.hasOwn(input,'note'))return {...input,note:normalizeRichNote((input as {note:unknown}).note)};
    return input;
  }
  async updateRecommendation(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'recommendations:write',async()=>{
      parseContent(contentIdSchema,id);const {expectedRevision,...editable}=parseContent(updateRecommendationSchema,this.noteInput(input));
      return recommendationCoreDtoSchema.parse(await this.repository.updateRecommendation(actor.accountId,id,expectedRevision,editable,this.key(context)));
    });
  }
  async replaceRecommendationEntity(actor:Actor,id:string,input:unknown,context:RequestContext){
    return this.authorized(actor,'recommendations:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(replaceRecommendationEntitySchema,input);
      return recommendationCoreDtoSchema.parse(await this.repository.replaceRecommendationEntity(actor.accountId,id,parsed.expectedRevision,parsed.entityId,this.key(context)));
    });
  }
  async reorderCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(reorderCollectionSchema,input);
      return collectionCoreDtoSchema.parse(await this.repository.reorderCollection(actor.accountId,id,parsed.expectedRevision,parsed.orderedRecommendationIds,this.key(context)));
    });
  }
  async reorderCategoryLists(actor:Actor,category:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>categoryListsOrderResultSchema.parse(await this.repository.reorderCategoryLists(
      actor.accountId,parseContent(contentCategorySchema,category),parseContent(reorderCategoryListsSchema,input),this.key(context))));
  }
  async archiveCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(contentRevisionSchema,input);
      return this.repository.archiveCollection(actor.accountId,id,parsed.expectedRevision,this.key(context));
    });
  }
  /** SMP-04 Make it mine. Body {expectedRevision}; the list id comes from the route. */
  async makeCollectionMine(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      const parsed=parseContent(makeSampleMineSchema,{...(input&&typeof input==='object'&&!Array.isArray(input)?input:{}),collectionId:id});
      return collectionCoreDtoSchema.parse(await this.repository.makeCollectionMine(actor.accountId,parsed.collectionId,parsed.expectedRevision,this.key(context)));
    });
  }
  async restoreCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(restoreCollectionSchema,input);
      return collectionCoreDtoSchema.parse(await this.repository.restoreCollection(actor.accountId,id,parsed.expectedRevision,parsed.slug,this.key(context)));
    });
  }
  async purgeCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(contentRevisionSchema,input);
      return this.repository.purgeCollection(actor.accountId,id,parsed.expectedRevision,this.key(context));
    });
  }
  async archiveRecommendation(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'recommendations:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(contentRevisionSchema,input);
      return this.repository.archiveRecommendation(actor.accountId,id,parsed.expectedRevision,this.key(context));
    });
  }
}
