import {createHash} from 'node:crypto';
import {attestC10StandalonePostgresAuthority} from '../../../scripts/music-qualification-postgres';
import {validateIntegrationDatabaseTarget} from '../integration-global-setup';
export function captureGamesOwnedPostgres(environment:NodeJS.ProcessEnv, expectedCommit:string, options:{dockerRead?:(args:string[])=>string}={}):GamesPostgresSnapshot {
 if(environment.MUSIC_C3_POSTGRES_TEST!=='1'||environment.MUSIC_C5_POSTGRES_TEST!=='1'||!environment.DATABASE_URL_TEST)throw Error('Explicit owned Games PG authority required');
 if(Object.keys(environment).some(key=>key.startsWith('MUSIC_UAT_DATABASE_')&&environment[key]!==undefined))throw Error('Games requires exclusive C10 authority');
 let authority:ReturnType<typeof attestC10StandalonePostgresAuthority>;
 try {authority=attestC10StandalonePostgresAuthority(environment,expectedCommit,options);}
 catch {throw Error('Games C10 attestation failed');}
 if(!authority)throw Error('Games requires attested C10 authority');
 const target=validateIntegrationDatabaseTarget(environment.DATABASE_URL_TEST,environment);
 if(Number(target.port)!==authority.port)throw Error('Exclusive guarded Games PG required');
 return Object.freeze({commit:authority.commit,containerId:authority.containerId,imageId:authority.imageId,target:target.toString(),targetDigest:createHash('sha256').update(target.toString()).digest('hex')});
}export type GamesPostgresSnapshot=Readonly<{commit:string;containerId:string;imageId:string;target:string;targetDigest:string}>;
export function validateGamesOwnedPostgres(environment:NodeJS.ProcessEnv,expectedCommit:string,options:{dockerRead?:(args:string[])=>string}={}):URL {return new URL(captureGamesOwnedPostgres(environment,expectedCommit,options).target);}
export function validateGamesRestore(environment:NodeJS.ProcessEnv,expectedCommit:string,source:GamesPostgresSnapshot,options:{dockerRead?:(args:string[])=>string}={}):GamesPostgresSnapshot {
 const fresh=captureGamesOwnedPostgres(environment,expectedCommit,options);
 for(const key of ['commit','containerId','imageId','target','targetDigest'] as const)if(fresh[key]!==source[key])throw Error('Games restore authority changed');
 return fresh;
}