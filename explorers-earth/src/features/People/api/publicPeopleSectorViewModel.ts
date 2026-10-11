import {publicPersonSchema,type PublicPerson} from '../../../../../tunes/shared/explorersPublicPeopleSectorContract';
import type {RecommendedPerson,PersonList} from '../types';
import type {PublicPagePayload} from '../../PublicHome/api/usePublicPagedResource';

function invalid():never{throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');}
export type PublicPeopleReadBudget={bytes:number};
/** Count the complete incoming page before retaining its rows, including first-page previews. */
export function accountPublicPeoplePage(raw:unknown,budget:PublicPeopleReadBudget):void{
 let serialized:string|undefined;
 try{serialized=JSON.stringify(raw);}catch{return invalid();}
 if(serialized===undefined)return invalid();
 const bytes=new TextEncoder().encode(serialized).length;
 if(bytes>64*1024*1024-budget.bytes)throw Error('PUBLIC_PROFILE_READ_LIMIT');
 budget.bytes+=bytes;
}
const platform=(value:string|null):RecommendedPerson['platform']=>{
 if(value===null)return null;
 if(value==='twitter')return 'x';
 return ['instagram','linkedin','x','github','youtube','website','other'].includes(value)?value as RecommendedPerson['platform']:'other';
};
/** Only public DTO facts enter the existing presentation props. */
export function publicPersonViewModel(raw:unknown):RecommendedPerson{
 const parsed=publicPersonSchema.safeParse(raw);if(!parsed.success)return invalid();const p:PublicPerson=parsed.data;
 return {documentId:p.documentId,name:p.title,full_name:p.full_name,username_handle:p.username_handle,handle:p.username_handle,
 headline:p.headline,location:p.location_text,avatar_path:p.avatar_url,avatar_url:p.avatar_url,
 primary_platform:p.primary_platform==='twitter'?'twitter':platform(p.primary_platform)==='x'?'twitter':platform(p.primary_platform) as RecommendedPerson['primary_platform'],
 platform:platform(p.platform),profile_url:p.profile_url??undefined,social_urls:p.social_urls,skills_tags:p.skills_tags,tags:p.skills_tags,
 follower_count:p.follower_count,user_recommendation_note:p.user_recommendation_note,user_rating:p.user_rating,is_pinned:p.is_pinned,pin_order:p.pin_order,
 display_order:p.display_order,person_list:p.person_list,person_category:p.person_category,people_category:p.people_category};
}
export function publicPeopleLists(raw:unknown):PersonList[]{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as {personLists?:unknown}).personLists))return invalid();
 return (raw as {personLists:PersonList[]}).personLists.map(list=>({...list,recommended_people:list.recommended_people.map(publicPersonViewModel)}));
}
export function publicPeopleSectors(people:RecommendedPerson[]){
 const seen=new Set<string>();return people.flatMap(p=>{const term=p.people_category;if(!term?.slug||!term.Category_name||seen.has(term.documentId))return [];seen.add(term.documentId);return [{documentId:term.documentId,slug:term.slug,name:term.Category_name}];});
}
type Preview={documentId:string;slug:string;recommended_people:unknown[];recommended_people_next_cursor:string|null};
function preview(raw:unknown):Preview[]{
 if(!raw||typeof raw!=='object'||!Array.isArray((raw as {personLists?:unknown}).personLists))return invalid();
 const lists=(raw as {personLists:Preview[]}).personLists;
 for(const l of lists)if(!l||typeof l.documentId!=='string'||typeof l.slug!=='string'||!Array.isArray(l.recommended_people)||!(l.recommended_people_next_cursor===null||typeof l.recommended_people_next_cursor==='string'&&l.recommended_people_next_cursor.length>0&&l.recommended_people_next_cursor.length<=2048))return invalid();
 return lists;
}
export async function completePeoplePreviews(raw:unknown,read:(slug:string,cursor:string)=>Promise<unknown>,signal:AbortSignal,budget:PublicPeopleReadBudget={bytes:0}):Promise<PublicPagePayload>{
 if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
 accountPublicPeoplePage(raw,budget);
 const lists=preview(raw),completed=[];
 for(const list of lists){
  const people=[...list.recommended_people],seen=new Set<string>();let cursor=list.recommended_people_next_cursor;
  while(cursor!==null){
   if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
   if(seen.has(cursor))throw Error('PUBLIC_PROFILE_PAGINATION_LIMIT');seen.add(cursor);
   const page=await read(list.slug,cursor);if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
   accountPublicPeoplePage(page,budget);
   const next=preview(page);if(next.length!==1||next[0].documentId!==list.documentId||next[0].slug!==list.slug)return invalid();
   if(next[0].recommended_people.length===0&&next[0].recommended_people_next_cursor!==null)return invalid();
   people.push(...next[0].recommended_people);cursor=next[0].recommended_people_next_cursor;
  }
  completed.push({...list,recommended_people:people,recommended_people_next_cursor:null});
 }
 return {...raw as PublicPagePayload,personLists:completed};
}
