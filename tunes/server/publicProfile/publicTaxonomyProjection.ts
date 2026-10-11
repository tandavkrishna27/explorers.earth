import type {Pool} from 'pg';
import {z} from 'zod/v3';
export const publicTaxonomyTermSchema=z.object({documentId:z.string().uuid(),id:z.string().uuid(),slug:z.string().min(1).max(100),Category_name:z.string().min(1).max(200)}).strict();
export async function publicCatalogFence(db:Pick<Pool,'query'>,category:'people'|'places'){
 return (await db.query('SELECT state,version::text AS version,default_locale FROM taxonomy_catalogs WHERE category=$1',[category])).rows[0]??null;
}
export const samePublicCatalog=(a:any,b:any)=>JSON.stringify(a)===JSON.stringify(b);
/** Public compatibility shapes derive only from active owned assignments and approved default labels. */
export async function publicAssignedTaxonomy(db:Pick<Pool,'query'>,recommendation:string,account:string,category:'people'|'places'){
 const rows=(await db.query(`SELECT t.id,t.slug,t.parent_id,x.label FROM recommendation_taxonomy rt
 JOIN recommendations r ON r.id=rt.recommendation_id AND r.account_id=rt.account_id AND r.category=rt.category
 JOIN taxonomy_catalogs catalog ON catalog.category=rt.category AND catalog.state='CONFIGURED'
 JOIN taxonomy_terms t ON t.id=rt.term_id AND t.category=rt.category AND t.active
 JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale=catalog.default_locale
 LEFT JOIN taxonomy_terms p ON p.id=t.parent_id AND p.category=t.category
 WHERE rt.recommendation_id=$1 AND rt.account_id=$2 AND rt.category=$3
 AND (t.parent_id IS NULL OR (t.category='places' AND p.active AND p.parent_id IS NULL))
 ORDER BY rt.position,t.id LIMIT 3`,[recommendation,account,category])).rows;
 const root=rows.find(r=>r.parent_id===null);
 const child=root?rows.find(r=>r.parent_id===root.id):undefined;
 const shape=(r:any)=>r?publicTaxonomyTermSchema.parse({documentId:r.id,id:r.id,slug:r.slug,Category_name:r.label}):null;
 return {root:shape(root),child:shape(child)};
}
export async function resolvePublicSector(db:Pick<Pool,'query'>,slug:string){
 const catalog=await publicCatalogFence(db,'people');if(catalog?.state!=='CONFIGURED')return undefined;
 // A canonical identity, even inactive, takes precedence over any alias.
 const canonical=(await db.query("SELECT id,slug,active,parent_id FROM taxonomy_terms WHERE category='people' AND slug=$1",[slug])).rows[0];
 const term=canonical??(await db.query(`SELECT t.id,t.slug,t.active,t.parent_id FROM taxonomy_legacy_slug_mappings m JOIN taxonomy_terms t ON t.id=m.term_id AND t.category=m.category WHERE m.category='people' AND m.legacy_slug=$1`,[slug])).rows[0];
 if(!term?.active||term.parent_id!==null)return undefined;
 const label=(await db.query('SELECT label FROM taxonomy_term_translations WHERE term_id=$1 AND locale=$2',[term.id,catalog.default_locale])).rows[0]?.label;
 if(!label)return undefined;
 return {catalog,sector:publicTaxonomyTermSchema.parse({documentId:term.id,id:term.id,slug:term.slug,Category_name:label})};
}
