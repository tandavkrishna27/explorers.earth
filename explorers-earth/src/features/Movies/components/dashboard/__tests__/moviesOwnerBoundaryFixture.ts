import {createElement} from 'react';
import {expect,vi} from 'vitest';
import * as moviesClient from '../../../api/moviesClient';
import {render,screen,fireEvent,waitFor,act,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import useAuthStore from '../../../../../store/store';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const account=id(1),list=id(2);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
export function gate(){let release!:()=>void;const promise=new Promise<void>(resolve=>release=resolve);return {promise,release};}
export function fixture(){
 const expiresAt=Date.now()+600000;let revision=7,pinRevision=1;let pins=Array.from({length:15},(_,n)=>({recommendationId:id(100+n),collectionId:list,position:n}));
 const active=new Set<Promise<unknown>>();let closed=false;
 const track=<T,>(promise:Promise<T>)=>{active.add(promise);void promise.then(()=>active.delete(promise),()=>active.delete(promise));return promise;};
 // Default spy forwards original arguments and returns the original promise.
 const reader=vi.spyOn(moviesClient,'readMoviesOwnerContent');
 const writes:Array<{method:string;body:any}>=[];let hold:ReturnType<typeof gate>|undefined,reject=false;
 const snapshot=()=>({version:'explorers-owner-content/v2',snapshotToken:'fixture',revision:String(revision),expiresAt,pinRevision});
 const child=(n:number)=>({id:id(100+n),accountId:account,category:'movies',entityId:id(999),userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:pins.find(p=>p.recommendationId===id(100+n))?{collectionId:list,position:pins.find(p=>p.recommendationId===id(100+n))!.position,revision:pinRevision}:null});
 const transport=async(input:string,options:RequestInit={})=>{
  const check=()=>{if(closed||options.signal?.aborted)throw new DOMException('Fixture closed','AbortError');};check();
  const u=new URL(input,'http://localhost'),stream=u.pathname.split('/').at(-1)!;
  if(options.method==='PATCH'||options.method==='PUT'){
   const body=JSON.parse(options.body as string);writes.push({method:options.method,body});
   const ordered=body.orderedPins.map((p:any,n:number)=>({...p,position:n}));
   pins=options.method==='PUT'?ordered:[...ordered,...pins.filter(p=>!ordered.some((x:any)=>x.recommendationId===p.recommendationId)).map((p,n)=>({...p,position:ordered.length+n}))];
   revision++;pinRevision++;
   return reply({topPicks:{operation:options.method==='PUT'?'replace':'upsert-order',categoryRevision:String(revision),pinRevision,pins:ordered}});
  }
  if(stream==='content-snapshot'){if(hold)await new Promise<void>((resolve,reject)=>{const abort=()=>{finish();reject(new DOMException('Fixture aborted','AbortError'));};const finish=()=>options.signal?.removeEventListener('abort',abort);options.signal?.addEventListener('abort',abort,{once:true});hold!.promise.then(()=>{finish();resolve();});if(options.signal?.aborted)abort();});check();if(reject)return reply({error:{code:'UNAVAILABLE'}},503);}
  if(stream==='content-snapshot'||stream==='validate')return reply(snapshot());
  if(u.pathname.includes('/recommendations/')&&stream!=='recommendations'){
   const n=Number(u.pathname.split('/').at(-2)!.slice(-12))-100,c=child(n);
   return reply({recommendation:{...c,categoryRevision:String(revision),note:null,entity:{id:id(999),kind:'movie',title:`Movie ${n}`},displayOverrides:{},displayTitle:`Movie ${n}`}});
  }
  const recommendations=Array.from({length:43},(_,n)=>child(n));
  const all=stream==='collections'?Array.from({length:14},(_,n)=>({id:n===0?list:id(500+n),accountId:account,category:'movies',title:`List ${n}`,slug:`list-${n}`,visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,isSample:false,archived:false,displayOrder:n})):
   stream==='recommendations'?recommendations:stream==='memberships'?recommendations.map((r,n)=>({recommendationId:r.id,collectionId:list,collectionRevision:1,displayOrder:n,collectionArchived:false,recommendationArchived:false})):stream==='top-picks'?pins:[];
  const offset=u.searchParams.has('cursor')?24:0;
  return reply({version:'explorers-owner-content/v2',snapshotToken:'fixture',snapshot:String(revision),expiresAt,items:all.slice(offset,offset+24),nextCursor:offset+24<all.length?stream+'-page2':null,...(stream==='top-picks'?{pinRevision}:{})});
 };
 vi.stubGlobal('fetch',(input:string,options:RequestInit={})=>track(transport(input,options)));
 return {close(){closed=true;hold?.release();},async drain(){for(const result of reader.mock.results)if(result.type==='return')track(result.value);try{await waitFor(()=>expect(active.size).toBe(0),{timeout:4000});}finally{reader.mockRestore();}},writes,get pins(){return pins;},hold(g:ReturnType<typeof gate>){hold=g;},reject(){reject=true;}};
}
export function context(){
 const original=useAuthStore.getState(),storage=localStorage.getItem('auth-storage');
 useAuthStore.setState({accountId:account,generation:10,isAuthenticated:true,status:'active-complete',user:{id:id(9),documentId:account,username:'fixture',email:'fixture@example.invalid',blocked:false}});
 const query=new QueryClient({defaultOptions:{queries:{retry:false}}});
 return {wrap:(element:React.ReactNode)=>createElement(QueryClientProvider,{client:query},createElement(MemoryRouter,{initialEntries:[{pathname:`/recommendations/movies/${list}`,state:{justAddedRecommendation:true}}]},element)),restore:()=>{cleanup();query.clear();useAuthStore.setState(original,true);if(storage===null)localStorage.removeItem('auth-storage');else localStorage.setItem('auth-storage',storage);vi.unstubAllGlobals();}};
}
