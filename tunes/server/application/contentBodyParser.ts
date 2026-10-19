import { json, type RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
/** Larger authoring budget only for the existing owned content command paths. */
export function contentBodyParser():RequestHandler {
 const standard=json({limit:'64kb'}),content=json({limit:1024*1024});
 return (req,res,next)=>{
  const command=['POST','PATCH','DELETE','PUT'].includes(req.method)&&/^\/api\/explorers\/v1\/(recommendations|collections)(?:\/|$)/.test(req.path);
  (command?content:standard)(req,res,error=>{
   if(command&&error?.type==='entity.too.large') {res.set('Cache-Control','no-store').status(413).json({error:{code:'RESOURCE_TOO_LARGE',message:'Content command exceeds the request byte bound',requestId:randomUUID()}});return;}
   next(error);
  });
 };
}
