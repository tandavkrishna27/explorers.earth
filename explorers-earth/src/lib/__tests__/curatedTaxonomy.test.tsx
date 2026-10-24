import {renderHook,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {explorersApiClient} from '../explorersApiClient';
import {useCuratedCatalog,suggestTermFromLabels} from '../curatedTaxonomy';

it('loads the complete catalog once and maps it to combobox terms',async()=>{
 vi.spyOn(explorersApiClient,'getCompleteTaxonomyCatalog').mockResolvedValue({state:'CONFIGURED',items:[{id:'t1',slug:'fantasy',label:'Fantasy',parentId:null,position:0}]} as never);
 const {result}=renderHook(()=>useCuratedCatalog('books'));
 await waitFor(()=>expect(result.current.terms).toEqual([{id:'t1',label:'Fantasy',parentId:null,slug:'fantasy'}]));
 expect(result.current.unconfigured).toBe(false);
});
it('an unconfigured catalog hides the picker instead of failing',async()=>{
 vi.spyOn(explorersApiClient,'getCompleteTaxonomyCatalog').mockResolvedValue({state:'UNCONFIGURED',items:[]} as never);
 const {result}=renderHook(()=>useCuratedCatalog('apps'));
 await waitFor(()=>expect(result.current.unconfigured).toBe(true));
});
it('reuses a cached catalog for 5 minutes, then fetches it again',async()=>{
 let now=1_000_000;const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
 const fetch=vi.spyOn(explorersApiClient,'getCompleteTaxonomyCatalog');fetch.mockReset();fetch
  .mockResolvedValueOnce({state:'CONFIGURED',items:[{id:'old',slug:'old',label:'Old',parentId:null,position:0}]} as never)
  .mockResolvedValueOnce({state:'CONFIGURED',items:[{id:'new',slug:'new',label:'New',parentId:null,position:0}]} as never);
 const first=renderHook(()=>useCuratedCatalog('products'));
 await waitFor(()=>expect(first.result.current.terms.map(t=>t.id)).toEqual(['old']));first.unmount();
 now+=5*60_000-1;
 const second=renderHook(()=>useCuratedCatalog('products'));
 await waitFor(()=>expect(second.result.current.terms.map(t=>t.id)).toEqual(['old']));second.unmount();
 expect(fetch).toHaveBeenCalledTimes(1);
 now+=2;
 const third=renderHook(()=>useCuratedCatalog('products'));
 await waitFor(()=>expect(third.result.current.terms.map(t=>t.id)).toEqual(['new']));
 expect(fetch).toHaveBeenCalledTimes(2);
 clock.mockRestore();fetch.mockRestore();
});
it('suggests a term from provider labels (subjects, IGDB genres)',()=>{
 const terms=[{id:'f',slug:'fantasy',label:'Fantasy',parentId:null},{id:'sf',slug:'science-fiction',label:'Science Fiction',parentId:null},{id:'pl',slug:'platformer',label:'Platformer',parentId:null}];
 expect(suggestTermFromLabels(terms,['Fiction / Fantasy / Epic'])).toBe('f');
 expect(suggestTermFromLabels(terms,['Platform'])).toBe('pl');
 expect(suggestTermFromLabels(terms,['Cooking'])).toBeNull();
});
