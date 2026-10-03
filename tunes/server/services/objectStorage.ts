import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageEnvironment = "local" | "qa" | "prod";
export interface ObjectStorage {
  readonly environment: StorageEnvironment;
  put(key: string, bytes: Buffer): Promise<string | undefined | void>;
  get(key: string): Promise<Buffer>;
  delete(key: string, versionId?: string | null): Promise<void>;
}
async function storageDeadline<T>(milliseconds:number,work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Storage deadline exceeded'));},milliseconds);});
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
    const path = this.path(key);
    await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
    await writeFile(path, bytes, { flag: "wx", mode: 0o600, signal: AbortSignal.timeout(120_000) });
  }
  async get(key: string): Promise<Buffer> { return storageDeadline(120000,signal=>readFile(this.path(key),{signal})); }
  async delete(key: string): Promise<void> { await storageDeadline(120000,()=>rm(this.path(key), { force: true })); }
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
