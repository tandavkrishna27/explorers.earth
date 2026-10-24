import {z} from 'zod/v3';
import {linkPreviewSchema,linkPreviewUrlSchema,type LinkPreview} from '../../../tunes/shared/explorersLinkPreviewContract';
import {commandKeySchema} from '../../../tunes/shared/explorersContract';
import {ExplorersApiError,handleExpiredSession} from './explorersApiClient';
import useAuthStore from '../store/store';

/** Mirrors AppleAppCandidate in tunes/server/services/appleSearch.ts (server-only, so not importable). */
export const appCandidateSchema=z.object({
 title:z.string(),developer:z.string().nullable(),appUrl:z.string().url(),iconUrl:z.string().url().nullable(),
 priceTier:z.enum(['Free','Paid']),platforms:z.array(z.enum(['iOS','macOS'])),genres:z.array(z.string()),screenshotUrls:z.array(z.string().url()),
}).strict();
export type AppCandidate=z.infer<typeof appCandidateSchema>;

const previewResult=z.object({preview:linkPreviewSchema}).strict();
const importResult=z.object({media:z.object({id:z.string().min(1)}).passthrough()}).strict();
const appsResult=z.object({apps:z.array(appCandidateSchema)}).strict();

// Same path as the owner commands in explorersApiClient: same-origin cookies (the browser
// supplies Origin, which the server checks), no caching, server error codes passed through.
async function call<T>(path:string,init:RequestInit,schema:z.ZodType<T,any,any>):Promise<T>{
 const generation=useAuthStore.getState().generation;
 const response=await fetch(`/api/explorers/v1/catalog${path}`,{credentials:'include',cache:'no-store',...init});
 handleExpiredSession(response,generation);
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new ExplorersApiError(response.status,body?.error?.code??'UNAVAILABLE',body?.error?.message??'Request failed');
 const parsed=schema.safeParse(body);
 if(!parsed.success)throw new ExplorersApiError(502,'LINK_PREVIEW_UNAVAILABLE','Unexpected link preview response');
 return parsed.data;
}
const newKey=()=>commandKeySchema.parse(crypto.randomUUID());

export const linkPreviewClient={
 async preview(url:string,signal?:AbortSignal):Promise<LinkPreview>{
  const body=JSON.stringify({url:linkPreviewUrlSchema.parse(url)});
  return (await call('/link-preview',{method:'POST',headers:{'Content-Type':'application/json'},body,signal},previewResult)).preview;
 },
 async importImage(imageUrl:string,key:string=newKey()):Promise<{id:string}>{
  const body=JSON.stringify({imageUrl:linkPreviewUrlSchema.parse(imageUrl)});
  return (await call('/link-preview/image',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':commandKeySchema.parse(key)},body},importResult)).media;
 },
 async searchApps(query:string,country?:string,signal?:AbortSignal):Promise<AppCandidate[]>{
  const params=new URLSearchParams({query});if(country)params.set('country',country);
  return (await call(`/apps?${params.toString()}`,{signal},appsResult)).apps;
 },
};
