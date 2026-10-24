import { toast } from 'sonner';
import { explorersApiClient } from '../../../lib/explorersApiClient';
import { invalidateMovies } from './explorersAdapter';

// The provider-image copy is its own idempotent command with a durable receipt, so the
// add page no longer waits for it: the list shows provider images until the copy lands.
export function startMovieImport(recommendationId:string,key:string){
 const controller=new AbortController();
 const done=(async()=>{
  try{
   const fresh=await explorersApiClient.getMyEditableRecommendation(recommendationId,controller.signal);
   const imported=await explorersApiClient.importMovieMedia(fresh,key,controller.signal);
   if(imported.slots.some(slot=>slot.status==='unavailable'))toast.info('Saved. Some provider images could not be copied.');
  }catch{
   toast.info('Movie saved. Provider image copying is unavailable; original images remain.');
  }finally{
   invalidateMovies();
  }
 })();
 return {done,cancel:()=>controller.abort()};
}
