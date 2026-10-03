import {movieContextSchema,movieDetailsSchema,type MovieContext,type MovieDetails} from '../../../shared/explorersMovieContract';
/** Derived presentation only: stored provider facts and owner context remain distinct. */
export function effectiveMovieWatchOffers(details:MovieDetails,context:MovieContext) {
 const facts=movieDetailsSchema.parse(details),selection=movieContextSchema.parse(context);
 const region=facts.watchProviders[selection.region];if(!region){if(selection.selectedProviderIds?.length)throw new Error('MOVIE_CONTEXT_INCOMPATIBLE');return [];}
 const seen=new Set<number>();const offers=[...region.flatrate,...region.rent,...region.buy].filter(p=>{if(seen.has(p.providerId))return false;seen.add(p.providerId);return true;});
 if(selection.selectedProviderIds===null)return offers.sort((a,b)=>a.priority-b.priority).slice(0,8);
 if(selection.selectedProviderIds.some(id=>!seen.has(id)))throw new Error('MOVIE_CONTEXT_INCOMPATIBLE');
 return selection.selectedProviderIds.map(id=>offers.find(p=>p.providerId===id)!);
}
