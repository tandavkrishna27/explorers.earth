import {describe,expect,it,vi} from 'vitest';
import {removeProfileMedia} from '../profileClient';

const media={id:'11111111-1111-4111-8111-111111111111',url:'/m',mimeType:'image/png',size:1,alternativeText:null,caption:null};
const account={revision:7,profileImage:media,backgroundImage:{...media,id:'22222222-2222-4222-8222-222222222222'}};
const api=()=>({updateAccount:vi.fn(async input=>({revision:input.expectedRevision+1}) as never),deleteMedia:vi.fn(async()=>undefined)});

describe('removing profile media',()=>{
 it('clears the profile photo with the revision being shown, then deletes the asset',async()=>{
  const client=api();
  await removeProfileMedia('profile',account as never,client as never);
  expect(client.updateAccount).toHaveBeenCalledWith({expectedRevision:7,profileImageId:null});
  expect(client.deleteMedia).toHaveBeenCalledWith(media.id);
 });
 it('clears the cover image without touching the photo',async()=>{
  const client=api();
  await removeProfileMedia('background',account as never,client as never);
  expect(client.updateAccount).toHaveBeenCalledWith({expectedRevision:7,backgroundImageId:null});
  expect(client.deleteMedia).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
 });
 it('is still removed from the profile when deleting the file fails',async()=>{
  const client=api();client.deleteMedia.mockRejectedValue(new Error('offline'));
  await expect(removeProfileMedia('profile',account as never,client as never)).resolves.toMatchObject({revision:8});
 });
 it('does not delete the file when the account update is refused',async()=>{
  const client=api();client.updateAccount.mockRejectedValue(Object.assign(new Error('Account changed'),{status:409}));
  await expect(removeProfileMedia('profile',account as never,client as never)).rejects.toMatchObject({status:409});
  expect(client.deleteMedia).not.toHaveBeenCalled();
 });
});
