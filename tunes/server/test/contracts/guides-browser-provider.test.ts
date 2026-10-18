import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
const root=resolve(import.meta.dirname,'../../../..');
function load(path:string,deps:Record<string,unknown>,key=''):any {
 const source=readFileSync(resolve(root,path),'utf8').replaceAll('import.meta.env.VITE_GOOGLE_MAPS_API_KEY',JSON.stringify(key));
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const exports={};new Function('require','exports','React',code)((name:string)=>{if(!(name in deps))throw Error(name);return deps[name];},exports,deps.react);return exports;
}
const fixture='explorers-earth/e2e/setup/guides-browser-provider.ts';
it('owned fixed routes and strict schemas reject untrusted query, IDs, masks and response authority',async()=>{
 let data:any;const calls:any[]=[];const m=load(fixture,{axios:{get:async(...args:any[])=>{calls.push(args);return {data};}}}),p=m.browserPlacesProvider;
 expect(await p.search('manual location')).toEqual([]);expect(calls).toEqual([]);
 data=[{id:m.GUIDES_PROVIDER_ID,label:m.GUIDES_PROVIDER_QUERY}];expect(await p.search(m.GUIDES_PROVIDER_QUERY)).toEqual(data);expect(calls[0][0]).toBe('/__guides_provider__/v1/search');
 await expect(p.selection('../evil')).rejects.toThrow();await expect(p.details(m.GUIDES_PROVIDER_ID,'*')).rejects.toThrow();expect(()=>p.photoUrl('https://evil')).toThrow();expect(calls).toHaveLength(1);
 data=m.GUIDES_PROVIDER_DETAILS;const place=await p.selection(m.GUIDES_PROVIDER_ID);expect(place.primaryType).toBe('museum');expect(place.geometry.location.lat()).toBe(12.5);expect(place.geometry.location.lng()).toBe(77.5);
 for(const bad of [null,{...data,url:'https://evil'},{...data,location:{latitude:0,longitude:0}},{...data,types:['restaurant']}]){data=bad;await expect(p.selection(m.GUIDES_PROVIDER_ID)).rejects.toThrow();}
 data=m.GUIDES_PROVIDER_PHOTOS;expect(await p.details(m.GUIDES_PROVIDER_ID,'photos')).toEqual(data);expect(p.photoUrl(m.GUIDES_PROVIDER_PHOTO,'')).toBe('/__guides_provider__/v1/photos/guides-fixture-photo.jpg');
 expect(calls.every(c=>c[0].startsWith('/__guides_provider__/v1/'))).toBe(true);
});
it('production default retains exact Google URL/key/mask/photo semantics',async()=>{
 const calls:any[]=[];const p=load('explorers-earth/src/lib/browserPlacesProvider.ts',{axios:{get:async(...args:any[])=>{calls.push(args);return {data:{}};}},'./publicRuntimeConfig':{mapsBrowserKey:()=> 'sdk-key'}}).browserPlacesProvider;
 expect(p.kind).toBe('google-sdk');await p.details('id','photos',undefined,'legacy-key');expect(calls[0]).toEqual(['https://places.googleapis.com/v1/places/id',{signal:undefined,headers:{'X-Goog-Api-Key':'legacy-key','X-Goog-FieldMask':'photos'}}]);
 expect(p.photoUrl('places/id/photos/photo','key')).toBe('https://places.googleapis.com/v1/places/id/photos/photo/media?maxWidthPx=800&key=key');
});
it('actual photo and price modules bypass missing key only in owned mode',async()=>{
 let data:any;const m=load(fixture,{axios:{get:async()=>({data})}});
 const services=(p:any)=>['googlePhotosService.ts','googlePlaceService.ts'].map(name=>load('explorers-earth/src/features/Guides/utils/'+name,{'../../../lib/browserPlacesProvider':{browserPlacesProvider:p},'../../../lib/publicRuntimeConfig':{mapsBrowserKey:()=>''}}));
 const [photos,price]=services(m.browserPlacesProvider);data=m.GUIDES_PROVIDER_PHOTOS;expect(await photos.fetchGooglePlacePhotos(m.GUIDES_PROVIDER_ID)).toEqual([{url:m.GUIDES_PROVIDER_PATHS.jpeg,width:8,height:8,aspectRatio:'8:8'}]);data=m.GUIDES_PROVIDER_PRICE;expect(await price.fetchPlacePriceLevel(m.GUIDES_PROVIDER_ID)).toEqual({priceLevel:2,priceRange:'$5 - $10'});
 const [prodPhotos,prodPrice]=services({kind:'google-sdk',details:()=>{throw Error('unexpected request');}});expect(await prodPhotos.fetchGooglePlacePhotos('id')).toEqual([]);expect(await prodPrice.fetchPlacePriceLevel('id')).toBeUndefined();
});
it('actual owned AddressInput uses HTTP results, selection callbacks and abort/token fences without SDK',async()=>{
 const state:any[]=[],refs:any[]=[];let cursor=0,refCursor=0,tree:any;const cleanups:Function[]=[];const changes:any[]=[],places:any[]=[];
 const react={createElement:(type:any,props:any,...children:any[])=>({type,props:{...props,children}}),useState:(initial:any)=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],(v:any)=>{state[i]=v;}];},useRef:(initial:any)=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useEffect:(fn:Function,deps:any[])=>{if(deps.length===0&&cleanups.length===0){const cleanup=fn();if(cleanup)cleanups.push(cleanup);}}};
 let searchResolve:any,selectionResolve:any;const signals:AbortSignal[]=[];
 const provider={kind:'owned-http',search:(_q:string,signal:AbortSignal)=>{signals.push(signal);return new Promise(r=>{searchResolve=r;});},selection:(_id:string,signal:AbortSignal)=>{signals.push(signal);return new Promise(r=>{selectionResolve=r;});}};
 const module=load('explorers-earth/src/features/Profile/components/AddressInput.tsx',{'../../../lib/browserPlacesProvider':{browserPlacesProvider:provider},'../../../lib/publicRuntimeConfig':{mapsBrowserKey:()=>''},axios:{},react,'@vis.gl/react-google-maps':{useMapsLibrary:()=>{throw Error('SDK forbidden');}},'../../../utils/getCurrentLocation':{},'../../../assets/icons/CurrLocation':{},sonner:{},'react-i18next':{useTranslation:()=>({t:(k:string)=>k})},'../../../components/GoogleMapsProvider':{withGoogleMapsProvider:(component:any)=>component}});
 const props={label:'Location',type:'title',onChange:(...args:any[])=>changes.push(args),setPlaces:(p:any)=>places.push(p)};
 const render=()=>{cursor=0;refCursor=0;const entry=module.default(props);tree=entry.type(entry.props);};
 const nodes=()=>{const list:any[]=[];const walk=(n:any)=>{if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==='object'){list.push(n);walk(n.props?.children);}};walk(tree);return list;};
 const input=()=>nodes().find(n=>n.type==='input');const button=()=>nodes().find(n=>n.type==='button');const flush=async()=>{await Promise.resolve();await Promise.resolve();render();};
 render();input().props.onChange({target:{value:'Guides Fixture Museum'}});expect(changes.at(-1)).toEqual(['Guides Fixture Museum','input']);searchResolve([{id:'guides-fixture-museum',label:'Guides Fixture Museum'}]);await flush();expect(button()).toBeDefined();button().props.onClick();const late=selectionResolve;input().props.onChange({target:{value:'manual'}});expect(signals[1].aborted).toBe(true);late({name:'stale',formatted_address:'stale',address_components:[]});await flush();expect(places).toEqual([]);expect(changes.at(-1)).toEqual(['manual','input']);
 searchResolve([{id:'guides-fixture-museum',label:'Guides Fixture Museum'}]);await flush();button().props.onClick();selectionResolve({name:'Museum',formatted_address:'Museum address',address_components:[]});await flush();expect(places.at(-1).name).toBe('Museum');expect(changes.at(-1)).toEqual(['Museum address','selection']);expect(input().props.value).toBe('Museum');cleanups[0]();expect(signals.at(-1)?.aborted).toBe(true);
});
