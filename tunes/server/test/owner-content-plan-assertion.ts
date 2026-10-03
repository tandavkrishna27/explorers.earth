type PlanNode = Record<string, any>;
const requirePlan=(condition:unknown,message:string):void=>{if(!condition)throw new Error('Selected owner collection plan: '+message);};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function children(node:PlanNode,count:number):PlanNode[]{requirePlan(Array.isArray(node.Plans)&&node.Plans.length===count,'unexpected child/operator shape');return node.Plans;}
function work(node:PlanNode,rows:number,loops:number){
 requirePlan(node['Actual Rows']===rows&&node['Actual Loops']===loops,'unbounded rows/loops');
 if(node.Filter)requirePlan(node['Rows Removed by Filter']===0,'missing/unbounded filter measurement');
 for(const metric of ['Rows Removed by Filter','Rows Removed by Index Recheck','Rows Removed by Join Filter','Temp Read Blocks','Temp Written Blocks'])requirePlan((node[metric]??0)===0,'filtered/rechecked/spilled work');
}
function owner(node:PlanNode,accountId:string,category:string){
 const predicate=[node['Index Cond'],node.Filter].filter(Boolean).join(' AND ');
 requirePlan(!/\b(?:OR|NOT)\b|<>|!=/i.test(predicate),'nonconjunctive protection');
 requirePlan(new RegExp(`\\baccount_id = '${accountId}'::uuid\\b`).test(predicate)&&new RegExp(`\\bcategory = '${category}'::text\\b`).test(predicate),'owner/category protection missing');
}
/** Only the two reviewed ordered collection seeks, not any-index/name substring.
 * The unique(collection_id,display_order) invariant gives one row per presorted
 * group. Incremental sort may read one extra row for the next group: 25+1.
 */
export function assertSelectedCollectionPlan(plan:unknown,context:{accountId:string;category:string;collectionId:string}):void {
 requirePlan(/^[a-f0-9-]{36}$/.test(context.accountId)&&/^[a-f0-9-]{36}$/.test(context.collectionId)&&/^[a-z]+$/.test(context.category),'invalid assertion bindings');
 const limit=plan as PlanNode;requirePlan(limit?.['Node Type']==='Limit','missing limit');work(limit,25,1);
 const [sort]=children(limit,1);requirePlan(sort['Node Type']==='Incremental Sort','not ordered incremental sort');work(sort,25,1);
 requirePlan(equal(sort['Sort Key'],['i.display_order','r.id'])&&equal(sort['Presorted Key'],['i.display_order']),'wrong order/presorted key');
 const group=sort['Full-sort Groups'];requirePlan(group?.['Group Count']===1&&equal(group['Sort Methods Used'],['quicksort']),'unbounded sort groups/method');
 for(const key of ['Average Sort Space Used','Peak Sort Space Used'])requirePlan(Number.isFinite(group['Sort Space Memory']?.[key])&&group['Sort Space Memory'][key]>0&&group['Sort Space Memory'][key]<=64,'sort memory beyond bounded group');
 requirePlan(!sort['Pre-sorted Groups'],'unexpected additional sort work');
 const [join]=children(sort,1);requirePlan(join['Node Type']==='Nested Loop'&&join['Join Type']==='Inner'&&join['Inner Unique']===true,'unbounded/unknown join');
 const [outer,inner]=children(join,2),rows=outer['Actual Rows'];requirePlan(Number.isInteger(rows)&&rows>=25&&rows<=26,'outer seek work beyond page+lookahead');work(join,rows,1);work(outer,rows,1);work(inner,1,rows);
 for(const [node,relation,alias] of [[outer,'collection_items','i'],[inner,'recommendations','r']] as const)requirePlan(node['Node Type']==='Index Scan'&&node['Relation Name']===relation&&node.Alias===alias&&node['Scan Direction']==='Forward'&&!(node.Plans?.length),'unexpected scan/relation/materialization');
 requirePlan(['collection_items_owner_collection_order_idx','collection_items_collection_id_display_order_key'].includes(outer['Index Name']),'unreviewed collection index');
 requirePlan(typeof outer['Index Cond']==='string'&&new RegExp(`\\bcollection_id = '${context.collectionId}'::uuid\\b`).test(outer['Index Cond']),'selected collection is not index constrained');
 requirePlan(inner['Index Name']==='recommendations_pkey'&&inner['Index Cond']==='(id = i.recommendation_id)','not exact per-membership primary lookup');
 owner(outer,context.accountId,context.category);owner(inner,context.accountId,context.category);
}
