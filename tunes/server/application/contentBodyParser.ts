import { json, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import {PLACE_PINS_PARSER_BYTES} from './placePinsPolicy';
export const placePinsBodyBytes=Symbol('placePinsBodyBytes');
export function isPlacePinsPath(path:string):boolean {
 return /^\/api\/explorers\/v1\/collections\/[^/]+\/place-pins(?:\/availability|\/drafts(?:\/[^/]+(?:\/commit|\/chunks\/[^/]+)?)?)?$/.test(path);
}
/** Larger authoring budget only for the existing owned content command paths. */
export function contentBodyParser():RequestHandler {
 const standard=json({limit:'64kb'}),content=json({limit:1024*1024});
 const pins=json({limit:PLACE_PINS_PARSER_BYTES,verify:(req,_res,buffer)=>{(req as typeof req&{[placePinsBodyBytes]?:number})[placePinsBodyBytes]=buffer.byteLength;}});
 return (req,res,next)=>{
  if(isPlacePinsPath(req.path)){
   pins(req,res,error=>{
    if(error){res.set('Cache-Control','no-store').status(error.type==='entity.too.large'?413:422).json({error:{code:error.type==='entity.too.large'?'RESOURCE_TOO_LARGE':'INVALID_INPUT',message:error.type==='entity.too.large'?'Places pin request exceeds the request byte bound':'Invalid Places pin JSON body',requestId:randomUUID()}});return;}
    // No-content transports still require strict body validation at the boundary.
    if((req as typeof req&{[placePinsBodyBytes]?:number})[placePinsBodyBytes]===undefined&&req.body===undefined)(req as typeof req&{[placePinsBodyBytes]?:number})[placePinsBodyBytes]=0;
    next();
   });return;
  }
  const command=['POST','PATCH','DELETE','PUT'].includes(req.method)&&/^\/api\/explorers\/v1\/(recommendations|collections)(?:\/|$)/.test(req.path);
  (command?content:standard)(req,res,error=>{
   if(command&&error?.type==='entity.too.large') {res.set('Cache-Control','no-store').status(413).json({error:{code:'RESOURCE_TOO_LARGE',message:'Content command exceeds the request byte bound',requestId:randomUUID()}});return;}
   next(error);
  });
 };
}
