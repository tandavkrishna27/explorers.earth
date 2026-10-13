import {z} from 'zod/v3';
import {appBindingSchema,appSnapshotSchema,appBindingResultSchema,appAcceptanceResultSchema,appEnrichmentCommandSchema,type AppBinding,type AppSelectedField} from '../../../../../tunes/shared/explorersAppEnrichmentContract';
import {assertOwnerDetailObservation,handleExpiredSession,ExplorersApiError,type RecommendationObservation} from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';
type Scope={accountId:string|null;generation:number;route:string};
export type AppEnrichmentIntent=Readonly<{key:string;body:string;recommendationId:string;operation:'disableAppEnrichment'|'acceptAppEnrichment'}>;
const intents=new WeakMap<AppEnrichmentIntent,{scope:Scope;observed:RecommendationObservation;binding:AppBinding}>();
const route=()=>JSON.stringify([window.location.pathname,window.location.search,window.location.hash]);
const capture=():Scope=>{const state=useAuthStore.getState();return {accountId:state.accountId,generation:state.generation,route:route()};};
function current(scope:Scope,signal?:AbortSignal){const state=useAuthStore.getState();if(signal?.aborted||!state.isAuthenticated||scope.accountId!==state.accountId||scope.generation!==state.generation||scope.route!==route())throw new ExplorersApiError(499,'ABORTED','App owner or route changed');}
function owner(observed:RecommendationObservation){assertOwnerDetailObservation(observed,'recommendation');if(observed.detail.category!=='apps')throw new ExplorersApiError(422,'INVALID_INPUT','App required');}
function bound(observed:RecommendationObservation,value:AppBinding){const binding=appBindingSchema.parse(value);if(binding.accountId!==observed.accountId||binding.recommendationId!==observed.resourceId||binding.appEntityId!==observed.detail.entityId)throw new ExplorersApiError(409,'CONFLICT','Reload app enrichment');return binding;}
async function request<T>(scope:Scope,id:string,suffix:string,schema:z.ZodType<T>,signal?:AbortSignal,intent?:AppEnrichmentIntent):Promise<T>{
 current(scope,signal);const controller=new AbortController(),stop=()=>controller.abort();signal?.addEventListener('abort',stop);const unsubscribe=useAuthStore.subscribe(()=>{try{current(scope);}catch{stop();}});const timeout=setTimeout(stop,20000);
 try{const response=await fetch(`/api/explorers/v1/recommendations/${encodeURIComponent(id)}/app-enrichment/${suffix}`,{method:intent?(intent.operation==='disableAppEnrichment'?'DELETE':'POST'):'GET',credentials:'include',cache:'no-store',signal:controller.signal,...(intent?{headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},body:intent.body}:{})});handleExpiredSession(response,scope.generation);const payload=await response.json();current(scope,signal);
  if(!response.ok)throw new ExplorersApiError(response.status,payload.error?.code??'UNAVAILABLE',payload.error?.message??'App enrichment request failed');return schema.parse(payload);
 }finally{clearTimeout(timeout);unsubscribe();signal?.removeEventListener('abort',stop);}
}
function prepare(observed:RecommendationObservation,binding:AppBinding,input:unknown):AppEnrichmentIntent{owner(observed);const checkedBinding=bound(observed,binding);const command=appEnrichmentCommandSchema.parse(input);if(command.operation!=='disableAppEnrichment'&&command.operation!=='acceptAppEnrichment')throw new Error('Unsupported operation');const intent=Object.freeze({key:crypto.randomUUID(),body:JSON.stringify(command),recommendationId:observed.resourceId,operation:command.operation});intents.set(intent,{scope:capture(),observed,binding:checkedBinding});return intent;}
export const AppEnrichmentClient={
 async read(observed:RecommendationObservation,signal?:AbortSignal){owner(observed);const scope=capture();const first=await request(scope,observed.resourceId,'binding',z.object({binding:appBindingSchema.nullable()}).strict(),signal);if(first.binding)bound(observed,first.binding);const second=await request(scope,observed.resourceId,'suggestions',z.object({suggestions:appSnapshotSchema.array()}).strict(),signal);if(second.suggestions.some(snapshot=>snapshot.appEntityId!==observed.detail.entityId))throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid app suggestion');return {binding:first.binding,suggestions:second.suggestions};},
 prepareDisable(observed:RecommendationObservation,binding:AppBinding){return prepare(observed,binding,{operation:'disableAppEnrichment',expectedRecommendationRevision:observed.resourceRevision,expectedBindingRevision:binding.bindingRevision});},
 prepareAcceptance(observed:RecommendationObservation,binding:AppBinding,snapshotId:string,selectedFields:AppSelectedField[]){if(!binding.currentGenerationId)throw new ExplorersApiError(409,'CONFLICT','Reload app enrichment');return prepare(observed,binding,{operation:'acceptAppEnrichment',expectedRecommendationRevision:observed.resourceRevision,expectedBindingRevision:binding.bindingRevision,snapshotId,selectedFields});},
 async execute(intent:AppEnrichmentIntent,signal?:AbortSignal){
  const metadata=intents.get(intent);if(!metadata)throw new Error('Unrecognized enrichment intent');current(metadata.scope,signal);owner(metadata.observed);
  const invalid=()=>{throw new ExplorersApiError(503,'INVALID_OWNER_CONTENT','Invalid enrichment result');};
  if(intent.operation==='disableAppEnrichment'){
   const result=(await request(metadata.scope,intent.recommendationId,'binding',z.object({binding:appBindingResultSchema}).strict(),signal,intent)).binding;
   if(result.recommendationId!==intent.recommendationId||result.bindingId!==metadata.binding.bindingId||result.bindingGenerationId!==metadata.binding.currentGenerationId||result.optIn||result.recommendationRevision!==metadata.observed.resourceRevision||result.bindingRevision!==metadata.binding.bindingRevision+(result.changed?1:0))invalid();return result;
  }
  const result=(await request(metadata.scope,intent.recommendationId,'acceptances',z.object({acceptance:appAcceptanceResultSchema}).strict(),signal,intent)).acceptance,command=JSON.parse(intent.body);
  if(result.recommendationId!==intent.recommendationId||result.snapshotId!==command.snapshotId||result.bindingGenerationId!==metadata.binding.currentGenerationId||result.recommendationRevision!==metadata.observed.resourceRevision+(result.changed?1:0)||JSON.stringify(result.acceptedFields)!==JSON.stringify(command.selectedFields))invalid();return result;
 },
};
