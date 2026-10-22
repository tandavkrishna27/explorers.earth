import {publicAccountRefSchema} from '../publicProfile/publicAccountRef';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod/v3';
import type {Pool,PoolClient} from 'pg';

export function placePinsReadInteger(raw:unknown,maximum=Number.MAX_SAFE_INTEGER-1):number {
 if(typeof raw!=='number'&&(typeof raw!=='string'||!/^(0|[1-9][0-9]*)$/.test(raw)))throw Error('Invalid Places integer');
 const value=typeof raw==='number'?raw:Number(raw);
 if(!Number.isSafeInteger(value)||value<0||value>maximum)throw Error('Invalid Places integer');
 return value;
}

// Collection-local ordering is independent of collection pin_order/category top picks.
export const placePinJoin=(membership:string,pin='pp')=>`LEFT JOIN collection_place_pins ${pin} ON ${pin}.account_id=${membership}.account_id AND ${pin}.collection_id=${membership}.collection_id AND ${pin}.recommendation_id=${membership}.recommendation_id`;
export const placePinBucket=(pin='pp')=>`CASE WHEN ${pin}.recommendation_id IS NULL THEN 1 ELSE 0 END`;
export const placeSortPosition=(membership:string,pin='pp')=>`coalesce(${pin}.position,${membership}.display_order)`;
export const publicPlaceSuppressionGate=`NOT EXISTS(SELECT 1 FROM person_entity_details pd WHERE pd.entity_id=r.entity_id AND pd.suppressed_at IS NOT NULL)`;

export type PlaceEligibilityObservation={eligibleItemCount:number;eligiblePinCount:number;eligibilityFingerprint:string};
export type PlaceEligibilityList=PlaceEligibilityObservation&{collectionId:string;collectionRevision:string;categoryContentRevision:string};
export function placeEligibilityObservation(raw:Record<string,unknown>):PlaceEligibilityObservation {
 const eligibleItemCount=placePinsReadInteger(raw.item_count,Number.MAX_SAFE_INTEGER),eligiblePinCount=placePinsReadInteger(raw.pin_count,Number.MAX_SAFE_INTEGER);
 if(eligiblePinCount>eligibleItemCount)throw Error('Invalid Places eligible counts');
 const count=BigInt(eligibleItemCount),half=BigInt('9223372036854775808'),lower=-count*half,upper=count*(half-BigInt(1)),digits=(count*half).toString().length+1;
 const lanes=Array.from({length:4},(_,n)=>{
  const value=raw[`lane_${n}`];
  if(typeof value!=='string'||value.length>digits||!/^(0|-?[1-9][0-9]*)$/.test(value))throw Error('Invalid Places eligibility aggregate');
  const exact=BigInt(value);if(exact<lower||exact>upper)throw Error('Invalid Places eligibility aggregate');
  return value;
 });
 const eligibilityFingerprint=createHash('sha256').update(['explorers-places-eligibility/v1',String(eligibleItemCount),String(eligiblePinCount),...lanes,''].join('\n'),'utf8').digest('hex');
 return {eligibleItemCount,eligiblePinCount,eligibilityFingerprint};
}

/** SHA256 row hashes reduce into four exact numeric SUM lanes, with bounded aggregate state. */
export async function readPublicPlaceEligibility(db:Pick<Pool,'query'>,account:string,collection:string):Promise<PlaceEligibilityObservation> {
 const canonical=`r.account_id::text||chr(10)||ci.collection_id::text||chr(10)||r.id::text||chr(10)||r.entity_id::text||chr(10)||coalesce(pp.position::text,'unpinned')||chr(10)||ci.display_order::text||chr(10)`;
 const lanes=Array.from({length:4},(_,n)=>`coalesce(sum(('x'||substr(fingerprint.hash,${1+n*16},16))::bit(64)::bigint),0)::text AS lane_${n}`).join(',');
 const result=await db.query(`/* public_places_eligibility_aggregate */ SELECT count(*)::text AS item_count,count(pp.recommendation_id)::text AS pin_count,${lanes}
  FROM collection_items ci JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
  JOIN recommendations r ON r.id=ci.recommendation_id AND r.account_id=ci.account_id AND r.category=ci.category
  JOIN creator_accounts a ON a.id=r.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category
  ${placePinJoin('ci')} CROSS JOIN LATERAL(SELECT encode(sha256(convert_to(${canonical},'UTF8')),'hex') AS hash) fingerprint
  WHERE a.id=$1 AND c.id=$2 AND c.category='places' AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public
  AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
  AND r.archived_at IS NULL AND r.publication_state='published' AND ${publicPlaceSuppressionGate}`,[account,collection]);
 if(!result.rows[0])throw Error('Places eligibility aggregate unavailable');
 return placeEligibilityObservation(result.rows[0]);
}

/** Fresh snapshot validates every observed list, including empty lists and off-page eligibility. */
export async function publicPlaceRowsStillEligible(pool:Pool,account:string,rows:{id:string;entityId:string;collectionId:string}[],lists:PlaceEligibilityList[],client?:PoolClient):Promise<boolean> {
 const expected=new Set(rows.map(row=>`${row.id}:${row.entityId}:${row.collectionId}`));
 if(expected.size!==rows.length)throw Error('Duplicate public Places eligibility identity');
 const observedLists=new Set(lists.map(list=>list.collectionId));
 if(observedLists.size!==lists.length||rows.some(row=>!observedLists.has(row.collectionId)))throw Error('Public Places list eligibility identity unavailable');
 if(!lists.length)return true;
 const db=client??await pool.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query("SET LOCAL statement_timeout='2000ms'");
  for(const observed of lists){
   const currentList=(await db.query(`/* public_places_current_list */ SELECT c.id,c.revision::text AS collection_revision,coalesce(cs.revision::text,'0') AS category_revision
    FROM collections c JOIN creator_accounts a ON a.id=c.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
    LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category=c.category
    WHERE c.id=$2 AND c.account_id=$1 AND c.category='places' AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public
    AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`,[account,observed.collectionId])).rows[0];
   if(!currentList){await db.query('COMMIT');return false;}
   if(currentList.collection_revision!==observed.collectionRevision||currentList.category_revision!==observed.categoryContentRevision)throw new PublicPlaceRestartConflict();
   const current=await readPublicPlaceEligibility(db,account,observed.collectionId);
   if(current.eligibilityFingerprint!==observed.eligibilityFingerprint||current.eligibleItemCount!==observed.eligibleItemCount||current.eligiblePinCount!==observed.eligiblePinCount)throw new PublicPlaceRestartConflict();
  }
  const current=rows.length?(await db.query(`/* public_places_current_eligibility */ SELECT r.id,r.entity_id,c.id AS collection_id
   FROM unnest($2::uuid[],$3::uuid[],$4::uuid[]) observed(id,entity_id,collection_id)
   JOIN recommendations r ON r.id=observed.id AND r.entity_id=observed.entity_id AND r.account_id=$1 AND r.category='places'
   JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.account_id=r.account_id AND ci.category=r.category AND ci.collection_id=observed.collection_id
   JOIN collections c ON c.id=ci.collection_id AND c.account_id=ci.account_id AND c.category=ci.category
   JOIN creator_accounts a ON a.id=r.account_id JOIN account_category_settings s ON s.account_id=a.id AND s.category=r.category
   WHERE a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public
   AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'
   AND r.archived_at IS NULL AND r.publication_state='published' AND ${publicPlaceSuppressionGate}`,
   [account,rows.map(row=>row.id),rows.map(row=>row.entityId),rows.map(row=>row.collectionId)])).rows:[];
  await db.query('COMMIT');
  return current.length===expected.size&&current.every(row=>expected.has(`${row.id}:${row.entity_id}:${row.collection_id}`));
 }catch(error){await db.query('ROLLBACK');throw publicPlaceReadFailure(error);}finally{if(!client)db.release();}
}

export class PublicPlaceReadLimit extends Error {readonly status=503;constructor(){super('Places read resource limit');}}
export function publicPlaceReadFailure(error:unknown):unknown {return (error as {code?:unknown}|null)?.code==='57014'?new PublicPlaceReadLimit():error;}

export class PublicPlaceCursorError extends Error {constructor(){super('Invalid Places continuation');}}
export class PublicPlaceRestartConflict extends Error {constructor(){super('Places changed; restart pagination');}}
const digits=z.string().regex(/^\d+$/);
const bindingSchema=z.object({account:z.union([publicAccountRefSchema,z.string().uuid()]),username:z.string().max(64),collection:z.string().uuid(),slug:z.string().max(200),limit:z.number().int().min(1).max(24),collectionRevision:digits,categoryRevision:digits,accountRevision:digits,catalogVersion:z.string().max(256),eligibilityFingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const tupleSchema=z.object({pinBucket:z.union([z.literal(0),z.literal(1)]),sortPosition:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER-1).safe(),id:z.string().uuid()}).strict();
const cursorSchema=z.object({v:z.literal('places-pins/2'),binding:bindingSchema,tuple:tupleSchema}).strict();
export type PlacePinsCursorBinding=z.infer<typeof bindingSchema>;
export type PlacePinsTuple=z.infer<typeof tupleSchema>;
const domain='explorers-public-places-pins/v2\0';
export function encodePlacePinsCursor(secret:string,binding:PlacePinsCursorBinding,tuple:PlacePinsTuple):string {
 if(secret.length<32)throw Error('Places continuation key unavailable');
 const part=Buffer.from(JSON.stringify(cursorSchema.parse({v:'places-pins/2',binding,tuple}))).toString('base64url');
 const value=part+'.'+createHmac('sha256',secret).update(domain).update(part).digest('base64url');
 if(Buffer.byteLength(value)>2048)throw new PublicPlaceCursorError();
 return value;
}
export function decodePlacePinsCursor(value:string|undefined,secret:string,expected:PlacePinsCursorBinding):PlacePinsTuple|undefined {
 if(value===undefined)return undefined;
 let parsed:z.infer<typeof cursorSchema>;
 try{
  if(secret.length<32||Buffer.byteLength(value)>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(value))throw Error();
  const [part,signature]=value.split('.'),bytes=Buffer.from(part,'base64url'),supplied=Buffer.from(signature,'base64url');
  if(bytes.toString('base64url')!==part||supplied.toString('base64url')!==signature)throw Error();
  const actual=createHmac('sha256',secret).update(domain).update(part).digest();
  if(supplied.length!==actual.length||!timingSafeEqual(supplied,actual))throw Error();
  parsed=cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
 }catch{throw new PublicPlaceCursorError();}
 const bound=bindingSchema.parse(expected);
 for(const field of ['account','username','collection','slug','limit'] as const)if(parsed.binding[field]!==bound[field])throw new PublicPlaceCursorError();
 for(const field of ['collectionRevision','categoryRevision','accountRevision','catalogVersion','eligibilityFingerprint'] as const)if(parsed.binding[field]!==bound[field])throw new PublicPlaceRestartConflict();
 return parsed.tuple;
}
