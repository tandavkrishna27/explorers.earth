import type {Pool} from 'pg';
import type {Actor} from './actor';
import {AuthorizationError} from './authorization';
import {OwnerContentService} from './ownerContent';
import {PublicContentService} from './publicContent';
import {SearchFailure} from './searchQuery';
import {searchRequestSchema,publicSearchRequestSchema,creatorProfileSchema,type SearchInput} from '../../shared/explorersSearchContract';
import {PublicProfileService} from '../publicProfile/publicProfileService';
import {PostgresPublicProfileGateway} from '../publicProfile/postgresPublicProfileGateway';
/** Read-only application facade; observations confer no mutation authority. */
export class DiscoveryService {
 private owner:OwnerContentService;private public:PublicContentService;private profiles:PublicProfileService;
 constructor(pool:Pool,secret:string){this.owner=new OwnerContentService(pool,secret);this.public=new PublicContentService(pool,secret);this.profiles=new PublicProfileService(new PostgresPublicProfileGateway(pool),{ttlMs:0});}
 async searchRecommendations(actor:Actor|null,input:SearchInput){
  // Route/service authorization still precedes owner parsing; explicit owner
  // never downgrades when a credential is absent or invalid.
  if(input?.scope==='owner'){if(!actor)throw new AuthorizationError(401,'UNAUTHENTICATED','Sign in is required');return this.owner.searchRecommendations(actor,input);}
  const parsed=searchRequestSchema.safeParse(input);if(!parsed.success)throw new SearchFailure(400);return this.public.searchRecommendations(parsed.data);
 }
 listCreatorRecommendations(handle:string,input:Omit<Extract<SearchInput,{scope:'public'}>,'scope'|'creatorHandle'>){return this.public.searchRecommendations({...input,scope:'public',creatorHandle:handle});}
 async getCreatorProfile(handle:string){
  const parsed=publicSearchRequestSchema.pick({creatorHandle:true}).safeParse({creatorHandle:handle});if(!parsed.success||!parsed.data.creatorHandle)throw new SearchFailure(400);
  const shell=await this.profiles.shell(parsed.data.creatorHandle,{bypassCache:true});return shell?creatorProfileSchema.parse({id:shell.documentId,handle:shell.username,displayName:shell.Account_Name,accountType:shell.Account_Type}):undefined;
 }
 getCollection(actor:Actor|null,id:string){return actor?this.owner.getCollection(actor,id):this.public.getCollectionById(id);}
}
