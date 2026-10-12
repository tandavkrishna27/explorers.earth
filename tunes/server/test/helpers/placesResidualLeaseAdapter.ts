type Client={query:(...args:any[])=>Promise<any>;release:()=>void};
// Import is inert; the caller supplies an already verified, controller-owned lease.
// Logical repository release never escapes ownership of the enclosing operation.
export function createResidualLeaseAdapter(client:Client,afterQuery?:(args:any[],result:any)=>Promise<void>){
 let checkedOut=false,pending:Promise<any>|undefined,transaction=false,completed=false,finished=false;
 const refusal=()=>Error('Fixture sequential lease state');
 const pool={connect:async()=>{
  if(finished||checkedOut||pending||transaction)throw refusal();checkedOut=true;completed=false;
  let logicalReleased=false;
  return {query:(...args:any[])=>{
   if(logicalReleased||finished)throw refusal();
   if(pending)return Promise.reject(refusal());
   // The last actual result of this checkout must prove completion. Neither a
   // previous checkout nor a later nonterminal query may supply that proof.
   completed=false;
   const text=typeof args[0]==='string'?args[0]:args[0]?.text;
   if(text==='BEGIN'){transaction=true;completed=false;}
   const original=(async()=>{const result=await client.query(...args),last=Array.isArray(result)?result.at(-1):result;
    if(last?.command==='COMMIT'||last?.command==='ROLLBACK'){transaction=false;completed=true;}
    await afterQuery?.(args,result);return result;
   })();pending=original;original.then(()=>{if(pending===original)pending=undefined;},()=>{if(pending===original)pending=undefined;});return original;
  },release:()=>{if(logicalReleased||pending||transaction||!completed)throw refusal();logicalReleased=true;checkedOut=false;}};
 }};
 return {pool,finish:()=>{if(finished||checkedOut||pending||transaction||!completed)throw refusal();finished=true;client.release();}};
}
