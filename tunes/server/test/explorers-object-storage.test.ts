import { DeleteObjectCommand, GetObjectCommand, ListObjectVersionsCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { resolveObjectStorage, S3ObjectStorage } from "../services/objectStorage";
import {MediaService} from '../application/media';
import {MediaRepository} from '../repositories/mediaRepository';
import type {Pool} from 'pg';

const key = "qa/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
describe("private environment-selected media storage", () => {
  it("requires an explicit hosted environment and bucket in production", () => {
    expect(() => resolveObjectStorage({ NODE_ENV: "production" })).toThrow();
    expect(() => resolveObjectStorage({ NODE_ENV: "production", EXPLORERS_MEDIA_ENVIRONMENT: "local" })).toThrow();
    expect(() => resolveObjectStorage({ NODE_ENV: "production", EXPLORERS_MEDIA_ENVIRONMENT: "prod" })).toThrow();
    expect(() => resolveObjectStorage({ NODE_ENV: "production", EXPLORERS_DEPLOYMENT_TIER: "qa",
      EXPLORERS_MEDIA_ENVIRONMENT: "prod", EXPLORERS_MEDIA_S3_BUCKET: "private-fixture-bucket",
      EXPLORERS_MEDIA_S3_REGION: "us-east-1" })).toThrow();
    expect(resolveObjectStorage({ NODE_ENV: "production", EXPLORERS_MEDIA_ENVIRONMENT: "prod",
      EXPLORERS_MEDIA_S3_BUCKET: "private-fixture-bucket", EXPLORERS_MEDIA_S3_REGION: "us-east-1" }).environment).toBe("prod");
  });

  it("uses the configured private bucket and exact prefix, including version-aware delete", async () => {
    const send = vi.fn().mockResolvedValueOnce({ VersionId: "v1" })
      .mockResolvedValueOnce({ Body: { transformToByteArray: async () => Uint8Array.from([1, 2]) } })
      .mockResolvedValueOnce({});
    const storage = new S3ObjectStorage("qa", "private-fixture-bucket", { send } as unknown as S3Client);
    expect(await storage.put(key, Buffer.from([1, 2]))).toBe("v1");
    expect(await storage.get(key)).toEqual(Buffer.from([1, 2]));
    await storage.delete(key, "v1");
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[2][0].input).toMatchObject({ Bucket: "private-fixture-bucket", Key: key, VersionId: "v1" });
    await expect(storage.put(key.replace(/^qa/, "prod"), Buffer.from([1]))).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("recovers a versioned upload whose version metadata was not committed", async () => {
    const send = vi.fn().mockResolvedValueOnce({ Versions: [
      { Key: key, VersionId: "orphan-v1" }, { Key: `${key}-other`, VersionId: "untouched" }], IsTruncated: false })
      .mockResolvedValueOnce({});
    const storage = new S3ObjectStorage("qa", "private-fixture-bucket", { send } as unknown as S3Client);
    await storage.delete(key);
    expect(send.mock.calls[0][0]).toBeInstanceOf(ListObjectVersionsCommand);
    expect(send.mock.calls[1][0].input).toMatchObject({ Key: key, VersionId: "orphan-v1" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
it('rechecks publication after bytes arrive before returning anonymous media',async()=>{
 const record={id:'22222222-2222-4222-8222-222222222222',account_id:'11111111-1111-4111-8111-111111111111',status:'ready',purpose:'recommendation',storage_environment:'qa',object_key:key,mime_type:'image/png',byte_size:'8',alternative_text:null,caption:null,storage_version_id:null,content_sha256:Buffer.alloc(32)};
 const find=vi.spyOn(MediaRepository.prototype,'find').mockResolvedValue(record);
 let visible=true;const isPublic=vi.spyOn(MediaRepository.prototype,'isPublicAttachment').mockImplementation(async()=>visible);
 const service=new MediaService({} as Pool,{environment:'qa',put:async()=>undefined,get:async()=>{visible=false;return Buffer.alloc(8);},delete:async()=>undefined});
 try{await expect(service.resolveMediaContent(null,record.id)).rejects.toThrow('Media unavailable');expect(isPublic).toHaveBeenCalledTimes(2);}finally{find.mockRestore();isPublic.mockRestore();}
});
it('bounds S3 get and complete version cleanup with an abort deadline',async()=>{
 const send=(_command:unknown,options?:{abortSignal?:AbortSignal})=>new Promise<any>((_resolve,reject)=>{if(!options?.abortSignal){reject(new Error('Missing storage deadline'));return;}options.abortSignal.addEventListener('abort',()=>reject(new Error('Timed out')),{once:true});});
 const storage=new S3ObjectStorage('qa','private-fixture-bucket',{send} as unknown as S3Client,10);
 await expect(storage.get(key)).rejects.toThrow('Storage deadline exceeded');await expect(storage.delete(key,'v1')).rejects.toThrow('Storage deadline exceeded');await expect(storage.delete(key)).rejects.toThrow('Storage deadline exceeded');
});
it('bounds S3 response body even when headers arrive and body stalls',async()=>{
 const storage=new S3ObjectStorage('qa','private-fixture-bucket',{send:async()=>({Body:{transformToByteArray:()=>new Promise(()=>{})}})} as unknown as S3Client,10);
 await expect(storage.get(key)).rejects.toThrow('Storage deadline exceeded');
});
describe('Movie import owned native put settlement', () => {
 it('bounds caller completion without claiming noncooperative send settlement', async () => {
  let finish!: (v:{VersionId:string})=>void;
  const send=vi.fn((_command:unknown,_options:unknown)=>new Promise(resolve=>{finish=resolve;}));
  const storage=new S3ObjectStorage('qa','private-fixture-bucket',{send} as unknown as S3Client);
  const put=storage.putOwned(key,Buffer.from([1,2]),10);let settled=false;
  put.settlement.then(()=>{settled=true;});
  await expect(put.completion).rejects.toThrow('Storage deadline exceeded');
  expect(send).toHaveBeenCalledTimes(1);
  expect((send.mock.calls[0][1] as {abortSignal:AbortSignal}).abortSignal.aborted).toBe(true);
  expect(settled).toBe(false);finish({VersionId:'late-owned-v1'});
  await put.settlement;expect(settled).toBe(true);
  await expect(put.nativeResult).resolves.toBe('late-owned-v1');
 });
 it('observes late native rejection without rejecting settlement or retrying',async()=>{
  let fail!:(e:Error)=>void;
  const send=vi.fn(()=>new Promise((_resolve,reject)=>{fail=reject;}));
  const storage=new S3ObjectStorage('qa','private-fixture-bucket',{send} as unknown as S3Client);
  const put=storage.putOwned(key,Buffer.from([1]),10);
  await expect(put.completion).rejects.toThrow('Storage deadline exceeded');
  fail(new Error('native rejection after abort'));
  await expect(put.settlement).resolves.toBeUndefined();
  await expect(put.nativeResult).rejects.toThrow('native rejection after abort');
  expect(send).toHaveBeenCalledTimes(1);
 });
 it('returns native version and refuses invalid native admission',async()=>{
  const send=vi.fn().mockResolvedValue({VersionId:'v-owned'});
  const storage=new S3ObjectStorage('qa','private-fixture-bucket',{send} as unknown as S3Client);
  const put=storage.putOwned(key,Buffer.from([1]),5000);
  await expect(put.completion).resolves.toBe('v-owned');
  await expect(put.settlement).resolves.toBeUndefined();
  expect(()=>storage.putOwned(key.replace(/^qa/,'prod'),Buffer.from([1]),5000)).toThrow();
  expect(()=>storage.putOwned(key,Buffer.from([1]),0)).toThrow();
  expect(()=>storage.putOwned(key,Buffer.from([1]),5001)).toThrow();
  expect(send).toHaveBeenCalledTimes(1);
 });
});
