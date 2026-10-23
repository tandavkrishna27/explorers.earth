import {replaceTaxonomyAssignment} from './taxonomyAssignmentRepository';
import type {TaxonomyAssignmentInput} from '../../shared/explorersTaxonomyContract';
import {insertMovieDetails,readMovieEntity,writeMovieContext,readMovieContext,checkMovieContext,writeMovieTerms} from './movieCatalogRepository';
import {movieDisplayFieldsSchema,movieDetailsSchema,emptyMovieDetails,resolveManualMovieSchema,type MovieContext} from '../../shared/explorersMovieContract';
import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { CollectionCoreDto, RecommendationCoreDto, TopPickCategory, CategoryTopPicksInput, CategoryTopPicksResult,DisplayOverrides,ReorderCategoryListsInput,CategoryListsOrderResult } from '../../shared/explorersContract';
import {createCollectionResultSchema,type CreateCollectionResult} from '../../shared/explorersContract';
import { lockContentCategories } from '../db/explorers-content-lock';
import type { RichNote } from '../../shared/explorersRichNoteContract';
import {emptyBookDetails,bookDisplayFieldsSchema,bookEntityDetailsSchema,type BookCandidate,type BookEntityDetails,type BookRecommendationContext} from '../../shared/explorersBookContract';
import {insertBookDetails,readBookEntity,writeBookContext} from './bookCatalogRepository';
import { replaceRecommendationMedia } from './recommendationMediaWrite';
import {insertAppDetails,readAppEntity,writeAppScreenshots} from './appCatalogRepository';
import {insertProductDetails,readProductEntity,writeProductOffer} from './productCatalogRepository';
import {appDisplayFieldsSchema,appEntityDetailsSchema,type AppScreenshots} from '../../shared/explorersAppContract';
import {productDisplayFieldsSchema,productEntityDetailsSchema,emptyProductOffer,type ProductOffer} from '../../shared/explorersProductContract';
import {personDisplayFieldsSchema,personEntityDetailsSchema,emptyPersonDetails} from '../../shared/explorersPersonContract';
import {insertPersonDetails,readPersonEntity} from './personCatalogRepository';
import {insertPlaceDetails,readPlaceEntity,writePlaceContext,writePlacePhotos,writePlaceCollectionDetails} from './placeCatalogRepository';
import {writeLocationLink,deleteLocationLink} from './placeLinkRepository';
import {linkableChildCategorySchema,type LinkableChildCategory} from '../../shared/explorersPlaceLinkContract';
import {placeDisplayFieldsSchema,placeEntityDetailsSchema,emptyPlaceDetails,emptyPlaceContext,emptyPlaceCollectionDetails,type PlaceRecommendationContext,type PlacePhotos,type PlaceCollectionDetails} from '../../shared/explorersPlaceContract';

export type CatalogKind = 'place'|'movie'|'book'|'game'|'app'|'product'|'person';
export type ContentCategory = 'places'|'guides'|'movies'|'books'|'games'|'apps'|'products'|'people';
/** Categories whose owner lists add and remove items through the shared membership route.
 *  Places stay out: their memberships carry pin positions and location links. */
const MEMBERSHIP_CATEGORIES:ReadonlySet<string>=new Set(['games','apps','products','people']);
export type CollectionRecord = CollectionCoreDto;
export type RecommendationRecord = RecommendationCoreDto;
export class RecommendationFailure extends Error {
  constructor(readonly status:404|409|413|422, message:string) {super(message);}
}
const hash=(value:string)=>createHash('sha256').update(value).digest();
// Hash normalized domain inputs, independent of transport JSON object insertion order.
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
const collectionDto=(r:any):CollectionRecord=>({id:r.id,accountId:r.account_id,category:r.category,title:r.title,slug:r.slug,
  visibility:r.visibility,publicationState:r.publication_state,revision:Number(r.revision),description:r.description,heading:r.heading,coverMediaId:r.cover_media_id??null});
const recommendationDto=(r:any):RecommendationRecord=>({id:r.id,accountId:r.account_id,entityId:r.entity_id,category:r.category,userRating:r.user_rating,publicationState:r.publication_state,revision:Number(r.revision),mediaIds:r.media_ids??[]});

/** Internal persistence seam: application authorization and typed transport validation precede calls. */
export class ExplorersRecommendationRepository {
  constructor(private readonly pool:Pool) {}
  private async collectionRecord(db:Pick<Pool,'query'>,row:any):Promise<CollectionRecord> {
    const cover=await db.query("SELECT media_id FROM collection_media WHERE collection_id=$1 AND slot='cover'",[row.id]);
    return collectionDto({...row,cover_media_id:cover.rows[0]?.media_id??null});
  }
  private async recommendationRecord(db:Pick<Pool,'query'>,row:any):Promise<RecommendationRecord> {
    const media=await db.query('SELECT media_id FROM recommendation_media WHERE recommendation_id=$1 ORDER BY display_order',[row.id]);
    return recommendationDto({...row,media_ids:media.rows.map(r=>r.media_id)});
  }
  private async replaceCover(db:PoolClient,accountId:string,id:string,mediaId:string|null) {
    await db.query('DELETE FROM collection_media WHERE collection_id=$1',[id]);
    if(mediaId!==null) await db.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[id,accountId,mediaId]);
  }
  private async replaceMedia(db:PoolClient,accountId:string,id:string,mediaIds:string[]) {
    await replaceRecommendationMedia(db,accountId,id,mediaIds);
  }
  private async transaction<T>(work:(db:PoolClient)=>Promise<T>):Promise<T> {
    const db=await this.pool.connect();
    try {await db.query('BEGIN');const result=await work(db);await db.query('COMMIT');return result;}
    catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
  }
  private async command<T>(accountId:string,operation:string,input:unknown,key:string,work:(db:PoolClient)=>Promise<T>):Promise<T> {
    if(!/^[A-Za-z0-9._~-]{8,200}$/.test(key)) throw new RecommendationFailure(422,'Idempotency key required');
    return this.transaction(async db=>{
      // Catalog mutex precedes account locks, including existing assignment lifecycle commands.
      const recommendationOperation=['updateRecommendation','archiveRecommendation','replaceRecommendationEntity'].includes(operation);
      const addressed=input as {category?:ContentCategory;id?:string};
      const observed=recommendationOperation?(await db.query('SELECT category FROM recommendations WHERE id=$1 AND account_id=$2',[addressed.id,accountId])).rows[0]:undefined;
      if(recommendationOperation&&!observed)throw new RecommendationFailure(404,'Recommendation unavailable');
      const taxonomyCategory=observed?.category??(operation==='createRecommendation'?addressed.category:undefined);
      if(taxonomyCategory==='places'||taxonomyCategory==='people')await db.query('SELECT lock_explorers_taxonomy_catalog($1)',[taxonomyCategory]);
      // Matches lifecycle lock order; a suspended/deleted account cannot start content writes.
      const account=await db.query('SELECT status FROM creator_accounts WHERE id=$1 FOR UPDATE',[accountId]);
      if(account.rows[0]?.status!=='active') throw new RecommendationFailure(404,'Account unavailable');
      if(recommendationOperation){
        const current=(await db.query('SELECT category FROM recommendations WHERE id=$1 AND account_id=$2',[addressed.id,accountId])).rows[0];
        if(!current||current.category!==observed.category)throw new RecommendationFailure(404,'Recommendation unavailable');
      }
      const keyHash=hash(key),requestHash=hash(canonical(input));
      const prior=await db.query(`SELECT request_hash,response,status,replay_until>clock_timestamp() AS replayable
        FROM application_command_receipts WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3 FOR UPDATE`,[accountId,operation,keyHash]);
      if(prior.rows[0]) {
        const row=prior.rows[0];
        if(!row.request_hash.equals(requestHash)||row.status!=='completed'||!row.replayable) throw new RecommendationFailure(409,'Idempotency conflict');
        return row.response as T;
      }
      // Account -> category -> aggregate. Replay returns above without mutation.
      // Existing resource scope is derived under the account lock, never supplied
      // by the caller; the callback still checks ownership/archive/revision.
      const commandInput=input as {category?:ContentCategory;id?:string;parentLocationCollectionId?:string};
      let category=commandInput.category;
      if(operation==='attachGameMembership'||operation==='detachGameMembership'){
        // Preserve the historical Games receipt fingerprint while deriving the
        // actual membership lock domain from the owned collection.
        const scope=await db.query('SELECT category FROM collections WHERE id=$1 AND account_id=$2',[(input as {collectionId:string}).collectionId,accountId]);
        category=scope.rows[0]?.category;
        if(!category)throw new RecommendationFailure(404,'Collection unavailable');
        if(!MEMBERSHIP_CATEGORIES.has(category))throw new RecommendationFailure(422,'Membership category unsupported');
      }
      if(!category) {
        const recommendation=operation==='updateRecommendation'||operation==='archiveRecommendation'||operation==='replaceRecommendationEntity';
        const scope=await db.query(recommendation
          ? 'SELECT category FROM recommendations WHERE id=$1 AND account_id=$2'
          : 'SELECT category FROM collections WHERE id=$1 AND account_id=$2',[commandInput.id,accountId]);
        category=scope.rows[0]?.category;
      }
      if(category) await lockContentCategories(db,accountId,operation==='createCollection'&&commandInput.parentLocationCollectionId!==undefined?[category,'places']:[category]);
      const result=await work(db);
      await db.query(`INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response)
        VALUES($1,$2,$3,$4,$5)`,[accountId,operation,keyHash,requestHash,JSON.stringify(result)]);
      return result;
    });
  }
  /** Bounded internal command seam; strict input and Actor authority come from the application. */
  async writeCategoryTopPicks(accountId:string,category:TopPickCategory,input:CategoryTopPicksInput,key:string,replace:boolean):Promise<CategoryTopPicksResult> {
    return this.command(accountId,replace?'setCategoryTopPicks':'upsertCategoryTopPickOrder',{category,...input},key,async db=>{
      // command holds account and category advisory locks before this pin lock.
      const categoryRevision=async()=>String((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') revision",[accountId,category])).rows[0].revision);
      if(await categoryRevision()!==input.expectedCategoryRevision) throw new RecommendationFailure(409,'Stale category revision');
      const state=await db.query('SELECT revision FROM account_category_pin_state WHERE account_id=$1 AND category=$2 FOR UPDATE',[accountId,category]);
      const revision=state.rows[0]?Number(state.rows[0].revision):null;
      if(revision!==input.expectedPinRevision) throw new RecommendationFailure(409,'Stale pin revision');
      for(const pin of input.orderedPins) {
        const member=await db.query(`SELECT 1 FROM collection_items ci JOIN collections c ON c.id=ci.collection_id
          JOIN recommendations r ON r.id=ci.recommendation_id WHERE ci.account_id=$1 AND ci.category=$2
          AND ci.recommendation_id=$3 AND ci.collection_id=$4 AND c.account_id=$1 AND c.category=$2
          AND r.account_id=$1 AND r.category=$2 AND c.archived_at IS NULL AND r.archived_at IS NULL`,
          [accountId,category,pin.recommendationId,pin.collectionId]);
        if(!member.rows[0]) throw new RecommendationFailure(422,'Selected membership unavailable');
      }
      // State must exist before pins because their FK points at it. New state is
      // revision 1, never inserted and subsequently incremented to 2.
      const changed=revision===null
        ?await db.query('INSERT INTO account_category_pin_state(account_id,category,revision) VALUES($1,$2,1) RETURNING revision',[accountId,category])
        :await db.query('UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1 AND category=$2 RETURNING revision',[accountId,category]);
      if(replace) await db.query('DELETE FROM category_recommendation_pins WHERE account_id=$1 AND category=$2',[accountId,category]);
      for(let position=0;position<input.orderedPins.length;position++) {
        const pin=input.orderedPins[position];
        await db.query(`INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position)
          VALUES($1,$2,$3,$4,$5) ON CONFLICT(account_id,category,recommendation_id)
          DO UPDATE SET collection_id=excluded.collection_id,position=excluded.position`,[accountId,category,pin.recommendationId,pin.collectionId,position]);
      }
      return {operation:replace?'replace':'upsert-order',categoryRevision:await categoryRevision(),pinRevision:Number(changed.rows[0].revision),
        pins:input.orderedPins.map((pin,position)=>({...pin,position}))};
    });
  }
  /** Provider facts are server-validated upstream; this method never fetches or accepts caller authority. */
  async resolveManualEntity(accountId:string,input:{category:TopPickCategory;details:{title:string}},key:string) {
    const kinds={books:'book',movies:'movie',games:'game',apps:'app',products:'product',people:'person'} as const;
    return this.command(accountId,'resolveManualEntity',input,key,async db=>{
      const result=await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES($1,$2,'manual',to_tsvector('simple',$2)) RETURNING id,kind,title",[kinds[input.category],input.details.title]);
      return result.rows[0] as {id:string;kind:CatalogKind;title:string};
    });
  }
  /** A manual game with its year, platforms and genres (GMS-X01). The details row is written
   * only for the game entity just created, and only when something was given. */
  async resolveGameEntity(accountId:string,input:{details:{title:string;releaseYear?:number|null;platforms?:string[];genres?:string[]}},key:string) {
    return this.command(accountId,'resolveGameEntity',input,key,async db=>{
      const {title,releaseYear=null,platforms=[],genres=[]}=input.details;
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('game',$1,'manual',to_tsvector('simple',$1)) RETURNING id,kind,title",[title])).rows[0] as {id:string;kind:CatalogKind;title:string};
      if(releaseYear!==null||platforms.length||genres.length)
        await db.query("INSERT INTO game_entity_details(entity_id,release_year,platforms,genres) SELECT id,$2,$3,$4 FROM entities WHERE id=$1 AND kind='game'",[entity.id,releaseYear,platforms,genres]);
      return entity;
    });
  }
  /**
   * Apps and Products have no provider, so there is only a manual path - but the details
   * are typed, and before this they were silently discarded: resolveEntity fell through
   * to resolveManualEntity, which writes the entities row and nothing else. The client
   * then rejected the untyped response, so creating one could not succeed.
   */
  async resolveAppEntity(accountId:string,input:{kind:'manual';category:'apps';details:Record<string,unknown>},key:string) {
    return this.command(accountId,'resolveAppEntity',input,key,async db=>{
      const {title,...fields}=input.details as {title:string};
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('app',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];
      await insertAppDetails(db,entity.id,appEntityDetailsSchema.parse({developer:null,logoUrl:null,description:null,downloadUrl:null,priceTier:null,platforms:[],...fields}));
      return readAppEntity(db,entity.id);
    });
  }
  async resolveProductEntity(accountId:string,input:{kind:'manual';category:'products';details:Record<string,unknown>},key:string) {
    return this.command(accountId,'resolveProductEntity',input,key,async db=>{
      const {title,...fields}=input.details as {title:string};
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('product',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];
      await insertProductDetails(db,entity.id,productEntityDetailsSchema.parse({brand:null,logoUrl:null,description:null,specifications:{},imageUrls:[],...fields}));
      return readProductEntity(db,entity.id);
    });
  }
  async resolvePersonEntity(accountId:string,input:{kind:'manual';category:'people';details:Record<string,unknown>},key:string) {
    return this.command(accountId,'resolvePersonEntity',input,key,async db=>{
      const {title,...fields}=input.details as {title:string};
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('person',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];
      await insertPersonDetails(db,entity.id,personEntityDetailsSchema.parse({...emptyPersonDetails(),...fields}));
      return readPersonEntity(db,entity.id);
    });
  }
  async resolvePlaceEntity(accountId:string,input:{kind:'manual';category:'places';details:Record<string,unknown>},key:string) {
    return this.command(accountId,'resolvePlaceEntity',input,key,async db=>{
      const {title,...fields}=input.details as {title:string};
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('place',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];
      await insertPlaceDetails(db,entity.id,placeEntityDetailsSchema.parse({...emptyPlaceDetails(),...fields}));
      return readPlaceEntity(db,entity.id);
    });
  }
  async resolveBookEntity(accountId:string,input:{kind:'provider';category:'books';provider:'google_books'|'open_library';externalKind:'volume'|'edition';externalId:string}|{kind:'manual';category:'books';details:{title:string}},key:string,fetchCandidate:()=>Promise<BookCandidate>) {
    return this.command(accountId,'resolveBookEntity',input,key,async db=>{
      if(input.kind==='provider') {
        const candidate=await fetchCandidate();
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical([input.provider,input.externalKind,input.externalId])]);
        const prior=(await db.query("SELECT entity_id FROM entity_identifiers WHERE provider=$1 AND external_kind=$2 AND external_id=$3",[input.provider,input.externalKind,input.externalId])).rows[0];
        if(prior)return readBookEntity(db,prior.entity_id);
        const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('book',$1,'provider',to_tsvector('simple',$1)) RETURNING id",[candidate.title])).rows[0];
        await insertBookDetails(db,entity.id,candidate.preview);
        await db.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,fetched_at,source_url) VALUES($1,$2,$3,$4,$5,$6)",[entity.id,input.provider,input.externalKind,input.externalId,new Date(candidate.provenance.fetchedAt),candidate.provenance.sourceUrl]);
        return readBookEntity(db,entity.id);
      }
      const {title,...fields}=input.details;
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('book',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];
      await insertBookDetails(db,entity.id,bookEntityDetailsSchema.parse({...emptyBookDetails(),...fields}));
      return readBookEntity(db,entity.id);
    });
  }
  async resolveMovieEntity(accountId:string,input:{kind:'provider';category:'movies';externalKind:'movie'|'tv';externalId:string}|{kind:'manual';category:'movies';details:Record<string,unknown>},key:string,fetchCandidate:()=>Promise<any>) {
    return this.command(accountId,'resolveMovieEntity',input,key,async db=>{
      if(input.kind==='manual'){const parsed=resolveManualMovieSchema.parse(input);const {title,mediaType,...fields}=parsed.details;const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('movie',$1,'manual',to_tsvector('simple',$1)) RETURNING id",[title])).rows[0];await insertMovieDetails(db,entity.id,movieDetailsSchema.parse({...emptyMovieDetails(mediaType),...fields}));return readMovieEntity(db,entity.id);}
      const candidate=await fetchCandidate();
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[canonical(['tmdb',input.externalKind,input.externalId])]);
      const prior=(await db.query("SELECT entity_id FROM entity_identifiers WHERE provider='tmdb' AND external_kind=$1 AND external_id=$2",[input.externalKind,input.externalId])).rows[0];
      if(prior)return readMovieEntity(db,prior.entity_id);
      const entity=(await db.query("INSERT INTO entities(kind,title,origin,search_document) VALUES('movie',$1,'provider',to_tsvector('simple',$1)) RETURNING id",[candidate.title])).rows[0];
      await insertMovieDetails(db,entity.id,candidate.details);
      await db.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,fetched_at,source_url) VALUES($1,'tmdb',$2,$3,$4,$5)",[entity.id,input.externalKind,input.externalId,new Date(candidate.provenance.fetchedAt),candidate.provenance.sourceUrl]);
      return readMovieEntity(db,entity.id);
    });
  }
  private async replaceOverrides(db:PoolClient,accountId:string,id:string,values:DisplayOverrides) {
    if(Object.keys(values).length===0) {await db.query('DELETE FROM recommendation_display_overrides WHERE recommendation_id=$1 AND account_id=$2',[id,accountId]);return;}
    await db.query(`INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(recommendation_id) DO UPDATE SET display_values=excluded.display_values`,[id,accountId,JSON.stringify(values)]);
  }
  async resolveProviderEntity(input:{kind:CatalogKind;title:string;provider:'tmdb'|'google_books'|'open_library'|'igdb'|'google_places';externalKind:string;externalId:string}) {
    return this.transaction(async db=>{
      const identity=canonical([input.provider,input.externalKind,input.externalId]);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);
      const existing=await db.query(`SELECT e.id,e.kind,e.title FROM entity_identifiers i JOIN entities e ON e.id=i.entity_id
        WHERE i.provider=$1 AND i.external_kind=$2 AND i.external_id=$3`,[input.provider,input.externalKind,input.externalId]);
      if(existing.rows[0]) {
        if(existing.rows[0].kind!==input.kind) throw new RecommendationFailure(409,'Provider identity kind conflict');
        return existing.rows[0] as {id:string;kind:CatalogKind;title:string};
      }
      const inserted=await db.query(`INSERT INTO entities(kind,title,origin,search_document)
        VALUES($1,$2,'provider',to_tsvector('simple',$2)) RETURNING id,kind,title`,[input.kind,input.title]);
      await db.query(`INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id) VALUES($1,$2,$3,$4)`,
        [inserted.rows[0].id,input.provider,input.externalKind,input.externalId]);
      return inserted.rows[0] as {id:string;kind:CatalogKind;title:string};
    });
  }
  async createCollection(accountId:string,input:{category:ContentCategory;title:string;slug:string;visibility?:'public'|'private';publicationState?:'draft'|'published';description?:string|null;heading?:string|null;coverMediaId?:string|null;placeLocation?:PlaceCollectionDetails;parentLocationCollectionId?:string;parentExpectedRevision?:number},key:string):Promise<CreateCollectionResult> {
    const linked=input.parentLocationCollectionId!==undefined;
    if(linked!==(input.parentExpectedRevision!==undefined))throw new RecommendationFailure(422,'Parent identity and revision are required together');
    if(linked&&(!Number.isSafeInteger(input.parentExpectedRevision)||(input.parentExpectedRevision??0)<1))throw new RecommendationFailure(422,'Invalid revision');
    if(linked&&!linkableChildCategorySchema.safeParse(input.category).success)throw new RecommendationFailure(422,'Only Products and People lists link to a location');
    const normalized={...input,visibility:input.visibility??'private',publicationState:input.publicationState??'draft'};
    return this.command(accountId,'createCollection',normalized,key,async db=>{
      const parent=linked?await this.lockCollection(db,accountId,input.parentLocationCollectionId!,input.parentExpectedRevision!):undefined;
      if(parent&&parent.category!=='places')throw new RecommendationFailure(422,'A location list is required');
      // LP-09. A slug a LIVE list was renamed from still resolves to that list, so a new
      // list may not take it. A redirect left by an archived list is stale and released.
      const redirected=await db.query(`SELECT 1 FROM collection_slug_redirects r JOIN collections c ON c.id=r.collection_id
        WHERE r.account_id=$1 AND r.category=$2 AND r.old_slug=$3 AND c.archived_at IS NULL`,[accountId,input.category,input.slug]);
      if(redirected.rowCount)throw new RecommendationFailure(409,'Content conflicts with an existing resource');
      await db.query('DELETE FROM collection_slug_redirects WHERE account_id=$1 AND category=$2 AND old_slug=$3',[accountId,input.category,input.slug]);
      const result=await db.query(`INSERT INTO collections(account_id,category,title,slug,visibility,publication_state,display_order)
        SELECT $1,$2,$3,$4,$5,$6,coalesce(max(display_order)+1,0) FROM collections WHERE account_id=$1 AND category=$2 RETURNING *`,
        [accountId,input.category,input.title,input.slug,normalized.visibility,normalized.publicationState]);
      await db.query('UPDATE collections SET description=$2,heading=$3 WHERE id=$1',[result.rows[0].id,input.description??null,input.heading??null]);
      await this.replaceCover(db,accountId,result.rows[0].id,input.coverMediaId??null);
      if(input.category!=='places'&&input.placeLocation!==undefined)throw new RecommendationFailure(422,'Category context mismatch');
      // A Places list always owns a location row from the start, so the location is this
      // list's own from creation; an unset location is explicitly empty, not missing.
      if(input.category==='places')await writePlaceCollectionDetails(db,result.rows[0].id,accountId,input.placeLocation??emptyPlaceCollectionDetails());
      // Ticket 5.2. Creating a list from a location links it in the same transaction, so a
      // failed parent leaves no orphan child - the whole create rolls back.
      let parentLocation:CreateCollectionResult['parentLocation'];
      if(input.parentLocationCollectionId!==undefined){
        const child=linkableChildCategorySchema.safeParse(input.category);
        if(!child.success)throw new RecommendationFailure(422,'Only Products and People lists link to a location');
        await writeLocationLink(db,{childCollectionId:result.rows[0].id,accountId,childCategory:child.data,locationCollectionId:input.parentLocationCollectionId});
        const changed=await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1 AND account_id=$2 RETURNING id,revision',[parent!.id,accountId]);
        parentLocation={id:changed.rows[0].id,revision:Number(changed.rows[0].revision)};
      }
      const created=createCollectionResultSchema.parse({...await this.collectionRecord(db,{...result.rows[0],description:input.description??null,heading:input.heading??null}),...(parentLocation?{parentLocation}:{})});
      if(created.accountId!==accountId||created.category!==input.category||created.revision!==1||created.id.toLowerCase()===input.parentLocationCollectionId?.toLowerCase()||
        (linked?(created.parentLocation?.id.toLowerCase()!==input.parentLocationCollectionId!.toLowerCase()||created.parentLocation?.revision!==input.parentExpectedRevision!+1):created.parentLocation!==undefined))throw new RecommendationFailure(422,'Invalid create result');
      return created;
    });
  }
  private async lockCollection(db:PoolClient,accountId:string,id:string,revision:number,options:{allowArchived?:boolean}={}) {
    if(!Number.isSafeInteger(revision)||revision<1) throw new RecommendationFailure(422,'Invalid revision');
    const result=await db.query(`SELECT * FROM collections WHERE id=$1 AND account_id=$2${options.allowArchived?'':' AND archived_at IS NULL'} FOR UPDATE`,[id,accountId]);
    if(!result.rows[0]) throw new RecommendationFailure(404,'Collection unavailable');
    if(Number(result.rows[0].revision)!==revision) throw new RecommendationFailure(409,'Stale collection revision');
    return result.rows[0];
  }
  async createRecommendation(accountId:string,input:{category:Exclude<ContentCategory,'guides'>;entityId:string;collectionId:string;expectedCollectionRevision:number;userRating?:number|null;publicationState?:'draft'|'published';mediaIds?:string[];note?:RichNote|null;displayOverrides?:DisplayOverrides;bookContext?:BookRecommendationContext;movieContext?:MovieContext;movieTermIds?:string[];appScreenshots?:AppScreenshots;productOffer?:ProductOffer;placeContext?:PlaceRecommendationContext;placePhotos?:PlacePhotos}&TaxonomyAssignmentInput,key:string):Promise<RecommendationRecord> {
    return this.command(accountId,'createRecommendation',input,key,async db=>{
      if(input.category!=='places'&&input.placesTaxonomy!==undefined||input.category!=='people'&&input.peopleSectorTermId!==undefined)throw new RecommendationFailure(422,'Category taxonomy mismatch');
      const list=await this.lockCollection(db,accountId,input.collectionId,input.expectedCollectionRevision);
      if(list.category!==input.category) throw new RecommendationFailure(422,'Collection category mismatch');
      const result=await db.query(`INSERT INTO recommendations(account_id,entity_id,category,user_rating,publication_state,note)
        VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,[accountId,input.entityId,input.category,input.userRating??null,input.publicationState??'draft',input.note==null?null:JSON.stringify(input.note)]);
      await db.query(`INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order)
        SELECT $1,$2,$3,$4,coalesce(max(display_order)+1,0) FROM collection_items WHERE collection_id=$1`,
        [input.collectionId,result.rows[0].id,accountId,input.category]);
      await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1',[input.collectionId]);
      if(input.displayOverrides!==undefined) await this.replaceOverrides(db,accountId,result.rows[0].id,input.displayOverrides);
      if(input.bookContext!==undefined) await writeBookContext(db,result.rows[0].id,accountId,input.bookContext);
      if(input.category!=='apps'&&input.appScreenshots!==undefined||input.category!=='products'&&input.productOffer!==undefined||input.category!=='places'&&(input.placeContext!==undefined||input.placePhotos!==undefined))throw new RecommendationFailure(422,'Category context mismatch');
      if(input.appScreenshots!==undefined) await writeAppScreenshots(db,result.rows[0].id,accountId,input.appScreenshots.screenshotMediaIds);
      // An offer row is always written for a product so the recorded offer is this
      // recommendation's own from the start; absent fields are unknown, not zero.
      if(input.category==='products') await writeProductOffer(db,result.rows[0].id,accountId,input.productOffer??emptyProductOffer());
      // A fresh Places row always gets a context, so contact disclosure is explicitly
      // private from creation rather than absent and later defaulted. The default type
      // follows the entity: a Places list may hold a person, which is the existing
      // Recommendation_Type:'person' case, and 0046's deferred invariant requires the
      // declared type to match the entity kind.
      if(input.category==='places'){
       const kind=(await db.query<{kind:string}>('SELECT kind FROM entities WHERE id=$1',[input.entityId])).rows[0]?.kind;
       const fallback={...emptyPlaceContext(),...(kind==='person'?{recommendationType:'person' as const}:{})};
       await writePlaceContext(db,result.rows[0].id,accountId,input.placeContext??fallback);
      }
      if(input.placePhotos!==undefined) await writePlacePhotos(db,result.rows[0].id,accountId,input.placePhotos.photoMediaIds);
      if(input.category==='movies'&&(await db.query('SELECT 1 FROM movie_entity_details WHERE entity_id=$1',[input.entityId])).rows[0]){await writeMovieContext(db,result.rows[0].id,accountId,input.entityId,input.movieContext??{region:'US',selectedProviderIds:null});await writeMovieTerms(db,result.rows[0].id,accountId,input.entityId,input.movieTermIds);}
      await replaceTaxonomyAssignment(db,result.rows[0].id,accountId,input.category,input);
      await this.replaceMedia(db,accountId,result.rows[0].id,input.mediaIds??[]);
      return this.recommendationRecord(db,result.rows[0]);
    });
  }
  async reorderCollection(accountId:string,id:string,expectedRevision:number,ids:string[],key:string):Promise<CollectionRecord> {
    return this.command(accountId,'reorderCollection',{id,expectedRevision,ids},key,async db=>{
      await this.lockCollection(db,accountId,id,expectedRevision);
      const current=await db.query(`SELECT ci.recommendation_id,r.archived_at FROM collection_items ci
        JOIN recommendations r ON r.id=ci.recommendation_id WHERE ci.collection_id=$1`,[id]);
      const active=current.rows.filter(r=>!r.archived_at).map(r=>r.recommendation_id);
      if(ids.length!==active.length||new Set(ids).size!==ids.length||ids.some(value=>!active.includes(value)))
        throw new RecommendationFailure(422,'Order requires exact active member set');
      // Archived recommendations lose membership in the archive operation, avoiding rank collisions.
      for(let position=0;position<ids.length;position++) await db.query('UPDATE collection_items SET display_order=$3 WHERE collection_id=$1 AND recommendation_id=$2',[id,ids[position],position]);
      const result=await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id]);
      return this.collectionRecord(db,result.rows[0]);
    });
  }
  /**
   * Orders an owner's lists within one category.
   *
   * One transaction under the account and category locks every command takes, so two reorders
   * (or a reorder and an edit) serialize. The positions are written as 0..n-1 in a single
   * statement from the named order, which is what keeps them dense and unique however the
   * previous values looked. The category revision the caller read must still be current, and
   * the named lists must be exactly the owner's active lists (display) or exactly the
   * currently pinned ones (pinned): another owner's id, an archived list, an omission or a
   * list added since all fail the same way, with a conflict that reveals nothing about
   * lists that are not the caller's.
   */
  async reorderCategoryLists(accountId:string,category:ContentCategory,input:ReorderCategoryListsInput,key:string):Promise<CategoryListsOrderResult> {
    return this.command(accountId,'reorderCategoryLists',{category,...input},key,async db=>{
      const revision=String((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') revision",[accountId,category])).rows[0].revision);
      if(revision!==input.expectedCategoryRevision) throw new RecommendationFailure(409,'Stale category revision');
      const pinned=input.scope==='pinned';
      const current=(await db.query(`SELECT id::text AS id FROM collections WHERE account_id=$1 AND category=$2 AND archived_at IS NULL${pinned?' AND pin_order IS NOT NULL':''}
        ORDER BY ${pinned?'pin_order':'display_order'},id FOR UPDATE`,[accountId,category])).rows.map(row=>row.id as string);
      if(current.length!==input.orderedCollectionIds.length||input.orderedCollectionIds.some(id=>!current.includes(id)))
        throw new RecommendationFailure(409,'Lists changed; reload and retry');
      const column=pinned?'pin_order':'display_order';
      await db.query(`UPDATE collections c SET ${column}=ordered.ordinal-1,revision=c.revision+1,updated_at=now()
        FROM unnest($3::uuid[]) WITH ORDINALITY AS ordered(id,ordinal)
        WHERE c.id=ordered.id AND c.account_id=$1 AND c.category=$2 AND coalesce(c.${column},-1)<>ordered.ordinal-1`,[accountId,category,input.orderedCollectionIds]);
      const after=String((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category=$2),'0') revision",[accountId,category])).rows[0].revision);
      return {category,scope:input.scope,categoryRevision:after,lists:input.orderedCollectionIds.map((id,position)=>({id,position}))};
    });
  }
  async archiveCollection(accountId:string,id:string,expectedRevision:number,key:string):Promise<{id:string;archived:true}> {
    return this.command(accountId,'archiveCollection',{id,expectedRevision},key,async db=>{
      await this.lockCollection(db,accountId,id,expectedRevision);
      const removed=await db.query('DELETE FROM category_recommendation_pins WHERE collection_id=$1 RETURNING account_id,category',[id]);
      if(removed.rowCount) await db.query('UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1 AND category=(SELECT category FROM collections WHERE id=$2)',[accountId,id]);
      await db.query('UPDATE collections SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$1',[id]);
      return {id,archived:true};
    });
  }
  // LP-08. Restore brings an archived list back under its slug, or a new one when the old
  // slug now belongs to a live list or is a live list's redirect. The new slug leaves no
  // redirect: the archived URL resolved to nothing, so there is no old link to keep.
  async restoreCollection(accountId:string,id:string,expectedRevision:number,slug:string|undefined,key:string):Promise<CollectionRecord> {
    return this.command(accountId,'restoreCollection',{id,expectedRevision,slug},key,async db=>{
      const locked=await this.lockCollection(db,accountId,id,expectedRevision,{allowArchived:true});
      if(!locked.archived_at)throw new RecommendationFailure(409,'List is not archived');
      const next=slug??locked.slug;
      const taken=await db.query(`SELECT 1 FROM collections WHERE account_id=$1 AND category=$2 AND slug=$3 AND archived_at IS NULL AND id<>$4
        UNION ALL SELECT 1 FROM collection_slug_redirects r JOIN collections c ON c.id=r.collection_id
        WHERE r.account_id=$1 AND r.category=$2 AND r.old_slug=$3 AND r.collection_id<>$4 AND c.archived_at IS NULL LIMIT 1`,[accountId,locked.category,next,id]);
      if(taken.rowCount)throw new RecommendationFailure(409,'List URL is taken; choose a new URL to restore');
      await db.query('DELETE FROM collection_slug_redirects WHERE account_id=$1 AND category=$2 AND old_slug=$3',[accountId,locked.category,next]);
      const result=await db.query('UPDATE collections SET archived_at=NULL,slug=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id,next]);
      return this.collectionRecord(db,result.rows[0]);
    });
  }
  // LP-08. Permanent delete. Children CASCADE (analytics events only lose their link, 0066);
  // recommendations left in no other list are archived so media cleanup follows the
  // existing archive path. Recommendations and entities are never hard-deleted.
  async purgeCollection(accountId:string,id:string,expectedRevision:number,key:string):Promise<{id:string;deleted:true}> {
    return this.command(accountId,'purgeCollection',{id,expectedRevision},key,async db=>{
      const locked=await this.lockCollection(db,accountId,id,expectedRevision,{allowArchived:true});
      const orphans=await db.query(`SELECT ci.recommendation_id id FROM collection_items ci WHERE ci.collection_id=$1
        AND NOT EXISTS (SELECT 1 FROM collection_items o WHERE o.recommendation_id=ci.recommendation_id AND o.collection_id<>$1)`,[id]);
      const removed=await db.query('DELETE FROM category_recommendation_pins WHERE collection_id=$1 RETURNING 1',[id]);
      if(removed.rowCount) await db.query('UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1 AND category=$2',[accountId,locked.category]);
      await db.query('DELETE FROM collections WHERE id=$1 AND account_id=$2',[id,accountId]);
      if(orphans.rowCount) await db.query('UPDATE recommendations SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=ANY($1::uuid[]) AND account_id=$2 AND archived_at IS NULL',[orphans.rows.map(r=>r.id),accountId]);
      return {id,deleted:true};
    });
  }
  async getPublicCollection(id:string):Promise<CollectionRecord|null> {
    const result=await this.pool.query(`SELECT c.* FROM collections c JOIN creator_accounts a ON a.id=c.account_id
      JOIN account_category_settings s ON s.account_id=c.account_id AND s.category=c.category
      WHERE c.id=$1 AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
        AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`,[id]);
    return result.rows[0]?this.collectionRecord(this.pool,result.rows[0]):null;
  }
  private async lockRecommendation(db:PoolClient,accountId:string,id:string,revision:number) {
    if(!Number.isSafeInteger(revision)||revision<1) throw new RecommendationFailure(422,'Invalid revision');
    const result=await db.query('SELECT * FROM recommendations WHERE id=$1 AND account_id=$2 AND archived_at IS NULL FOR UPDATE',[id,accountId]);
    if(!result.rows[0]) throw new RecommendationFailure(404,'Recommendation unavailable');
    if(Number(result.rows[0].revision)!==revision) throw new RecommendationFailure(409,'Stale recommendation revision');
    return result.rows[0];
  }
  private async lockRecommendationParents(db:PoolClient,accountId:string,id:string,activeOnly=true) {
    // Scope discovery occurs under command's account/category locks. Stable UUID
    // parent order precedes every recommendation lock for cleanup-capable commands.
    return (await db.query(`SELECT c.id,c.revision,c.category FROM collections c JOIN collection_items ci ON ci.collection_id=c.id
      AND ci.account_id=c.account_id AND ci.category=c.category WHERE ci.recommendation_id=$1 AND c.account_id=$2
      ${activeOnly?'AND c.archived_at IS NULL':"AND (c.category<>'places' OR c.archived_at IS NULL)"} ORDER BY c.id FOR UPDATE OF c`,[id,accountId])).rows;
  }
  async writeGameMembership(accountId:string,collectionId:string,recommendationId:string,input:{expectedCollectionRevision:number;expectedRecommendationRevision:number},key:string,attached:boolean){
    return this.command(accountId,attached?'attachGameMembership':'detachGameMembership',{category:'games',collectionId,recommendationId,...input},key,async db=>{
      const collection=await this.lockCollection(db,accountId,collectionId,input.expectedCollectionRevision);
      const recommendation=await this.lockRecommendation(db,accountId,recommendationId,input.expectedRecommendationRevision);
      const category=collection.category;
      if(!MEMBERSHIP_CATEGORIES.has(category)||recommendation.category!==category)throw new RecommendationFailure(422,'Membership category unsupported');
      const existing=await db.query('SELECT 1 FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[collectionId,recommendationId]);
      if(attached){
        if(existing.rowCount)throw new RecommendationFailure(409,'Membership already exists');
        await db.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) SELECT $1,$2,$3,$4,coalesce(max(display_order)+1,0) FROM collection_items WHERE collection_id=$1",[collectionId,recommendationId,accountId,category]);
      }else{
        if(!existing.rowCount)throw new RecommendationFailure(404,'Membership unavailable');
        const pins=await db.query("DELETE FROM category_recommendation_pins WHERE account_id=$1 AND category=$4 AND collection_id=$2 AND recommendation_id=$3 RETURNING position",[accountId,collectionId,recommendationId,category]);
        if(pins.rowCount)await db.query("UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1 AND category=$2",[accountId,category]);
        await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[collectionId,recommendationId]);
        await db.query('WITH ranks AS (SELECT recommendation_id,row_number() OVER(ORDER BY display_order,recommendation_id)-1 AS position FROM collection_items WHERE collection_id=$1) UPDATE collection_items ci SET display_order=ranks.position FROM ranks WHERE ci.collection_id=$1 AND ci.recommendation_id=ranks.recommendation_id',[collectionId]);
      }
      const list=await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[collectionId]);
      const row=await db.query('UPDATE recommendations SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[recommendationId]);
      return{collection:await this.collectionRecord(db,list.rows[0]),recommendation:await this.recommendationRecord(db,row.rows[0]),attached};
    });
  }
  /**
   * Links an existing child list to a location, or unlinks it.
   *
   * Both revisions are checked under their locks, so a stale view cannot link a pair the
   * creator was not looking at. The child's revision moves either way, because what the
   * list belongs to is part of the list.
   */
  async writeLocationMembership(accountId:string,input:{childCollectionId:string;expectedChildRevision:number;locationCollectionId?:string;expectedLocationRevision?:number},key:string,attached:boolean) {
    return this.command(accountId,attached?'attachLocationLink':'detachLocationLink',{childCollectionId:input.childCollectionId,expectedChildRevision:input.expectedChildRevision,locationCollectionId:input.locationCollectionId??null,expectedLocationRevision:input.expectedLocationRevision??null},key,async db=>{
      // A link spans two categories, so both are locked before any row is - the
      // wrapper derives one category from `id` and this command is addressed by the
      // child, so it takes its own locks in the same account -> category -> row order.
      const observed=(await db.query('SELECT category FROM collections WHERE id=$1 AND account_id=$2',[input.childCollectionId,accountId])).rows[0];
      if(!observed)throw new RecommendationFailure(404,'Collection unavailable');
      const childCategory=linkableChildCategorySchema.safeParse(observed.category);
      if(!childCategory.success)throw new RecommendationFailure(422,'Only Products and People lists link to a location');
      await lockContentCategories(db,accountId,[childCategory.data,'places']);
      await this.lockCollection(db,accountId,input.childCollectionId,input.expectedChildRevision);
      if(attached){
        if(input.locationCollectionId===undefined||input.expectedLocationRevision===undefined)throw new RecommendationFailure(422,'A location list is required');
        // Locked for its revision, and its category checked here so the refusal says which
        // rule was broken rather than surfacing a foreign key.
        const parent=await this.lockCollection(db,accountId,input.locationCollectionId,input.expectedLocationRevision);
        if(parent.category!=='places')throw new RecommendationFailure(422,'A location list is required');
        await writeLocationLink(db,{childCollectionId:input.childCollectionId,accountId,childCategory:childCategory.data,locationCollectionId:input.locationCollectionId});
      }else{
        await deleteLocationLink(db,input.childCollectionId,accountId);
      }
      const row=await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[input.childCollectionId]);
      return{collection:await this.collectionRecord(db,row.rows[0]),attached};
    });
  }
  async updateCollection(accountId:string,id:string,expectedRevision:number,input:{title?:string;slug?:string;visibility?:'public'|'private';publicationState?:'draft'|'published';description?:string|null;heading?:string|null;coverMediaId?:string|null;placeLocation?:PlaceCollectionDetails;displayOrder?:number;pinOrder?:number|null},key:string):Promise<CollectionRecord> {
    return this.command(accountId,'updateCollection',{id,expectedRevision,input},key,async db=>{
      const locked=await this.lockCollection(db,accountId,id,expectedRevision);
      if(locked.category!=='places'&&input.placeLocation!==undefined)throw new RecommendationFailure(422,'Category context mismatch');
      // LP-09. Renaming keeps the old URL working: the old slug becomes a redirect to this
      // list. Taking a slug that is another live list's redirect is a conflict; taking a
      // slug this list (or an archived list) left behind releases that redirect.
      if(input.slug!==undefined&&input.slug!==locked.slug){
        const taken=await db.query(`SELECT 1 FROM collection_slug_redirects r JOIN collections c ON c.id=r.collection_id
          WHERE r.account_id=$1 AND r.category=$2 AND r.old_slug=$3 AND r.collection_id<>$4 AND c.archived_at IS NULL`,[accountId,locked.category,input.slug,id]);
        if(taken.rowCount)throw new RecommendationFailure(409,'Content conflicts with an existing resource');
        await db.query('DELETE FROM collection_slug_redirects WHERE account_id=$1 AND category=$2 AND old_slug=$3',[accountId,locked.category,input.slug]);
        await db.query(`INSERT INTO collection_slug_redirects(account_id,category,old_slug,collection_id) VALUES($1,$2,$3,$4)
          ON CONFLICT (account_id,category,old_slug) DO UPDATE SET collection_id=EXCLUDED.collection_id,created_at=now()`,[accountId,locked.category,locked.slug,id]);
      }
      const result=await db.query(`UPDATE collections SET title=coalesce($2,title),visibility=coalesce($3,visibility),
        publication_state=coalesce($4,publication_state),slug=coalesce($5,slug),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.title??null,input.visibility??null,input.publicationState??null,input.slug??null]);
      if(input.description!==undefined) await db.query('UPDATE collections SET description=$2 WHERE id=$1',[id,input.description]);
      if(input.heading!==undefined) await db.query('UPDATE collections SET heading=$2 WHERE id=$1',[id,input.heading]);
      if(input.coverMediaId!==undefined) await this.replaceCover(db,accountId,id,input.coverMediaId);
      // Where the list sits, and whether it is pinned above the rest. Both are the
      // list's own and neither touches the pinned recommendations inside it.
      if(input.displayOrder!==undefined) await db.query('UPDATE collections SET display_order=$2 WHERE id=$1 AND account_id=$3',[id,input.displayOrder,accountId]);
      // Publish before pin, and unpublishing unpins. Tickets 5.1 and 5.3.
      //
      // A pin is a promise that the list appears first on a public profile, so pinning
      // something nobody can see is a pin that does nothing - and leaving a pin on a list
      // that has just been unpublished is worse, because the pin outlives the visibility
      // and the slot stays occupied by something absent.
      //
      // The two cases are deliberately not treated the same. Explicitly pinning an
      // unpublished or private list is a mistake and is refused. Unpublishing a list that
      // happens to be pinned is a legitimate action, so the pin is cleared in this same
      // transaction rather than the caller being made to do it in a second request that
      // could fail on its own.
      const finalState=input.publicationState??locked.publication_state;
      const finalVisibility=input.visibility??locked.visibility;
      const publiclyVisible=finalState==='published'&&finalVisibility==='public';
      const requestedPin=input.pinOrder!==undefined?input.pinOrder:(locked.pin_order===null?null:Number(locked.pin_order));
      if(input.pinOrder!==undefined&&input.pinOrder!==null&&!publiclyVisible)
        throw new RecommendationFailure(422,'A list must be published and public before it can be pinned');
      const pinOrder=publiclyVisible?requestedPin:null;
      if(input.pinOrder!==undefined||pinOrder!==requestedPin||locked.pin_order!==null&&pinOrder===null)
        await db.query('UPDATE collections SET pin_order=$2 WHERE id=$1 AND account_id=$3',[id,pinOrder,accountId]);
      if(input.placeLocation!==undefined) await writePlaceCollectionDetails(db,id,accountId,input.placeLocation);
      return this.collectionRecord(db,{...result.rows[0],description:input.description===undefined?result.rows[0].description:input.description,heading:input.heading===undefined?result.rows[0].heading:input.heading});
    });
  }
  async updateRecommendation(accountId:string,id:string,expectedRevision:number,input:{userRating?:number|null;publicationState?:'draft'|'published';mediaIds?:string[];note?:RichNote|null;displayOverrides?:DisplayOverrides;bookContext?:BookRecommendationContext;movieContext?:MovieContext;movieTermIds?:string[];appScreenshots?:AppScreenshots;productOffer?:ProductOffer;placeContext?:PlaceRecommendationContext;placePhotos?:PlacePhotos}&TaxonomyAssignmentInput,key:string):Promise<RecommendationRecord> {
    if(input.userRating!==undefined&&input.userRating!==null&&(!Number.isInteger(input.userRating)||input.userRating<1||input.userRating>10))
      throw new RecommendationFailure(422,'Invalid rating');
    return this.command(accountId,'updateRecommendation',{id,expectedRevision,input},key,async db=>{
      const locked=await this.lockRecommendation(db,accountId,id,expectedRevision);
      if(locked.category!=='books'&&input.bookContext!==undefined||locked.category!=='movies'&&(input.movieContext!==undefined||input.movieTermIds!==undefined)||locked.category!=='apps'&&input.appScreenshots!==undefined||locked.category!=='products'&&input.productOffer!==undefined||locked.category!=='places'&&(input.placeContext!==undefined||input.placePhotos!==undefined))throw new RecommendationFailure(422,'Category context mismatch');
      if(locked.category==='movies'){const {title,...fields}=input.displayOverrides??{};if(!movieDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid Movie overrides');}else if(locked.category==='books'){const {title,...fields}=input.displayOverrides??{};if(!bookDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid Book overrides');}else if(locked.category==='apps'){const {title,...fields}=input.displayOverrides??{};if(!appDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid App overrides');}else if(locked.category==='products'){const {title,...fields}=input.displayOverrides??{};if(!productDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid Product overrides');}else if(locked.category==='people'){const {title,...fields}=input.displayOverrides??{};if(!personDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid Person overrides');}else if(locked.category==='places'){const {title,...fields}=input.displayOverrides??{};if(!placeDisplayFieldsSchema.safeParse(fields).success)throw new RecommendationFailure(422,'Invalid Place overrides');}else if(Object.keys(input.displayOverrides??{}).some(k=>k!=='title'))throw new RecommendationFailure(422,'Category overrides mismatch');
      const result=await db.query(`UPDATE recommendations SET user_rating=CASE WHEN $2 THEN $3 ELSE user_rating END,
        publication_state=coalesce($4,publication_state),note=CASE WHEN $5 THEN $6::jsonb ELSE note END,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.userRating!==undefined,input.userRating??null,input.publicationState??null,input.note!==undefined,input.note==null?null:JSON.stringify(input.note)]);
      if(input.displayOverrides!==undefined) await this.replaceOverrides(db,accountId,id,input.displayOverrides);
      if(input.bookContext!==undefined) await writeBookContext(db,id,accountId,input.bookContext);
      if(input.movieContext!==undefined)await writeMovieContext(db,id,accountId,locked.entity_id,input.movieContext);
      if(input.movieTermIds!==undefined)await writeMovieTerms(db,id,accountId,locked.entity_id,input.movieTermIds);
      if(input.appScreenshots!==undefined) await writeAppScreenshots(db,id,accountId,input.appScreenshots.screenshotMediaIds);
      if(input.productOffer!==undefined) await writeProductOffer(db,id,accountId,input.productOffer);
      if(input.placeContext!==undefined) await writePlaceContext(db,id,accountId,input.placeContext);
      if(input.placePhotos!==undefined) await writePlacePhotos(db,id,accountId,input.placePhotos.photoMediaIds);
      await replaceTaxonomyAssignment(db,id,accountId,locked.category,input);
      if(input.mediaIds!==undefined) await this.replaceMedia(db,accountId,id,input.mediaIds);
      return this.recommendationRecord(db,result.rows[0]);
    });
  }
  async replaceRecommendationEntity(accountId:string,id:string,expectedRevision:number,entityId:string,key:string):Promise<RecommendationRecord> {
    return this.command(accountId,'replaceRecommendationEntity',{id,expectedRevision,entityId},key,async db=>{
      const parent=await this.lockRecommendationParents(db,accountId,id);
      const current=await this.lockRecommendation(db,accountId,id,expectedRevision);
      if(current.entity_id===entityId)throw new RecommendationFailure(422,'Entity replacement is unchanged');
      const entity=(await db.query('SELECT kind FROM entities WHERE id=$1 FOR KEY SHARE',[entityId])).rows[0];
      if(!entity)throw new RecommendationFailure(404,'Entity unavailable');
      const expected:Record<string,string[]>={places:['place','person'],books:['book'],movies:['movie'],games:['game'],apps:['app'],products:['product'],people:['person']};
      if(!expected[current.category]?.includes(entity.kind))throw new RecommendationFailure(422,'Entity category mismatch');
      if(current.category==='movies'&&(await db.query('SELECT 1 FROM movie_recommendation_context WHERE recommendation_id=$1',[id])).rows[0])await checkMovieContext(db,entityId,await readMovieContext(db,id,accountId));
      if(!parent.length)throw new RecommendationFailure(404,'Recommendation aggregate unavailable');
      if(current.category==='movies') {
        const detached=await db.query<{media_id:string}>('DELETE FROM recommendation_movie_media WHERE recommendation_id=$1 AND account_id=$2 RETURNING media_id',[id,accountId]);
        const mediaIds=Array.from(new Set(detached.rows.map(row=>row.media_id))).sort();
        for(const mediaId of mediaIds) {
          const media=await db.query("SELECT id FROM media_assets WHERE id=$1 AND account_id=$2 AND status='ready' FOR UPDATE",[mediaId,accountId]);
          if(!media.rows[0])continue;
          const refs=await db.query<{count:string}>(`SELECT ((SELECT count(*) FROM profile_media WHERE media_id=$1)
            +(SELECT count(*) FROM profile_feed_items WHERE media_id=$1)
            +(SELECT count(*) FROM collection_media WHERE media_id=$1)
            +(SELECT count(*) FROM recommendation_media WHERE media_id=$1)
            +(SELECT count(*) FROM recommendation_book_covers WHERE media_id=$1)
            +(SELECT count(*) FROM recommendation_movie_media WHERE media_id=$1))::text AS count`,[mediaId]);
          if(Number(refs.rows[0]?.count)===0)await db.query("UPDATE media_assets SET status='pending_delete',delete_requested_at=now(),updated_at=now() WHERE id=$1 AND account_id=$2 AND status='ready'",[mediaId,accountId]);
        }
      }
      const result=(await db.query('UPDATE recommendations SET entity_id=$2,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',[id,entityId])).rows[0];
      return this.recommendationRecord(db,result);
    });
  }
  async archiveRecommendation(accountId:string,id:string,expectedRevision:number,key:string):Promise<{id:string;archived:true}> {
    return this.command(accountId,'archiveRecommendation',{id,expectedRevision},key,async db=>{
      const parents=await this.lockRecommendationParents(db,accountId,id,false);
      const recommendation=await this.lockRecommendation(db,accountId,id,expectedRevision);
      const pins=await db.query('DELETE FROM category_recommendation_pins WHERE recommendation_id=$1 RETURNING recommendation_id',[id]);
      if(pins.rowCount) await db.query('UPDATE account_category_pin_state SET revision=revision+1 WHERE account_id=$1 AND category=$2',[accountId,recommendation.category]);
      await db.query('DELETE FROM collection_items WHERE recommendation_id=$1',[id]);
      for(const parent of parents) {
        const current=(await db.query('SELECT revision FROM collections WHERE id=$1 AND account_id=$2',[parent.id,accountId])).rows[0];
        if(parent.category!=='places'||String(current?.revision)===String(parent.revision))
          await db.query('UPDATE collections SET revision=revision+1,updated_at=now() WHERE id=$1',[parent.id]);
      }
      await db.query('UPDATE recommendations SET archived_at=now(),revision=revision+1,updated_at=now() WHERE id=$1',[id]);
      return {id,archived:true};
    });
  }
}
