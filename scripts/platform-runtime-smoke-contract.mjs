import assert from 'node:assert/strict';
export function selectCompiledExport(entries,name){
 const matches=entries.filter(({file,source})=>/^chunk-[A-Z0-9]+[.]js$/.test(file)&&source.match(/export [{]([^}]*)[}];/s)?.[1].split(',').map(value=>value.trim()).includes(name));
 if(matches.length!==1)throw new Error('CANONICAL_COMPILED_EXPORT_AMBIGUOUS');return matches[0].file;
}
export function assertUnauthenticatedSession(response){
 assert.equal(response.status,200,'CANONICAL_SESSION_STATUS_INVALID');
 assert.equal(response.headers['cache-control'],'no-store','CANONICAL_SESSION_CACHE_INVALID');
 assert.match(response.headers['content-type']??'',/^application\/json(?:;|$)/i,'CANONICAL_SESSION_MIME_INVALID');
 assert.equal(typeof response.body,'string');assert.equal(JSON.parse(response.body),null,'CANONICAL_UNAUTHENTICATED_SESSION_INVALID');
}
function assertSchema(schema){
 assert.equal(schema?.ready,true,'CANONICAL_SCHEMA_NOT_READY');
 assert.equal(schema.currentId,'0037_explorers_movies_provider_context','CANONICAL_SCHEMA_VERSION_INVALID');
 for(const key of ['currentChecksum','schemaChecksum'])assert.match(schema[key]??'',/^[a-f0-9]{64}$/,'CANONICAL_SCHEMA_CHECKSUM_INVALID');
}
export function assertRestartQualification(result,before){
 assert.equal(result.healthy,true,'RESTARTED_API_NOT_HEALTHY');
 assertUnauthenticatedSession(result.session);assertSchema(before);assertSchema(result.schema);
 assert.deepEqual(result.schema,before,'RESTARTED_SCHEMA_CHANGED');assert.equal(result.roleCount,1,'RUNTIME_ROLE_MISSING');
}
