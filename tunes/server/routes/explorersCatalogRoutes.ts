import {MovieCatalog} from '../services/movieCatalog';
import {randomUUID} from 'node:crypto';
import type {Express,Request,Response} from 'express';
import type {Pool} from 'pg';
import type {Actor} from '../application/actor';
import {AuthorizationError} from '../application/authorization';
import {MediaInputError,MediaUnavailable} from '../application/media';
import {createLinkPreviewService,LinkPreviewInputError,LinkPreviewRateLimited,type LinkPreviewService} from '../application/linkPreview';
import {commandKeySchema} from '../../shared/explorersContract';
import type {ExplorersAuth,ExplorersAuthConfig} from '../auth/betterAuth';
import {CatalogService,MovieGenreFailure,GameCatalogFailure,movieSearchFailure} from '../application/catalog';
import {RecommendationFailure} from '../repositories/explorersRecommendationRepository';
import {BookCatalog,BookProviderFailure} from '../services/bookCatalog';import {GameCatalogFailure as GameProviderFailure} from '../services/gameCatalogTypes';
import {requireActor,sendActorError} from '../middleware/explorersPrincipal';
import {TaxonomyCatalogService,TaxonomyCatalogFailure} from '../application/taxonomyCatalog';
export type LinkPreviewRouteService=Partial<Pick<LinkPreviewService,'preview'|'importImage'|'searchApps'>>;
const unsupportedMethod=(_req:Request,res:Response)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}});
/**
 * Owner-initiated paste-a-link prefill. The pasted URL travels only in a POST body (never a
 * query string, so it stays out of access logs), the browser origin must be ours, and nothing is cached.
 */
export function registerLinkPreviewRoutes(app:Pick<Express,'post'|'get'|'all'>,dependencies:{baseURL:string;resolveActor:(request:Request)=>Promise<Actor>;service:LinkPreviewRouteService}){
 const fail=(req:Request,res:Response,error:unknown,requestId:string)=>{
  const body=(status:number,code:string,message:string)=>res.status(status).json({error:{code,message,requestId}});
  if(error instanceof LinkPreviewRateLimited){res.set('Retry-After',String(error.retryAfterSeconds));return body(429,'RATE_LIMITED','Too many link previews. Try again shortly');}
  if(error instanceof LinkPreviewInputError||error instanceof MediaInputError)return body(422,'INVALID_INPUT',error.message);
  if(error instanceof MediaUnavailable)return body(503,'UNAVAILABLE','Media storage is unavailable');
  if(error instanceof AuthorizationError)return sendActorError(req,res,error);
  if(error instanceof Error&&error.message==='LINK_PREVIEW_BLOCKED')return body(422,'LINK_PREVIEW_BLOCKED','This link cannot be previewed');
  if(error instanceof Error&&error.message==='LINK_PREVIEW_UNAVAILABLE')return body(502,'LINK_PREVIEW_UNAVAILABLE','The page could not be read');
  return sendActorError(req,res,error);
 };
 const command=(work:(actor:Actor,req:Request,requestId:string)=>Promise<[number,unknown]>)=>async(req:Request,res:Response)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{
   if(req.get('origin')!==dependencies.baseURL)throw new AuthorizationError(403,'FORBIDDEN','Origin is not trusted');
   const actor=await dependencies.resolveActor(req);
   if(Object.keys(req.query).length)throw new LinkPreviewInputError('Query parameters are not accepted');
   const [status,payload]=await work(actor,req,requestId);return res.status(status).json(payload);
  }catch(error){return fail(req,res,error,requestId);}
 };
 app.post('/api/explorers/v1/catalog/link-preview',command(async(actor,req)=>[200,{preview:await dependencies.service.preview!(actor,req.body)}]));
 app.all('/api/explorers/v1/catalog/link-preview',unsupportedMethod);
 app.post('/api/explorers/v1/catalog/link-preview/image',command(async(actor,req,requestId)=>{
  const key=commandKeySchema.safeParse(req.get('Idempotency-Key'));if(!key.success)throw new LinkPreviewInputError('Idempotency-Key is required');
  return [201,{media:await dependencies.service.importImage!(actor,req.body,{requestId,idempotencyKey:key.data})}];
 }));
 app.all('/api/explorers/v1/catalog/link-preview/image',unsupportedMethod);
 app.get('/api/explorers/v1/catalog/apps',async(req,res)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{const actor=await dependencies.resolveActor(req);return res.json({apps:await dependencies.service.searchApps!(actor,{query:req.query.query,country:req.query.country})});}
  catch(error){return fail(req,res,error,requestId);}
 });
 app.all('/api/explorers/v1/catalog/apps',unsupportedMethod);
}
export function setupExplorersCatalogRoutes(app:Express,pool:Pool,auth:ExplorersAuth,config:ExplorersAuthConfig,books:BookCatalog,movies?:MovieCatalog,linkPreview:LinkPreviewRouteService=createLinkPreviewService(pool)){
 const service=new CatalogService(pool,books,movies);
 const taxonomy=new TaxonomyCatalogService(pool,config.secret);
 app.get('/api/explorers/v1/catalog/taxonomy',async(req,res)=>{res.set('Cache-Control','no-store');try{return res.json(await taxonomy.read(await requireActor(req,auth,pool),req.query));}catch(error){if(error instanceof TaxonomyCatalogFailure)return res.status(error.status).json({error:{code:error.code,message:error.message,requestId:randomUUID()}});sendActorError(req,res,error);}});
 app.all('/api/explorers/v1/catalog/taxonomy',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
 app.get('/api/explorers/v1/catalog/games',async(req,res)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{return res.json(await service.searchGames(await requireActor(req,auth,pool),req.query));}
  catch(error){if(error instanceof GameCatalogFailure)return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});if(error instanceof GameProviderFailure){if(error.retryAfterSeconds)res.set('Retry-After',String(error.retryAfterSeconds));return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});}if(error instanceof RecommendationFailure)return res.status(error.status).json({error:{code:'INVALID_INPUT',message:error.message,requestId}});sendActorError(req,res,error);}
 });
 app.all('/api/explorers/v1/catalog/games',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
 app.get('/api/explorers/v1/catalog/movie-genres',async(req,res)=>{res.set('Cache-Control','no-store');try{return res.json(await service.movieGenres(await requireActor(req,auth,pool),req.query));}catch(error){if(error instanceof MovieGenreFailure)return res.status(error.status).json({error:{code:error.code,message:error.message,requestId:randomUUID()}});sendActorError(req,res,error);}});
 app.all('/api/explorers/v1/catalog/movie-genres',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
 app.get('/api/explorers/v1/catalog/books',async(req,res)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{return res.json(await service.searchBooks(await requireActor(req,auth,pool),req.query));}
  catch(error){if(error instanceof BookProviderFailure){if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});}sendActorError(req,res,error);}
 });
 app.all('/api/explorers/v1/catalog/books',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
 registerLinkPreviewRoutes(app,{baseURL:config.baseURL,resolveActor:req=>requireActor(req,auth,pool),service:linkPreview});
 app.get('/api/explorers/v1/catalog/movies',async(req,res)=>{res.set('Cache-Control','no-store');const requestId=randomUUID();try{return res.json(await service.searchMovies(await requireActor(req,auth,pool),req.query));}catch(error){const failure=movieSearchFailure(error,requestId);if(failure)return res.status(failure.status).json(failure.body);sendActorError(req,res,error);}});
 app.all('/api/explorers/v1/catalog/movies',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));

}
