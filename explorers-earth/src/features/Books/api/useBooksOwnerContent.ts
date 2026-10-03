import {useCallback,useEffect,useRef,useState} from 'react';
import useAuthStore from '../../../store/store';
import {readBooksOwnerContent,type BooksOwnerContent} from './booksClient';
export function useBooksOwnerContent(listId?:string){
 const generation=useAuthStore(s=>s.generation),accountId=useAuthStore(s=>s.accountId);
 const [content,setContent]=useState<BooksOwnerContent>();const [loading,setLoading]=useState(true);const [error,setError]=useState<Error>();
 const sequence=useRef(0),abort=useRef<AbortController>();
 const refetch=useCallback(async()=>{
  const current=++sequence.current;abort.current?.abort();const controller=new AbortController();abort.current=controller;setLoading(true);setError(undefined);
  try{const value=await readBooksOwnerContent(controller.signal);if(sequence.current===current&&!controller.signal.aborted){setContent(value);return value;}}
  catch(failure){if(sequence.current===current&&!controller.signal.aborted)setError(failure instanceof Error?failure:new Error('Books could not be loaded'));}
  finally{if(sequence.current===current&&!controller.signal.aborted)setLoading(false);}
 },[generation,accountId]);
 useEffect(()=>{setContent(undefined);void refetch();return()=>{++sequence.current;abort.current?.abort();};},[refetch]);
 const lists=content?.lists??[];
 return {content,data:content?{bookLists:listId?lists.filter(list=>list.documentId===listId):lists}:undefined,loading,error,refetch};
}
