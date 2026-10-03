import {useState} from 'react';
import {explorersApiClient} from '../../../lib/explorersApiClient';
import {booksCommandKey,updateBookList} from './booksClient';
type ListPatch={documentId:string;List_Name?:string;list_description?:string|null;top_reads_heading?:string|null;slug?:string;visibility?:boolean};
export function useBookListCommands(){
 const [loading,setLoading]=useState(false);
 const update=async({variables}:{variables:ListPatch;optimisticResponse?:unknown})=>{
  setLoading(true);try{
   const {documentId,List_Name,list_description,top_reads_heading,slug,visibility}=variables;
   return await updateBookList(documentId,{...(List_Name===undefined?{}:{title:List_Name}),...(list_description===undefined?{}:{description:list_description}),...(top_reads_heading===undefined?{}:{heading:top_reads_heading}),...(slug===undefined?{}:{slug}),...(visibility===undefined?{}:{visibility})});
  }finally{setLoading(false);}
 };
 const archive=async({variables}:{variables:{documentId:string}})=>{
  const observation=await explorersApiClient.getMyEditableCollection(variables.documentId);
  return explorersApiClient.archiveMyCollection(observation,booksCommandKey());
 };
 return {update,archive,loading};
}
