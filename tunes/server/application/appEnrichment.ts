import type {Pool} from 'pg';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {parseContent} from './recommendations';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import {ExplorersAppEnrichmentRepository} from '../repositories/explorersAppEnrichmentRepository';
import {contentIdSchema,commandKeySchema,type RequestContext} from '../../shared/explorersContract';
import {appEnrichmentCommandSchema,appBindingResultSchema,appAcceptanceResultSchema,appOwnerBindingSchema,appSnapshotSchema,appSourceChoiceSchema,appSourceIdentitySchema,type AppSourceChoice} from '../../shared/explorersAppEnrichmentContract';
type Repository=Pick<ExplorersAppEnrichmentRepository,'execute'|'readBinding'|'readSuggestions'>;
/** Owner commands only. Immutable snapshot/entitlement writes remain worker authority. */
export class AppEnrichmentService {
 private readonly repository:Repository;
 private readonly sourceChoices:readonly AppSourceChoice[];
 constructor(private readonly pool:Pool,approvedSources:readonly unknown[]=[],repository?:Repository,sourceChoices?:readonly unknown[]){this.repository=repository??new ExplorersAppEnrichmentRepository(pool,approvedSources);const choices=appSourceChoiceSchema.array().parse(sourceChoices??[]);if(sourceChoices!==undefined){const key=(value:unknown)=>JSON.stringify(appSourceIdentitySchema.parse(value));const approved=approvedSources.map(key),chosen=choices.map(choice=>key(choice.identity));if(new Set(approved).size!==approved.length||new Set(chosen).size!==chosen.length||approved.length!==chosen.length||chosen.some(value=>!approved.includes(value)))throw new Error('Invalid approved App source choices');}this.sourceChoices=Object.freeze(choices.map(choice=>Object.freeze({...choice,identity:Object.freeze(choice.identity)})));}
 async execute(actor:Actor,id:string,input:unknown,context:RequestContext){
  await authorizeOperation(this.pool,actor,'recommendations:write',actor?.accountId);
  const recommendationId=parseContent(contentIdSchema,id),command=parseContent(appEnrichmentCommandSchema,input),key=parseContent(commandKeySchema,context?.idempotencyKey);
  try{const result=await this.repository.execute(actor.accountId,recommendationId,command,actor.userId,{idempotencyKey:key});return (command.operation==='acceptAppEnrichment'?appAcceptanceResultSchema:appBindingResultSchema).parse(result);}
  catch(error){const code=(error as {code?:string}).code;if(code==='23505')throw new RecommendationFailure(409,'Content conflicts with an existing resource');if(code==='23503'||code==='23514'||code==='22003')throw new RecommendationFailure(422,'Invalid content relation or value');throw error;}
 }
 private async owned(actor:Actor,id:string){
  await authorizeOperation(this.pool,actor,'recommendations:read',actor?.accountId);
  const recommendationId=parseContent(contentIdSchema,id);
  const row=(await this.pool.query(`SELECT r.category,e.kind,e.origin FROM recommendations r JOIN entities e ON e.id=r.entity_id WHERE r.id=$1 AND r.account_id=$2 AND r.archived_at IS NULL`,[recommendationId,actor.accountId])).rows[0];
  if(!row)throw new RecommendationFailure(404,'Recommendation unavailable');
  if(row.category!=='apps'||row.kind!=='app'||row.origin!=='manual')throw new RecommendationFailure(422,'Manual app recommendation required');
  return recommendationId;
 }
 async readSources(actor:Actor,id:string){await this.owned(actor,id);return this.sourceChoices;}
 async readBinding(actor:Actor,id:string){const recommendationId=await this.owned(actor,id);return appOwnerBindingSchema.nullable().parse(await this.repository.readBinding(actor.accountId,recommendationId));}
 async readSuggestions(actor:Actor,id:string){const recommendationId=await this.owned(actor,id);return appSnapshotSchema.array().parse(await this.repository.readSuggestions(actor.accountId,recommendationId));}
}
