import {useEffect,useState} from 'react';
import type {RecommendationObservation} from '../../../../lib/explorersApiClient';
import {appSelectableFields,type AppSelectedField} from '../../../../../../tunes/shared/explorersAppEnrichmentContract';
import {AppEnrichmentClient} from '../../api/appEnrichmentClient';
import {useAppEnrichment} from '../../hooks/useAppEnrichment';
const labels={title:'Title',description:'Description',priceTier:'Price',platforms:'Platforms'};
export default function AppEnrichmentPanel({observed,onAccepted,onReload,onBusyChange,disabled=false,manualDirty=false}:{observed:RecommendationObservation;onAccepted:()=>void;onReload?:()=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean;manualDirty?:boolean}){
 const enrichment=useAppEnrichment(observed,onAccepted),[selection,setSelection]=useState<{snapshotId:string;fields:AppSelectedField[]}>(),[sourceSelection,setSourceSelection]=useState<{scope:string;key:string}>();
 const scope=JSON.stringify([observed.accountId,observed.generation,observed.resourceId,observed.detail?.entityId,window.location.pathname,window.location.search,window.location.hash]),sources=enrichment.data?.sources??[];
 const sourceKey=(identity:typeof sources[number]['identity'])=>JSON.stringify([identity.sourceId,identity.sourceIdentity,identity.sourceIdentityHash,identity.canonicalizationVersion]);
 const sourceIndex=sourceSelection?.scope===scope?sources.findIndex(choice=>sourceKey(choice.identity)===sourceSelection.key):-1,choice=sourceIndex>=0?sources[sourceIndex]:undefined;
 const binding=enrichment.data?.binding,sameCurrentSource=Boolean(choice&&binding?.currentSource&&sourceKey(choice.identity)===sourceKey(binding.currentSource));
 const locked=disabled||manualDirty||enrichment.loading||enrichment.busy||enrichment.conflict||Boolean(enrichment.retry);
 const generation=enrichment.data?.binding?.currentGenerationId;
 useEffect(()=>{setSelection(undefined);},[scope,generation]);
 useEffect(()=>{onBusyChange?.(enrichment.busy||Boolean(enrichment.retry));},[enrichment.busy,enrichment.retry,onBusyChange]);
 return <section aria-label="App enrichment" className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
  <h2 className="font-semibold">Suggested app details</h2>
  {enrichment.data&&sources.length===0&&<p className="text-sm">No approved enrichment source is available to configure. Your manual details remain editable.</p>}
  {sources.length>0&&<div className="space-y-2"><label className="block">Enrichment source<select aria-label="Enrichment source" className="block w-full rounded-xl bg-dashboard-muted p-2" disabled={locked} value={sourceIndex<0?'':String(sourceIndex)} onChange={event=>{const selected=sources[Number(event.target.value)];setSourceSelection(event.target.value!==''&&selected?{scope,key:sourceKey(selected.identity)}:undefined);}}><option value="">Choose a source</option>{sources.map((source,index)=><option key={sourceKey(source.identity)} value={String(index)}>{source.label}</option>)}</select></label>{choice&&<a href={choice.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-sm break-all">{choice.sourceUrl}</a>}<button disabled={locked||!choice||Boolean(binding?.optIn&&sameCurrentSource)} onClick={()=>{if(!choice||!enrichment.data)return;void enrichment.run(binding?(sameCurrentSource?AppEnrichmentClient.prepareConfigure(observed,binding,choice):AppEnrichmentClient.prepareRebind(observed,binding,choice)):AppEnrichmentClient.prepareConfigure(observed,null,choice));}}>{binding?(sameCurrentSource&&!binding.optIn?'Re-enable nightly refresh':'Change source'):'Enable nightly refresh'}</button></div>}
  {manualDirty&&<p className="text-sm">Save or revert your manual edits before changing enrichment or accepting suggestions.</p>}
  <p className="text-sm">Accepting saves only the fields you select. Save any manual edits first; unsaved edits are not included in acceptance.</p>
  {enrichment.loading&&<p role="status">Loading suggestions…</p>}
  {enrichment.data?.binding&&<div><p>Automatic enrichment: {enrichment.data.binding.optIn?'Enabled':'Disabled'}</p>{enrichment.data.binding.optIn&&<button disabled={locked} onClick={()=>{void enrichment.run(AppEnrichmentClient.prepareDisable(observed,enrichment.data!.binding!));}}>Disable enrichment</button>}</div>}
  {enrichment.data&&enrichment.data.suggestions.length===0&&<p>No owned suggestions are available.</p>}
  {enrichment.data?.binding?.currentGenerationId&&enrichment.data.suggestions.map(snapshot=><fieldset key={snapshot.snapshotId} className="min-w-0 border border-dashboard-border rounded-xl p-3 space-y-2">
   <legend>Observed {new Date(snapshot.fetchedAt).toLocaleString()}</legend>
   {appSelectableFields.filter(field=>Object.prototype.hasOwnProperty.call(snapshot.fields,field)).map(field=><div key={field}>
    <label><input type="checkbox" aria-label={labels[field]} disabled={locked} checked={selection?.snapshotId===snapshot.snapshotId&&selection.fields.includes(field)} onChange={event=>setSelection(current=>{const fields=current?.snapshotId===snapshot.snapshotId?current.fields:[];return {snapshotId:snapshot.snapshotId,fields:event.target.checked?[...fields,field]:fields.filter(item=>item!==field)};})}/>{labels[field]}</label>
    <p>{Array.isArray(snapshot.fields[field])?(snapshot.fields[field] as string[]).join(', ')||'No platforms':snapshot.fields[field]??'Not stated'}</p>
    <a href={snapshot.fieldProvenance[field]!.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a><span> · {new Date(snapshot.fieldProvenance[field]!.observedAt).toLocaleString()}</span>
   </div>)}
   <button disabled={locked||selection?.snapshotId!==snapshot.snapshotId||!selection.fields.length} onClick={()=>{void enrichment.run(AppEnrichmentClient.prepareAcceptance(observed,enrichment.data!.binding!,snapshot.snapshotId,appSelectableFields.filter(field=>selection?.fields.includes(field))));}}>Accept selected fields</button>
  </fieldset>)}
  {enrichment.error&&<p role="alert">{enrichment.error}</p>}
  {enrichment.conflict&&onReload&&<div><p>Reloading discards unsaved manual edits.</p><button onClick={onReload}>Reload editor</button></div>}
  {enrichment.retry&&!enrichment.conflict&&<button disabled={disabled||enrichment.busy} onClick={()=>void enrichment.run(enrichment.retry!)}>Retry same request</button>}
  {!enrichment.retry&&enrichment.error&&<button disabled={enrichment.busy} onClick={enrichment.refresh}>Reload suggestions</button>}
 </section>;
}
