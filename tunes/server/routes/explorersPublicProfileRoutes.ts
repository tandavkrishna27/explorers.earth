import {PublicPlaceReadLimit,PublicPlaceCursorError,PublicPlaceRestartConflict} from '../application/placePinsRead';
import {PublicPeopleCursorError} from '../publicProfile/publicPeopleProjection';
import {PublicMovieCursorError} from '../publicProfile/publicMoviesProjection';
import {PublicGameCursorError,PublicGameReadLimit,prepareGamePublicReply,discardGamePublicResult} from '../publicProfile/publicGamesProjection';
import { createHash } from "node:crypto";
import type { Express,Request,Response } from "express";
import rateLimit from "express-rate-limit";
import { parsePublicPeopleSectorRequest, parsePublicMovieGenreRequest, parsePublicProfileDetailRequest, parsePublicProfileRequest, parsePublicProfileUsername } from "../publicProfile/publicProfileContract";
import type { PublicCategory } from "../publicProfile/publicProfilePolicy";

const notFound = { version: "explorers-public-error/v1", error: { code: "NOT_FOUND" } };
const badRequest = { version: "explorers-public-error/v1", error: { code: "BAD_REQUEST" } };
const unavailable = { version: "explorers-public-error/v1", error: { code: "UNAVAILABLE", retryable: true } };
const rateLimited = { version: "explorers-public-error/v1", error: { code: "RATE_LIMITED", retryable: true } };
const restartRequired={version:'explorers-public-error/v1',error:{code:'RESTART_REQUIRED',retryable:false}};
const readLimited={version:'explorers-public-error/v1',error:{code:'READ_LIMIT',retryable:true}};
function gamesRequestLifetime(request:Request,response:Response){
 const controller=new AbortController();
 const aborted=()=>controller.abort();const closed=()=>{if(!response.writableFinished)controller.abort();};
 request.once('aborted',aborted);response.once('close',closed);
 if(request.aborted||response.destroyed)controller.abort();
 // These HTTP references stay route-owned; only the signal enters admission.
 return {signal:controller.signal,dispose:()=>{request.removeListener('aborted',aborted);response.removeListener('close',closed);}};
}
async function sendGames(request:Request,response:Response,value:unknown){
 const settle=()=>{response.removeListener('finish',settle);response.removeListener('close',settle);discardGamePublicResult(value);};
 response.once('finish',settle);response.once('close',settle);
 if(response.destroyed||response.writableEnded){settle();return;}
 try{
  const json=await prepareGamePublicReply(value);
  if(response.destroyed||response.writableEnded){settle();return;}
  if(json===undefined)return response.status(404).json(notFound);
  const etag=`"${createHash('sha256').update(json).digest('base64url')}"`;
  response.set('Cache-Control','no-store').set('ETag',etag);
  if(request.get('if-none-match')===etag)return response.status(304).end();
  return response.status(200).type('application/json').send(json);
 }catch(error){discardGamePublicResult(value);if(response.destroyed||response.writableEnded){settle();return;}return response.status(503).json(error instanceof PublicGameReadLimit?readLimited:unavailable);}
}

export function setupExplorersPublicProfileRoutes(
  app: Express,
  dependencies: { peopleSector?(username:string,sectorSlug:string,limit:number,options?:{cursor?:string}):Promise<unknown|undefined>; movieGenre?(username:string,genreSlug:string,limit:number,options?:{bypassCache?:boolean;cursor?:string}):Promise<unknown|undefined>; shell?(username: string, options?: { bypassCache?: boolean }): Promise<unknown | undefined>; category(username: string, category: PublicCategory, limit: number, options?: { bypassCache?: boolean; cursor?: string;signal?:AbortSignal }): Promise<unknown | undefined>; detail?(username: string, category: PublicCategory, slug: string, limit: number, options?: { bypassCache?: boolean; cursor?: string;signal?:AbortSignal }): Promise<unknown | undefined> },
  options: { rateLimit?: { windowMs?: number; limit?: number } } = {},
): void {
  app.use("/api/explorers/v1/profiles", rateLimit({
    windowMs: options.rateLimit?.windowMs ?? 60_000,
    limit: options.rateLimit?.limit ?? 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_request, response) => response.status(429).json(rateLimited),
  }));
  app.use("/api/explorers/v1/profiles", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/explorers/v1/profiles/:username", async (req, res) => {
    let username: string;
    try { username = parsePublicProfileUsername(req.params.username); }
    catch { return res.status(400).json(badRequest); }
    let value: unknown | undefined;
    try { value = await dependencies.shell?.(username, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? "") }); }
    catch(error) { return res.status(error instanceof PublicPlaceRestartConflict?409:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?400:503).json(error instanceof PublicPlaceRestartConflict?restartRequired:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?badRequest:error instanceof PublicGameReadLimit?readLimited:unavailable); }
    if (!value) return res.status(404).json(notFound);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
  });
  app.get("/api/explorers/v1/profiles/:username/recommendations/:category", async (req, res) => {
    let parsed: { username: string; category: PublicCategory; limit: number; cursor?: string };
    try { parsed = parsePublicProfileRequest({ username: req.params.username, category: req.params.category, limit: req.query.limit, cursor: req.query.cursor }); }
    catch { return res.status(400).json(badRequest); }
    const lifetime=parsed.category==='games'?gamesRequestLifetime(req,res):undefined;
    try{
    let value: unknown | undefined;
    try { value = await dependencies.category(parsed.username, parsed.category, parsed.limit, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? ""), cursor: parsed.cursor,...(lifetime?{signal:lifetime.signal}:{}) }); }
    catch(error) {
      if(lifetime&&res.destroyed)return;
      return res.status(error instanceof PublicPlaceRestartConflict?409:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?400:503).json(error instanceof PublicPlaceRestartConflict?restartRequired:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?badRequest:error instanceof PublicGameReadLimit||error instanceof PublicPlaceReadLimit&&('category' in req.params&&req.params.category==='places')?readLimited:unavailable);
    }
    if(lifetime?.signal.aborted){discardGamePublicResult(value);return;}
    if (!value) return res.status(404).json(notFound);
    if(parsed.category==='games')return await sendGames(req,res,value);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
    }finally{lifetime?.dispose();}
  });
  app.get('/api/explorers/v1/profiles/:username/recommendations/movies/genres/:genreSlug',async(req,res)=>{
    let parsed;try{if(Object.keys(req.query).some(key=>key!=='limit'&&key!=='cursor'))throw Error();parsed=parsePublicMovieGenreRequest({username:req.params.username,genreSlug:req.params.genreSlug,...req.query});}catch{return res.status(400).json(badRequest);}
    let value;try{value=await dependencies.movieGenre?.(parsed.username,parsed.genreSlug,parsed.limit,{cursor:parsed.cursor});}catch(error){return res.status(error instanceof PublicPlaceRestartConflict?409:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?400:503).json(error instanceof PublicPlaceRestartConflict?restartRequired:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?badRequest:error instanceof PublicGameReadLimit||error instanceof PublicPlaceReadLimit&&('category' in req.params&&req.params.category==='places')?readLimited:unavailable);}
    if(!value)return res.status(404).json(notFound);const etag=`"${createHash('sha256').update(JSON.stringify(value)).digest('base64url')}"`;res.set('ETag',etag);if(req.get('if-none-match')===etag)return res.status(304).end();return res.status(200).json(value);
  });
  app.get('/api/explorers/v1/profiles/:username/recommendations/people/sectors/:sectorSlug',async(req,res)=>{
    let parsed;try{if(Object.keys(req.query).some(k=>k!=='limit'&&k!=='cursor'))throw Error();parsed=parsePublicPeopleSectorRequest({username:req.params.username,sectorSlug:req.params.sectorSlug,...req.query});}catch{return res.status(400).json(badRequest);}
    let value;try{value=await dependencies.peopleSector?.(parsed.username,parsed.sectorSlug,parsed.limit,{cursor:parsed.cursor});}catch(error){return res.status(error instanceof PublicPeopleCursorError?400:503).json(error instanceof PublicPeopleCursorError?badRequest:unavailable);}
    if(!value)return res.status(404).json(notFound);const etag=`"${createHash('sha256').update(JSON.stringify(value)).digest('base64url')}"`;res.set('ETag',etag);if(req.get('if-none-match')===etag)return res.status(304).end();return res.status(200).json(value);
  });
  app.get("/api/explorers/v1/profiles/:username/recommendations/:category/:slug", async (req, res) => {
    let parsed: { username: string; category: PublicCategory; slug: string; limit: number; cursor?: string };
    try { parsed = parsePublicProfileDetailRequest({ username: req.params.username, category: req.params.category, slug: req.params.slug, limit: req.query.limit, cursor: req.query.cursor }); }
    catch { return res.status(400).json(badRequest); }
    const lifetime=parsed.category==='games'?gamesRequestLifetime(req,res):undefined;
    try{
    let value: unknown | undefined;
    try { value = await dependencies.detail?.(parsed.username, parsed.category, parsed.slug, parsed.limit, { bypassCache: /(?:^|,)\s*no-cache\s*(?:,|$)/i.test(req.get("cache-control") ?? ""), cursor: parsed.cursor,...(lifetime?{signal:lifetime.signal}:{}) }); }
    catch(error) { if(lifetime&&res.destroyed)return;return res.status(error instanceof PublicPlaceRestartConflict?409:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?400:503).json(error instanceof PublicPlaceRestartConflict?restartRequired:error instanceof PublicPlaceCursorError||error instanceof PublicMovieCursorError||error instanceof PublicGameCursorError?badRequest:error instanceof PublicGameReadLimit||error instanceof PublicPlaceReadLimit&&('category' in req.params&&req.params.category==='places')?readLimited:unavailable); }
    if(lifetime?.signal.aborted){discardGamePublicResult(value);return;}
    if (!value) return res.status(404).json(notFound);
    if(parsed.category==='games')return await sendGames(req,res,value);
    const etag = `"${createHash("sha256").update(JSON.stringify(value)).digest("base64url")}"`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("ETag", etag);
    if (req.get("if-none-match") === etag) return res.status(304).end();
    return res.status(200).json(value);
    }finally{lifetime?.dispose();}
  });
}
