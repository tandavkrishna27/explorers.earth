import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {expect,it} from 'vitest';
import {guidePlaceSnapshotSchema,guideCollectionDetailsSchema} from '../../../shared/explorersGuideContract';
import {toGuide} from '../../../../explorers-earth/src/features/Guides/api/guidesViewModel';
import {guideWizardDetails} from '../../../../explorers-earth/src/features/Guides/api/guideWizardDetails';
// The 3-step creation wizard (CreateGuidePage/CreateGuideStep1-3) was deleted in WP9; its cases left with it.
// What remains here guards the living entered-location surfaces: the journey route editor,
// the location image service, AddressInput and the canonical toGuide projection.
const root=resolve(import.meta.dirname,'../../../..');
const modal='explorers-earth/src/features/Guides/components/GuideDetails/EditJourneyRouteModal.tsx';
const addressInput='explorers-earth/src/features/Profile/components/AddressInput.tsx';
function actual(relative:string,name:string,context:Record<string,unknown>={}){
 const file=resolve(root,relative),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)expression=n.initializer;ts.forEachChild(n,visit);};visit(ast);expect(expression).toBeDefined();
 const code=ts.transpileModule('return ('+ts.createPrinter().printNode(ts.EmitHint.Expression,expression!,ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(context),code)(...Object.values(context));
}
function effect(relative:string,match:string,context:Record<string,unknown>){
 const file=resolve(root,relative),ast=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let expression:ts.Expression|undefined;
 const visit=(n:ts.Node)=>{if(ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0].getText(ast).includes(match))expression=n.arguments[0];ts.forEachChild(n,visit);};visit(ast);expect(expression).toBeDefined();
 const code=ts.transpileModule('return ('+ts.createPrinter().printNode(ts.EmitHint.Expression,expression!,ast)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function(...Object.keys(context),code)(...Object.values(context))();
}
function recorder(){const places:any[]=[],changes:any[]=[];return {places,changes,setPlaces:(p:any)=>places.push(p),onChange:(...args:any[])=>changes.push(args)};}
it('actual route edit serializer preserves absent coordinates and valid zeroes',()=>{
 const serialize=actual(modal,'formatPlaceDetails');expect(serialize({name:'東京',formatted_address:'東京'}).Geometry).toBeNull();expect(serialize({geometry:{location:{lat:()=>0,lng:()=>0}}}).Geometry).toEqual({lat:0,lng:0});
});
it('actual route edit initialization and date-only save retain manual nulls and valid coordinate zeroes',async()=>{
 for(const geometry of [null,{lat:0,lng:0}]){
 const stop={Place_Id:'',Place_Name:'東京',Place_Address:'東京',Geometry:geometry},route={starting:stop,ending:stop,intermediateCities:[{...stop,id:'city',hasDate:true,date:'2026-10-12'}],isMultiCity:true};
 let arrivalPlace:any,departurePlace:any,intermediateCities:any,saved:any;
 effect(modal,'isOpen && guide.Place_Details',{isOpen:true,guide:{Place_Details:route},setArrivalPlace:(p:any)=>{arrivalPlace=p;},setDeparturePlace:(p:any)=>{departurePlace=p;},setIntermediateCities:(p:any)=>{intermediateCities=p;},setArrivalDisplay:()=>{},setDepartureDisplay:()=>{},toast:{error:()=>{throw Error('failed load');}}});
 expect(departurePlace.geometry?.location.lat()??null).toBe(geometry?.lat??null);
 actual(modal,'handleDateChange',{intermediateCities,setIntermediateCities:(p:any)=>{intermediateCities=p;}})('city','2026-10-13');await actual(modal,'handleSubmit',{arrivalPlace,departurePlace,intermediateCities,formatPlaceDetails:actual(modal,'formatPlaceDetails'),setLoading:()=>{},saveDetails:async(p:any)=>{saved=p;},toast:{success:()=>{},error:()=>{throw Error('failed save');}},onSuccess:undefined,onClose:()=>{}})();expect(guidePlaceSnapshotSchema.parse(saved.place)).toEqual({...route,intermediateCities:[{...route.intermediateCities[0],date:'2026-10-13'}]});
 }
});
it('actual location image entrypoints short circuit absent place IDs before any provider or resource work',async()=>{
 const trap=()=>{throw Error('unexpected external/resource work');};for(const name of ['fetchSingleCityLocationImage','fetchMultiCityLocationImage']){expect(await actual('explorers-earth/src/features/Guides/services/locationImageService.ts',name,{fetchLocationImage:trap,console:{warn:()=>{}}})({name:'東京',formatted_address:'東京'})).toBeNull();}
});
it('actual AddressInput autocomplete completion hands the genuine Google selection to its callbacks',async()=>{
 const r=recorder(),place={name:'Tokyo',formatted_address:'Tokyo, Japan',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}};let changed:any;
 class Autocomplete {getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect(addressInput,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:undefined,requestTokenRef:{current:0},setAddress:()=>{},setPlacesRef:{current:r.setPlaces},onChangeRef:{current:r.onChange}});
 await changed();expect(r.places).toEqual([place]);expect(r.places[0]).toBe(place);expect(r.changes).toEqual([['Tokyo, Japan','selection']]);
});
it('canonical toGuide projection keeps paired flat zero, nonzero and absent coordinates',()=>{
 for(const coords of [{lat:0,lng:0},{lat:35,lng:139},{lat:null,lng:null}]){
  const details=guideCollectionDetailsSchema.parse(guideWizardDetails({guideType:'Itinerary',locationMode:'single',numberOfDays:2,bestTimeToVisit:['January'],categories:['Food']},{name:'東京',address:'Tokyo',placeId:'google-id',rating:null,ratingsCount:null,...coords}));
  const guide=toGuide({id:'guide',title:'Trip',description:null,visibility:'private',slug:'trip',accountId:'account',displayOrder:0} as any,{details,sections:[],coverMediaId:null} as any);
  const projected=guide.Place_Details as Record<string,unknown>;expect(projected).toMatchObject({Place_Name:'東京',Place_Address:'Tokyo',Place_Id:'google-id'});
  if(coords.lat===null){expect('lat' in projected).toBe(false);expect('lng' in projected).toBe(false);}else{expect(projected.lat).toBe(coords.lat);expect(projected.lng).toBe(coords.lng);}
 }
});
it('actual detected-place completion identifies selection and actual typing invalidates pending metadata',async()=>{
 const r=recorder(),place={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>0,lng:()=>0}}};
 actual(addressInput,'populatePlaceData',{type:undefined,setAddress:()=>{},setPlaces:r.setPlaces,onChange:r.onChange,toast:{success:()=>{}}})(place);expect(r.places[0].place_id).toBe('google-id');expect(r.places[0].geometry.location.lat()).toBe(0);expect(r.changes).toEqual([['Tokyo','selection']]);
 let changed:any,complete:any;const requestTokenRef={current:0},calls:any[]=[],typed=recorder();class Autocomplete{getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect(addressInput,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:'title',requestTokenRef,setAddress:()=>{},setPlacesRef:{current:(value:any)=>calls.push(value)},onChangeRef:{current:(...args:any[])=>calls.push(args)},axios:{get:()=>new Promise(resolve=>{complete=resolve;})},mapsBrowserKey:()=> 'unused-no-network'});
 const pending=changed();actual(addressInput,'handleManualChange',{requestTokenRef,setAddress:()=>{},onChange:typed.onChange})('Kyoto');expect(typed.changes).toEqual([['Kyoto','input']]);complete({data:{}});await pending;expect(calls).toEqual([]);
});
it('actual invalid autocomplete completion clears a prior selection and fences pending metadata',async()=>{
 const r=recorder();let place:any={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}},changed:any,complete:any;
 const requestTokenRef={current:0};class Autocomplete{getPlace(){return place;}addListener(_name:string,callback:any){changed=callback;}}
 effect(addressInput,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:undefined,requestTokenRef,setAddress:()=>{},setPlacesRef:{current:r.setPlaces},onChangeRef:{current:r.onChange}});
 await changed();expect(r.places[0].place_id).toBe('google-id');place={name:'Invalid'};await changed();expect(r.places).toHaveLength(1);expect(r.changes.at(-1)).toEqual(['','input']);
 place={name:'Tokyo',formatted_address:'Tokyo',place_id:'google-id',geometry:{location:{lat:()=>35,lng:()=>139}}};const late=recorder();
 effect(addressInput,'new placesLibrary.Autocomplete',{inputRef:{current:{}},placesLibrary:{Autocomplete},type:'title',requestTokenRef,setAddress:()=>{},setPlacesRef:{current:late.setPlaces},onChangeRef:{current:late.onChange},axios:{get:()=>new Promise(resolve=>{complete=resolve;})},mapsBrowserKey:()=> 'unused-no-network'});
 const pending=changed();place=undefined;await changed();complete({data:{}});await pending;expect(late.places).toEqual([]);expect(late.changes).toEqual([['','input']]);
});
