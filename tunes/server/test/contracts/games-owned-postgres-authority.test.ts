import {expect,it,vi} from 'vitest';
import {validateGamesOwnedPostgres,captureGamesOwnedPostgres,validateGamesRestore} from '../helpers/games-owned-postgres-authority';
const commit='a'.repeat(40),id='b'.repeat(64),image='sha256:'+'c'.repeat(64);
function fixture(){
 const env:NodeJS.ProcessEnv={MUSIC_C3_POSTGRES_TEST:'1',MUSIC_C5_POSTGRES_TEST:'1',DATABASE_URL_TEST:'postgresql://music_migrator:synthetic-only@127.0.0.1:51644/music_fixture',MUSIC_C10_STANDALONE_POSTGRES_ACK:'C10_LABELED_LOCAL_PG15',MUSIC_C10_STANDALONE_POSTGRES_PORT:'51644',MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID:id,MUSIC_C10_STANDALONE_POSTGRES_COMMIT:commit};
 const inspect:any={Id:id,Name:'/music-c10-qualification-aaaaaaa-pg15',Image:image,Config:{Image:'postgres:15-alpine',Labels:{'com.explorers.music.c10-qualification':'true','com.explorers.music.owner':'task10','com.explorers.music.commit':commit}},State:{Running:true,Health:{Status:'healthy'}},HostConfig:{PortBindings:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'51644'}]}}};
 let socket='unix:///var/run/docker.sock';
 const dockerRead=vi.fn((args:string[])=>{if(args[0]==='context'&&args[1]==='show')return 'default';if(args[0]==='context')return JSON.stringify(socket);if(args.includes('container'))return JSON.stringify(inspect);if(args.includes('image'))return image;throw Error('Unexpected read');});
 return {env,inspect,dockerRead,setSocket:(value:string)=>{socket=value;}};
}
it('admits approved51644 only after actual existing exact Docker attestation',()=>{const f=fixture();const target=validateGamesOwnedPostgres(f.env,commit,f);expect(target.port).toBe('51644');expect(f.dockerRead).toHaveBeenCalledTimes(4);});
const changes:Array<[string,(f:ReturnType<typeof fixture>)=>void]>=[
 ['missing authority',f=>{for(const k of Object.keys(f.env))if(k.startsWith('MUSIC_C10_'))delete f.env[k];}],
 ['partial acknowledgement',f=>{delete f.env.MUSIC_C10_STANDALONE_POSTGRES_ACK;}],
 ['cross commit',f=>{f.env.MUSIC_C10_STANDALONE_POSTGRES_COMMIT='d'.repeat(40);}],
 ['wrong target port',f=>{f.env.DATABASE_URL_TEST=f.env.DATABASE_URL_TEST!.replace('51644','51645');}],
 ['reserved port',f=>{f.env.MUSIC_C10_STANDALONE_POSTGRES_PORT='55432';}],
 ['out of range',f=>{f.env.MUSIC_C10_STANDALONE_POSTGRES_PORT='99999';}],
 ['UAT presence',f=>{f.env.MUSIC_UAT_DATABASE_ACK='';}],
 ['ambient production',f=>{f.env.GATE_PROD='1';}],
 ['ambient Docker',f=>{f.env.DOCKER_HOST='unix:///var/run/docker.sock';}],
 ['wrong container',f=>{f.inspect.Id='d'.repeat(64);}],
 ['wrong name',f=>{f.inspect.Name='/other';}],
 ['wrong image',f=>{f.inspect.Config.Image='postgres:16-alpine';}],
 ['wrong image ID',f=>{f.inspect.Image='sha256:'+'d'.repeat(64);}],
 ['wrong owner',f=>{f.inspect.Config.Labels['com.explorers.music.owner']='other';}],
 ['wrong label commit',f=>{f.inspect.Config.Labels['com.explorers.music.commit']='d'.repeat(40);}],
 ['unhealthy',f=>{f.inspect.State.Health.Status='starting';}],
 ['nonlocal socket',f=>{f.setSocket('tcp://remote:2375');}],
 ['wildcard mapping',f=>{f.inspect.HostConfig.PortBindings['5432/tcp'][0].HostIp='0.0.0.0';}],
 ['extra mapping',f=>{f.inspect.HostConfig.PortBindings['5433/tcp']=[];}],
 ...(['database','role','protocol','host','password','query','hash'] as const).map(name=>[name,(f:ReturnType<typeof fixture>)=>{const url=new URL(f.env.DATABASE_URL_TEST!);if(name==='database')url.pathname='/other';if(name==='role')url.username='postgres';if(name==='host')url.hostname='localhost';if(name==='password')url.password='';if(name==='query')url.search='?unsafe=1';if(name==='hash')url.hash='#unsafe';f.env.DATABASE_URL_TEST=name==='protocol'?url.toString().replace('postgresql:','http:'):url.toString();}] as [string,(f:ReturnType<typeof fixture>)=>void]),
 ['missing C3',f=>{delete f.env.MUSIC_C3_POSTGRES_TEST;}],['missing C5',f=>{delete f.env.MUSIC_C5_POSTGRES_TEST;}]
];
for(const [name,change] of changes)it('rejects '+name+' before pool continuation',()=>{const f=fixture();change(f);const pool=vi.fn();expect(()=>{validateGamesOwnedPostgres(f.env,commit,f);pool();}).toThrow();expect(pool).not.toHaveBeenCalled();});
it.each(['failed','malformed'])('rejects %s Docker reads without exposing secret',kind=>{const f=fixture();const read=()=>{if(kind==='failed')throw Error('synthetic transport failure');return 'not-json';};let error:any;try{validateGamesOwnedPostgres(f.env,commit,{dockerRead:read});}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error.message).not.toContain('synthetic-only');});it.each([1,2,3,4])('contains native read failure at phase%s without raw diagnostics',phase=>{const f=fixture();let calls=0;const dockerRead=(args:string[])=>{if(++calls===phase)throw Error('PRIVATE_SENTINEL_IMAGE_READ');return f.dockerRead(args);};const pool=vi.fn();let error:any;try{validateGamesOwnedPostgres(f.env,commit,{dockerRead});pool();}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error.message).toBe('Games C10 attestation failed');expect(error.cause).toBeUndefined();expect(error.message).not.toContain('PRIVATE_SENTINEL');expect(pool).not.toHaveBeenCalled();});it('admits51644 restore preexec with immutable source capture for both calls',()=>{const f=fixture(),source=captureGamesOwnedPostgres(f.env,commit,f),exec=vi.fn();expect(Object.isFrozen(source)).toBe(true);expect(typeof source.target).toBe('string');for(let i=0;i<2;i++){const fresh=validateGamesRestore(f.env,commit,source,f);exec(fresh.containerId);}expect(exec).toHaveBeenCalledTimes(2);expect(f.dockerRead).toHaveBeenCalledTimes(12);});
it('source capture cannot mutate and destination URL does not replace source target',()=>{const f=fixture(),source=captureGamesOwnedPostgres(f.env,commit,f),destination=new URL(source.target);destination.pathname='/games_restore_owned';expect(()=>{(source as any).target=destination.toString();}).toThrow();expect(new URL(source.target).pathname).toBe('/music_fixture');expect(validateGamesRestore(f.env,commit,source,f).target).toBe(source.target);});
it.each(['commit','database','role','container','missing','image'] as const)('denies changed %s before second restore child',kind=>{const f=fixture(),source=captureGamesOwnedPostgres(f.env,commit,f),exec=vi.fn();exec(validateGamesRestore(f.env,commit,source,f).containerId);if(kind==='commit')f.env.MUSIC_C10_STANDALONE_POSTGRES_COMMIT='d'.repeat(40);if(kind==='database')f.env.DATABASE_URL_TEST=f.env.DATABASE_URL_TEST!.replace('music_fixture','other');if(kind==='role')f.env.DATABASE_URL_TEST=f.env.DATABASE_URL_TEST!.replace('music_migrator','postgres');if(kind==='container'){f.env.MUSIC_C10_STANDALONE_POSTGRES_CONTAINER_ID='d'.repeat(64);f.inspect.Id='d'.repeat(64);}if(kind==='missing')delete f.env.MUSIC_C10_STANDALONE_POSTGRES_ACK;if(kind==='image')f.inspect.Image='sha256:'+'d'.repeat(64);expect(()=>exec(validateGamesRestore(f.env,commit,source,f).containerId)).toThrow();expect(exec).toHaveBeenCalledTimes(1);});
it('denies changed valid image digest despite fresh internally consistent Docker proof',()=>{const f=fixture(),source=captureGamesOwnedPostgres(f.env,commit,f),exec=vi.fn();exec(validateGamesRestore(f.env,commit,source,f).containerId);const changed='sha256:'+'d'.repeat(64);f.inspect.Image=changed;const dockerRead=(args:string[])=>args.includes('image')?changed:f.dockerRead(args);expect(()=>exec(validateGamesRestore(f.env,commit,source,{dockerRead}).containerId)).toThrow('Games restore authority changed');expect(exec).toHaveBeenCalledTimes(1);});