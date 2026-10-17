import type {Pool,PoolClient} from 'pg';
import {locationLinkDtoSchema,type LocationLinkDto,type LinkableChildCategory} from '../../shared/explorersPlaceLinkContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

/**
 * Ticket 5.2. Reads and writes of the one link a Products or People list may have to a
 * location list.
 *
 * The invariants are not re-checked here, because they are not this layer's to keep:
 * one parent per child is the primary key, one account on both sides is both foreign
 * keys, and a location parent is the parent key's category. What this layer does is
 * translate the resulting database refusals into the status a caller can act on, and
 * that translation is the only interesting thing in the file.
 */

/** 23503 is a foreign key violation: one of the two lists is not the owner's, or not there. */
const MISSING_REFERENCE='23503';
/** 23505 is a unique violation: the child already has a parent. */
const DUPLICATE='23505';

export async function readLocationLink(db:Pick<Pool,'query'>,childCollectionId:string,accountId:string):Promise<LocationLinkDto|null>{
 const row=(await db.query('SELECT child_collection_id,child_category,location_collection_id FROM collection_location_links WHERE child_collection_id=$1 AND account_id=$2',
  [childCollectionId,accountId])).rows[0];
 if(!row)return null;
 return locationLinkDtoSchema.parse({childCollectionId:row.child_collection_id,childCategory:row.child_category,locationCollectionId:row.location_collection_id});
}

/** Every child linked to one location, by child category, in the owner's display order. */
export async function readLinkedChildren(db:Pick<Pool,'query'>,locationCollectionId:string,accountId:string){
 return (await db.query(`SELECT l.child_collection_id,l.child_category FROM collection_location_links l
   JOIN collections c ON c.id=l.child_collection_id AND c.account_id=l.account_id
   WHERE l.location_collection_id=$1 AND l.account_id=$2 ORDER BY l.child_category,c.display_order,c.id`,
  [locationCollectionId,accountId])).rows.map(row=>({childCollectionId:row.child_collection_id as string,childCategory:row.child_category as LinkableChildCategory}));
}

/**
 * Links a child list to a location.
 *
 * A child that already has a parent is a 409 with the original relation untouched, not a
 * silent move: the creator asked to attach, and if the list is already somewhere else
 * that is a fact they need to see rather than one to overwrite. Re-pointing is an
 * explicit detach followed by an attach.
 *
 * A parent that is not one of the owner's location lists - a place recommendation id, a
 * list of another category, another account's list - fails the foreign key, which is a
 * 422: the request named something that cannot be a location parent.
 */
export async function writeLocationLink(db:PoolClient,input:{childCollectionId:string;accountId:string;childCategory:LinkableChildCategory;locationCollectionId:string}){
 try{
  await db.query('INSERT INTO collection_location_links(child_collection_id,account_id,child_category,location_collection_id) VALUES($1,$2,$3,$4)',
   [input.childCollectionId,input.accountId,input.childCategory,input.locationCollectionId]);
 }catch(error){
  const code=(error as {code?:string}).code;
  if(code===DUPLICATE)throw new RecommendationFailure(409,'List is already linked to a location');
  if(code===MISSING_REFERENCE)throw new RecommendationFailure(422,'Invalid location parent');
  throw error;
 }
}

/** Detaching leaves the child list and everything in it; only the relation goes. */
export async function deleteLocationLink(db:PoolClient,childCollectionId:string,accountId:string){
 const result=await db.query('DELETE FROM collection_location_links WHERE child_collection_id=$1 AND account_id=$2',[childCollectionId,accountId]);
 if(!result.rowCount)throw new RecommendationFailure(404,'List is not linked to a location');
}
