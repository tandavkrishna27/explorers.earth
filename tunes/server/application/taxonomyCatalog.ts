import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {z} from 'zod/v3';
import type {Pool} from 'pg';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {TaxonomyCatalogRepository} from '../repositories/taxonomyCatalogRepository';
import {taxonomyCatalogQuerySchema,taxonomyCatalogPageSchema,taxonomyCatalogItemSchema} from '../../shared/explorersTaxonomyContract';
const domain='explorers-taxonomy-catalog/v1';
const cursorSchema=taxonomyCatalogItemSchema.pick({id:true,position:true,category:true}).extend({position:z.number().int().min(0).max(2147483647),requestedLocale:z.string().nullable(),defaultLocale:z.string(),catalogVersion:z.number().int().positive().safe(),limit:z.number().int().min(1).max(24),order:z.literal('position-id/v1'),expires:z.number().int().positive().safe()}).strict();
export class TaxonomyCatalogFailure extends Error {constructor(readonly status:422|409|503,readonly code:'INVALID_INPUT'|'REVISION_CONFLICT'|'READ_LIMIT'){super(code==='REVISION_CONFLICT'?'Catalog changed; restart pagination':code==='INVALID_INPUT'?'Invalid taxonomy catalog parameters':'Taxonomy catalog configuration unavailable');}}
export class TaxonomyCatalogService {
 private readonly key:Buffer;
 constructor(private readonly pool:Pool,secret:string){this.key=createHash('sha256').update(`${domain}\0${secret}`).digest();}
 private decode(token:string){try{const b=Buffer.from(token,'base64url');if(b.toString('base64url')!==token||b.length<29)throw Error();const d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAAD(Buffer.from(domain));d.setAuthTag(b.subarray(12,28));const c=cursorSchema.parse(JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')));if(c.expires<=Date.now()||c.expires>Date.now()+600000)throw Error();return c;}catch{throw new TaxonomyCatalogFailure(422,'INVALID_INPUT');}}
 private encode(value:z.infer<typeof cursorSchema>){const n=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key,n);c.setAAD(Buffer.from(domain));const b=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([n,c.getAuthTag(),b]).toString('base64url');}
 async read(actor:Actor,input:unknown){
  await authorizeOperation(this.pool,actor,'entities:resolve',actor?.accountId);
  const parsed=taxonomyCatalogQuerySchema.safeParse(input);if(!parsed.success)throw new TaxonomyCatalogFailure(422,'INVALID_INPUT');const q=parsed.data,c=q.cursor?this.decode(q.cursor):undefined;
  if(c&&(c.category!==q.category||c.requestedLocale!==(q.locale??null)||c.limit!==q.limit))throw new TaxonomyCatalogFailure(422,'INVALID_INPUT');
  const db=await this.pool.connect();try{
   await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
   await authorizeOperation(db,actor,'entities:resolve',actor.accountId);
   const repo=new TaxonomyCatalogRepository(db),m=await repo.metadata(q.category),version=Number(m?.version);
   if(!m||!Number.isSafeInteger(version))throw new TaxonomyCatalogFailure(503,'READ_LIMIT');
   if(c&&c.catalogVersion!==version)throw new TaxonomyCatalogFailure(409,'REVISION_CONFLICT');
   if(c&&c.defaultLocale!==m.default_locale)throw new TaxonomyCatalogFailure(422,'INVALID_INPUT');
   let items:any[]=[],nextCursor:string|null=null;
   if(m.state==='CONFIGURED'){
    const rows=await repo.page(q.category,q.locale??null,m.default_locale,q.limit,c);
    if(rows.some(r=>typeof r.defaultLabel!=='string'||!r.defaultLabel.trim()))throw new TaxonomyCatalogFailure(503,'READ_LIMIT');
    items=rows.slice(0,q.limit).map(({defaultLabel,...item})=>item);
    if(rows.length>q.limit){const last=items[items.length-1];nextCursor=this.encode({id:last.id,position:last.position,category:q.category,requestedLocale:q.locale??null,defaultLocale:m.default_locale,catalogVersion:version,limit:q.limit,order:'position-id/v1',expires:Date.now()+600000});}
   }
   const result=taxonomyCatalogPageSchema.safeParse({version:domain,category:q.category,state:m.state,catalogVersion:version,requestedLocale:q.locale??null,defaultLocale:m.default_locale,items,nextCursor});if(!result.success)throw new TaxonomyCatalogFailure(503,'READ_LIMIT');
   await db.query('COMMIT');return result.data;
  }catch(error){try{await db.query('ROLLBACK');}catch{}throw error;}finally{db.release();}
 }
}
