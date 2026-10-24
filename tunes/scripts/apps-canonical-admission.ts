import {validateAppsEnrichmentSources} from './apps-enrichment-browser-support';
import {appEnrichmentCommandSchema,appSourceIdentitySchema} from '../shared/explorersAppEnrichmentContract';
import type {Request,Response,NextFunction} from 'express';
import type {Pool} from 'pg';
import type {OwnedUatDatabaseAuthority} from './music-uat-database';
import {z} from 'zod/v3';
import {createCollectionSchema,updateCollectionSchema,createRecommendationSchema,updateRecommendationSchema,categoryTopPicksInputSchema} from '../shared/explorersContract';
import {resolveManualAppSchema,appDisplayFieldsSchema} from '../shared/explorersAppContract';
import {ownerCollectionsRequestSchema,ownerRecommendationsRequestSchema,ownerDetailRequestSchema,ownerSnapshotRequestSchema,ownerSnapshotValidationRequestSchema,ownerMembershipsRequestSchema,ownerTopPicksRequestSchema} from '../shared/explorersOwnerContentContract';
import {explorersAnalyticsInputSchema} from '../server/services/explorers-analytics-service';
import {parsePublicProfileRequest,parsePublicProfileDetailRequest} from '../server/publicProfile/publicProfileContract';
type Persona=Readonly<{userId:string;accountId:string;handle:string}>;
export type AppsCanonicalAdmissionOptions={pool:Pool;runAuthority:OwnedUatDatabaseAuthority;personas:{ownerA:Persona;ownerB:Persona};enrichmentSources?:readonly unknown[]};
export const APPS_REQUEST_ROUTE_LABELS=Object.freeze(['unproved','me','auth-session','health','media-get','media-head','upload','media-delete','collections-read','collections-editable','recommendations-read','recommendations-editable','content-snapshot','content-snapshot/validate','memberships','top-picks','public-shell','public-apps','command'] as const);
export const APPS_REQUEST_METHOD_LABELS=Object.freeze(['UNKNOWN','GET','HEAD','POST','PATCH','PUT','DELETE','OPTIONS','OTHER'] as const);
export type AppsRequestRouteLabel=typeof APPS_REQUEST_ROUTE_LABELS[number];
export type AppsRequestMethodLabel=typeof APPS_REQUEST_METHOD_LABELS[number];
type RequestLabel=Readonly<{route:AppsRequestRouteLabel;method:AppsRequestMethodLabel}>;
const requestLabels=new WeakMap<object,WeakMap<object,RequestLabel>>();
export function extractAppsCanonicalRequestLabel(admission:unknown,request:unknown){return admission!==null&&typeof admission==='object'&&request!==null&&typeof request==='object'?requestLabels.get(admission)?.get(request):undefined;}
const readTransportProofs=new WeakMap<object,(request:object)=>boolean>();
/** Private identity lookup: never inspect foreign admission objects or request getters. */
export function isAppsCanonicalReadTransport(admission:unknown,request:unknown):boolean {
 if(!admission||typeof admission!=='object'||!request||typeof request!=='object')return false;
 try{return readTransportProofs.get(admission)?.(request)===true;}catch{return false;}
}
type Scope={label?:AppsRequestRouteLabel;kind:string;id?:string;other?:string;handle?:string;slug?:string;query:Record<string,string>};
const prefix='/api/explorers/v1',id='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',uuid=new RegExp(`^${id}$`);
function keys(v:unknown,names:string[]){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!==[...names].sort().join(','))throw Error('Apps admission configuration denied');}
const denied=(res:Response)=>res.status(503).json({error:{code:'UNAVAILABLE',message:'Apps fixture admission denied'}});
/** Effect-free construction. The owning composition must register these original async
 * middleware functions in its custody ledger. This module supplies no settlement proof. */
export function createAppsCanonicalAdmission(options:AppsCanonicalAdmissionOptions){
 keys(options,Object.hasOwn(options,'enrichmentSources')?['pool','runAuthority','personas','enrichmentSources']:['pool','runAuthority','personas']);const enrichmentSources=Object.hasOwn(options,'enrichmentSources')?validateAppsEnrichmentSources(options.enrichmentSources):undefined;keys(options.personas,['ownerA','ownerB']);
 const authority=options.runAuthority;keys(authority,['owned','runId','commit','database','port','containerId','imageId','contextHost']);
 if(authority.owned!==true||!/^[a-f0-9]{32}$/.test(authority.runId)||!/^[a-f0-9]{40}$/.test(authority.commit)||authority.database!==`music_uat_${authority.runId}`||!Number.isSafeInteger(authority.port)||authority.port<1024||authority.port>65535||!/^[a-f0-9]{64}$/.test(authority.containerId)||!/^sha256:[a-f0-9]{64}$/.test(authority.imageId)||!['npipe:////./pipe/docker_engine','npipe:////./pipe/dockerDesktopLinuxEngine','unix:///var/run/docker.sock'].includes(authority.contextHost))throw Error('Apps admission configuration denied');
 const people=Object.values(options.personas).map(p=>{keys(p,['userId','accountId','handle']);if(!uuid.test(p.accountId)||typeof p.userId!=='string'||p.userId.length<1||p.userId.length>128||!/^[-a-z0-9]{3,30}$/.test(p.handle))throw Error('Apps admission configuration denied');return Object.freeze({...p});});
 if(new Set(people.map(p=>p.accountId)).size!==2||new Set(people.map(p=>p.userId)).size!==2||new Set(people.map(p=>p.handle)).size!==2||typeof options.pool?.query!=='function')throw Error('Apps admission configuration denied');
 const pool=options.pool,database=authority.database,accountIds=people.map(p=>p.accountId),userIds=people.map(p=>p.userId),query=pool.query.bind(pool),queryFunction=pool.query;
 let sealed=false;const admitted=new WeakMap<Request,Scope>(),readTransports=new WeakMap<object,string>(),labels=new WeakMap<object,RequestLabel>();
 async function binding(){if(pool.query!==queryFunction)throw Error('denied');const result=await query('SELECT current_database() AS database,user_id,account_id FROM initial_account_bindings WHERE user_id=ANY($1::text[]) LIMIT 3',[userIds]);if(result.rows.length!==2||!people.every(p=>result.rows.filter(row=>row.database===database&&row.user_id===p.userId&&row.account_id===p.accountId).length===1))throw Error('denied');}
 async function row(sql:string,values:unknown[]){const result=await query(sql,values);if(result.rows.length!==1||!accountIds.includes(result.rows[0].account_id))throw Error('denied');return result.rows[0] as {account_id:string;object_key?:string};}
 async function collection(value:string){if(!uuid.test(value))throw Error('denied');return row("SELECT account_id FROM collections WHERE id=$1::uuid AND category='apps' AND account_id=ANY($2::uuid[]) AND current_database()=$3 LIMIT 2",[value,accountIds,database]);}
 async function recommendation(value:string){if(!uuid.test(value))throw Error('denied');return row("SELECT r.account_id FROM recommendations r JOIN entities e ON e.id=r.entity_id JOIN app_entity_details d ON d.entity_id=e.id WHERE r.id=$1::uuid AND r.category='apps' AND e.kind='app' AND e.origin='manual' AND r.account_id=ANY($2::uuid[]) AND current_database()=$3 LIMIT 2",[value,accountIds,database]);}
 async function media(value:string){if(!uuid.test(value))throw Error('denied');const result=await row("SELECT ma.account_id,mo.object_key FROM media_assets ma JOIN media_objects mo ON mo.media_id=ma.id AND mo.variant='original' WHERE ma.id=$1::uuid AND ma.purpose='recommendation' AND ma.account_id=ANY($2::uuid[]) AND mo.storage_environment='local' AND current_database()=$3 LIMIT 2",[value,accountIds,database]);if(result.object_key!==`local/${result.account_id}/${value}`)throw Error('denied');return result;}
 function shape(req:Request):Scope{
  const raw=req.originalUrl;if(typeof raw!=='string'||raw.length>16384||!raw.startsWith('/')||/[\\#\u0000-\u0020\u007f]/.test(raw))throw Error('denied');
  const [path,search='']=raw.split('?');if(raw.split('?').length>2||path.includes('%')||path.includes('//')||path.endsWith('/'))throw Error('denied');
  const params=new URLSearchParams(search),q:Record<string,string>=Object.create(null);for(const [key,value] of params){if(Object.hasOwn(q,key))throw Error('denied');q[key]=value;}
  const method=req.method;let kind='',match:RegExpMatchArray|null=null;
  if(method==='GET'&&['/api/auth/get-session',`${prefix}/me`,'/health/live'].includes(path)){if(Object.keys(q).length)throw Error('denied');kind='identity';}
  else if(method==='POST'&&path==='/api/explorers/analytics/events')kind='analytics';
  else if(path===`${prefix}/media`&&method==='POST'){if(req.get('x-media-purpose')!=='recommendation')throw Error('denied');kind='upload';}
  else if((match=path.match(new RegExp(`^${prefix}/media/(${id})(/content)?$`)))&&((match[2]&&['GET','HEAD'].includes(method))||(!match[2]&&method==='DELETE')))kind='media';
  else if((match=path.match(new RegExp(`^${prefix}/(collections|recommendations)/(${id})(/editable)?$`)))&&((match[3]&&method==='GET')||(!match[3]&&['PATCH','DELETE'].includes(method)))){kind=`${match[1]}-${method==='GET'?'editable':'command'}`;return checked({kind,id:match[2],query:q});}
  else if((match=path.match(new RegExp(`^${prefix}/recommendations/(${id})/app-enrichment/(binding|suggestions|sources)$`)))&&method==='GET')return checked({kind:'recommendations-editable',id:match[1],query:q});
  else if(enrichmentSources&&(match=path.match(new RegExp(`^${prefix}/recommendations/(${id})/app-enrichment/(binding|acceptances)$`)))&&((match[2]==='binding'&&['PUT','DELETE'].includes(method))||(match[2]==='acceptances'&&method==='POST')))return checked({kind:'enrichment-command',id:match[1],other:match[2],query:q});
  else if((match=path.match(new RegExp(`^${prefix}/collections/(${id})/memberships/(${id})$`)))&&method==='DELETE')return checked({kind:'detach',id:match[1],other:match[2],query:q});
  else if(path===`${prefix}/collections`&&['GET','POST'].includes(method))kind=method==='GET'?'collections-read':'collections-create';
  else if(path===`${prefix}/recommendations`&&['GET','POST'].includes(method))kind=method==='GET'?'recommendations-read':'recommendations-create';
  else if(path===`${prefix}/entities/resolve`&&method==='POST')kind='resolve';
  else if((match=path.match(new RegExp(`^${prefix}/categories/apps/(content-snapshot/validate|content-snapshot|memberships|top-picks)$`)))&&(method==='GET'||method==='PUT'&&match[1]==='top-picks'))kind=method==='PUT'?'pins':match[1];
  else if((match=path.match(new RegExp(`^${prefix}/profiles/([-a-z0-9]{3,30})(?:/recommendations/apps(?:/([a-z0-9]+(?:-[a-z0-9]+)*))?)?$`)))&&method==='GET'){if(!people.some(p=>p.handle===match![1]))throw Error('denied');return checked({kind:path.includes('/recommendations/')?'public-apps':'public-shell',handle:match[1],...(match[2]?{slug:match[2]}:{}),query:q});}
  else throw Error('denied');return checked({kind,...(kind==='identity'?{label:(path==='/api/auth/get-session'?'auth-session':path==='/health/live'?'health':'me') as AppsRequestRouteLabel}:{}),...(kind==='media'?{id:match![1]}:{}),query:q});
 }
 function checked(scope:Scope){const q=scope.query;switch(scope.kind){
  case 'collections-read':if(q.category!=='apps')throw Error('denied');ownerCollectionsRequestSchema.parse(q);break;
  case 'recommendations-read':if(q.category!=='apps')throw Error('denied');ownerRecommendationsRequestSchema.parse(q);break;
  case 'collections-editable':case 'recommendations-editable':ownerDetailRequestSchema.parse(q);break;
  case 'content-snapshot':ownerSnapshotRequestSchema.parse({...q,category:'apps'});if(Object.hasOwn(q,'category'))throw Error('denied');break;
  case 'content-snapshot/validate':ownerSnapshotValidationRequestSchema.parse({...q,category:'apps'});if(Object.hasOwn(q,'category'))throw Error('denied');break;
  case 'memberships':ownerMembershipsRequestSchema.parse({...q,category:'apps'});if(Object.hasOwn(q,'category'))throw Error('denied');break;
  case 'top-picks':ownerTopPicksRequestSchema.parse({...q,category:'apps'});if(Object.hasOwn(q,'category'))throw Error('denied');break;
  case 'public-apps':if(scope.slug)parsePublicProfileDetailRequest({...q,username:scope.handle,category:'apps',slug:scope.slug});else parsePublicProfileRequest({...q,username:scope.handle,category:'apps'});if(Object.keys(q).some(key=>!['limit','cursor'].includes(key)))throw Error('denied');break;
  default:if(Object.keys(q).length)throw Error('denied');
 }return scope;}
 async function relations(scope:Scope){if(scope.kind==='enrichment-command')await recommendation(scope.id!);if(scope.kind.startsWith('collections-')&&scope.id)await collection(scope.id);if(scope.kind.startsWith('recommendations-')&&scope.id)await recommendation(scope.id);if(scope.kind==='detach'){const parent=await collection(scope.id!),item=await recommendation(scope.other!);if(parent.account_id!==item.account_id)throw Error('denied');}
  if(scope.kind==='media')await media(scope.id!);if(scope.query.collectionId)await collection(scope.query.collectionId);if(scope.query.recommendationId)await recommendation(scope.query.recommendationId);
  if(scope.handle){const person=people.find(p=>p.handle===scope.handle)!;const account=await row('SELECT id AS account_id FROM creator_accounts WHERE id=$1::uuid AND handle=$2 AND current_database()=$3 LIMIT 2',[person.accountId,person.handle,database]);if(account.account_id!==person.accountId)throw Error('denied');}
  if(scope.kind==='public-apps'&&scope.slug){const person=people.find(p=>p.handle===scope.handle)!;await row("SELECT c.account_id FROM collections c JOIN creator_accounts a ON a.id=c.account_id WHERE c.slug=$1 AND c.category='apps' AND c.account_id=$2::uuid AND a.handle=$3 AND current_database()=$4 LIMIT 2",[scope.slug,person.accountId,person.handle,database]);}
 }
 async function beforeDispatch(req:Request,res:Response,next:NextFunction){try{if(sealed||admitted.has(req))throw Error('denied');const scope=shape(req),ownMethod=Object.getOwnPropertyDescriptor(req,'method')?.value;await binding();await relations(scope);admitted.set(req,scope);const method=(APPS_REQUEST_METHOD_LABELS as readonly unknown[]).includes(ownMethod)?ownMethod as AppsRequestMethodLabel:'UNKNOWN';let route:AppsRequestRouteLabel=(APPS_REQUEST_ROUTE_LABELS as readonly string[]).includes(scope.kind)?scope.kind as AppsRequestRouteLabel:'command';if(scope.kind==='identity')route=scope.label??'unproved';if(scope.kind==='media')route=method==='GET'?'media-get':method==='HEAD'?'media-head':'media-delete';labels.set(req,Object.freeze({route,method}));if(req.method==='GET'&&['public-shell','public-apps','collections-read','collections-editable','recommendations-read','recommendations-editable','content-snapshot','content-snapshot/validate','memberships','top-picks'].includes(scope.kind))readTransports.set(req,req.originalUrl);next();}catch{denied(res);}}
 async function checkMedia(values:string[],account?:string){for(const value of [...new Set(values)]){const asset=await media(value);if(account&&asset.account_id!==account)throw Error('denied');}}
 async function afterJsonParser(req:Request,res:Response,next:NextFunction){try{const scope=admitted.get(req);if(!scope)throw Error('denied');await binding();const body=req.body;
  switch(scope.kind){
   case 'enrichment-command':{const v=appEnrichmentCommandSchema.parse(body);if(!enrichmentSources)throw Error('denied');if(req.method==='PUT'?!['configureAppEnrichment','rebindAppEnrichment'].includes(v.operation):req.method==='DELETE'?v.operation!=='disableAppEnrichment':v.operation!=='acceptAppEnrichment')throw Error('denied');if(v.operation==='configureAppEnrichment'||v.operation==='rebindAppEnrichment'){const tuple=(source:unknown)=>JSON.stringify(appSourceIdentitySchema.parse(source));if(!enrichmentSources.some(source=>tuple(source)===tuple({sourceId:v.sourceId,sourceIdentity:v.sourceIdentity,sourceIdentityHash:v.sourceIdentityHash,canonicalizationVersion:v.canonicalizationVersion})))throw Error('denied');}break;}
   case 'resolve':resolveManualAppSchema.parse(body);break;
   case 'collections-create':{const v=createCollectionSchema.parse(body);if(v.category!=='apps'||v.coverMediaId!==null||v.attachTo!==undefined||v.placeLocation!==undefined)throw Error('denied');break;}
   case 'collections-command':if(req.method==='PATCH'){const v=updateCollectionSchema.parse(body);if(v.placeLocation!==undefined||v.coverMediaId!=null)throw Error('denied');}break;
   case 'recommendations-create':{const v=createRecommendationSchema.parse(body);if(v.category!=='apps')throw Error('denied');const parent=await collection(v.collectionId);const entity=await query("SELECT e.id FROM entities e JOIN app_entity_details d ON d.entity_id=e.id WHERE e.id=$1::uuid AND e.kind='app' AND e.origin='manual' AND current_database()=$2 LIMIT 2",[v.entityId,database]);if(entity.rows.length!==1)throw Error('denied');await checkMedia([...v.mediaIds,...(v.appScreenshots?.screenshotMediaIds??[])],parent.account_id);break;}
   case 'recommendations-command':if(req.method==='PATCH'){const v=updateRecommendationSchema.parse(body);if(v.bookContext!==undefined||v.movieContext!==undefined||v.movieTermIds!==undefined||v.productOffer!==undefined||v.placeContext!==undefined||v.placePhotos!==undefined)throw Error('denied');if(v.displayOverrides)appDisplayFieldsSchema.extend({title:z.string().nullable().optional()}).parse(v.displayOverrides);const item=await recommendation(scope.id!);await checkMedia([...(v.mediaIds??[]),...(v.appScreenshots?.screenshotMediaIds??[])],item.account_id);}break;
   case 'pins':{const v=categoryTopPicksInputSchema.parse(body);for(const pin of v.orderedPins){const parent=await collection(pin.collectionId),item=await recommendation(pin.recommendationId);if(parent.account_id!==item.account_id)throw Error('denied');}break;}
   case 'analytics':{const v=explorersAnalyticsInputSchema.parse(body);if(!accountIds.includes(v.accountId)||v.event.page!=='public-apps')throw Error('denied');if(v.locationId&&(await collection(v.locationId)).account_id!==v.accountId)throw Error('denied');if(v.recommendationId&&(await recommendation(v.recommendationId)).account_id!==v.accountId)throw Error('denied');break;}
  }next();}catch{denied(res);}}
 async function beforeMediaCommand(req:Request,res:Response,next:NextFunction){try{if(admitted.get(req)?.kind!=='upload')throw Error('denied');await binding();if(!req.explorersActor||!accountIds.includes(req.explorersActor.accountId)||req.get('x-media-purpose')!=='recommendation'||!Buffer.isBuffer(req.body)||req.body.length<8||req.body.length>5*1024*1024||Number(req.get('content-length'))!==req.body.length||req.get('content-type')!=='image/png'||!req.body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('denied');next();}catch{denied(res);}}
 const admission=Object.freeze({beforeDispatch,afterJsonParser,beforeMediaCommand,seal(){sealed=true;}});
 requestLabels.set(admission,labels);readTransportProofs.set(admission,request=>{const path=readTransports.get(request);return path!==undefined&&Object.getOwnPropertyDescriptor(request,'method')?.value==='GET'&&Object.getOwnPropertyDescriptor(request,'originalUrl')?.value===path;});return admission;
}
