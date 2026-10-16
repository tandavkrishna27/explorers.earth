import {randomUUID} from 'node:crypto';
import type {Request,Response,Router} from 'express';
import type {Actor} from '../application/actor';
import type {RequestContext} from '../../shared/explorersContract';
import {placePinsResults,type PlacePinsOperation} from '../../shared/explorersPlacePinsContract';
import {PlacePinsFailure} from '../application/placePinsBoundary';
import {AuthorizationError} from '../application/authorization';
import {placePinsBodyBytes} from '../application/contentBodyParser';
type Boundary={execute(actor:Actor,input:unknown,context:RequestContext,bodyBytes:number):Promise<unknown>};
type Dependencies={baseURL:string;resolveActor(request:Request):Promise<Actor>;boundary:Boundary};
export function registerExplorersPlacePinsRoutes(routes:Router,dependencies:Dependencies):void {
 const unsupported=(_req:Request,res:Response)=>res.set('Cache-Control','no-store').status(405).json({error:{code:'INVALID_INPUT',message:'Method is not supported',requestId:randomUUID()}});
 const handle=(operation:PlacePinsOperation,envelope:string)=>async(req:Request,res:Response)=>{
  if(operation==='placePinsAvailability'&&req.method!=='GET')return unsupported(req,res);
  res.set('Cache-Control','no-store');const requestId=randomUUID();
  try {
   if(operation!=='placePinsAvailability'&&req.get('origin')!==dependencies.baseURL)throw new PlacePinsFailure(403,'FORBIDDEN','Origin is not trusted');
   const actor=await dependencies.resolveActor(req);
   if(Object.keys(req.query).length)throw new PlacePinsFailure(422,'INVALID_INPUT','Query parameters are not accepted');
   const read=operation==='placePinsAvailability';
   const bytes=(req as Request&{[placePinsBodyBytes]?:number})[placePinsBodyBytes];
   if(read&&(bytes||req.get('content-length')&&req.get('content-length')!=='0'||req.get('transfer-encoding')||req.body!==undefined&&Object.keys(req.body??{}).length))throw new PlacePinsFailure(422,'INVALID_INPUT','Availability accepts no body');
   if(!read&&bytes===undefined)throw new PlacePinsFailure(503,'UNAVAILABLE','Bounded Places pin transport is unavailable');
   const input={operation,collectionId:String(req.params.id??''),
    ...(req.params.draftId!==undefined?{draftId:String(req.params.draftId)}:{}),
    ...(operation==='appendPlacePinsChunk'?{chunkIndex:/^(0|[1-9][0-9]*)$/.test(String(req.params.chunkIndex))?Number(req.params.chunkIndex):NaN}:{}),
    ...(!read?{body:req.body}:{})};
   const result=await dependencies.boundary.execute(actor,input,{requestId,idempotencyKey:req.get('Idempotency-Key')},bytes??0);
   const parsed=placePinsResults[operation].safeParse(result);
   if(!parsed.success)throw new PlacePinsFailure(503,'UNAVAILABLE','Places pin result is unavailable');
   return res.json({[envelope]:parsed.data});
  }catch(error){
   const failure=error instanceof PlacePinsFailure||error instanceof AuthorizationError?error:new PlacePinsFailure(503,'UNAVAILABLE','Places pin service is unavailable');
   return res.status(failure.status).json({error:{code:failure.status===503?'UNAVAILABLE':failure.code,message:failure.message,requestId}});
  }
 };
 routes.get('/api/explorers/v1/collections/:id/place-pins/availability',handle('placePinsAvailability','placePinsAvailability'));
 routes.all('/api/explorers/v1/collections/:id/place-pins/availability',unsupported);
 routes.put('/api/explorers/v1/collections/:id/place-pins',handle('replacePlacePins','placePins'));
 routes.all('/api/explorers/v1/collections/:id/place-pins',unsupported);
 routes.post('/api/explorers/v1/collections/:id/place-pins/drafts',handle('beginPlacePinsDraft','placePinsDraft'));
 routes.all('/api/explorers/v1/collections/:id/place-pins/drafts',unsupported);
 routes.put('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId/chunks/:chunkIndex',handle('appendPlacePinsChunk','placePinsChunk'));
 routes.all('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId/chunks/:chunkIndex',unsupported);
 routes.post('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId/commit',handle('commitPlacePinsDraft','placePins'));
 routes.all('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId/commit',unsupported);
 routes.delete('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId',handle('abortPlacePinsDraft','placePinsDraftAbort'));
 routes.all('/api/explorers/v1/collections/:id/place-pins/drafts/:draftId',unsupported);
}
