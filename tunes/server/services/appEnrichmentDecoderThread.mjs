import {parentPort} from 'node:worker_threads';
import {decodeWebsiteMetadata,decodeAppleMetadata,validateProviderParsingPolicy,resolveWebsiteIdentity,resolveAppleIdentity} from '../application/appEnrichmentProviderCore.mjs';
import {validateAppDecoderFields,validateAppDecoderIdentity,validateAppDecoderObservedAt} from './appEnrichmentDecoderFields.generated.mjs';

// Only the fixed compiled dispatcher and shared-schema validator execute in this thread.
parentPort?.once('message',request=>{
 let controlId='';
 try{
  if(!request||typeof request!=='object'||Object.keys(request).length!==7||Object.keys(request).some(key=>!['version','controlId','adapterKind','identity','observedAt','bytes','parsingPolicy'].includes(key))||request.version!==1||typeof request.controlId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(request.controlId))throw Error();
  controlId=request.controlId;
  const policy=validateProviderParsingPolicy(request.parsingPolicy),identity=validateAppDecoderIdentity(request.identity);
  if(!(request.bytes instanceof Uint8Array)||request.bytes.byteLength>policy.maxInputBytes)throw Error();
  validateAppDecoderObservedAt(request.observedAt);
  let result;
  if(request.adapterKind==='website'){resolveWebsiteIdentity(identity);result=decodeWebsiteMetadata(request.bytes,identity,policy,validateAppDecoderFields);}
  else if(request.adapterKind==='apple'){resolveAppleIdentity(identity);result=decodeAppleMetadata(request.bytes,identity,policy,validateAppDecoderFields);}
  else throw Error();
  if(Buffer.byteLength(JSON.stringify(result))>32768)throw Error();
  parentPort.postMessage({version:1,controlId,result});
 }catch{parentPort?.postMessage({version:1,controlId,result:{kind:'invalid'}});}
 finally{parentPort?.close();}
});
