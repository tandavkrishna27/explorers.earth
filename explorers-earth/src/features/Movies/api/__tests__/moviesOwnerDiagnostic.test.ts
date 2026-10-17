import {describe,it,expect} from 'vitest';
import {createMoviesOwnerDiagnostic,canonicalMoviesBrowserSnapshot,classifyMoviesDiagnosticButton} from '../moviesOwnerDiagnostic';

const empty={owner:'unavailable',phase:'unavailable',cause:'none',view:'unavailable',list:'unavailable',visibility:'unavailable',signal:'unavailable',guard:'unavailable',prompt:'unavailable'};
const view={list:'ready-nonempty',visibility:'draft',signal:'present',guard:'fresh',prompt:'open'} as const;
describe('Movies bounded fixed-slot publisher',()=>{
 it('is inert without an exact version-one gate and never creates authority',()=>{
  for(const slot of [undefined,null,[],{}, {version:2,snapshot:empty},{version:1,snapshot:empty,secret:'synthetic'}]){
   const target:any=slot===undefined?{}:{__moviesOwnerDiagnostic:slot};
   expect(createMoviesOwnerDiagnostic(target)).toBeUndefined();expect(target.__moviesOwnerDiagnostic).toBe(slot);
  }
 });
 it('resets a new view and fences attempts, replacements and cleanup without retaining an event array',()=>{
  const target:any={__moviesOwnerDiagnostic:{version:1,snapshot:{...empty}}};
  const first=createMoviesOwnerDiagnostic(target)!;
  const stale=first.beginAttempt();stale({owner:'pending'});stale({phase:'detail-fanout',cause:'none'});first.commit(view);
  expect(target.__moviesOwnerDiagnostic.snapshot).toEqual({...empty,...view,owner:'pending',phase:'detail-fanout',view:'active'});
  const live=first.beginAttempt();live({owner:'accepted'});stale({owner:'rejected'});expect(target.__moviesOwnerDiagnostic.snapshot.owner).toBe('accepted');
  const takeover=createMoviesOwnerDiagnostic(target)!;takeover.beginAttempt()({owner:'pending'});takeover.commit({...view,prompt:'closed'});const owned=structuredClone(target.__moviesOwnerDiagnostic.snapshot);
  live({owner:'rejected'});expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(owned);first.commit(view);expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(owned);first.beginAttempt()({owner:'accepted'});expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(owned);first.deactivate();expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(owned);
  // Continue the original deactivation contract with the current publisher.
  const takeoverLive=takeover.beginAttempt();takeoverLive({owner:'accepted'});takeover.commit(view);takeover.deactivate();takeoverLive({owner:'rejected'});takeover.commit({...view,prompt:'closed'});expect(target.__moviesOwnerDiagnostic.snapshot).toMatchObject({view:'inactive',prompt:'open',owner:'accepted'});
  const replacement=createMoviesOwnerDiagnostic(target)!;expect(target.__moviesOwnerDiagnostic.snapshot).toEqual({...empty,view:'active'});
  first.deactivate();live({owner:'rejected'});expect(target.__moviesOwnerDiagnostic.snapshot).toEqual({...empty,view:'active'});
  replacement.deactivate();expect(Object.keys(target.__moviesOwnerDiagnostic).sort()).toEqual(['snapshot','version']);
 });
 it('rejects malformed commits atomically and swallows hostile accessors and slot writes',()=>{
  const target:any={__moviesOwnerDiagnostic:{version:1,snapshot:{...empty}}};const publisher=createMoviesOwnerDiagnostic(target)!;publisher.commit(view);
  for(const bad of [{...view,secret:'synthetic'}, {...view,list:'cookie'},null,[],{...view,prompt:true}]){const before=structuredClone(target.__moviesOwnerDiagnostic.snapshot);expect(()=>publisher.commit(bad as never)).not.toThrow();expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(before);}
  const hostile=Object.defineProperty({},'__moviesOwnerDiagnostic',{get(){throw Error('synthetic');}});expect(()=>createMoviesOwnerDiagnostic(hostile)).not.toThrow();
  Object.freeze(target.__moviesOwnerDiagnostic);expect(()=>publisher.beginAttempt()({owner:'pending'})).not.toThrow();expect(()=>publisher.deactivate()).not.toThrow();
 });
 it('canonicalizes untrusted browser projection to unavailable without carrying raw data',()=>{
  const valid={...empty,button:'disabled',sample:'captured'};
  expect(canonicalMoviesBrowserSnapshot(valid)).toEqual(valid);
  for(const bad of [null,[],{}, {...valid,secret:'cookie session authorization body url id DOM'}, {...valid,button:'clickable'}, {...valid,owner:3}])expect(canonicalMoviesBrowserSnapshot(bad)).toEqual({...empty,button:'unavailable',sample:'unavailable'});
  for(const key of Object.keys(valid)){const missing:any={...valid};delete missing[key];expect(canonicalMoviesBrowserSnapshot(missing)).toEqual({...empty,button:'unavailable',sample:'unavailable'});for(const value of ['',null,true,3,[],{}])expect(canonicalMoviesBrowserSnapshot({...valid,[key]:value})).toEqual({...empty,button:'unavailable',sample:'unavailable'});}
 });
 it.each([
  [[], 'absent'],[[{visible:true,disabled:false},{visible:false,disabled:true}],'multiple'],
  [[{visible:false,disabled:false}],'hidden'],[[{visible:true,disabled:true}],'disabled'],[[{visible:true,disabled:false}],'visible-enabled'],
 ] as const)('classifies only finite local button flags %#',(buttons,expected)=>expect(classifyMoviesDiagnosticButton(buttons)).toBe(expected));
 it('a replacement document and slot invalidates old publishers without copying prior view values',()=>{
  const target:any={__moviesOwnerDiagnostic:{version:1,snapshot:{...empty}}},first=createMoviesOwnerDiagnostic(target)!,old=first.beginAttempt();first.commit(view);
  target.__moviesOwnerDiagnostic={version:1,snapshot:{...empty}};old({owner:'accepted'});first.commit(view);first.deactivate();expect(target.__moviesOwnerDiagnostic.snapshot).toEqual(empty);
  const fresh:any={__moviesOwnerDiagnostic:{version:1,snapshot:{...empty}}};createMoviesOwnerDiagnostic(fresh);expect(fresh.__moviesOwnerDiagnostic.snapshot).toEqual({...empty,view:'active'});
 });
});
