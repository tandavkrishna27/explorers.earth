// Fixture only: every queued promise remains part of the original owned reader.
// No timers, physical leases, controller bypass or independent deadline are created.
export function createReaderQueryQueue(forward:(...args:any[])=>Promise<any>,admitted:()=>boolean=()=>true){
 let tail:Promise<void>=Promise.resolve(),pending=0,closed=false,failure:unknown;
 const query=(...args:any[])=>{
  pending++;
  const original=tail.then(async()=>{
   if(closed)throw failure;
   if(!admitted()){closed=true;failure=Error('Fixture reader admission closed');throw failure;}
   try{return await forward(...args);}catch(error){closed=true;failure=error;throw error;}
  });
  // Both handlers retain the outcome without allowing rejection to reopen admission.
  tail=original.then(()=>{pending--;},()=>{pending--;});
  return original;
 };
 return {query,assertSettled:()=>{if(pending)throw Error('Fixture reader query queue unsettled');},status:()=>({pending,closed})};
}
