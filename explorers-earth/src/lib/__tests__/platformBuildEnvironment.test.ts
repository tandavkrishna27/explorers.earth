import {expect,it} from 'vitest';
import {resolveConfig} from 'vite';
import {resolve} from 'node:path';
it('exposes no ambient browser prefix including nominally unused prefixes',async()=>{
  const name='PLATFORM_NEVER_PUBLIC_AMBIENT_SECRET';const prior=process.env[name];
  process.env[name]='SYNTHETIC_PLATFORM_SECRET';
  try{
    const root=process.cwd();
    const config=await resolveConfig({root,configFile:resolve(root,'vite.platform.config.ts'),mode:'platform'},'build');
    expect(config.env[name]).toBeUndefined();expect(config.envDir).toBe(false);
  }finally{if(prior===undefined)delete process.env[name];else process.env[name]=prior;}
});
