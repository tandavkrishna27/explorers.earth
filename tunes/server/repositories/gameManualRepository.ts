import type {Pool} from 'pg';
import {manualGamePresentationSchema,type ManualGamePresentation} from '../../shared/explorersGameOwnerContract';
import {RecommendationFailure} from './explorersRecommendationRepository';
export class GamePresentationUnavailable extends Error {readonly status=503;readonly code='PROVIDER_UNAVAILABLE' as const;constructor(){super('Games provider is unavailable');}}
/** Read actual canonical origin and every attachment, including invalid ones so
 * a corrupt or detached upload cannot silently disappear from the projection. */
export async function readManualGamePresentation(db:Pick<Pool,'query'>,recommendationId:string,accountId:string):Promise<ManualGamePresentation>{
 const row=(await db.query("SELECT e.origin,e.kind FROM recommendations r JOIN entities e ON e.id=r.entity_id WHERE r.id=$1 AND r.account_id=$2 AND r.category='games'",[recommendationId,accountId])).rows[0];
 if(!row)throw new RecommendationFailure(404,'Game unavailable');
 if(row.origin!=='manual')throw new GamePresentationUnavailable();
 if(row.kind!=='game')throw new RecommendationFailure(422,'Invalid stored Game');
 const rows=(await db.query(`SELECT rm.media_id,rm.account_id,rm.display_order,m.id AS asset_id,m.account_id AS asset_account_id,m.status,m.purpose FROM recommendation_media rm LEFT JOIN media_assets m ON m.id=rm.media_id WHERE rm.recommendation_id=$1 AND rm.account_id=$2 ORDER BY rm.display_order,m.id LIMIT 21`,[recommendationId,accountId])).rows;
 if(rows.length>20)throw new RecommendationFailure(413,'Game media exceeds the response bound');
 let last=-1;
 for(const media of rows){if(media.account_id!==accountId||media.asset_account_id!==accountId||media.asset_id!==media.media_id||media.status!=='ready'||media.purpose!=='recommendation'||!Number.isSafeInteger(media.display_order)||media.display_order<=last)throw new RecommendationFailure(422,'Invalid stored Game media');last=media.display_order;}
 const images=rows.map(media=>({mediaId:media.media_id as string,url:`/api/explorers/v1/media/${media.media_id}/content`}));
 const result=manualGamePresentationSchema.safeParse({version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images,coverMediaId:images[0]?.mediaId??null});
 if(!result.success)throw new RecommendationFailure(422,'Invalid stored Game media');return result.data;
}
