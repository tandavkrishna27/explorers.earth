import {it} from 'vitest';
import {appsLocalQualificationCaseIds,type createAppsLocalQualificationPgHarness} from './helpers/appEnrichmentLocalQualificationPgHarness';
export {appsLocalQualificationCaseIds};
type Harness=ReturnType<typeof createAppsLocalQualificationPgHarness>;
/** Inert on import/collection. Only the root's reviewed guarded wrapper supplies a live harness. */
export function registerAppLocalQualification(harness:Harness,register:(name:string,work:()=>Promise<void>,timeout?:number)=>unknown=it):void{for(const id of appsLocalQualificationCaseIds)register(id,()=>harness.runCase(id),120000);}
