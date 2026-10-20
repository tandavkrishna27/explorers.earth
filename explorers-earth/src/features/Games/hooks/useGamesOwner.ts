import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import {readGamesOwnerContent,type GamesOwnerContent} from '../api/explorersAdapter';
const changes=new EventTarget();export const invalidateGames=()=>changes.dispatchEvent(new Event('change'));
/** `keep` retains the last read of the same owner and route while a refresh is in flight, so a screen that triggered the refresh is not replaced by its loading state. */
export function useGamesOwner(listId?:string,enabled=true,keep=false){
 const generation=useAuthStore(state=>state.generation),accountId=useAuthStore(state=>state.accountId),location=useLocation(),scope=JSON.stringify([generation,accountId,location.pathname]);
 const [received,setReceived]=useState<{scope:string;content:GamesOwnerContent}>(),[loading,setLoading]=useState(enabled),[error,setError]=useState<Error>(),[revision,setRevision]=useState(0);const attempt=useRef(0);
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);useEffect(()=>{changes.addEventListener('change',refresh);return()=>changes.removeEventListener('change',refresh);},[refresh]);
 useEffect(()=>{const controller=new AbortController(),identity=++attempt.current;setReceived(previous=>keep&&previous?.scope===scope?previous:undefined);setError(undefined);if(!enabled||!accountId){setLoading(false);return()=>controller.abort();}setLoading(true);void readGamesOwnerContent(controller.signal).then(content=>{if(!controller.signal.aborted&&attempt.current===identity)setReceived({scope,content});}).catch(failure=>{if(!controller.signal.aborted&&attempt.current===identity)setError(failure instanceof Error?failure:new Error('Games could not be loaded'));}).finally(()=>{if(!controller.signal.aborted&&attempt.current===identity)setLoading(false);});return()=>controller.abort();},[scope,enabled,revision,accountId,keep]);
 const content=received?.scope===scope?received.content:undefined;const data=useMemo(()=>content?{gameLists:content.view.lists.filter(list=>!listId||list.documentId===listId)}:undefined,[content,listId]);
 return {state:{content,data,loading,error},refresh,observations:content,content,data,loading,error,refetch:refresh};
}
