import {useCallback,useEffect,useRef,useState} from 'react';
import useAuthStore from '../../../store/store';
import {readBooksOwnerContent,type BooksOwnerContent} from './booksClient';
export function useBooksOwnerContent(listId?:string){
 const generation=useAuthStore(s=>s.generation),accountId=useAuthStore(s=>s.accountId);
 const scope=JSON.stringify([generation,accountId]);
 const [received,setReceived]=useState<{scope:string;content:BooksOwnerContent}>();
 const [status,setStatus]=useState<{scope:string;loading:boolean;error?:Error}>({scope,loading:Boolean(accountId)});
 const sequence=useRef(0),abort=useRef<AbortController>(),mounted=useRef(false);
 const refetch=useCallback(async()=>{
  const ownsAuthority=()=>{const current=useAuthStore.getState();return current.generation===generation&&current.accountId===accountId;};
  // A saved callback from another authority must not even cancel current work.
  if(!mounted.current||!accountId||!ownsAuthority())return;
  const current=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;
  const isCurrent=()=>mounted.current&&sequence.current===current&&!controller.signal.aborted&&ownsAuthority();
  setStatus({scope,loading:true});
  try{const value=await readBooksOwnerContent(controller.signal);if(isCurrent()){setReceived({scope,content:value});return value;}}
  catch(failure){if(isCurrent())setStatus({scope,loading:true,error:failure instanceof Error?failure:new Error('Books could not be loaded')});}
  finally{if(isCurrent())setStatus(previous=>previous.scope===scope?{...previous,loading:false}:previous);}
 },[generation,accountId,scope]);
 useEffect(()=>{mounted.current=true;setReceived(undefined);if(accountId)void refetch();else setStatus({scope,loading:false});return()=>{mounted.current=false;++sequence.current;abort.current?.abort();};},[refetch,accountId,scope]);
 // Passive cleanup cannot protect the account-transition render/layout frame.
 const content=received?.scope===scope?received.content:undefined;
 const visibleStatus=status.scope===scope?status:{scope,loading:Boolean(accountId)};
 const lists=content?.lists??[];
 return {content,data:content?{bookLists:listId?lists.filter(list=>list.documentId===listId):lists}:undefined,loading:visibleStatus.loading,error:visibleStatus.error,refetch};
}
