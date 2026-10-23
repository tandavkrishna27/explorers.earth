import {useEffect,useState} from 'react';
import {explorersApiClient} from './explorersApiClient';
import type {FlatCuratedCategory} from '../../../tunes/shared/explorersTaxonomyContract';

export type CuratedTerm={id:string;label:string;parentId:string|null;slug:string};
type State={terms:CuratedTerm[];unconfigured:boolean;loading:boolean;error:Error|null};
const cache=new Map<string,Promise<{terms:CuratedTerm[];unconfigured:boolean}>>();

export function useCuratedCatalog(category:FlatCuratedCategory|'movies'):State{
 const [state,setState]=useState<State>({terms:[],unconfigured:false,loading:true,error:null});
 useEffect(()=>{let live=true;
  const pending=cache.get(category)??explorersApiClient.getCompleteTaxonomyCatalog({category}).then(page=>({unconfigured:page.state!=='CONFIGURED',terms:page.items.map(i=>({id:i.id,label:i.label,parentId:i.parentId,slug:i.slug}))}));
  cache.set(category,pending);pending.catch(()=>cache.delete(category));
  pending.then(v=>{if(live)setState({...v,loading:false,error:null});},(error:Error)=>{if(live)setState(s=>({...s,loading:false,error}));});
  return ()=>{live=false;};},[category]);
 return state;
}

const words=(value:string)=>value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** First curated term whose label words all appear in one provider label, else whose slug starts with
 * a provider-label word (IGDB "Platform" -> "platformer"). Pre-selection only; the owner can change it. */
export function suggestTermFromLabels(terms:readonly CuratedTerm[],labels:readonly string[]):string|null{
 for(const label of labels){
  const have=words(label),set=new Set(have);
  const hit=terms.find(t=>words(t.label).filter(w=>w!=='and').every(w=>set.has(w)))
   ??terms.find(t=>have.some(w=>w.length>=4&&t.slug.toLowerCase().startsWith(w)));
  if(hit)return hit.id;
 }
 return null;
}
