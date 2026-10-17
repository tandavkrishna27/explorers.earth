export const cleanupZero='00000000-0000-0000-0000-000000000000';
export type CleanupContinuation={accountId:string;afterCollectionId:string;afterDraftId:string};
type Page={removed:number;nextAccountId:string|null;continuation:CleanupContinuation|null};
type Observation={remaining:number;targetReached:boolean};
// Fixture traversal only: each page retains the repository's original policy.
// The inventory includes every existing draft/receipt, including rows which age
// into eligibility during this operation. No private owner-selection bypass.
export async function traverseCleanup(options:{initialRemaining:number;owners:number;completeSweep?:boolean;page:(after:string,resume?:CleanupContinuation)=>Promise<Page>;observe:()=>Promise<Observation>}){
 const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 const bound=options.initialRemaining+options.owners+2;
 if(!valid(options.initialRemaining)||!valid(options.owners)||!valid(bound))throw Error('Fixture cleanup inventory bound');
 let after=cleanupZero,resume:CleanupContinuation|undefined,remaining=options.initialRemaining;
 const position=(cursor:string,continuation?:CleanupContinuation)=>continuation?[continuation.accountId,continuation.afterCollectionId,continuation.afterDraftId]:[cursor,cleanupZero,cleanupZero];
 for(let calls=0;calls<bound;calls++){
  const prior=position(after,resume),result=await options.page(after,resume),observed=await options.observe();
  if(!valid(result.removed)||!valid(observed.remaining)||observed.remaining>remaining)throw Error('Fixture cleanup inventory progress');
  const nextAfter=result.nextAccountId??after,nextResume=result.continuation??undefined;
  if(result.nextAccountId&&result.nextAccountId<=after)throw Error('Fixture cleanup owner cursor');
  if(nextResume&&nextResume.accountId<=nextAfter)throw Error('Fixture cleanup continuation owner');
  const exhausted=result.nextAccountId===null&&!nextResume;
  if(!options.completeSweep&&observed.targetReached)return result;
  if(exhausted){if(options.completeSweep)return result;throw Error('Fixture cleanup target not reached');}
  const next=position(nextAfter,nextResume),advanced=next.join(':')>prior.join(':');
  if(next[0]<prior[0]||(!advanced&&(next[1]!==cleanupZero||next[2]!==cleanupZero)))throw Error('Fixture cleanup cursor regression');
  // A lawful zero tuple reset (including receipt-only maintenance with removed0)
  // requires a real decrease in the observed inventory, never a cursor fiction.
  if(!advanced&&observed.remaining>=remaining)throw Error('Fixture cleanup no progress');
  after=nextAfter;resume=nextResume;remaining=observed.remaining;
 }
 throw Error('Fixture cleanup traversal exhausted inventory bound');
}
