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
/** Retains the admitted reader lease through compatibility's logical release and final check. */
export function createReaderLeaseAdapter(lease:Lease,beforeSecondBegin:()=>Promise<void>){
 let connected=false,transaction=false,busy=false,begins=0,commits=0,rollbacks=0,logicalReleases=0,physicalReleases=0;
 const statements:{text:string;values:unknown[];command?:string;observedRows?:any[]}[]=[];
 const physicalRelease=()=>{if(!physicalReleases){physicalReleases++;lease.release();}};
 const query=async(...args:any[])=>{
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
 const client={query,release:()=>{if(!connected||transaction||busy)throw Error('Fixture reader lease release');connected=false;logicalReleases++;if(begins===2)physicalRelease();}};
 const pool={
  connect:async()=>{if(connected||physicalReleases||busy)throw Error('Fixture reader lease connect');connected=true;return client;},
  query:async(...args:any[])=>{if(connected||transaction||busy||begins!==1||commits!==1)throw Error('Fixture reader lease pool query');return query(...args);},
 };
 return {pool,statements,status:()=>({connected,transaction,busy,begins,commits,rollbacks,logicalReleases,physicalReleases}),finish:()=>{if(busy||transaction||connected)throw Error('Fixture reader lease unsettled');physicalRelease();}};
}
