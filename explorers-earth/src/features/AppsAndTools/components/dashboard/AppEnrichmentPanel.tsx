import {useEffect,useState} from 'react';
import type {RecommendationObservation} from '../../../../lib/explorersApiClient';
import {appSelectableFields,type AppSelectedField} from '../../../../../../tunes/shared/explorersAppEnrichmentContract';
import {AppEnrichmentClient} from '../../api/appEnrichmentClient';
import {useAppEnrichment} from '../../hooks/useAppEnrichment';
const labels={title:'Title',description:'Description',priceTier:'Price',platforms:'Platforms'};
export default function AppEnrichmentPanel({observed,onAccepted,onReload,onBusyChange,disabled=false}:{observed:RecommendationObservation;onAccepted:()=>void;onReload?:()=>void;onBusyChange?:(busy:boolean)=>void;disabled?:boolean}){
 const enrichment=useAppEnrichment(observed,onAccepted),[selection,setSelection]=useState<{snapshotId:string;fields:AppSelectedField[]}>();
 const locked=disabled||enrichment.busy||enrichment.conflict||Boolean(enrichment.retry);
 useEffect(()=>{onBusyChange?.(enrichment.busy||Boolean(enrichment.retry));},[enrichment.busy,enrichment.retry,onBusyChange]);
 return <section aria-label="App enrichment" className="rounded-2xl border border-dashboard-border bg-dashboard-sidebar p-5 space-y-3">
  <h2 className="font-semibold">Suggested app details</h2>
  <p className="text-sm">No approved enrichment source is available to configure. Your manual details remain editable.</p>
  <p className="text-sm">Accepting saves only the fields you select. Save any manual edits first; unsaved edits are not included in acceptance.</p>
  {enrichment.loading&&<p role="status">Loading suggestions…</p>}
  {enrichment.data?.binding&&<div><p>Automatic enrichment: {enrichment.data.binding.optIn?'Enabled':'Disabled'}</p>{enrichment.data.binding.optIn&&<button disabled={locked} onClick={()=>{void enrichment.run(AppEnrichmentClient.prepareDisable(observed,enrichment.data!.binding!));}}>Disable enrichment</button>}</div>}
  {enrichment.data&&enrichment.data.suggestions.length===0&&<p>No owned suggestions are available.</p>}
  {enrichment.data?.binding?.currentGenerationId&&enrichment.data.suggestions.map(snapshot=><fieldset key={snapshot.snapshotId} className="border border-dashboard-border rounded-xl p-3 space-y-2">
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
