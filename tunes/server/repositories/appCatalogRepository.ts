import type {Pool,PoolClient} from 'pg';
import {appEntityDtoSchema,appEntityDetailsSchema,type AppEntityDetails} from '../../shared/explorersAppContract';
import {RecommendationFailure} from './explorersRecommendationRepository';

// Ticket 4.3. Apps has no provider, so unlike Books and Movies there is no entity_identifiers
// join, no provenance and no candidate import: every fact here was entered by an owner.
// 0043 declares app_url NOT NULL, so an app entity either has a complete details row or
// none at all - there is no all-null empty value to fall back on, which is why a missing
// row is an error rather than emptyAppDetails().

export async function insertAppDetails(db:PoolClient,entityId:string,d:AppEntityDetails){
 await db.query(`INSERT INTO app_entity_details(entity_id,app_url,developer,logo_url,description,download_url,price_tier,platforms) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
  [entityId,d.appUrl,d.developer,d.logoUrl,d.description,d.downloadUrl,d.priceTier,d.platforms]);
}

export async function readAppEntity(db:Pick<Pool,'query'>,id:string){
 const bounds=(await db.query('SELECT octet_length(to_json(d)::text) AS bytes FROM app_entity_details d WHERE entity_id=$1',[id])).rows[0];
 if(Number(bounds?.bytes??0)>8192)throw new RecommendationFailure(413,'App facts exceed the read bound');
 const row=(await db.query(`SELECT e.id,e.kind,e.title,e.origin,d.* FROM entities e LEFT JOIN app_entity_details d ON d.entity_id=e.id WHERE e.id=$1`,[id])).rows[0];
 if(!row)throw new Error('App catalog unavailable');
 if(!row.entity_id)throw new RecommendationFailure(409,'App entity has no typed details');
 const details=appEntityDetailsSchema.parse({appUrl:row.app_url,developer:row.developer,logoUrl:row.logo_url,description:row.description,downloadUrl:row.download_url,priceTier:row.price_tier,platforms:row.platforms});
 return appEntityDtoSchema.parse({id:row.id,kind:row.kind,title:row.title,origin:row.origin,details});
}

// Screenshots are owned media in ordered slots. The relation is read by slot_index so the
// owner's arrangement survives a reload, and 0043 bounds it at ten.
export async function readAppScreenshotMediaIds(db:Pick<Pool,'query'>,recommendationId:string,accountId:string):Promise<string[]>{
 const rows=(await db.query<{media_id:string}>('SELECT media_id FROM recommendation_app_screenshots WHERE recommendation_id=$1 AND account_id=$2 ORDER BY slot_index',[recommendationId,accountId])).rows;
 if(rows.length>10)throw new RecommendationFailure(413,'App screenshots exceed the read bound');
 return rows.map(row=>row.media_id);
}

/**
 * Replaces the whole ordered set in one statement pair, so a reorder is not a sequence of
 * individually valid states that a concurrent reader could observe half-applied. 0043's
 * deferred guard checks the final slot state, which is what permits the delete-then-insert.
 */
export async function writeAppScreenshots(db:PoolClient,recommendationId:string,accountId:string,mediaIds:readonly string[]){
 if(mediaIds.length>10)throw new RecommendationFailure(422,'App screenshots exceed ten slots');
 if(new Set(mediaIds).size!==mediaIds.length)throw new RecommendationFailure(422,'App screenshots must be distinct');
 await db.query('DELETE FROM recommendation_app_screenshots WHERE recommendation_id=$1 AND account_id=$2',[recommendationId,accountId]);
 if(!mediaIds.length)return;
 await db.query(`INSERT INTO recommendation_app_screenshots(recommendation_id,account_id,slot_index,media_id)
   SELECT $1,$2,ordinality-1,value FROM unnest($3::uuid[]) WITH ORDINALITY AS entry(value,ordinality)`,
  [recommendationId,accountId,[...mediaIds]]);
}

// An owner's display override re-presents a shared entity. appUrl is absent from the
// override vocabulary by design, so it can never be replaced here.
export function effectiveAppDetails(details:AppEntityDetails,overrides:Record<string,unknown>){
 const result={...details};
 for(const key of Object.keys(details))if(key!=='appUrl'&&Object.hasOwn(overrides,key))(result as any)[key]=overrides[key];
 return appEntityDetailsSchema.parse(result);
}
