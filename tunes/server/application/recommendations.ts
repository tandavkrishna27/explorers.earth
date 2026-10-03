import type { Pool } from 'pg';
import { z } from 'zod/v3';
import { collectionCoreDtoSchema, recommendationCoreDtoSchema, createCollectionSchema, updateCollectionSchema,
  createRecommendationSchema, updateRecommendationSchema, reorderCollectionSchema, contentRevisionSchema,
  contentIdSchema, commandKeySchema, topPickCategorySchema, categoryTopPicksInputSchema, categoryTopPicksResultSchema, type RequestContext } from '../../shared/explorersContract';
import type { Actor } from './actor';
import { authorizeOperation } from './authorization';
import { ExplorersRecommendationRepository, RecommendationFailure } from '../repositories/explorersRecommendationRepository';
import { normalizeRichNote } from './richNote';
import {replaceRecommendationEntitySchema} from '../../shared/explorersBookContract';

export function parseContent<T>(schema:z.ZodType<T,any,any>,input:unknown):T {
  const parsed=schema.safeParse(input);
  if(!parsed.success) throw new RecommendationFailure(422,'Invalid content fields');
  return parsed.data;
}
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
    return this.authorized(actor,'collections:write',async()=>collectionCoreDtoSchema.parse(await this.repository.createCollection(actor.accountId,parseContent(createCollectionSchema,input),this.key(context))));
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
  async archiveCollection(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'collections:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(contentRevisionSchema,input);
      return this.repository.archiveCollection(actor.accountId,id,parsed.expectedRevision,this.key(context));
    });
  }
  async archiveRecommendation(actor:Actor,id:string,input:unknown,context:RequestContext) {
    return this.authorized(actor,'recommendations:write',async()=>{
      parseContent(contentIdSchema,id);const parsed=parseContent(contentRevisionSchema,input);
      return this.repository.archiveRecommendation(actor.accountId,id,parsed.expectedRevision,this.key(context));
    });
  }
}
