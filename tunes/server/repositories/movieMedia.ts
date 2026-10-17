import type {Pool} from 'pg';
import {movieMediaSourceSchema,movieProviderMediaSchema,movieOwnedImageSchema,type MovieMediaSource,type MovieProviderMedia} from '../../shared/explorersMovieMediaContract';
import {readMovieEntity} from './movieCatalogRepository';
import {RecommendationFailure} from './explorersRecommendationRepository';
export async function readMovieProviderMedia(db:Pick<Pool,'query'>,id:string,accountId:string):Promise<MovieProviderMedia|null>{
 const rec=(await db.query("SELECT entity_id FROM recommendations WHERE id=$1 AND account_id=$2 AND category='movies' AND archived_at IS NULL",[id,accountId])).rows[0];if(!rec)return null;
 const entity=await readMovieEntity(db,rec.entity_id);if(!entity.provenance)return null;
 const source:MovieMediaSource=movieMediaSourceSchema.parse({entityId:entity.id,provider:entity.provenance.provider,externalKind:entity.provenance.externalKind,externalId:entity.provenance.externalId,fetchedAt:entity.provenance.fetchedAt,mappingVersion:entity.provenance.mappingVersion});
 const rows=(await db.query(`SELECT m.*,a.id AS asset_id,a.mime_type,a.byte_size,a.alternative_text,a.caption FROM recommendation_movie_media m JOIN media_assets a ON a.id=m.media_id AND a.account_id=m.account_id AND a.status='ready' AND a.purpose='recommendation' WHERE m.recommendation_id=$1 AND m.account_id=$2 AND m.source_entity_id=$3 ORDER BY m.slot_index LIMIT 13`,[id,accountId,entity.id])).rows;
 if(rows.length>12)throw new RecommendationFailure(413,'Movie image references exceed bounds');
 const mediaBySlot=new Map<number,ReturnType<typeof movieOwnedImageSchema.parse>>();
 for(const row of rows){
  if(row.source_external_kind!==source.externalKind||row.source_external_id!==source.externalId||Number(row.source_fetched_at)!==source.fetchedAt||Number(row.source_mapping_version)!==source.mappingVersion)continue;
  mediaBySlot.set(row.slot_index,movieOwnedImageSchema.parse({id:row.asset_id,url:`/api/explorers/v1/media/${row.asset_id}/content`,mimeType:row.mime_type,size:Number(row.byte_size),alternativeText:row.alternative_text,caption:row.caption}));
 }
 return movieProviderMediaSchema.parse({source,poster:mediaBySlot.get(0)??null,backdrop:mediaBySlot.get(1)??null,cast:entity.details.cast.slice(0,10).map((c,ordinal)=>({slot:{kind:'cast',ordinal,personId:c.personId,creditId:c.creditId},media:mediaBySlot.get(ordinal+2)??null}))});
}
