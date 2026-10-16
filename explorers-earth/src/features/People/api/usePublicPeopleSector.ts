import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {publicPeopleSectorPageSchema,type PublicPeopleSectorPage} from '../../../../../tunes/shared/explorersPublicPeopleSectorContract';
import {publicProfileGatewayClient} from '../../PublicHome/api/publicProfileGatewayClient';
import {subscribePublicProfileInvalidation} from '../../PublicHome/api/publicProfileInvalidation';
import {accountPublicPeoplePage} from './publicPeopleSectorViewModel';

type State={scope:string|undefined;data:PublicPeopleSectorPage|undefined;loading:boolean;error:unknown|null};
const empty=(scope:string|undefined,loading=false):State=>({scope,data:undefined,loading,error:null});
async function cancellable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
 let stop!:()=>void;const aborted=new Promise<never>((_resolve,reject)=>{stop=()=>reject(Error('PUBLIC_PROFILE_ABORTED'));signal.addEventListener('abort',stop,{once:true});});
 try{return await Promise.race([work,aborted]);}finally{signal.removeEventListener('abort',stop);}
}
export function usePublicPeopleSector(username:string|undefined,sectorSlug:string|undefined,enabled:boolean){
 const normalized=username?.trim().toLowerCase(),scope=normalized&&sectorSlug?`${normalized}\u0000${sectorSlug}`:undefined;
 const config=useRef({normalized,sectorSlug,enabled,scope});useLayoutEffect(()=>{config.current={normalized,sectorSlug,enabled,scope};});
 const [state,setState]=useState(()=>empty(scope,enabled&&Boolean(scope)));
 const generation=useRef(0),controller=useRef<AbortController>();
 const cancel=useCallback(()=>{++generation.current;controller.current?.abort();controller.current=undefined;},[]);
 const refetch=useCallback(async()=>{
  cancel();const c=config.current;if(!c.enabled||!c.scope)return;
  const token=generation.current,active=new AbortController();controller.current=active;
  const current=()=>generation.current===token&&!active.signal.aborted&&config.current.enabled&&config.current.scope===c.scope;
  setState(empty(c.scope,true));
  try{
   let restarted=false;const budget={bytes:0};
   for(;;){
    let cursor:string|null=null,first:PublicPeopleSectorPage|undefined;const people:PublicPeopleSectorPage['recommended_people']=[],seen=new Set<string>(),ids=new Set<string>();
    try{
     do{
      if(!current())return;
      const raw=await cancellable(publicProfileGatewayClient.peopleSectorPage(c.normalized!,c.sectorSlug!,{limit:24,...(cursor?{cursor}:{})},active.signal),active.signal);
      if(!current())return;
      accountPublicPeoplePage(raw,budget);
      const parsed=publicPeopleSectorPageSchema.safeParse(raw);if(!parsed.success)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');const page=parsed.data;
      if(page.recommended_people.length===0&&page.nextCursor!==null)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
      if(page.canonicalSlug!==page.sector.slug||page.redirectSlug!==null&&page.redirectSlug!==page.canonicalSlug||page.redirectSlug===null&&c.sectorSlug!==page.canonicalSlug)throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
      if(first&&(first.sector.documentId!==page.sector.documentId||first.canonicalSlug!==page.canonicalSlug||first.sector.Category_name!==page.sector.Category_name))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
      first??=page;
      for(const person of page.recommended_people){if(ids.has(person.documentId))throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');ids.add(person.documentId);people.push(person);}
      cursor=page.nextCursor;
      if(cursor!==null){if(!cursor||seen.has(cursor))throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');seen.add(cursor);}
     }while(cursor!==null);
     if(current())setState({scope:c.scope,data:{...first!,recommended_people:people,nextCursor:null},loading:false,error:null});return;
    }catch(error){
     if(!current())return;
     if(cursor!==null&&!restarted&&error instanceof Error&&error.message==='PUBLIC_PROFILE_400'){restarted=true;continue;}
     throw error;
    }
   }
  }catch(error){if(current())setState({...empty(c.scope),error});}
  finally{if(controller.current===active)controller.current=undefined;}
 },[cancel]);
 useEffect(()=>{if(enabled&&scope)void refetch();else{cancel();setState(empty(scope));}return cancel;},[scope,enabled,cancel,refetch]);
 useEffect(()=>subscribePublicProfileInvalidation(event=>{if(event.username.trim().toLowerCase()===normalized&&(event.category==='public_people'||event.category==='public_profile')){cancel();setState(empty(scope,enabled));if(enabled)void refetch();}}),[scope,normalized,enabled,cancel,refetch]);
 const visible=enabled&&scope&&state.scope===scope?state:empty(scope,enabled&&Boolean(scope));
 return {...visible,refetch};
}
