import type {Pool,PoolClient} from 'pg';
import {LIST_LINK_LIMIT,linkedListCardSchema,listLinkDtoSchema,type LinkedListCard,type ListLinkDto} from '../../shared/explorersListLinkContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

const COLUMNS='id,host_collection_id,host_category,linked_collection_id,linked_category,role,display_order,created_at';
const toDto=(r:Record<string,any>):ListLinkDto=>listLinkDtoSchema.parse({id:r.id,hostCollectionId:r.host_collection_id,hostCategory:r.host_category,
 linkedCollectionId:r.linked_collection_id,linkedCategory:r.linked_category,role:r.role,displayOrder:r.display_order,createdAt:(r.created_at as Date).toISOString()});

/** One level: the lists this list links to (in order), then the lists that link to it. Links of links are never read. */
export async function readListLinksForCollection(db:Pick<Pool,'query'>,collectionId:string,accountId:string):Promise<LinkedListCard[]>{
 const rows=(await db.query(`SELECT l.id,l.role,l.display_order,l.created_at,
   CASE WHEN l.host_collection_id=$1 THEN 'outgoing' ELSE 'incoming' END AS direction,
   c.id AS cid,c.category,c.title,c.slug,c.visibility,c.publication_state,c.archived_at IS NOT NULL AS archived,
   (SELECT m.media_id FROM collection_media m WHERE m.collection_id=c.id LIMIT 1) AS cover
  FROM collection_list_links l JOIN collections c ON c.account_id=l.account_id
   AND c.id=CASE WHEN l.host_collection_id=$1 THEN l.linked_collection_id ELSE l.host_collection_id END
  WHERE l.account_id=$2 AND (l.host_collection_id=$1 OR l.linked_collection_id=$1)
  ORDER BY (l.host_collection_id=$1) DESC,l.display_order,l.created_at,l.id`,[collectionId,accountId])).rows;
 return rows.map(r=>linkedListCardSchema.parse({linkId:r.id,direction:r.direction,role:r.role,displayOrder:r.display_order,
  collection:{id:r.cid,category:r.category,title:r.title,slug:r.slug,visibility:r.visibility,publicationState:r.publication_state,archived:r.archived,coverMediaId:r.cover??null}}));
}

export async function insertListLink(db:PoolClient,input:{accountId:string;hostCollectionId:string;linkedCollectionId:string;role:string|null;position?:number}):Promise<ListLinkDto>{
 if(input.hostCollectionId===input.linkedCollectionId)throw new RecommendationFailure(422,'A list cannot link to itself');
 const sides=(await db.query('SELECT id,category FROM collections WHERE account_id=$1 AND id=ANY($2::uuid[]) AND archived_at IS NULL FOR SHARE',
  [input.accountId,[input.hostCollectionId,input.linkedCollectionId]])).rows;
 const host=sides.find(r=>r.id===input.hostCollectionId),linked=sides.find(r=>r.id===input.linkedCollectionId);
 if(!host||!linked)throw new RecommendationFailure(404,'Resource unavailable');
 const count=Number((await db.query('SELECT count(*)::int AS n FROM collection_list_links WHERE host_collection_id=$1 AND account_id=$2',[host.id,input.accountId])).rows[0].n);
 if(count>=LIST_LINK_LIMIT)throw new RecommendationFailure(409,'This list already links the maximum number of lists');
 const position=Math.min(input.position??count,count);
 try{
  await db.query('UPDATE collection_list_links SET display_order=display_order+1 WHERE host_collection_id=$1 AND account_id=$2 AND display_order>=$3',[host.id,input.accountId,position]);
  const row=(await db.query(`INSERT INTO collection_list_links(account_id,host_collection_id,host_category,linked_collection_id,linked_category,role,display_order)
   VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLUMNS}`,[input.accountId,host.id,host.category,linked.id,linked.category,input.role,position])).rows[0];
  return toDto(row);
 }catch(error){
  if((error as {code?:string}).code==='23505')throw new RecommendationFailure(409,'These lists are already linked');
  throw error;
 }
}

/** Returns the removed link so the caller can offer Undo with the same role and position. */
export async function deleteListLink(db:PoolClient,accountId:string,linkId:string):Promise<ListLinkDto>{
 const row=(await db.query(`DELETE FROM collection_list_links WHERE id=$1 AND account_id=$2 RETURNING ${COLUMNS}`,[linkId,accountId])).rows[0];
 if(!row)throw new RecommendationFailure(404,'Resource unavailable');
 await db.query('UPDATE collection_list_links SET display_order=display_order-1 WHERE host_collection_id=$1 AND account_id=$2 AND display_order>$3',
  [row.host_collection_id,accountId,row.display_order]);
 return toDto(row);
}

export async function updateListLinkRole(db:PoolClient,accountId:string,linkId:string,role:string|null):Promise<ListLinkDto>{
 const row=(await db.query(`UPDATE collection_list_links SET role=$3 WHERE id=$1 AND account_id=$2 RETURNING ${COLUMNS}`,[linkId,accountId,role])).rows[0];
 if(!row)throw new RecommendationFailure(404,'Resource unavailable');
 return toDto(row);
}

export async function reorderListLinks(db:PoolClient,accountId:string,hostCollectionId:string,linkIds:string[]):Promise<void>{
 const present=(await db.query('SELECT id FROM collection_list_links WHERE host_collection_id=$1 AND account_id=$2 FOR UPDATE',[hostCollectionId,accountId])).rows.map(r=>r.id as string);
 if(present.length!==linkIds.length||present.some(id=>!linkIds.includes(id)))throw new RecommendationFailure(409,'Links changed; reload and retry');
 await db.query(`UPDATE collection_list_links l SET display_order=o.ordinal-1 FROM unnest($3::uuid[]) WITH ORDINALITY AS o(id,ordinal)
  WHERE l.id=o.id AND l.host_collection_id=$1 AND l.account_id=$2`,[hostCollectionId,accountId,linkIds]);
}
