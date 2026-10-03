import {describe,it,expect,vi} from 'vitest';
import {PublicProfileService} from '../../publicProfile/publicProfileService';
describe('Books fresh public authorization',()=>{
 it('rechecks gates after warm reads and does not share old in-flight content',async()=>{
  let visible=true;let release!:(value:unknown)=>void;
  const gateway={resolveAccount:vi.fn(async()=>visible?{public_profile:'Yes',public_books:'Yes'}:undefined),resolveCategory:vi.fn(async()=>({bookLists:['public']})),resolveDetail:vi.fn(()=>new Promise(resolve=>{release=resolve;}))};
  const service=new PublicProfileService(gateway);
  expect(await service.category('owner','books',12)).toEqual({bookLists:['public']});
  const old=service.detail('owner','books','known',24);await vi.waitFor(()=>expect(gateway.resolveDetail).toHaveBeenCalledTimes(1));
  visible=false;
  expect(await service.category('owner','books',12)).toBeUndefined();
  expect(await service.detail('owner','books','known',24)).toBeUndefined();
  release({bookList:'previously public'});expect(await old).toBeUndefined();
  visible=true;expect(await service.category('owner','books',12)).toEqual({bookLists:['public']});
 });
});
