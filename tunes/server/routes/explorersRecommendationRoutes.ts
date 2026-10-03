import {MovieCatalog,MovieProviderFailure} from '../services/movieCatalog';
import {BookCoverImportService} from '../application/bookCoverImport';
import {MediaService} from '../application/media';
import { randomUUID } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { Router } from 'express';
import type { Pool } from 'pg';
import type { ExplorersAuth, ExplorersAuthConfig } from '../auth/betterAuth';
import type { Actor } from '../application/actor';
import { RecommendationService } from '../application/recommendations';
import { CatalogService } from '../application/catalog';
import { OwnerContentService } from '../application/ownerContent';
import { RecommendationFailure } from '../repositories/explorersRecommendationRepository';
import { requireActor, sendActorError } from '../middleware/explorersPrincipal';
import type { RequestContext } from '../../shared/explorersContract';
import {SearchFailure} from '../application/searchQuery';
import {BookProviderFailure,BookCatalog} from '../services/bookCatalog';

export function setupExplorersRecommendationRoutes(app:Express,pool:Pool,auth:ExplorersAuth,config:ExplorersAuthConfig,books?:BookCatalog,coverImporter=new BookCoverImportService(pool,new MediaService(pool)),movies?:MovieCatalog) {
  const service=new RecommendationService(pool),catalog=new CatalogService(pool,books,movies);
  const ownerContent=new OwnerContentService(pool,config.secret);
  const routes=Router({caseSensitive:true,strict:true});
  const unsupported=(_request:Request,response:Response)=>response.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}});
  const mutation=(work:(actor:Actor,id:string,body:unknown,context:RequestContext)=>Promise<unknown>,name:string,status=200)=>async(request:Request,response:Response)=>{
    response.set('Cache-Control','no-store');
    const requestId=randomUUID();
    if(request.get('origin')!==config.baseURL) return response.status(403).json({error:{code:'FORBIDDEN',message:'Origin is not trusted',requestId}});
    try {
      const actor=await requireActor(request,auth,pool);
      if(Object.keys(request.query).length) throw new RecommendationFailure(422,'Query parameters are not accepted');
      const result=await work(actor,String(request.params.id??''),request.body,{requestId,idempotencyKey:request.get('Idempotency-Key')});
      return response.status(status).json({[name]:result});
    } catch(error) {
      if(error instanceof BookProviderFailure||error instanceof MovieProviderFailure){if(error instanceof BookProviderFailure&&error.retryAfter)response.set('Retry-After',String(error.retryAfter));return response.status(error.status).json({error:{code:error.code,message:error.message,requestId}});}
      if(error instanceof RecommendationFailure) return response.status(error.status).json({error:{code:error.status===404?'NOT_FOUND':error.status===409?'CONFLICT':error.status===413?'RESOURCE_TOO_LARGE':'INVALID_INPUT',message:error.message,requestId}});
      sendActorError(request,response,error);
    }
  };
  const read=(work:(actor:Actor,id:string,query:unknown)=>Promise<unknown>,name?:string)=>async(request:Request,response:Response)=>{
    response.set('Cache-Control','no-store');const requestId=randomUUID();
    try {
      const actor=await requireActor(request,auth,pool),result=await work(actor,String(request.params.id??''),request.query);
      return response.json(name?{[name]:result}:result);
    } catch(error) {
      if(error instanceof SearchFailure)return response.status(error.status).json({error:{code:error.status===503?'UNAVAILABLE':error.status===409?'CONFLICT':error.status===413?'RESOURCE_TOO_LARGE':error.status===404?'NOT_FOUND':'INVALID_INPUT',message:error.message,requestId,...(error.status===503?{retryable:true}:{})}});
      if(error instanceof RecommendationFailure) return response.status(error.status).json({error:{code:error.status===404?'NOT_FOUND':error.status===409?'CONFLICT':error.status===413?'RESOURCE_TOO_LARGE':'INVALID_INPUT',message:error.message,requestId}});
      sendActorError(request,response,error);
    }
  };
  const categoryQuery=(request:Request,query:unknown)=>{
    if(Object.prototype.hasOwnProperty.call(query,'category')) throw new RecommendationFailure(422,'Category is specified by the route');
    return {...(query as object),category:request.params.category};
  };
  routes.get('/api/explorers/v1/collections',read((a,_id,q)=>ownerContent.listCollections(a,q)));
  routes.get('/api/explorers/v1/collections/:id',read((a,id,q)=>ownerContent.getCollection(a,id,q),'collection'));
  routes.get('/api/explorers/v1/collections/:id/editable',read((a,id,q)=>ownerContent.getCollection(a,id,q,true),'collection'));
  routes.get('/api/explorers/v1/recommendations',read((a,_id,q)=>ownerContent.listRecommendations(a,q)));
  routes.get('/api/explorers/v1/categories/:category/content-snapshot',async(req,res)=>read((a,_id,q)=>ownerContent.getSnapshot(a,categoryQuery(req,q)))(req,res));
  routes.get('/api/explorers/v1/categories/:category/content-snapshot/validate',async(req,res)=>read((a,_id,q)=>ownerContent.validateSnapshot(a,categoryQuery(req,q)))(req,res));
  routes.get('/api/explorers/v1/categories/:category/memberships',async(req,res)=>read((a,_id,q)=>ownerContent.listMemberships(a,categoryQuery(req,q)))(req,res));
  routes.get('/api/explorers/v1/categories/:category/top-picks',async(req,res)=>read((a,_id,q)=>ownerContent.listTopPicks(a,categoryQuery(req,q)))(req,res));
  // Literal registrations also make each executable boundary visible to the
  // official AST inventory; interpolated templates and loop paths are not parsed.
  routes.post('/api/explorers/v1/entities/resolve',mutation((a,_id,b,c)=>catalog.resolveEntity(a,b,c),'entity'));
  routes.put('/api/explorers/v1/categories/:category/top-picks',async(req,res)=>mutation((a,_id,b,c)=>service.setCategoryTopPicks(a,String(req.params.category),b,c),'topPicks')(req,res));
  routes.patch('/api/explorers/v1/categories/:category/top-picks/order',async(req,res)=>mutation((a,_id,b,c)=>service.upsertCategoryTopPickOrder(a,String(req.params.category),b,c),'topPicks')(req,res));
  routes.post('/api/explorers/v1/collections',mutation((a,_id,b,c)=>service.createCollection(a,b,c),'collection',201));
  routes.patch('/api/explorers/v1/collections/:id',mutation((a,id,b,c)=>service.updateCollection(a,id,b,c),'collection'));
  routes.patch('/api/explorers/v1/collections/:id/order',mutation((a,id,b,c)=>service.reorderCollection(a,id,b,c),'collection'));
  routes.delete('/api/explorers/v1/collections/:id',mutation((a,id,b,c)=>service.archiveCollection(a,id,b,c),'collection'));
  routes.get('/api/explorers/v1/recommendations/search',read((a,_id,q)=>{
    if(Object.values(q as object).some(v=>typeof v!=='string'))throw new RecommendationFailure(422,'Search parameters must be scalar');
    if(Object.hasOwn(q as object,'scope'))throw new RecommendationFailure(422,'Scope is specified by the route');
    return ownerContent.searchRecommendations(a,{...(q as object),scope:'owner',...((q as any).entityIds!==undefined?{entityIds:typeof (q as any).entityIds==='string'?(q as any).entityIds.split(','):(q as any).entityIds}:{})});
  }));
  routes.all('/api/explorers/v1/recommendations/search',unsupported);
  routes.get('/api/explorers/v1/recommendations/:id',read((a,id,q)=>ownerContent.getRecommendation(a,id,q),'recommendation'));
  routes.get('/api/explorers/v1/recommendations/:id/editable',read((a,id,q)=>ownerContent.getRecommendation(a,id,q,true),'recommendation'));
  routes.post('/api/explorers/v1/recommendations',mutation((a,_id,b,c)=>service.createRecommendation(a,b,c),'recommendation',201));
  routes.post('/api/explorers/v1/recommendations/:id/book-covers',mutation((a,id,b,c)=>coverImporter.import(a,id,b,c),'coverImport'));
  routes.post('/api/explorers/v1/recommendations/:id/entity',mutation((a,id,b,c)=>service.replaceRecommendationEntity(a,id,b,c),'recommendation'));
  routes.patch('/api/explorers/v1/recommendations/:id',mutation((a,id,b,c)=>service.updateRecommendation(a,id,b,c),'recommendation'));
  routes.delete('/api/explorers/v1/recommendations/:id',mutation((a,id,b,c)=>service.archiveRecommendation(a,id,b,c),'recommendation'));
  routes.all('/api/explorers/v1/entities/resolve',unsupported);
  routes.all('/api/explorers/v1/collections',unsupported);
  routes.all('/api/explorers/v1/collections/:id',unsupported);
  routes.all('/api/explorers/v1/collections/:id/editable',unsupported);
  routes.all('/api/explorers/v1/collections/:id/order',unsupported);
  routes.all('/api/explorers/v1/recommendations',unsupported);
  routes.all('/api/explorers/v1/recommendations/:id',unsupported);
  routes.all('/api/explorers/v1/recommendations/:id/editable',unsupported);
  routes.all('/api/explorers/v1/recommendations/:id/book-covers',unsupported);
  routes.all('/api/explorers/v1/recommendations/:id/entity',unsupported);
  routes.all('/api/explorers/v1/categories/:category/content-snapshot',unsupported);
  routes.all('/api/explorers/v1/categories/:category/content-snapshot/validate',unsupported);
  routes.all('/api/explorers/v1/categories/:category/memberships',unsupported);
  routes.all('/api/explorers/v1/categories/:category/top-picks',unsupported);
  routes.all('/api/explorers/v1/categories/:category/top-picks/order',unsupported);
  app.use(routes);
}
