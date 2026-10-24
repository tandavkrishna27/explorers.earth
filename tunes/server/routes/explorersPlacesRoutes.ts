import {randomUUID} from 'node:crypto';
import type {Express} from 'express';
import type {Pool} from 'pg';
import type {ExplorersAuth} from '../auth/betterAuth';
import {requireActor,sendActorError} from '../middleware/explorersPrincipal';
import {PlacesNearbyFailure,PlacesNearbyService} from '../services/placesNearby';
import {placesNearbyQuerySchema,placesNearbyResponseSchema} from '../../shared/explorersPlacesNearbyContract';

// WP6 (ruling R11): the server-side nearby lookup for the Places add flow. Authenticated
// like the catalog search routes; the provider key stays on the server.
export function setupExplorersPlacesRoutes(app:Express,pool:Pool,auth:ExplorersAuth,nearby:Pick<PlacesNearbyService,'nearby'>){
 app.get('/api/explorers/v1/places/nearby',async(req,res)=>{
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try{
   const actor=await requireActor(req,auth,pool);
   const query=placesNearbyQuerySchema.safeParse(req.query);
   if(!query.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Valid lat and lng are required',requestId}});
   return res.json(placesNearbyResponseSchema.parse(await nearby.nearby(actor.accountId,query.data)));
  }catch(error){
   if(error instanceof PlacesNearbyFailure){res.set('Retry-After',String(error.retryAfterSeconds));return res.status(error.status).json({error:{code:error.code,message:error.message,requestId}});}
   sendActorError(req,res,error);
  }
 });
 app.all('/api/explorers/v1/places/nearby',(_req,res)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}}));
}
