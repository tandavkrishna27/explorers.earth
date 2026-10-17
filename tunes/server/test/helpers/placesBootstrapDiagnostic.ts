export const bootstrapStages=['admin-pool','admin-database','direct-pool','direct-verifier','direct-end','runtime-pool','runtime-role-query','runtime-role-assertion','repository','settle'] as const;
export type BootstrapStage=typeof bootstrapStages[number];
const states=new Set(['23502','23503','23505','23514','42501','57014','40001','40P01','55P03','42P01','42703','42883','28P01','3D000','53300','08001','08006','57P01']);
export type BootstrapMetadata={setupStage?:BootstrapStage;category?:'database'|'assertion'|'timeout'|'other';sqlState?:string};
export function finiteBootstrapMetadata(value:unknown):BootstrapMetadata{
 if(!value||typeof value!=='object')return {};
 const v=value as Record<string,unknown>;
 if(!(bootstrapStages as readonly unknown[]).includes(v.setupStage))return {};
 const sqlState=typeof v.sqlState==='string'&&states.has(v.sqlState)?v.sqlState:undefined;
 return {setupStage:v.setupStage as BootstrapStage,category:sqlState?'database':typeof v.category==='string'&&['assertion','timeout','other'].includes(v.category)?v.category as BootstrapMetadata['category']:'other',...(sqlState?{sqlState}:{})};
}
export function createBootstrapDiagnostic(){
 let first:BootstrapMetadata|undefined,active:BootstrapStage|undefined;
 function capture(stage:BootstrapStage,value:unknown){if(first)return;const v=value&&typeof value==='object'?value as Record<string,unknown>:{};const sqlState=typeof v.code==='string'&&states.has(v.code)?v.code:undefined;first={setupStage:stage,category:sqlState?'database':v.name==='AssertionError'?'assertion':v.name==='TimeoutError'?'timeout':'other',...(sqlState?{sqlState}:{})};}
 function error(){return Object.assign(Error('Fixture bootstrap stage'),first??{});}
 function snapshot():BootstrapMetadata{if(!first&&active)first={setupStage:active,category:'other'};return first?{...first}:{};}
 async function run<T>(stage:BootstrapStage,operation:()=>T|Promise<T>):Promise<T>{const prior=active;active=stage;try{return await operation();}catch(value){capture(stage,value);throw error();}finally{active=prior;}}
 return {run,error,snapshot};
}
