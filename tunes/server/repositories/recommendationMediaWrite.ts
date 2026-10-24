import type { PoolClient } from 'pg';

/** Replaces a recommendation's gallery in two statements; ordinality keeps the given order. */
export async function replaceRecommendationMedia(db:PoolClient,accountId:string,id:string,mediaIds:string[]):Promise<void> {
  await db.query('DELETE FROM recommendation_media WHERE recommendation_id=$1',[id]);
  if(!mediaIds.length) return;
  await db.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) SELECT $1,$2,m.id,m.ord-1 FROM unnest($3::uuid[]) WITH ORDINALITY AS m(id,ord)',[id,accountId,mediaIds]);
}
