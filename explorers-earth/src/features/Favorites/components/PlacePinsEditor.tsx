import {useEffect,useMemo,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import useAuthStore from '../../../store/store';
import type {PlacesOwnerContent} from '../api/explorersAdapter';
import type {RecommendedPlaceView} from '../api/placesViewModel';
import type {PlacePinsIntent} from '../api/placePinsIntent';
import {usePlacesCommands} from '../api/placesCommands';

// Finding 6. `disabled` is set while the owner read is in flight. The editor stays mounted
// on the retained snapshot so an open draft is not destroyed, but every mutating control
// is inert, because the retained observation is known to be behind the server.
type Props={owner:PlacesOwnerContent;listId:string;reload:()=>void;disabled?:boolean;request?:{id:string;nonce:number}};
type Draft={observation:PlacesOwnerContent['observation'];rows:readonly RecommendedPlaceView[];ids:string[]};
const title=(row:RecommendedPlaceView)=>row.Contact_Name||row.Place_Details.Title;
export function PlacePinsEditor({owner,listId,reload,disabled=false,request}:Props){
 const commands=usePlacesCommands(listId),location=useLocation(),generation=useAuthStore(state=>state.generation),accountId=useAuthStore(state=>state.accountId);
 const scope=JSON.stringify([accountId,generation,location.pathname,location.key,listId]),current=useRef(scope);current.current=scope;
 const commandRef=useRef(commands);commandRef.current=commands;
 const mounted=useRef(true),intent=useRef<PlacePinsIntent>(),attempt=useRef(0),seenRequest=useRef<number>();
 const [draft,setDraft]=useState<Draft>(),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string>();
 const dialog=useRef<HTMLElement>(null),openEditor=Boolean(draft),rowsById=useMemo(()=>new Map(draft?.rows.map(row=>[row.documentId,row])),[draft?.rows]),selectedIds=useMemo(()=>new Set(draft?.ids),[draft?.ids]);
 useEffect(()=>{if(!openEditor)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:undefined;dialog.current?.focus();return()=>{if(previous?.isConnected)previous.focus();};},[openEditor]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++attempt.current;if(intent.current)commandRef.current.retirePins(intent.current);};},[]);
 useEffect(()=>{++attempt.current;if(intent.current)commandRef.current.retirePins(intent.current);intent.current=undefined;setDraft(undefined);setError(undefined);setAvailable(false);setBusy(false);seenRequest.current=undefined;},[scope]);
 const fresh=():Draft|undefined=>{const list=owner.view.lists.find(row=>row.documentId===listId);if(!list)return;const rows=list.recommended_places;return {observation:owner.observation,rows,ids:rows.filter(row=>row.is_pinned).sort((a,b)=>(a.pin_order??0)-(b.pin_order??0)||a.documentId.localeCompare(b.documentId)).map(row=>row.documentId)};};
 const check=(captured:string,token:number)=>mounted.current&&current.current===captured&&attempt.current===token;
 const loadAvailability=async(value:Draft)=>{const captured=scope,token=++attempt.current;setBusy(true);setError(undefined);try{const policy=await commands.pinsAvailability(value.observation,listId);if(check(captured,token)){setAvailable(policy.available);if(!policy.available)setError('Pinning is unavailable for this list. Your current pins are unchanged.');}}catch(failure){if(check(captured,token)){setAvailable(false);setError(`Pinning is unavailable. ${failure instanceof Error?failure.message:'Retry loading the list.'}`);}}finally{if(check(captured,token))setBusy(false);}};
 const open=(id?:string)=>{
  // Finding 6. While the owner read is in flight the retained observation is known to be
  // behind the server, so no availability probe or draft mutation is started against it.
  if(disabled){setError('Reloading this list. Pin changes are paused.');return;}
  if(intent.current){setError('Retry or discard the current pin draft before changing it.');return;}const value=draft??fresh();if(!value)return;const next=id?{...value,ids:value.ids.includes(id)?value.ids.filter(pin=>pin!==id):[...value.ids,id]}:value;if(id&&!value.rows.some(row=>row.documentId===id))return;setDraft(next);void loadAvailability(next);};
 useEffect(()=>{if(request&&request.nonce!==seenRequest.current){seenRequest.current=request.nonce;open(request.id);}},[request]);
 const edit=(ids:string[])=>{if(draft&&!intent.current&&!busy&&!disabled)setDraft({...draft,ids});};
 // Finding 11. Escape and an explicit Close give the modal a real exit. Previously the only
 // ways out were a successful save or a discard that forced a full owner re-read. A staged
 // intent is never silently dropped: while one exists the dialog still insists on retry or
 // abort, which is the same rule the discard controls already enforce.
 const close=()=>{if(busy)return;if(intent.current){setError('Retry or abort the staged pin draft before closing.');return;}setDraft(undefined);setError(undefined);setAvailable(false);};
 const save=async()=>{if(!draft||busy||disabled)return;const captured=scope,token=++attempt.current;setBusy(true);setError(undefined);try{intent.current??=commands.preparePins(draft.observation,listId,draft.ids);await commands.savePins(intent.current);if(check(captured,token)){commandRef.current.retirePins(intent.current);intent.current=undefined;setDraft(undefined);}}catch(failure){if(check(captured,token))setError(`${failure instanceof Error?failure.message:'Pins could not be saved.'} Your pin draft is retained.`);}finally{if(check(captured,token))setBusy(false);}};
 const discard=async(reloadOwner:boolean)=>{if(busy||intent.current&&!intent.current.canDiscard)return;const captured=scope,token=++attempt.current;setBusy(true);setError(undefined);try{if(intent.current){await commands.abortPins(intent.current);if(!check(captured,token))return;intent.current=undefined;}if(check(captured,token)){if(reloadOwner){setDraft(undefined);reload();}else setError('Staging aborted. Your live pins are unchanged; your editor draft is retained.');}}catch(failure){if(check(captured,token))setError(`${failure instanceof Error?failure.message:'Staging could not be aborted.'} Your draft is retained.`);}finally{if(check(captured,token))setBusy(false);}};
 const locked=busy||disabled||Boolean(intent.current),canDiscard=!busy&&!disabled&&(!intent.current||intent.current.canDiscard);
 const button='rounded-lg border border-dashboard-accent px-3 py-2 text-sm text-dashboard hover:bg-dashboard-muted disabled:opacity-40';
 return <>
  <button type="button" className={button} disabled={disabled} onClick={()=>open()}>Edit pinned places</button>
  {draft&&<section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Pinned places in this list" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close();return;}if(event.key!=='Tab')return;const controls=Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}}} className="fixed inset-0 z-[160] bg-dashboard-overlay p-4 flex items-center justify-center">
   <div className="bg-dashboard-modal border border-dashboard-accent rounded-xl p-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
    {/* Finding 11. The close affordance a role="dialog" aria-modal="true" needs. */}
    <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-semibold text-dashboard">Pinned places in this list</h2><button type="button" className={button} aria-label="Close pinned places editor" onClick={close} disabled={busy}>Close</button></div>
    <p className="text-sm text-dashboard-muted">{draft.ids.length} pinned places</p>
    <p className="text-sm text-dashboard-muted mb-3">Pins appear first in the order you choose. Saving pins does not publish a place.</p>
    {error&&<p role="alert" className="text-dashboard mb-3">{error}</p>}
    {busy&&<p role="status">Saving or checking pin availability…</p>}
    {!available&&!busy&&!disabled&&!intent.current&&<button type="button" className={button} onClick={()=>void loadAvailability(draft)}>Retry availability</button>}
    <ol className="space-y-2 my-3" aria-label="Ordered pinned places">{draft.ids.map((id,index)=>{const row=rowsById.get(id);if(!row)return null;const name=title(row);return <li key={id} className="flex flex-wrap items-center gap-2 border border-white/10 rounded-lg p-2"><span className="flex-1 text-dashboard">{index+1}. {name}</span><button type="button" className={button} aria-label={`Move ${name} up`} disabled={locked||index===0} onClick={()=>{const ids=[...draft.ids];[ids[index-1],ids[index]]=[ids[index],ids[index-1]];edit(ids);}}>↑</button><button type="button" className={button} aria-label={`Move ${name} down`} disabled={locked||index===draft.ids.length-1} onClick={()=>{const ids=[...draft.ids];[ids[index],ids[index+1]]=[ids[index+1],ids[index]];edit(ids);}}>↓</button><button type="button" className={button} aria-label={`Unpin ${name}`} disabled={locked} onClick={()=>edit(draft.ids.filter(pin=>pin!==id))}>Unpin</button></li>;})}</ol>
    <div className="space-y-2 mb-3" aria-label="Other places in this list">{draft.rows.filter(row=>!selectedIds.has(row.documentId)).map(row=><div key={row.documentId} className="flex items-center gap-2"><span className="flex-1 text-dashboard">{title(row)}</span><button type="button" className={button} aria-label={`Pin ${title(row)}`} disabled={locked} onClick={()=>edit([...draft.ids,row.documentId])}>Pin</button></div>)}</div>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={locked} onClick={()=>edit([])}>Clear all pins</button>{available&&<button type="button" className={button} disabled={busy||disabled} onClick={()=>void save()}>{intent.current?'Retry save':'Save pins'}</button>}{intent.current?.hasDraft&&<button type="button" className={button} disabled={!canDiscard} onClick={()=>void discard(false)}>Abort staging</button>}<button type="button" className={button} disabled={!canDiscard} onClick={()=>void discard(true)}>Discard draft and reload</button></div>
    {intent.current&&!intent.current.canDiscard&&!busy&&<p className="text-sm text-dashboard-muted mt-2">Retry save to recover the original acknowledgement before discarding.</p>}
   </div>
  </section>}
 </>;
}
