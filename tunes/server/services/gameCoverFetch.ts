import {PlacePhotoFetcher,PlacePhotoFetchFailure} from './placePhotoFetch';
/** An IGDB cover, fetched by image id from images.igdb.com only, with the same pinned-address,
 * no-redirect, image-type, 5 MB and 5 s policy as a Google place photo. */
export class GameCoverFetcher {
 private readonly fetcher:PlacePhotoFetcher;
 constructor(fixture?:ConstructorParameters<typeof PlacePhotoFetcher>[0]){this.fetcher=new PlacePhotoFetcher(fixture,/^images\.igdb\.com$/);}
 fetch(imageId:string):Promise<{bytes:Buffer;mimeType:string}>{
  if(typeof imageId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(imageId))return Promise.reject(new PlacePhotoFetchFailure());
  return this.fetcher.fetch(`https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`);
 }
}
