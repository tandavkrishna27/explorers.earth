import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
const root=resolve(import.meta.dirname,'../../../..');
function form(props:any={}){
 const state:any[]=[];let cursor=0,payload:any,tree:any;
 const react={createElement:(type:any,props:any,...children:any[])=>({type,props:{...props,children}}),useState:(initial:any)=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],(next:any)=>{state[i]=typeof next==='function'?next(state[i]):next;}];},useEffect:()=>{},useRef:(value:any)=>({current:value})};
 const code=ts.transpileModule(readFileSync(resolve(root,'explorers-earth/src/features/Guides/components/CreateGuideStep1.tsx'),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const exports:any={};new Function('require','exports','React',code)((name:string)=>name==='react'?react:name==='framer-motion'?{Reorder:{Group:'Group',Item:'Item'}}:{__esModule:true,default:name.endsWith('AddressInput')?'AddressInput':name.endsWith('Button')?'Button':name},exports,react);
 const render=()=>{cursor=0;tree=exports.default({initialGuideType:'Theme',onNext:(data:any)=>{payload=data;},onCancel:()=>{},...props});};render();
 const nodes=()=>{const all:any[]=[];const walk=(node:any)=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){all.push(node);walk(node.props?.children);}};walk(tree);return all;};
 return {render,nodes,input:(placeholder:string)=>nodes().find(n=>n.type==='AddressInput'&&n.props.placeHolder===placeholder),manual:(index=0)=>nodes().filter(n=>n.type==='button'&&n.props.children.flat().includes('Use entered location'))[index],next:()=>{payload=undefined;nodes().find(n=>n.props?.btnText==='Next').props.onClickHandler();render();return payload;}};
}
it('requires explicit manual selection and invalidates it after text edits',()=>{
 const f=form();f.input('Search for a location').props.onChange('  東京 🗺️  ');f.render();expect(f.next()).toBeUndefined();expect(f.manual()).toBeDefined();f.manual().props.onClick();f.render();expect(f.next().selectedPlace).toEqual({name:'東京 🗺️',formatted_address:'東京 🗺️'});f.input('Search for a location').props.onChange('京都');f.render();expect(f.next()).toBeUndefined();
});
it('rejects blank, oversized, control characters and unmatched surrogates',()=>{
 for(const value of ['   ','x'.repeat(501),'a\u0000b','a\nb','a\ud800']){const f=form();f.input('Search for a location').props.onChange(value);f.render();f.manual().props.onClick();f.render();expect(f.next()).toBeUndefined();}
});
it('supports manual endpoints and stops and preserves genuine Google results',()=>{
 const f=form({initialLocationMode:'multi'});f.input('Search for starting location').props.onChange(' Kochi ');f.render();f.manual(0).props.onClick();f.render();const google={place_id:'google-id',name:'Mumbai',geometry:{location:{lat:()=>19,lng:()=>72}}};f.input('Search for destination location').props.setPlaces(google);f.render();f.input('Search for a city to add to your journey').props.onChange(' पुणे ');f.render();f.manual(2).props.onClick();f.render();const data=f.next();expect(data.fromLocation).toEqual({name:'Kochi',formatted_address:'Kochi'});expect(data.toLocation).toBe(google);expect(data.intermediateCities[0].place).toEqual({name:'पुणे',formatted_address:'पुणे'});f.input('Search for destination location').props.onChange('Delhi');f.render();expect(f.next()).toBeUndefined();
});
function actual(relative:string,name:string,context:Record<string,unknown>={}){
 const file=resolve(root,relative),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);};visit(ast);expect(expression).toBeDefined();
 const code=ts.transpileModule('return ('+ts.createPrinter().printNode(ts.EmitHint.Expression,expression!,ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(context),code)(...Object.values(context));
}
it('actual creation and route edit serializers preserve absent coordinates and valid zeroes',()=>{
 for(const relative of ['explorers-earth/src/features/Guides/components/CreateGuidePage.tsx','explorers-earth/src/features/Guides/components/GuideDetails/EditJourneyRouteModal.tsx']){
  const serialize=actual(relative,'formatPlaceDetails');expect(serialize({name:'東京',formatted_address:'東京'}).Geometry).toBeNull();expect(serialize({geometry:{location:{lat:()=>0,lng:()=>0}}}).Geometry).toEqual({lat:0,lng:0});
 }
});
import {guidePlaceSnapshotSchema} from '../../../shared/explorersGuideContract';
function effect(relative:string,match:string,context:Record<string,unknown>){
 const file=resolve(root,relative),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes(match))expression=n.arguments[0];ts.forEachChild(n,visit);};visit(ast);expect(expression).toBeDefined();
 const code=ts.transpileModule('return ('+ts.createPrinter().printNode(ts.EmitHint.Expression,expression!,ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(context),code)(...Object.values(context))();
}
it('actual wizard snapshot expression reaches canonical null geometry without inventing provider identity',()=>{
 const place={name:'東京',formatted_address:'東京'},relative='explorers-earth/src/features/Guides/components/CreateGuidePage.tsx',formatPlaceDetails=actual(relative,'formatPlaceDetails');
 const single=actual(relative,'placeSnapshot',{formData:{locationMode:'single',selectedPlace:place},formatPlaceDetails});expect(guidePlaceSnapshotSchema.parse(single)).toMatchObject({name:'東京',address:'東京',placeId:null,lat:null,lng:null});
 const multi=actual(relative,'placeSnapshot',{formData:{locationMode:'multi',fromLocation:place,toLocation:place,intermediateCities:[{id:'stop',place,hasDate:true,date:'2026-10-12'}]},formatPlaceDetails});expect(guidePlaceSnapshotSchema.parse(multi)).toEqual({starting:{Place_Id:'',Place_Name:'東京',Place_Address:'東京',Geometry:null},ending:{Place_Id:'',Place_Name:'東京',Place_Address:'東京',Geometry:null},intermediateCities:[{id:'stop',Place_Id:'',Place_Name:'東京',Place_Address:'東京',Geometry:null,hasDate:true,date:'2026-10-12'}],isMultiCity:true});
 expect(guidePlaceSnapshotSchema.safeParse({...multi,starting:{...multi.starting,Geometry:{lat:0}}}).success).toBe(false);expect(guidePlaceSnapshotSchema.safeParse({...single,lat:0,lng:null}).success).toBe(false);
});
it('actual edit initialization and date-only save retain manual nulls and valid coordinate zeroes',async()=>{
 for(const geometry of [null,{lat:0,lng:0}]){
 const stop={Place_Id:'',Place_Name:'東京',Place_Address:'東京',Geometry:geometry},route={starting:stop,ending:stop,intermediateCities:[{...stop,id:'city',hasDate:true,date:'2026-10-12'}],isMultiCity:true};
 let initial:any;effect('explorers-earth/src/features/Guides/components/CreateGuidePage.tsx','guideData?.guide',{type:'edit',guideData:{guide:{Place_Details:route,is_Multicity:true}},setPreviewUrl:()=>{},blocksToHtml:()=>'',setFormData:(value:any)=>{initial=value;}});expect(initial.fromLocation.geometry?.location.lat()??null).toBe(geometry?.lat??null);
 let arrivalPlace:any,departurePlace:any,intermediateCities:any,saved:any;
 const modal='explorers-earth/src/features/Guides/components/GuideDetails/EditJourneyRouteModal.tsx';effect(modal,'isOpen && guide.Place_Details',{isOpen:true,guide:{Place_Details:route},setArrivalPlace:(p:any)=>{arrivalPlace=p;},setDeparturePlace:(p:any)=>{departurePlace=p;},setIntermediateCities:(p:any)=>{intermediateCities=p;},setArrivalDisplay:()=>{},setDepartureDisplay:()=>{},toast:{error:()=>{throw Error('failed load');}}});
 actual(modal,'handleDateChange',{intermediateCities,setIntermediateCities:(p:any)=>{intermediateCities=p;}})('city','2026-10-13');await actual(modal,'handleSubmit',{arrivalPlace,departurePlace,intermediateCities,formatPlaceDetails:actual(modal,'formatPlaceDetails'),setLoading:()=>{},saveDetails:async(p:any)=>{saved=p;},toast:{success:()=>{},error:()=>{throw Error('failed save');}},onSuccess:undefined,onClose:()=>{}})();expect(guidePlaceSnapshotSchema.parse(saved.place)).toEqual({...route,intermediateCities:[{...route.intermediateCities[0],date:'2026-10-13'}]});
 }
});
it('actual location image entrypoints short circuit absent place IDs before any provider or resource work',async()=>{
 const trap=()=>{throw Error('unexpected external/resource work');};for(const name of ['fetchSingleCityLocationImage','fetchMultiCityLocationImage']){expect(await actual('explorers-earth/src/features/Guides/services/locationImageService.ts',name,{fetchLocationImage:trap,console:{warn:()=>{}}})({name:'東京',formatted_address:'東京'})).toBeNull();}
});
it('actual intermediate edit callbacks invalidate stale selections until fresh confirmation',()=>{
 const city={id:'stop',place:{place_id:'old',name:'Old'},displayValue:'Old',hasDate:true,date:'2026-10-12'},f=form({initialLocationMode:'multi',initialFromLocation:city.place,initialToLocation:city.place,initialIntermediateCities:[city]});
 // Open the city menu, then invoke its actual rendered edit callback.
 f.nodes().find(n=>n.props?.['aria-label']==='City options').props.onClick({stopPropagation(){}});f.render();f.nodes().find(n=>n.props?.title==='Edit').props.onClick({stopPropagation(){}});f.render();f.input('Search for city').props.onChange(' पुणे ');f.render();expect(f.next()).toBeUndefined();f.manual(2).props.onClick();f.render();expect(f.next().intermediateCities[0]).toMatchObject({place:{name:'पुणे',formatted_address:'पुणे'},hasDate:true,date:'2026-10-12'});
});
import {toGuide} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {guideWizardDetails} from '../../../../explorers-earth/src/features/Guides/api/guideWizardDetails';
import {guideCollectionDetailsSchema} from '../../../shared/explorersGuideContract';
it('actual AddressInput autocomplete completion preserves Google selection through its display callback',async()=>{
 const f=form(),input=f.input('Search for a location'),place={name:'Tokyo',formatted_address:'Tokyo, Japan',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}};let changed:any;
 class Autocomplete {getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect('explorers-earth/src/features/Profile/components/AddressInput.tsx','new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:undefined,requestTokenRef:{current:0},setAddress:()=>{},setPlacesRef:{current:input.props.setPlaces},onChangeRef:{current:input.props.onChange}});
 await changed();f.render();expect(f.next().selectedPlace).toBe(place);f.input('Search for a location').props.onChange('Kyoto','input');f.render();expect(f.next()).toBeUndefined();
});
it('canonical toGuide projection reloads and resaves paired flat zero, nonzero and absent coordinates',()=>{
 for(const coords of [{lat:0,lng:0},{lat:35,lng:139},{lat:null,lng:null}]){
  const details=guideCollectionDetailsSchema.parse(guideWizardDetails({guideType:'Itinerary',locationMode:'single',numberOfDays:2,bestTimeToVisit:['January'],categories:['Food']},{name:'東京',address:'Tokyo',placeId:'google-id',rating:null,ratingsCount:null,...coords}));
  const guide=toGuide({id:'guide',title:'Trip',description:null,visibility:'private',slug:'trip',accountId:'account',displayOrder:0} as any,{details,sections:[],coverMediaId:null} as any);let data:any;
  const relative='explorers-earth/src/features/Guides/components/CreateGuidePage.tsx';effect(relative,'guideData?.guide',{type:'edit',guideData:{guide},setPreviewUrl:()=>{},blocksToHtml:()=>'',setFormData:(value:any)=>{data=value;}});
  const snapshot=actual(relative,'placeSnapshot',{formData:data,formatPlaceDetails:actual(relative,'formatPlaceDetails')});expect(guideCollectionDetailsSchema.parse(guideWizardDetails(data,snapshot,details))).toEqual(details);
 }
});
it('actual detected-place completion identifies selection and actual typing invalidates pending metadata',async()=>{
 const relative='explorers-earth/src/features/Profile/components/AddressInput.tsx',f=form(),input=f.input('Search for a location'),place={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>0,lng:()=>0}}};
 actual(relative,'populatePlaceData',{type:undefined,setAddress:()=>{},setPlaces:input.props.setPlaces,onChange:input.props.onChange,toast:{success:()=>{}}})(place);f.render();expect(f.next().selectedPlace.place_id).toBe('google-id');
 let changed:any,complete:any;const requestTokenRef={current:0},calls:any[]=[];class Autocomplete{getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect(relative,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:'title',requestTokenRef,setAddress:()=>{},setPlacesRef:{current:(value:any)=>calls.push(value)},onChangeRef:{current:(...args:any[])=>calls.push(args)},axios:{get:()=>new Promise(resolve=>{complete=resolve;})},mapsBrowserKey:()=> 'unused-no-network'});
 const pending=changed();actual(relative,'handleManualChange',{requestTokenRef,setAddress:()=>{},onChange:input.props.onChange})('Kyoto');f.render();expect(f.next()).toBeUndefined();complete({data:{}});await pending;expect(calls).toEqual([]);
});
it('actual invalid autocomplete completion clears a prior selection and fences pending metadata',async()=>{
 const relative='explorers-earth/src/features/Profile/components/AddressInput.tsx',f=form(),input=f.input('Search for a location');let place:any={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}},changed:any,complete:any;
 const requestTokenRef={current:0};class Autocomplete{getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect(relative,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:undefined,requestTokenRef,setAddress:()=>{},setPlacesRef:{current:input.props.setPlaces},onChangeRef:{current:input.props.onChange}});
 await changed();f.render();expect(f.next().selectedPlace.place_id).toBe('google-id');place={name:'Invalid'};await changed();f.render();expect(f.next()).toBeUndefined();
 place={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}};
 effect(relative,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:'title',requestTokenRef,setAddress:()=>{},setPlacesRef:{current:input.props.setPlaces},onChangeRef:{current:input.props.onChange},axios:{get:()=>new Promise(resolve=>{complete=resolve;})},mapsBrowserKey:()=> 'unused-no-network'});
 const pending=changed();place=undefined;await changed();complete({data:{}});await pending;f.render();expect(f.next()).toBeUndefined();
});
