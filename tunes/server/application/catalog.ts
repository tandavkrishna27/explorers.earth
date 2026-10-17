import {gameCatalogRequestSchema} from '../../shared/explorersGameOwnerContract';
import {movieGenreTermsResultSchema} from '../../shared/explorersMovieMediaContract';
import {MovieCatalog} from '../services/movieCatalog';
import {movieEntityDtoSchema,resolveManualMovieSchema} from '../../shared/explorersMovieContract';
import type { Pool } from 'pg';
import { entityCoreDtoSchema, resolveEntitySchema,commandKeySchema,type RequestContext } from '../../shared/explorersContract';
import type { Actor } from './actor';
import { authorizeOperation } from './authorization';
import { parseContent } from './recommendations';
import { RecommendationFailure,ExplorersRecommendationRepository } from '../repositories/explorersRecommendationRepository';
import {BookCatalog} from '../services/bookCatalog';
import {bookEntityDtoSchema} from '../../shared/explorersBookContract';
import {appEntityDtoSchema,resolveManualAppSchema} from '../../shared/explorersAppContract';
import {productEntityDtoSchema,resolveManualProductSchema} from '../../shared/explorersProductContract';
import {personEntityDtoSchema,resolveManualPersonSchema} from '../../shared/explorersPersonContract';
import {placeEntityDtoSchema,resolveManualPlaceSchema} from '../../shared/explorersPlaceContract';

export class MovieGenreFailure extends Error {constructor(readonly status:422|503,readonly code:'INVALID_INPUT'|'READ_LIMIT'){super(code==='INVALID_INPUT'?'Genre parameters are not supported':'Movie genre configuration unavailable');}}
export class GameCatalogFailure extends Error {
 readonly status=503;readonly code='PROVIDER_UNAVAILABLE' as const;
 constructor(){super('Games provider is unavailable');}
}
const reviewedMovieGenreMappings:Readonly<Record<string,string>>={"movie:28": "action", "movie:12": "adventure", "movie:16": "animation", "movie:35": "comedy", "movie:80": "crime", "movie:99": "documentary", "movie:18": "drama", "movie:10751": "family", "movie:14": "fantasy", "movie:36": "history", "movie:27": "horror", "movie:10402": "music", "movie:9648": "mystery", "movie:10749": "romance", "movie:878": "science-fiction", "movie:10770": "tv-movie", "movie:53": "thriller", "movie:10752": "war", "movie:37": "western", "tv:10759": "action-adventure", "tv:16": "animation", "tv:35": "comedy", "tv:80": "crime", "tv:99": "documentary", "tv:18": "drama", "tv:10751": "family", "tv:10762": "kids", "tv:9648": "mystery", "tv:10763": "news", "tv:10764": "reality", "tv:10765": "sci-fi-fantasy", "tv:10766": "soap", "tv:10767": "talk", "tv:10768": "war-politics", "tv:37": "western"};
/** Existing owned catalog context only. Provider ingestion/fetch is a separate
 * trusted server adapter; HTTP callers cannot supply or overwrite shared facts. */
export class CatalogService {
  constructor(private readonly db:Pool,private readonly books=new BookCatalog(),private readonly movies=new MovieCatalog({accessToken:process.env.TMDB_ACCESS_TOKEN,apiKey:process.env.TMDB_API_KEY,authorize:a=>authorizeOperation(db,a,'entities:resolve',a.accountId)})) {}
  async movieGenres(actor:Actor,input:unknown){
    await authorizeOperation(this.db,actor,'entities:resolve',actor?.accountId);
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new MovieGenreFailure(422,'INVALID_INPUT');
    const terms=(await this.db.query("SELECT t.id,t.slug,x.label FROM taxonomy_terms t JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale='en' WHERE t.category='movies' AND t.active ORDER BY t.slug,t.id LIMIT 28")).rows;
    if(terms.length!==27)throw new MovieGenreFailure(503,'READ_LIMIT');
    const mappings=(await this.db.query("SELECT m.term_id,m.external_kind,m.provider_genre_id,t.slug FROM movie_provider_genre_terms m JOIN taxonomy_terms t ON t.id=m.term_id AND t.category=m.category WHERE m.category='movies' AND t.active ORDER BY m.external_kind,m.provider_genre_id LIMIT 36")).rows;
    if(mappings.length!==35||mappings.some(m=>reviewedMovieGenreMappings[`${m.external_kind}:${m.provider_genre_id}`]!==m.slug)||new Set(mappings.map(m=>`${m.external_kind}:${m.provider_genre_id}`)).size!==35||new Set(mappings.map(m=>m.term_id)).size!==27)throw new MovieGenreFailure(503,'READ_LIMIT');
    const result=movieGenreTermsResultSchema.parse({version:'explorers-movie-genres/v1',items:terms.map(t=>({...t,providerMappings:mappings.filter(m=>m.term_id===t.id).map(m=>({externalKind:m.external_kind,providerGenreId:Number(m.provider_genre_id)}))}))});
    await authorizeOperation(this.db,actor,'entities:resolve',actor.accountId);return result;
  }
  async searchBooks(actor:Actor,input:unknown){await authorizeOperation(this.db,actor,'entities:resolve',actor?.accountId);return this.books.search(actor.accountId,input);}
  async searchGames(actor:Actor,input:unknown){await authorizeOperation(this.db,actor,'entities:resolve',actor?.accountId);parseContent(gameCatalogRequestSchema,input);throw new GameCatalogFailure();}
  async searchMovies(actor:Actor,input:unknown){return this.movies.search(actor,input);}
  async resolveEntity(actor:Actor,input:unknown,context?:RequestContext) {
    await authorizeOperation(this.db,actor,'entities:resolve',actor?.accountId);
    const parsed=parseContent(resolveEntitySchema,input);
    if('kind' in parsed) {
      if(parsed.kind==='provider'&&parsed.category==='games')throw new GameCatalogFailure();
      if(parsed.kind==='manual'&&parsed.category==='movies')return movieEntityDtoSchema.parse(await new ExplorersRecommendationRepository(this.db).resolveMovieEntity(actor.accountId,parseContent(resolveManualMovieSchema,parsed),parseContent(commandKeySchema,context?.idempotencyKey),async()=>{throw new RecommendationFailure(422,'Manual Movie cannot fetch provider authority');}));
      if(parsed.kind==='provider'&&parsed.category==='movies')return movieEntityDtoSchema.parse(await new ExplorersRecommendationRepository(this.db).resolveMovieEntity(actor.accountId,parsed,parseContent(commandKeySchema,context?.idempotencyKey),()=>this.movies.resolve(actor,parsed.externalKind,parsed.externalId)));
      const key=parseContent(commandKeySchema,context?.idempotencyKey),repository=new ExplorersRecommendationRepository(this.db);
      // Apps and Products carry typed details with their manual resolve. Without these
      // branches the details were dropped and only the entities row was written.
      if(parsed.kind==='manual'&&parsed.category==='apps')return appEntityDtoSchema.parse(await repository.resolveAppEntity(actor.accountId,parseContent(resolveManualAppSchema,parsed),key));
      if(parsed.kind==='manual'&&parsed.category==='products')return productEntityDtoSchema.parse(await repository.resolveProductEntity(actor.accountId,parseContent(resolveManualProductSchema,parsed),key));
      if(parsed.kind==='manual'&&parsed.category==='people')return personEntityDtoSchema.parse(await repository.resolvePersonEntity(actor.accountId,parseContent(resolveManualPersonSchema,parsed),key));
      if(parsed.kind==='manual'&&parsed.category==='places')return placeEntityDtoSchema.parse(await repository.resolvePlaceEntity(actor.accountId,parseContent(resolveManualPlaceSchema,parsed),key));
      if(parsed.kind==='provider'||parsed.category==='books'&&Object.keys(parsed.details).some(k=>k!=='title'))return bookEntityDtoSchema.parse(await repository.resolveBookEntity(actor.accountId,parsed as any,key,()=>this.books.resolve(actor.accountId,(parsed as any).externalId)));
      return entityCoreDtoSchema.parse(await repository.resolveManualEntity(actor.accountId,parsed as any,key));
    }
    const result=await this.db.query(`SELECT e.id,e.kind,e.title FROM entities e
      WHERE e.id=$1 AND EXISTS(SELECT 1 FROM recommendations r
        JOIN collection_items ci ON ci.recommendation_id=r.id
        JOIN collections c ON c.id=ci.collection_id
        WHERE r.entity_id=e.id AND r.account_id=$2 AND r.archived_at IS NULL AND c.archived_at IS NULL)`,[parsed.entityId,actor.accountId]);
    if(!result.rows[0]) throw new RecommendationFailure(404,'Entity unavailable');
    const entity=entityCoreDtoSchema.parse(result.rows[0]);
    const expected={places:['place','person'],movies:['movie'],books:['book'],games:['game'],apps:['app'],products:['product'],people:['person']};
    if(!expected[parsed.category].includes(entity.kind)) throw new RecommendationFailure(422,'Entity category mismatch');
    return entity;
  }
}
