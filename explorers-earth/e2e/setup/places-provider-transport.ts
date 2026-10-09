import type {Page} from '@playwright/test';
import {denyHostedEgress} from './deny-hosted-egress';
const headerMask='id,displayName,formattedAddress,types,primaryType,primaryTypeDisplayName,addressComponents,location,rating';
const queryFields='id,displayName,formattedAddress,primaryType,primaryTypeDisplayName,priceRange,rating,userRatingCount,location,photos';
export const PLACES_PROVIDER_DTO={id:'fixture-zero-city',displayName:{text:'Fixture Zero City'},formattedAddress:'Fixture Zero City, Test Country',primaryType:'locality',primaryTypeDisplayName:{text:'City'},types:['locality'],location:{latitude:0,longitude:0},photos:[]};
export type PlacesProviderObservation={method:'GET';path:string;queryKeys:string[];fieldMask:string|null;queryFields:string|null};
export function classifyPlacesProviderRequest(input:{url:string;method:string;headers:Record<string,string>}):PlacesProviderObservation|null {
  let url:URL;try{url=new URL(input.url);}catch{return null;}
  if(url.origin!=='https://places.googleapis.com'||url.username||url.password||url.pathname!=='/v1/places/fixture-zero-city'||url.hash||input.method!=='GET')return null;
  const keys=[...url.searchParams.keys()].sort(),headers=Object.fromEntries(Object.entries(input.headers).map(([key,value])=>[key.toLowerCase(),value]));
  const mask=headers['x-goog-fieldmask']??null,fields=url.searchParams.get('fields');
  const headerRequest=keys.length===0&&mask===headerMask&&headers['x-goog-api-key']==='fixture-google-maps-key';
  const queryRequest=keys.join(',')==='fields,key'&&fields===queryFields&&url.searchParams.get('key')==='fixture-google-maps-key'&&mask===null;
  if(!headerRequest&&!queryRequest)return null;
  // Record field selection and key names; never record credentials/header values.
  return {method:'GET',path:url.pathname,queryKeys:keys,fieldMask:mask,queryFields:fields};
}
/** Install after the catchall: Playwright applies the last matching route first. */
export async function installPlacesProviderTransport(page:Page) {
  await denyHostedEgress(page);
  const observations:PlacesProviderObservation[]=[],denied:{method:string;kind:'unsupported-google-request'}[]=[];
  await page.route(url=>url.hostname==='places.googleapis.com',async route=>{
    const request=route.request(),observation=classifyPlacesProviderRequest({url:request.url(),method:request.method(),headers:request.headers()});
    if(!observation){denied.push({method:request.method(),kind:'unsupported-google-request'});await route.fulfill({status:418,contentType:'application/json',body:'{"error":"PLACES_PROVIDER_REQUEST_DENIED"}'});return;}
    observations.push(observation);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(PLACES_PROVIDER_DTO)});
  });
  return {observations,denied,assertExpected(){if(denied.length)throw new Error('Unsupported fixture Google request');}};
}
