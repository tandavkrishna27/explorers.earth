import type {PropsWithChildren} from 'react';
// Deterministic third-party callback only. Auth, native forms and writes are real.
const fixturePlace = () => ({place_id:'fixture-zero-city',name:'Fixture Zero City',formatted_address:'Fixture Zero City, Test Country',types:['locality'],address_components:[{long_name:'Fixture Zero City',short_name:'Fixture Zero City',types:['locality']},{long_name:'Test Country',short_name:'TC',types:['country']}],geometry:{location:{lat:()=>0,lng:()=>0}}});
export class FixtureAutocomplete {
  private listeners=new Set<()=>unknown>();
  private readonly option:HTMLButtonElement;
  private readonly show:()=>void;
  constructor(private readonly input:HTMLInputElement,_options?:unknown) {
    this.option=input.ownerDocument.createElement('button');
    this.option.type='button';this.option.setAttribute('role','option');this.option.textContent='Fixture Zero City';
    this.option.hidden=true;
    this.show=()=>{this.option.hidden=input.disabled||input.value.trim().length===0;};
    input.addEventListener('input',this.show);input.addEventListener('focus',this.show);
    this.option.onclick=()=>{if(input.disabled)return;input.value='Fixture Zero City';this.option.hidden=true;for(const listener of this.listeners)void listener();};
    input.insertAdjacentElement('afterend',this.option);
  }
  addListener(event:string,listener:()=>unknown) {if(event!=='place_changed')throw new Error('Unknown fixture Maps event');this.listeners.add(listener);return {remove:()=>{this.listeners.delete(listener);}};}
  getPlace(){return fixturePlace();}
  dispose(){this.listeners.clear();this.option.onclick=null;this.option.remove();this.input.removeEventListener('input',this.show);this.input.removeEventListener('focus',this.show);}
}
export function clearFixtureListeners(instance:FixtureAutocomplete){instance.dispose();}
const placesLibrary={Autocomplete:FixtureAutocomplete};
export function useMapsLibrary(name:string){
  if(name!=='places')return null;
  // The retained AddressInput calls the global Google cleanup API on unmount.
  const scope=globalThis as unknown as {google?:unknown};
  scope.google={maps:{event:{clearInstanceListeners:clearFixtureListeners}}};
  return placesLibrary;
}
export const APIProvider=({children}:PropsWithChildren)=> <>{children}</>;
export const Map=()=>null;
export const AdvancedMarker=()=>null;
export const Pin=()=>null;
export const useMap=()=>null;
export const useApiIsLoaded=()=>true;
