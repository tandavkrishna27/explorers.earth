import {createReaderQueryQueue} from './placesReaderQueryQueue';
// Acceptance utilities only: resources and admission are supplied by the original suite.
type Page={items:{id:string;[key:string]:any}[];nextCursor:string|null;metadata:unknown};
export async function drainReaderPages(read:(cursor?:string)=>Promise<Page>,expected:string[],limit:number):Promise<{items:Page['items'];pages:Page[]}> {
 if(!Number.isInteger(limit)||limit<1||limit>24)throw Error('Fixture page limit');
 const pages:Page[]=[],items:Page['items']=[];let cursor:string|undefined,metadata:string|undefined;
 for(let n=0;n<4;n++){
  const page=await read(cursor);if(page.items.length>limit)throw Error('Fixture page limit');
  const current=JSON.stringify(page.metadata);if(n&&current!==metadata)throw Error('Fixture page metadata changed');metadata=current;
  pages.push(page);items.push(...page.items);cursor=page.nextCursor??undefined;
  if(!cursor){const actual=items.map(row=>row.id);if(new Set(actual).size!==actual.length||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Fixture traversal identity mismatch');return {items,pages};}
 }
 throw Error('Fixture traversal cursor persisted');
}

type Lease={query:(...args:any[])=>Promise<any>;release:()=>void};
const begin='BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY';
// Only this module can identify a retained pool whose own FIFO already covers every query.
const retainedReaderPools=new WeakMap<object,{pool:{connect:()=>Promise<Lease>;query:(...args:any[])=>Promise<any>};addAdmission:(admission:()=>boolean)=>void}>();
/** Matches pg.Client logical admission while the owned lease physically forwards once. */
export function createReaderPoolAdapter(pool:{connect:()=>Promise<Lease>},admitted:()=>boolean){
 const retained=retainedReaderPools.get(pool);if(retained){retained.addAdmission(admitted);return retained.pool;}
 const connect=async()=>{
  const lease=await pool.connect(),queue=createReaderQueryQueue((...args)=>lease.query(...args),admitted);let released=false;
  return {query:(...args:any[])=>{if(released)return Promise.reject(Error('Fixture reader released'));return queue.query(...args);},release:()=>{queue.assertSettled();if(released)throw Error('Fixture reader released');lease.release();released=true;}};
 };
 return {connect,query:async(...args:any[])=>{const client=await connect();try{return await client.query(...args);}finally{client.release();}}};
}
/** Retains the admitted reader lease through compatibility's logical release and final check. */
export function createReaderLeaseAdapter(lease:Lease,beforeSecondBegin:()=>Promise<void>,admitted:()=>boolean=()=>true){
 let connected=false,transaction=false,busy=false,begins=0,commits=0,rollbacks=0,logicalReleases=0,physicalReleases=0;
 const statements:{text:string;values:unknown[];command?:string;observedRows?:any[]}[]=[];
 const physicalRelease=()=>{if(!physicalReleases){physicalReleases++;lease.release();}};
 const forward=async(...args:any[])=>{
  const text=typeof args[0]==='string'?args[0]:args[0]?.text,values=typeof args[0]==='string'?(args[1]??[]):(args[0]?.values??[]);
  if(physicalReleases||busy||typeof text!=='string')throw Error('Fixture reader lease query');
  busy=true;
  try{
   if(text===begin){
    if(transaction||begins>1||begins===1&&commits!==1)throw Error('Fixture reader transaction transition');
    if(begins===1)await beforeSecondBegin();
   }
   const result=await lease.query(...args);statements.push({text,values:[...values],command:result.command,...text.includes('public_places_eligibility_aggregate')||text.includes('public_places_current_list')?{observedRows:result.rows}:{} });
   if(text===begin){if(result.command!=='BEGIN')throw Error('Fixture reader BEGIN command');begins++;transaction=true;}
   if(text==='COMMIT'){if(!transaction||result.command!=='COMMIT')throw Error('Fixture reader COMMIT command');commits++;transaction=false;}
   if(text==='ROLLBACK'){if(result.command!=='ROLLBACK')throw Error('Fixture reader ROLLBACK command');rollbacks++;transaction=false;}
   return result;
  }finally{busy=false;}
 };
 const admissions=new Set([admitted]),queue=createReaderQueryQueue(forward,()=>[...admissions].every(check=>check()));
 const query=(...args:any[])=>{
  const text=typeof args[0]==='string'?args[0]:args[0]?.text;
  // Invalid transition admission is refused before an original query exists.
  if(!queue.status().pending&&text===begin&&(transaction||begins>1||begins===1&&commits!==1))return Promise.reject(Error('Fixture reader transaction transition'));
  return queue.query(...args);
 };
 const client={query,release:()=>{queue.assertSettled();if(!connected||transaction||busy)throw Error('Fixture reader lease release');connected=false;logicalReleases++;if(begins===2)physicalRelease();}};
 const pool={
  connect:async()=>{if(connected||physicalReleases||busy||queue.status().pending)throw Error('Fixture reader lease connect');connected=true;return client;},
  query:async(...args:any[])=>{if(connected||transaction||begins!==1||commits!==1)throw Error('Fixture reader lease pool query');return query(...args);},
 };
 // Preserve the explicit post-COMMIT pool.query phase, not extra logical checkouts.
 retainedReaderPools.set(pool,{pool,addAdmission:admission=>{admissions.add(admission);}});
 return {pool,statements,status:()=>({connected,transaction,busy:busy||queue.status().pending>0,begins,commits,rollbacks,logicalReleases,physicalReleases}),finish:()=>{queue.assertSettled();if(busy||transaction||connected)throw Error('Fixture reader lease unsettled');physicalRelease();}};
}
