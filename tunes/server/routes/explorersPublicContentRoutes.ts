import {PublicPlaceReadLimit} from '../application/placePinsRead';
import { Router, type Express, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { Pool } from 'pg';
import { PublicContentFailure, PublicContentService } from '../application/publicContent';
import {SearchFailure} from '../application/searchQuery';
import {readUnsubscribeToken,suppressEmail} from '../application/emailSuppression';
export function setupExplorersPublicContentRoutes(app:Express,pool:Pool,secret:string,routerFactory:typeof Router=Router):void {
  const router=routerFactory({caseSensitive:true,strict:true}),service=new PublicContentService(pool,secret);
  router.use('/api/explorers/v1/public/recommendations',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
  router.get('/api/explorers/v1/public/recommendations/search',async(req,res)=>{
   try{
    if(Object.values(req.query).some(v=>typeof v!=='string'))throw new SearchFailure(400);
    if(Object.hasOwn(req.query,'scope'))throw new SearchFailure(400);
    return res.json(await service.searchRecommendations({...req.query,scope:'public',...(req.query.entityIds!==undefined?{entityIds:typeof req.query.entityIds==='string'?req.query.entityIds.split(','):req.query.entityIds}:{})}));
   }catch(error){
    const status=error instanceof SearchFailure?error.status:503;
    return res.status(status).json({version:'explorers-public-error/v1',error:{code:status===404?'NOT_FOUND':status===409?'PAGE_CHANGED':status===413?'RESOURCE_TOO_LARGE':status===503?'UNAVAILABLE':'BAD_REQUEST',...(status===409?{restart:true}:{}),...(status===503?{retryable:true}:{})}});
   }
  });
  router.all('/api/explorers/v1/public/recommendations/search',(_req,res)=>res.status(405).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}}));
  // Handle availability. Rate-limited harder than the content reads above - 30/min against
  // their 120 - because a per-keystroke availability check is also an enumeration oracle,
  // and the client debounces, so a real creator needs far fewer than thirty tries a minute.
  router.use('/api/explorers/v1/public/handles',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
  router.get('/api/explorers/v1/public/handles/:handle/available',async(req,res)=>{
    try {
      if(Object.keys(req.query).length)throw new PublicContentFailure(400);
      return res.json(await service.handleAvailable({handle:req.params.handle}));
    }catch(error){
      if(error instanceof PublicContentFailure)return res.status(error.status).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}});
      return res.status(503).json({version:'explorers-public-error/v1',error:{code:'UNAVAILABLE',retryable:true}});
    }
  });
  router.all('/api/explorers/v1/public/handles/:handle/available',(_req,res)=>res.status(405).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}}));
  router.use('/api/explorers/v1/public/profiles',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
  const read=async(req:Request,res:Response)=>{
    try {
      if(Object.keys(req.query).some(key=>key!=='limit'&&key!=='cursor')) throw new PublicContentFailure(400);
      // Raw query keys are retained so unknown keys/arrays cannot be discarded before validation.
      const value=await service.page({...req.query,username:req.params.username,category:req.params.category,...(req.params.slug?{slug:req.params.slug}:{})});
      return value?res.json(value):res.status(404).json({version:'explorers-public-error/v1',error:{code:'NOT_FOUND'}});
    } catch(error) {
      if(error instanceof PublicPlaceReadLimit&&req.params.category==='places')return res.status(503).json({version:'explorers-public-error/v1',error:{code:'READ_LIMIT',retryable:true}});
      if(error instanceof PublicContentFailure) return res.status(error.status).json({version:'explorers-public-error/v1',error:{code:error.status===409?'PAGE_CHANGED':'BAD_REQUEST',...(error.status===409?{restart:true}:{})}});
      return res.status(503).json({version:'explorers-public-error/v1',error:{code:'UNAVAILABLE',retryable:true}});
    }
  };
  router.get('/api/explorers/v1/public/profiles/:username/collections/:category',read);
  router.get('/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations',read);
  router.get('/api/explorers/v1/public/profiles/:username/collections/:category/:slug/recommendations/:id',async(req,res)=>{
    try {
      if(Object.keys(req.query).length)throw new PublicContentFailure(400);
      const value=await service.detail(req.params);
      return value?res.json(value):res.status(404).json({version:'explorers-public-error/v1',error:{code:'NOT_FOUND'}});
    }catch(error){
      if(error instanceof PublicContentFailure)return res.status(error.status).json({version:'explorers-public-error/v1',error:{code:error.status===413?'RESOURCE_TOO_LARGE':'BAD_REQUEST'}});
      return res.status(503).json({version:'explorers-public-error/v1',error:{code:'UNAVAILABLE',retryable:true}});
    }
  });
  /*
   * Email unsubscribe. Decision D2, 2026-10-08.
   *
   * Public by necessity, not by expansion: the click arrives from a mail client, often on
   * another device, from somebody who may have no account at all. Requiring a session would
   * mean the people most likely to want out are the least able to get out.
   *
   * The token carries its own authority - the address plus an HMAC over it under a
   * purpose-bound key - so it cannot be forged and cannot be replayed into any other
   * surface. See application/emailSuppression.ts for why there is deliberately no expiry.
   *
   * GET does NOT write. Mail clients and security scanners prefetch links, so a GET that
   * suppressed would unsubscribe people who never clicked anything. GET only reports which
   * address the token is for, and POST performs it - which is also what RFC 8058 one-click
   * unsubscribe sends.
   *
   * Rate-limited at 30/min like the handle check rather than the content reads' 120: a real
   * person clicks once, and the limit bounds how fast invalid tokens can be probed.
   */
  router.use('/api/explorers/v1/public/email/unsubscribe',(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();},rateLimit({windowMs:60_000,limit:30,standardHeaders:'draft-7',legacyHeaders:false}));
  router.get('/api/explorers/v1/public/email/unsubscribe',(req,res)=>{
    const email=readUnsubscribeToken(secret,req.query.token);
    if(!email)return res.status(400).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}});
    return res.json({version:'explorers-email-unsubscribe/v1',email,confirmed:false});
  });
  router.post('/api/explorers/v1/public/email/unsubscribe',async(req,res)=>{
    try {
      const email=readUnsubscribeToken(secret,req.query.token??(req.body as {token?:unknown}|undefined)?.token);
      if(!email)return res.status(400).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}});
      const result=await suppressEmail(pool,{email,reason:'unsubscribe',source:'public-unsubscribe-link'});
      // 200 either way. A second click is not an error to show somebody who is already
      // unsubscribed, and the distinction is reported rather than signalled by status.
      return res.json({version:'explorers-email-unsubscribe/v1',email,confirmed:true,alreadyUnsubscribed:result.alreadySuppressed});
    }catch{
      return res.status(503).json({version:'explorers-public-error/v1',error:{code:'UNAVAILABLE',retryable:true}});
    }
  });
  router.all('/api/explorers/v1/public/email/unsubscribe',(_req,res)=>res.status(405).json({version:'explorers-public-error/v1',error:{code:'BAD_REQUEST'}}));
  app.use(router);
}
