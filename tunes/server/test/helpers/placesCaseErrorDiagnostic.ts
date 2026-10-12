export const caseSourceFile='server/test/explorers-place-pins.integration.test.ts' as const;
const states=new Set(['23502','23503','23505','23514','42501','57014','40001','40P01','55P03','42P01','42703','42883','28P01','3D000','53300','08001','08006','57P01']);
export type CaseErrorMetadata={caseCategory:'database'|'assertion'|'timeout'|'other';caseSqlState?:string;sourceFile?:typeof caseSourceFile;sourceLine?:number;sourceColumn?:number};
export function finiteCaseErrorMetadata(value:unknown):CaseErrorMetadata|undefined{
 if(!value||typeof value!=='object')return;
 const v=value as Record<string,unknown>,keys=Object.keys(v);
 if(!['database','assertion','timeout','other'].includes(v.caseCategory as string))return;
 if(Object.hasOwn(v,'caseSqlState')&&(!states.has(v.caseSqlState as string)||v.caseCategory!=='database')||v.caseCategory==='database'&&!Object.hasOwn(v,'caseSqlState'))return;
 const coords=['sourceFile','sourceLine','sourceColumn'].filter(k=>Object.hasOwn(v,k));
 if(coords.length&&(coords.length!==3||v.sourceFile!==caseSourceFile||![v.sourceLine,v.sourceColumn].every(n=>Number.isInteger(n)&&Number(n)>=1&&Number(n)<=1000000)))return;
 if(keys.some(k=>!['caseCategory','caseSqlState','sourceFile','sourceLine','sourceColumn'].includes(k)))return;
 return {...v} as CaseErrorMetadata;
}
export function captureCaseErrorMetadata(error:unknown):CaseErrorMetadata{
 const v=error&&typeof error==='object'?error as Record<string,unknown>:{},sql=typeof v.code==='string'&&states.has(v.code)?v.code:undefined;
 const metadata:CaseErrorMetadata={caseCategory:sql?'database':v.name==='AssertionError'?'assertion':v.name==='TimeoutError'?'timeout':'other',...(sql?{caseSqlState:sql}:{})};
 // Only this exact test file can contribute coordinates; stack text never leaves this function.
 if(typeof v.stack==='string')for(const line of v.stack.split('\n')){
  const match=/(?:^|[\\/])server[\\/]test[\\/]explorers-place-pins\.integration\.test\.ts:(\d{1,7}):(\d{1,7})(?:\)|\s|$)/.exec(line);
  if(match){const sourceLine=Number(match[1]),sourceColumn=Number(match[2]);if([sourceLine,sourceColumn].every(n=>n>=1&&n<=1000000))Object.assign(metadata,{sourceFile:caseSourceFile,sourceLine,sourceColumn});break;}
 }
 return metadata;
}
export function annotateCaseErrorReplacement<T extends Error>(replacement:T,original:unknown):T&{category:CaseErrorMetadata['caseCategory'];sqlState?:string;sourceFile?:typeof caseSourceFile;sourceLine?:number;sourceColumn?:number}{
 // Read only data descriptors: diagnostic getters must never run during failure cleanup.
 const safe:Record<string,unknown>={};
 if(original&&typeof original==='object')for(const key of ['code','name','stack']){
  try{let current:object|null=original;for(let depth=0;current&&depth<4;depth++,current=Object.getPrototypeOf(current)){
   const descriptor=Object.getOwnPropertyDescriptor(current,key);if(descriptor){if(Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string')safe[key]=descriptor.value;break;}
  }}catch{/* A hostile descriptor is diagnostically unknown. */}
 }
 const finite=finiteCaseErrorMetadata(captureCaseErrorMetadata(safe))??{caseCategory:'other' as const};
 return Object.assign(replacement,{category:finite.caseCategory,...(finite.caseSqlState?{sqlState:finite.caseSqlState}:{}),...(finite.sourceFile?{sourceFile:finite.sourceFile,sourceLine:finite.sourceLine,sourceColumn:finite.sourceColumn}:{})});
}
