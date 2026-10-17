import type {Pool,PoolClient} from 'pg';
import {personEntityDtoSchema,personEntityDetailsSchema,personSocialUrlsSchema,emptyPersonDetails,type PersonEntityDetails} from '../../shared/explorersPersonContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

// Ticket 4.5. People has no provider: no entity_identifiers join, no provenance, no
// candidate import. Every fact was entered by an owner about a third party.
//
// Unlike Apps and Products, every column is nullable - the core entity title carries the
// name - so an absent details row is a legitimate state and reads fall back to the empty
// value rather than failing. That is the Books shape.

export async function insertPersonDetails(db:PoolClient,entityId:string,d:PersonEntityDetails){
 await db.query(`INSERT INTO person_entity_details(entity_id,username_handle,headline,location_text,avatar_url,primary_platform,social_urls,skills_tags,external_follower_count_text)
   VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
  [entityId,d.usernameHandle,d.headline,d.locationText,d.avatarUrl,d.primaryPlatform,JSON.stringify(d.socialUrls),d.skillsTags,d.externalFollowerCountText]);
}

/**
 * Reads the shared person record. `suppressed` is carried on the DTO rather than being
 * hidden here, because the owner's own list must keep working while every public surface
 * omits the person - the read is the same, the decision is the caller's.
 */
export async function readPersonEntity(db:Pick<Pool,'query'>,id:string){
 const bounds=(await db.query('SELECT octet_length(to_json(d)::text) AS bytes FROM person_entity_details d WHERE entity_id=$1',[id])).rows[0];
 if(Number(bounds?.bytes??0)>8192)throw new RecommendationFailure(413,'Person facts exceed the read bound');
 const row=(await db.query(`SELECT e.id,e.kind,e.title,e.origin,d.*,d.suppressed_at IS NOT NULL AS suppressed FROM entities e LEFT JOIN person_entity_details d ON d.entity_id=e.id WHERE e.id=$1`,[id])).rows[0];
 if(!row)throw new Error('Person catalog unavailable');
 const details=row.entity_id?personEntityDetailsSchema.parse({
  usernameHandle:row.username_handle,headline:row.headline,locationText:row.location_text,avatarUrl:row.avatar_url,
  primaryPlatform:row.primary_platform,socialUrls:personSocialUrlsSchema.parse(row.social_urls??{}),
  skillsTags:row.skills_tags??[],externalFollowerCountText:row.external_follower_count_text,
 }):emptyPersonDetails();
 return personEntityDtoSchema.parse({id:row.id,kind:row.kind,title:row.title,origin:row.origin,details,suppressed:row.suppressed===true});
}

/** True when this person has asked not to be listed. Public surfaces must omit them. */
export async function personSuppressed(db:Pick<Pool,'query'>,entityId:string){
 return (await db.query('SELECT 1 FROM person_entity_details WHERE entity_id=$1 AND suppressed_at IS NOT NULL',[entityId])).rowCount===1;
}

// An owner's display override re-presents a shared entity. usernameHandle is absent from
// the override vocabulary by design - a handle is how a person is identified on a
// platform, so replacing it would re-point everyone else's recommendation at a different
// person - so it can never be replaced here.
export function effectivePersonDetails(details:PersonEntityDetails,overrides:Record<string,unknown>){
 const result={...details};
 for(const key of Object.keys(details))if(key!=='usernameHandle'&&Object.hasOwn(overrides,key))(result as any)[key]=overrides[key];
 return personEntityDetailsSchema.parse(result);
}
