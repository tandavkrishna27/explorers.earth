import { accountDtoSchema, type AccountDto, type UpdateAccountInput, type RevisionInput, type CategoryKey } from '../../../../tunes/shared/explorersContract';
import { NavigationError } from './accountNavigationWriter';
import { CATEGORY_IDS, type CategoryId, type NavigationSnapshot, type NavigationPatch, type Scope } from './categoryNavigationPolicy';
const keys: Record<CategoryId, CategoryKey> = {public_recommendations:'places',public_music:'music',public_guides:'guides',public_movie:'movies',public_books:'books',public_games:'games',public_apps:'apps',public_products:'products',public_people:'people'};
const invalid = ():never => { throw new NavigationError('uncertain','Category settings are incomplete. Refresh to try again.'); };
export function toNavigationSnapshot(input: AccountDto, scope: Scope):NavigationSnapshot {
 const parsed=accountDtoSchema.safeParse(input); if(!parsed.success) return invalid(); const account=parsed.data;
 if(!scope.userDocumentId||account.id!==scope.accountDocumentId||account.status!=='active') throw new NavigationError('blocked','Verified account required.');
 const rows=account.categories;
 if(rows.length!==9||new Set(rows.map(row=>row.category)).size!==9||new Set(rows.map(row=>row.displayOrder)).size!==9) return invalid();
 const pins=rows.filter(row=>row.pinnedOrder!==null);if(new Set(pins.map(row=>row.pinnedOrder)).size!==pins.length) return invalid();
 const visibility={} as NavigationSnapshot['visibility']; for(const id of CATEGORY_IDS){const row=rows.find(row=>row.category===keys[id]);if(!row)return invalid();visibility[id]=row.isPublic?'Yes':'No';}
 const savedPins=['public_profile',...pins.sort((a,b)=>a.pinnedOrder!-b.pinnedOrder!).map(row=>CATEGORY_IDS.find(id=>keys[id]===row.category)!)];
 return {scope:{userDocumentId:scope.userDocumentId,accountDocumentId:scope.accountDocumentId},revision:account.revision,categories:rows.map(row=>({...row})),visibility,savedPins,autoPinning:account.autoPinning};
}
export function toNavigationAccountUpdate(snapshot:NavigationSnapshot,patch:NavigationPatch):UpdateAccountInput & RevisionInput {
 const update:UpdateAccountInput & RevisionInput={expectedRevision:snapshot.revision};
 if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1)return invalid();
 for(const field of Object.keys(patch))if(field!=='auto_pinning'&&field!=='pinned_nav_tabs'&&!CATEGORY_IDS.includes(field as CategoryId))return invalid();
 if(patch.auto_pinning!==undefined){if(typeof patch.auto_pinning!=='boolean')return invalid();update.autoPinning=patch.auto_pinning;}
 if(patch.pinned_nav_tabs!==undefined||CATEGORY_IDS.some(id=>patch[id]!==undefined)) {
  const pins=patch.pinned_nav_tabs;
  if(pins!==undefined&&(!Array.isArray(pins)||pins[0]!=='public_profile'||new Set(pins).size!==pins.length||pins.slice(1).some(id=>!CATEGORY_IDS.includes(id as CategoryId))))return invalid();
  update.categories=snapshot.categories.map(row=>{const id=CATEGORY_IDS.find(id=>keys[id]===row.category)!;const value=patch[id];if(value!==undefined&&value!=='Yes'&&value!=='No')return invalid();return {...row,...(value!==undefined?{isPublic:value==='Yes'}:{}),...(pins!==undefined?{pinnedOrder:pins.includes(id)?pins.indexOf(id)-1:null}:{})};});
 }
 return update;
}
