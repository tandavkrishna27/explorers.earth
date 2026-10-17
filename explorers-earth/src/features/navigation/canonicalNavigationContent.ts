import { assertCompleteOwnerContent, explorersApiClient } from '../../lib/explorersApiClient';
import useAuthStore from '../../store/store';
import { ownerCollectionDtoSchema } from '../../../../tunes/shared/explorersOwnerContentContract';
import type { Scope, CategoryId, Eligibility } from './categoryNavigationPolicy';
export type NavigationContent = { counts: Partial<Record<CategoryId, number>>; eligibility: Partial<Record<CategoryId, Eligibility>> };
const native = [['public_books','books'],['public_movie','movies'],['public_games','games']] as const;
const unknown = (): NavigationContent => ({ counts: {}, eligibility: { public_books:'unknown',public_movie:'unknown',public_games:'unknown',public_recommendations:'unknown',public_guides:'unknown',public_apps:'unknown',public_products:'unknown',public_people:'unknown' } });
/** Only a complete cookie-authorized native collection set can establish publication eligibility. */
export async function readCanonicalNavigationContent(scope: Scope, isCurrent: () => boolean, signal?: AbortSignal): Promise<NavigationContent> {
 const initial=useAuthStore.getState();
 const current=()=>!signal?.aborted&&isCurrent()&&useAuthStore.getState().isAuthenticated&&useAuthStore.getState().generation===initial.generation&&useAuthStore.getState().accountId===scope.accountDocumentId&&useAuthStore.getState().user?.id===scope.userDocumentId;
 const result=unknown();
 for(const [field,category] of native) {
  if(!current())return unknown();
  try {
   const complete=await explorersApiClient.getAllMyCollections({category,status:'active',limit:100},signal);
   if(!current())return unknown();
   assertCompleteOwnerContent(complete);
   if(complete.accountId!==scope.accountDocumentId||complete.generation!==initial.generation)throw Error('Foreign content');
   const items=complete.items.map(item=>ownerCollectionDtoSchema.parse(item));
   if(items.some(item=>item.accountId!==scope.accountDocumentId||item.category!==category))throw Error('Foreign content');
   const count=items.filter(item=>!item.archived&&item.visibility==='public'&&item.publicationState==='published').length;
   result.counts[field]=count;result.eligibility[field]=count>0?'allowed':'no-content';
  } catch { if(!current())return unknown(); }
 }
 return current()?result:unknown();
}
