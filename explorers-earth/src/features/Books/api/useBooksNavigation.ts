import {useCallback,useEffect,useRef,useState} from 'react';
import type {AccountDto} from '../../../../../tunes/shared/explorersContract';
import useAuthStore from '../../../store/store';
import {explorersApiClient} from '../../../lib/explorersApiClient';
import {publishPublicProfileInvalidation} from '../../PublicHome/api/publicProfileInvalidation';

export function useBooksNavigation(){
 const generation=useAuthStore(s=>s.generation),accountId=useAuthStore(s=>s.accountId);
 const [account,setAccount]=useState<AccountDto>(),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 const sequence=useRef(0),mounted=useRef(true);
 const current=useCallback(()=>mounted.current&&useAuthStore.getState().generation===generation&&useAuthStore.getState().accountId===accountId,[generation,accountId]);
 const refresh=useCallback(async()=>{const n=++sequence.current;try{const value=await explorersApiClient.getMyProfile();if(current()&&n===sequence.current){if(value.id!==accountId)throw new Error('Account changed. Reopen Books.');setAccount(value);setError(undefined);}}catch(e){if(current()&&n===sequence.current)setError(e instanceof Error?e.message:'Could not load category settings');}},[current,accountId]);
 useEffect(()=>{mounted.current=true;setAccount(undefined);setBusy(false);void refresh();return()=>{mounted.current=false;++sequence.current;};},[refresh]);
 const request=async(intent:{category:'public_books';action:'publish'|'unpublish'},origin:unknown)=>{
  if(busy||!origin||!current()||(origin as {generation:number;accountDocumentId:string}).generation!==generation||(origin as {accountDocumentId:string}).accountDocumentId!==accountId)return;setBusy(true);setError(undefined);
  try{
   const profile=await explorersApiClient.getMyProfile();if(!current()||profile.id!==accountId)return;
   if(intent.action==='publish'){
    const content=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'books',status:'active'});
    if(!content.collections.some(c=>c.publicationState==='published'&&c.visibility==='public')){if(current())setError('no-content');return;}
   }
   if(!current())return;
   const visible=intent.action==='publish';
   const categories=profile.categories.map(c=>({...c,...(c.category==='books'?{isPublic:visible,...(!visible?{pinnedOrder:null}:{})}:{})}));
   const saved=await explorersApiClient.updateAccount({expectedRevision:profile.revision,categories});
   if(!current())return;setAccount(saved);
   publishPublicProfileInvalidation({accountDocumentId:saved.id,username:saved.handle??'',category:'public_books',action:intent.action,eventId:crypto.randomUUID()});
  }catch(e){if(current())setError(e instanceof Error?e.message:'Category settings could not be saved');}finally{if(current())setBusy(false);}
 };
 return {snapshot:account?{visibility:{public_books:account.categories.some(c=>c.category==='books'&&c.isPublic)?'Yes':'No'}}:undefined,authority:account?{accountDocumentId:account.id,generation}:undefined,busy,error,refresh,request};
}
