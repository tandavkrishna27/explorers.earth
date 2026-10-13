import {randomUUID} from 'node:crypto';
import {Router,type Express,type Request,type Response} from 'express';
import type {Pool} from 'pg';
import type {Actor} from '../application/actor';
import type {ExplorersAuth,ExplorersAuthConfig} from '../auth/betterAuth';
import {requireActor} from '../middleware/explorersPrincipal';
import {AuthorizationError} from '../application/authorization';
import {AppEnrichmentService} from '../application/appEnrichment';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import type {RequestContext} from '../../shared/explorersContract';
type Service=Pick<AppEnrichmentService,'execute'|'readBinding'|'readSuggestions'|'readSources'>;
export function registerExplorersAppEnrichmentRoutes(routes:Router,dependencies:{baseURL:string;resolveActor:(request:Request)=>Promise<Actor>;service:Service}){

 const handler=(kind:'binding'|'acceptance'|'suggestions'|'sources',operations?:readonly string[])=>async(request:Request,response:Response)=>{
  response.set('Cache-Control','no-store');const requestId=randomUUID();
  try{
   if(operations&&request.get('origin')!==dependencies.baseURL)throw new AuthorizationError(403,'FORBIDDEN','Origin is not trusted');
   const actor=await dependencies.resolveActor(request);
   if(Object.keys(request.query).length)throw new RecommendationFailure(422,'Query parameters are not accepted');
   const id=String(request.params.id??'');let result:unknown;
   if(operations){if(!request.body||!operations.includes(request.body.operation))throw new RecommendationFailure(422,'Invalid enrichment operation');const context:RequestContext={requestId,idempotencyKey:request.get('Idempotency-Key')};result=await dependencies.service.execute(actor,id,request.body,context);}
   else result=kind==='binding'?await dependencies.service.readBinding(actor,id):kind==='sources'?await dependencies.service.readSources(actor,id):await dependencies.service.readSuggestions(actor,id);
   return response.status(200).json({[kind]:result});
  }catch(error){if(error instanceof RecommendationFailure||error instanceof AuthorizationError){const code=error instanceof AuthorizationError?error.code:error.status===404?'NOT_FOUND':error.status===409?'CONFLICT':'INVALID_INPUT';return response.status(error.status).json({error:{code,message:error.message,requestId}});}return response.status(500).json({error:{code:'INTERNAL_ERROR',message:'Request failed',requestId}});}
 };
 routes.put('/api/explorers/v1/recommendations/:id/app-enrichment/binding',handler('binding',['configureAppEnrichment','rebindAppEnrichment']));
 routes.delete('/api/explorers/v1/recommendations/:id/app-enrichment/binding',handler('binding',['disableAppEnrichment']));
 routes.post('/api/explorers/v1/recommendations/:id/app-enrichment/acceptances',handler('acceptance',['acceptAppEnrichment']));
 routes.get('/api/explorers/v1/recommendations/:id/app-enrichment/sources',handler('sources'));
 routes.get('/api/explorers/v1/recommendations/:id/app-enrichment/binding',handler('binding'));
 routes.get('/api/explorers/v1/recommendations/:id/app-enrichment/suggestions',handler('suggestions'));
 const unsupported=(_request:Request,response:Response)=>response.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}});
 routes.all('/api/explorers/v1/recommendations/:id/app-enrichment/sources',unsupported);
 routes.all('/api/explorers/v1/recommendations/:id/app-enrichment/binding',unsupported);
 routes.all('/api/explorers/v1/recommendations/:id/app-enrichment/acceptances',unsupported);
 routes.all('/api/explorers/v1/recommendations/:id/app-enrichment/suggestions',unsupported);
}
export function setupExplorersAppEnrichmentRoutes(app:Express,pool:Pool,auth:ExplorersAuth,config:ExplorersAuthConfig,approvedSources:readonly unknown[]=[],routerFactory:typeof Router=Router,sourceChoices?:readonly unknown[]){
 const routes=routerFactory({caseSensitive:true,strict:true});registerExplorersAppEnrichmentRoutes(routes,{baseURL:config.baseURL,resolveActor:request=>requireActor(request,auth,pool),service:new AppEnrichmentService(pool,approvedSources,undefined,sourceChoices)});app.use(routes);
}
