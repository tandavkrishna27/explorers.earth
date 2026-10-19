import ts from 'typescript';
import {it,expect} from 'vitest';
import {captureCaseErrorMetadata,finiteCaseErrorMetadata,caseSourceFile,annotateCaseErrorReplacement} from '../helpers/placesCaseErrorDiagnostic';
import {readFileSync} from 'node:fs';
import {types} from 'pg';
it('fails closed for malformed finite coordinates and private extra keys',()=>{
 for(const value of [{caseCategory:'private'},{caseCategory:'database'},{caseCategory:'other',sourceLine:2},{caseCategory:'other',sourceFile:'private',sourceLine:2,sourceColumn:2},{caseCategory:'other',message:'private'},{caseCategory:'assertion',sourceFile:caseSourceFile,sourceLine:1000001,sourceColumn:1}])expect(finiteCaseErrorMetadata(value)).toBeUndefined();
});
import {expect as chaiExpect,AssertionError} from 'chai';
import {runInNewContext,runInThisContext} from 'node:vm';
import {isNativeError} from 'node:util/types';
it('refuses intrinsic stack formatting when native error name or message has an untrusted getter',()=>{
 for(const key of ['name','message']){let reads=0;const raw=Error('private');Object.defineProperty(raw,key,{get(){reads++;throw Error('private');}});expect(annotateCaseErrorReplacement(Error('generic'),raw).sourceFile).toBeUndefined();expect(reads).toBe(0);}
});
it('does not invoke a changed or accessor global stack formatter for a real native error',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(Error,'prepareStackTrace');let reads=0;
 try{
  const raw=Error('private');Object.defineProperty(Error,'prepareStackTrace',{configurable:true,writable:true,value:()=>{reads++;return 'private';}});
  expect(annotateCaseErrorReplacement(Error('generic'),raw).sourceFile).toBeUndefined();expect(reads).toBe(0);
  Object.defineProperty(Error,'prepareStackTrace',{configurable:true,get(){reads++;return ()=> 'private';}});
  expect(annotateCaseErrorReplacement(Error('generic'),raw).sourceFile).toBeUndefined();expect(reads).toBe(0);
 }finally{if(descriptor)Object.defineProperty(Error,'prepareStackTrace',descriptor);else Reflect.deleteProperty(Error,'prepareStackTrace');}
});
