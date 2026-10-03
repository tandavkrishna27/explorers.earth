import {MovieCatalog,MovieProviderFailure} from '../services/movieCatalog';
import {randomUUID} from 'node:crypto';
import type {Express} from 'express';
import type {Pool} from 'pg';
import type {ExplorersAuth,ExplorersAuthConfig} from '../auth/betterAuth';
import {CatalogService} from '../application/catalog';
import {BookCatalog,BookProviderFailure} from '../services/bookCatalog';
import {requireActor,sendActorError} from '../middleware/explorersPrincipal';
export function setupExplorersCatalogRoutes(app:Express,pool:Pool,auth:ExplorersAuth,config:ExplorersAuthConfig,books:BookCatalog,movies?:MovieCatalog){
 const service=new CatalogService(pool,books,movies);
 app.get('/api/explorers/v1/catalog/books',async(req,res)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{return res.json(await service.searchBooks(await requireActor(req,auth,pool),req.query));}
  catch(error){if(error instanceof BookProviderFailure){if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});}sendActorError(req,res,error);}
 });
 app.all('/api/explorers/v1/catalog/books',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
 app.get('/api/explorers/v1/catalog/movies',async(req,res)=>{res.set('Cache-Control','no-store');const requestId=randomUUID();try{return res.json(await service.searchMovies(await requireActor(req,auth,pool),req.query));}catch(error){if(error instanceof MovieProviderFailure)return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});sendActorError(req,res,error);}});
 app.all('/api/explorers/v1/catalog/movies',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));

}
