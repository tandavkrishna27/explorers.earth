import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { expect, it } from 'vitest';
import viteConfig from '../../../vite.config';

it('bundles sibling owner validators without sibling dependencies and executes strict validation',async()=>{
  const directory=mkdtempSync(resolve(tmpdir(),'owner-shared-bundle-'));
  if(!directory.startsWith(resolve(tmpdir(),'owner-shared-bundle-'))) throw new Error('Unexpected test directory');
  try {
    const frontend=resolve(directory,'frontend'),shared=resolve(directory,'tunes/shared');mkdirSync(frontend,{recursive:true});mkdirSync(shared,{recursive:true});
    // Derive the copy manifest from the sibling import graph instead of a literal
    // allowlist: a hard-coded array silently omitted explorersTaxonomyContract.ts once
    // two contracts began importing it, so the next added shared import must not be
    // able to break this fixture the same way.
    const sharedRoot=resolve(import.meta.dirname,'../../../../tunes/shared');
    const copied=new Set<string>(),pending=['explorersOwnerContentContract.ts','explorersContract.ts'];
    while(pending.length){
      const file=pending.shift()!;if(copied.has(file))continue;copied.add(file);
      const source=readFileSync(resolve(sharedRoot,file),'utf8');writeFileSync(resolve(shared,file),source);
      for(const match of source.matchAll(/from\s*['"]\.\/([A-Za-z0-9_.-]+)['"]/g)){const next=match[1].endsWith('.ts')?match[1]:`${match[1]}.ts`;if(!copied.has(next))pending.push(next);}
    }
    expect(copied.size).toBeGreaterThanOrEqual(2);
    const entry=resolve(frontend,'entry.ts');writeFileSync(entry,"export {ownerCollectionsRequestSchema,ownerTopPicksRequestSchema,ownerTopPickPageSchema} from '../tunes/shared/explorersOwnerContentContract'; export {categoryTopPicksInputSchema} from '../tunes/shared/explorersContract';");
    const config=await viteConfig({command:'build',mode:'production',isSsrBuild:false,isPreview:false});
    const output=await build({configFile:false,envDir:false,root:frontend,resolve:config.resolve,logLevel:'silent',build:{write:false,minify:false,lib:{entry,name:'ownerValidator',formats:['iife']}}});
    const chunks=(Array.isArray(output)?output:[output]).flatMap(x=>'output' in x?x.output:[]),chunk=chunks.find(x=>x.type==='chunk');expect(chunk?.type).toBe('chunk');
    type Validator={parse:(input:unknown)=>unknown;safeParse:(input:unknown)=>{success:boolean}};
    const context:{ownerValidator?:{ownerCollectionsRequestSchema:Validator;ownerTopPicksRequestSchema:Validator;ownerTopPickPageSchema:Validator;categoryTopPicksInputSchema:Validator}}={};runInNewContext(chunk!.type==='chunk'?chunk!.code:'',context);
    expect(context.ownerValidator!.ownerCollectionsRequestSchema.parse({category:'books'})).toEqual({category:'books',status:'active',limit:24});
    expect(context.ownerValidator!.ownerCollectionsRequestSchema.safeParse({category:'books',accountId:'forged'}).success).toBe(false);
    expect(context.ownerValidator!.ownerTopPicksRequestSchema.parse({category:'books'})).toEqual({category:'books',limit:24});
    expect(context.ownerValidator!.ownerTopPicksRequestSchema.safeParse({category:'places'}).success).toBe(false);
    expect(context.ownerValidator!.ownerTopPickPageSchema.safeParse({items:[]}).success).toBe(false);
    const input={expectedCategoryRevision:'0',expectedPinRevision:null,orderedPins:[]};
    expect(context.ownerValidator!.categoryTopPicksInputSchema.parse(input)).toEqual(input);
    expect(context.ownerValidator!.categoryTopPicksInputSchema.safeParse({...input,accountId:'forged'}).success).toBe(false);
    expect(context.ownerValidator!.categoryTopPicksInputSchema.safeParse({expectedCategoryRevision:'0',orderedPins:[]}).success).toBe(false);
  } finally {rmSync(directory,{recursive:true,force:true});}
},30000);
