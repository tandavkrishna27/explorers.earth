import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageEnvironment = "local" | "qa" | "prod";
export type OwnedStoragePut = {
  completion: Promise<string | undefined | void>;
  /** Never rejects; resolves only after actual native work has settled. */
  settlement: Promise<void>;
  /** Late native version/error is retained for safe compensation after settlement. */
  nativeResult: Promise<string | undefined | void>;
};
export interface ObjectStorage {
  readonly environment: StorageEnvironment;
  put(key: string, bytes: Buffer): Promise<string | undefined | void>;
  putOwned?(key: string, bytes: Buffer, deadlineMs: number): OwnedStoragePut;
  get(key: string): Promise<Buffer>;
  delete(key: string, versionId?: string | null): Promise<void>;
}
/** Opt-in physical custody; ordinary stores and S3 have no fixture ledger. */
export const LOCAL_STORAGE_SETTLEMENT_MAX_OPERATIONS = 4096;
type LocalOperation = 'put' | 'putOwned' | 'get' | 'delete';
type LocalOutcome = {sequence:number;operation:LocalOperation;key:string;status:'pending'|'fulfilled'|'rejected';publicFailure:boolean};
export type LocalStorageSettlementEvidence = Readonly<{status:'settled'|'failed-but-settled'|'unsettled';sealed:boolean;pending:number;overflow:boolean;outcomes:readonly Readonly<LocalOutcome>[]} >;
export interface LocalStorageSettlementCapability {
  snapshot():LocalStorageSettlementEvidence;
  sealAndDrain(milliseconds:number):Promise<LocalStorageSettlementEvidence>;
}
type LocalLedger = {sealed:boolean;failed:boolean;overflow:boolean;pending:Set<Promise<void>>;outcomes:LocalOutcome[]};
const localLedgers = new WeakMap<LocalObjectStorage,LocalLedger>();
function assertLocalAdmission(storage:LocalObjectStorage){const ledger=localLedgers.get(storage);if(ledger&&(ledger.sealed||ledger.overflow)){ledger.failed=true;throw new Error('Local storage admission refused');}}
function physicalLocalWork<T>(storage:LocalObjectStorage,operation:LocalOperation,key:string,work:()=>Promise<T>){
  const ledger=localLedgers.get(storage);
  if(!ledger)return {result:work(),publicFailure:()=>undefined};
  if(ledger.sealed||ledger.overflow){ledger.failed=true;throw new Error('Local storage admission refused');}
  if(ledger.outcomes.length>=LOCAL_STORAGE_SETTLEMENT_MAX_OPERATIONS){ledger.failed=true;ledger.overflow=true;throw new Error('Local storage admission refused');}
  const outcome:LocalOutcome={sequence:ledger.outcomes.length+1,operation,key,status:'pending',publicFailure:false};ledger.outcomes.push(outcome);
  let fulfill!:(value:T)=>void,reject!:(error:unknown)=>void;
  const result=new Promise<T>((yes,no)=>{fulfill=yes;reject=no;});
  const settlement=result.then(()=>{outcome.status='fulfilled';ledger.pending.delete(settlement);},()=>{outcome.status='rejected';ledger.failed=true;ledger.pending.delete(settlement);});
  ledger.pending.add(settlement);
  // Ownership is recorded before even mkdir/read/rm may begin. The completion
  // race never removes this original physical operation from the ledger.
  try{work().then(fulfill,reject);}catch(error){reject(error);}
  return {result,publicFailure:()=>{outcome.publicFailure=true;ledger.failed=true;}};
}
function evidence(ledger:LocalLedger):LocalStorageSettlementEvidence {
  return Object.freeze({status:!ledger.sealed||ledger.pending.size?'unsettled':ledger.failed?'failed-but-settled':'settled',sealed:ledger.sealed,pending:ledger.pending.size,overflow:ledger.overflow,outcomes:Object.freeze(ledger.outcomes.map(outcome=>Object.freeze({...outcome})))});
}
export function createLocalObjectStorageWithSettlement(root:string):{storage:LocalObjectStorage;settlement:LocalStorageSettlementCapability} {
  const storage=new LocalObjectStorage(root),ledger:LocalLedger={sealed:false,failed:false,overflow:false,pending:new Set(),outcomes:[]};
  localLedgers.set(storage,ledger);
  const settlement:LocalStorageSettlementCapability=Object.freeze({snapshot:()=>evidence(ledger),sealAndDrain:async(milliseconds:number)=>{
    if(!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>21600000)throw new Error('Invalid local settlement budget');
    ledger.sealed=true;let timer:ReturnType<typeof setTimeout>|undefined;
    try{await Promise.race([Promise.all([...ledger.pending]),new Promise<void>(done=>{timer=setTimeout(()=>{ledger.failed=true;done();},milliseconds);})]);}finally{if(timer)clearTimeout(timer);}
    return evidence(ledger);
  }});
  return {storage,settlement};
}
function ownedPut(deadlineMs: number, work: (signal: AbortSignal) => Promise<string | undefined | void>,onTimeout:()=>void=()=>undefined): OwnedStoragePut {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 5000) throw new Error("Invalid owned storage deadline");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  // Call exactly once. Native rejection remains observed even after caller timeout.
  const nativeResult = work(controller.signal);
  const settlement = nativeResult.then(() => undefined, () => undefined);
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { onTimeout();controller.abort(); reject(new Error("Storage deadline exceeded")); }, deadlineMs);
  });
  const completion = Promise.race([nativeResult, deadline]).finally(() => clearTimeout(timer!));
  return { completion, settlement, nativeResult };
}
async function storageDeadline<T>(milliseconds:number,work:(signal:AbortSignal)=>Promise<T>,onTimeout:()=>void=()=>undefined):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{onTimeout();controller.abort();reject(new Error('Storage deadline exceeded'));},milliseconds);});
 try{return await Promise.race([work(controller.signal),deadline]);}finally{clearTimeout(timer!);}
}

export function assertObjectKey(key: string, environment: StorageEnvironment): void {
  if (!new RegExp(`^${environment}/[0-9a-f-]{36}/[0-9a-f-]{36}$`, "i").test(key))
    throw new Error("Invalid media storage key or environment");
}

export class LocalObjectStorage implements ObjectStorage {
  readonly environment = "local" as const;
  private readonly root: string;
  constructor(root = process.env.EXPLORERS_MEDIA_LOCAL_ROOT ?? join(tmpdir(), "explorers-private-media")) {
    this.root = resolve(root);
  }
  private path(key: string): string {
    assertObjectKey(key, this.environment);
    const path = resolve(this.root, ...key.split("/"));
    if (!path.startsWith(this.root + sep)) throw new Error("Invalid media storage path");
    return path;
  }
  async put(key: string, bytes: Buffer): Promise<void> {
    assertLocalAdmission(this);
    const path = this.path(key);
    await physicalLocalWork(this,'put',key,async()=>{
      await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
      await writeFile(path, bytes, { flag: "wx", mode: 0o600, signal: AbortSignal.timeout(120_000) });
    }).result;
  }
  putOwned(key: string, bytes: Buffer, deadlineMs: number): OwnedStoragePut {
    assertLocalAdmission(this);
    const path = this.path(key);
    let publicFailure:()=>void=()=>undefined;
    return ownedPut(deadlineMs, signal => {
      const operation=physicalLocalWork(this,'putOwned',key,async()=>{
      await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
      if (signal.aborted) throw new Error("Storage deadline exceeded");
      await writeFile(path, bytes, { flag: "wx", mode: 0o600, signal });
      });publicFailure=operation.publicFailure;return operation.result;
    },()=>publicFailure());
  }
  async get(key: string): Promise<Buffer> {assertLocalAdmission(this);const path=this.path(key);let publicFailure:()=>void=()=>undefined;return storageDeadline(120000,signal=>{const operation=physicalLocalWork(this,'get',key,()=>readFile(path,{signal}));publicFailure=operation.publicFailure;return operation.result;},()=>publicFailure());}
  async delete(key: string): Promise<void> {assertLocalAdmission(this);const path=this.path(key);let publicFailure:()=>void=()=>undefined;await storageDeadline(120000,()=>{const operation=physicalLocalWork(this,'delete',key,()=>rm(path,{force:true}));publicFailure=operation.publicFailure;return operation.result;},()=>publicFailure());}
}

/** The bucket remains private. The server is the only byte-delivery authority. */
export class S3ObjectStorage implements ObjectStorage {
  constructor(readonly environment: "qa" | "prod", private readonly bucket: string,
    private readonly client: S3Client,private readonly deadlineMs=120000) {
    if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket)) throw new Error("Invalid private media bucket");
  }
  async put(key: string, bytes: Buffer): Promise<string | undefined> {
    assertObjectKey(key, this.environment);
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes }),
      { abortSignal: AbortSignal.timeout(120_000) });
    return result.VersionId;
  }
  putOwned(key: string, bytes: Buffer, deadlineMs: number): OwnedStoragePut {
    assertObjectKey(key, this.environment);
    return ownedPut(deadlineMs, async signal => {
      const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes }), { abortSignal: signal });
      return result.VersionId;
    });
  }
  async get(key: string): Promise<Buffer> {
    assertObjectKey(key, this.environment);
    return storageDeadline(this.deadlineMs,async signal=>{
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }),{abortSignal:signal});
    if (!result.Body) throw new Error("Media object is missing");
    const abort=()=>{if(result.Body&&'destroy' in result.Body)result.Body.destroy();};signal.addEventListener('abort',abort,{once:true});
    try{return Buffer.from(await result.Body.transformToByteArray());}finally{signal.removeEventListener('abort',abort);}
    });
  }
  async delete(key: string, versionId?: string | null): Promise<void> {
    assertObjectKey(key, this.environment);
    return storageDeadline(this.deadlineMs,async signal=>{
    if (versionId) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: versionId }),{abortSignal:signal});
      return;
    }
    // An upload may have succeeded just before metadata failed. Enumerate exact
    // versions so a delete marker cannot masquerade as permanent byte cleanup.
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    let found = false;
    do {
      const listed = await this.client.send(new ListObjectVersionsCommand({ Bucket: this.bucket,
        Prefix: key, KeyMarker: keyMarker, VersionIdMarker: versionMarker, MaxKeys: 1000 }),{abortSignal:signal});
      for (const entry of [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]) {
        if (entry.Key !== key || !entry.VersionId) continue;
        found = true;
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key, VersionId: entry.VersionId }),{abortSignal:signal});
      }
      if (!listed.IsTruncated) break;
      keyMarker = listed.NextKeyMarker;
      versionMarker = listed.NextVersionIdMarker;
      if (!keyMarker) throw new Error("Incomplete media version listing");
    } while (true);
    if (!found) await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),{abortSignal:signal});
    });
  }
}

export function resolveObjectStorage(env: NodeJS.ProcessEnv = process.env): ObjectStorage {
  const selected = env.EXPLORERS_MEDIA_ENVIRONMENT;
  if (selected === undefined && env.NODE_ENV !== "production") return new LocalObjectStorage(env.EXPLORERS_MEDIA_LOCAL_ROOT);
  if (selected === "local" && env.NODE_ENV !== "production") return new LocalObjectStorage(env.EXPLORERS_MEDIA_LOCAL_ROOT);
  if (selected !== "qa" && selected !== "prod") throw new Error("Explicit QA or production media environment is required");
  if (env.NODE_ENV === "production" && selected !== (env.EXPLORERS_DEPLOYMENT_TIER === "qa" ? "qa" : "prod"))
    throw new Error("Media prefix does not match the deployment tier");
  const bucket = env.EXPLORERS_MEDIA_S3_BUCKET;
  const region = env.EXPLORERS_MEDIA_S3_REGION;
  if (!bucket || !region || !/^[a-z]{2}-[a-z-]+-\d$/.test(region)) throw new Error("Private media S3 bucket and region are required");
  return new S3ObjectStorage(selected, bucket, new S3Client({ region }));
}
