import type {PoolClient} from 'pg';

/**
 * WP10 (LNK-07). The lists linked to or from one public list, for a public reader. S3's rule:
 * a link is exposed only when BOTH lists are public, published, not archived and not samples.
 * Both ends are checked here rather than trusted from the caller, and the account/category
 * eligibility gate applies to the other list too. A private list on either end makes the link
 * absent, not redacted. One level: the other list's own links are never read.
 */
const gate=`a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const listGate=(c:string)=>`${c}.archived_at IS NULL AND ${c}.visibility='public' AND ${c}.publication_state='published' AND NOT ${c}.is_sample`;

export type PublicLinkedListCard={collectionId:string;category:string;title:string;description:string|null;slug:string;heading:string|null;displayOrder:number;coverMediaId:string|null;role:string|null;direction:'outgoing'|'incoming';linkOrder:number};

export async function publicLinkedLists(db:PoolClient,accountId:string,collectionId:string,options:{category?:string;limit?:number}={}):Promise<PublicLinkedListCard[]>{
 const limit=options.limit??12;
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid linked list page size');
 const rows=(await db.query(`SELECT c.id,c.category,c.title,c.description,c.slug,c.heading,c.display_order,l.role,l.display_order AS link_order,
   CASE WHEN l.host_collection_id=$2 THEN 'outgoing' ELSE 'incoming' END AS direction,cm.media_id AS cover_media_id
  FROM collection_list_links l
  JOIN collections self ON self.id=$2 AND self.account_id=l.account_id
  JOIN collections c ON c.account_id=l.account_id AND c.id=CASE WHEN l.host_collection_id=$2 THEN l.linked_collection_id ELSE l.host_collection_id END
  JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
  JOIN account_category_settings selfs ON selfs.account_id=a.id AND selfs.category=self.category AND selfs.is_public
  LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' AND EXISTS(SELECT 1 FROM media_assets m WHERE m.id=cm.media_id AND m.account_id=cm.account_id AND m.status='ready')
  WHERE l.account_id=$1 AND (l.host_collection_id=$2 OR l.linked_collection_id=$2) AND ($3::text IS NULL OR c.category=$3)
   AND ${listGate('self')} AND ${listGate('c')} AND ${gate}
  ORDER BY (l.host_collection_id=$2) DESC,l.display_order,l.created_at,l.id LIMIT $4`,[accountId,collectionId,options.category??null,limit])).rows;
 return rows.map(r=>({collectionId:r.id,category:r.category,title:r.title,description:r.description,slug:r.slug,heading:r.heading,
  displayOrder:Number(r.display_order),coverMediaId:r.cover_media_id??null,role:r.role,direction:r.direction,linkOrder:Number(r.link_order)}));
}
