import {isPublicAccountScope,isTransactionControl,type StatementRules} from './sqlStatementRecorder';

/**
 * Structural keys for every statement `publicGamesProjection` issues, shared by the
 * Games budget contract and the Games native-boundary suite so one column addition
 * cannot quietly empty either of them.
 *
 * Each key names a table/alias plus the one predicate that distinguishes the statement
 * from its siblings. SELECT lists are deliberately not used: the public account scope
 * SELECT list alone appears in nine projection files, so keying on it makes a single
 * column addition anywhere there vacuify every one of these mocks at once.
 */
export const gamesPublicRules:StatementRules={
 /** The public Games account scope: creator_accounts + the games category settings join. */
 scope:sql=>isPublicAccountScope(sql,'games'),
 /** The public Games collection page: collections as the driving table, Games category. */
 lists:sql=>sql.includes('FROM collections c')&&sql.includes("c.category='games'"),
 /** One collection's member rows: membership join, bound to a single collection by `c.id=$2`. */
 children:sql=>sql.includes('FROM collection_items ci')&&sql.includes('c.id=$2'),
 /** Top picks: the same membership join plus the category pin join. */
 hero:sql=>sql.includes('FROM collection_items ci')&&sql.includes('JOIN category_recommendation_pins tp'),
 /** Manual presentation origin probe (gameManualRepository). */
 manualOrigin:sql=>sql.includes('FROM recommendations r JOIN entities e')&&sql.includes("r.category='games'"),
 /** Manual presentation attachments (gameManualRepository). */
 manualMedia:sql=>sql.includes('FROM recommendation_media rm'),
};

/**
 * A statement that reads one of the projection's tables is structural: if it reaches a
 * mock's `[]` fallback the mock has gone vacuous and the recorder must say so.
 * Transaction control and `SET LOCAL` carry no rows and are exempt.
 */
export const gamesPublicStructural=(sql:string):boolean=>
 !isTransactionControl(sql)&&/FROM (creator_accounts a|collections c|collection_items ci|recommendations r|recommendation_media rm)\b/.test(sql);

/** The keys `boundedRows` wraps in its `WITH candidate` sizing envelope. */
const BOUNDED_KINDS=['lists','children','hero'];

/**
 * Reply in the shape the projection expects, and assert the wrapping still matches the
 * classification: if a bounded statement stops being wrapped (or an unbounded one starts),
 * that is a production change the mock must not paper over.
 */
export function gamesNativeReply(sql:string,kind:string|undefined,rows:any[]){
 const bounded=sql.startsWith('WITH candidate');
 if(bounded!==BOUNDED_KINDS.includes(kind??''))throw new Error(`Games bounded-statement wrapping changed for '${kind??'unclassified'}'`);
 return {rows:bounded?rows.map(row=>({payload:row,batch_bytes:String(Buffer.byteLength(JSON.stringify(rows))),batch_count:rows.length,batch_invalid:false})):rows,rowCount:rows.length};
}
