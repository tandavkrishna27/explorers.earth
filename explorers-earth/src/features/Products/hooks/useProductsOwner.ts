import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import {readProductsOwnerContent,type ProductsOwnerContent} from '../api/explorersAdapter';

// Ticket 4.4. The owner read for Products, replacing the Apollo/Strapi productLists query. Same
// scoping rule as Games: owner epoch and route are part of the cache key, so a signed-out
// or navigated-away read is never presented as the current owner's content.
const changes=new EventTarget();export const invalidateProducts=()=>changes.dispatchEvent(new Event('change'));
export function useProductsOwner(listId?:string,enabled=true){
 const generation=useAuthStore(state=>state.generation),accountId=useAuthStore(state=>state.accountId),location=useLocation(),scope=JSON.stringify([generation,accountId,location.pathname]);
 const [received,setReceived]=useState<{scope:string;content:ProductsOwnerContent}>(),[loading,setLoading]=useState(enabled),[error,setError]=useState<Error>(),[revision,setRevision]=useState(0);const attempt=useRef(0);
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);useEffect(()=>{changes.addEventListener('change',refresh);return()=>changes.removeEventListener('change',refresh);},[refresh]);
 useEffect(()=>{const controller=new AbortController(),identity=++attempt.current;setReceived(undefined);setError(undefined);if(!enabled||!accountId){setLoading(false);return()=>controller.abort();}setLoading(true);void readProductsOwnerContent(controller.signal).then(content=>{if(!controller.signal.aborted&&attempt.current===identity)setReceived({scope,content});}).catch(failure=>{if(!controller.signal.aborted&&attempt.current===identity)setError(failure instanceof Error?failure:new Error('Products could not be loaded'));}).finally(()=>{if(!controller.signal.aborted&&attempt.current===identity)setLoading(false);});return()=>controller.abort();},[scope,enabled,revision,accountId]);
 const content=received?.scope===scope?received.content:undefined;const data=useMemo(()=>content?{productLists:content.view.lists.filter(list=>!listId||list.documentId===listId)}:undefined,[content,listId]);
 return {state:{content,data,loading,error},refresh,observations:content,content,data,loading,error,refetch:refresh};
}
