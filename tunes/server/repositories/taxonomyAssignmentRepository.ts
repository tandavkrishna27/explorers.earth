import type {Pool,PoolClient} from 'pg';
import {RecommendationFailure} from './explorersRecommendationRepository';
import {placesTaxonomyAssignmentSchema,peopleSectorAssignmentSchema,placesTaxonomyReadSchema,peopleSectorReadSchema,curatedTermAssignmentSchema,curatedTermReadSchema,isFlatCuratedCategory,type FlatCuratedCategory,type TaxonomyAssignmentInput} from '../../shared/explorersTaxonomyContract';

/** Caller holds catalog, account/category and owned recommendation locks. */
export async function replaceTaxonomyAssignment(db:PoolClient,id:string,account:string,category:string,input:TaxonomyAssignmentInput){
 const flat=isFlatCuratedCategory(category);
 if(category!=='places'&&input.placesTaxonomy!==undefined||category!=='people'&&input.peopleSectorTermId!==undefined||!flat&&input.curatedTermId!==undefined)throw new RecommendationFailure(422,'Category taxonomy mismatch');
 const supplied=category==='places'?input.placesTaxonomy:category==='people'?input.peopleSectorTermId:flat?input.curatedTermId:undefined;
 if(supplied===undefined)return;
 const parsed=category==='places'?placesTaxonomyAssignmentSchema.safeParse(supplied):category==='people'?peopleSectorAssignmentSchema.safeParse(supplied):curatedTermAssignmentSchema.safeParse(supplied);
 if(!parsed.success)throw new RecommendationFailure(422,'Invalid taxonomy assignment');
 const ids=category==='places'?[input.placesTaxonomy!.categoryTermId,input.placesTaxonomy!.subcategoryTermId].filter((v):v is string=>v!==null):supplied===null?[]:[supplied as string];
 if(ids.length){
  const catalog=(await db.query('SELECT state,default_locale FROM taxonomy_catalogs WHERE category=$1',[category])).rows[0];
  if(catalog?.state!=='CONFIGURED')throw new RecommendationFailure(422,'Taxonomy catalog unavailable');
  const rows=(await db.query('SELECT id,parent_id,active FROM taxonomy_terms WHERE category=$1 AND id=ANY($2::uuid[])',[category,ids])).rows;
  const root=rows.find(r=>r.id===ids[0]),child=ids[1]?rows.find(r=>r.id===ids[1]):null;
  if(!root||!root.active||root.parent_id!==null||ids[1]&&(!child||!child.active||child.parent_id!==root.id))throw new RecommendationFailure(422,'Taxonomy selection unavailable');
 }
 await db.query('DELETE FROM recommendation_taxonomy WHERE recommendation_id=$1 AND account_id=$2 AND category=$3',[id,account,category]);
 for(let position=0;position<ids.length;position++)await db.query('INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,$3,$4,$5)',[id,account,category,ids[position],position]);
}

/** Recommendation-local hydration is independent of catalog entity details. */
export async function readTaxonomyAssignment(db:Pick<Pool,'query'>,id:string,account:string,category:'places'|'people'|FlatCuratedCategory){
 const catalog=(await db.query('SELECT state,version,default_locale FROM taxonomy_catalogs WHERE category=$1',[category])).rows[0];
 const state=catalog?.state??'UNCONFIGURED';
 const rows=(await db.query(`SELECT t.id,t.slug,t.parent_id,t.active,x.label,p.active AS parent_active
 FROM recommendation_taxonomy r JOIN taxonomy_terms t ON t.id=r.term_id AND t.category=r.category
 LEFT JOIN taxonomy_terms p ON p.id=t.parent_id AND p.category=t.category
 LEFT JOIN taxonomy_term_translations x ON x.term_id=t.id AND x.locale=$4
 WHERE r.recommendation_id=$1 AND r.account_id=$2 AND r.category=$3 ORDER BY r.position,t.id LIMIT 3`,[id,account,category,catalog?.default_locale??null])).rows;
 const selection=(r:any)=>r?{id:r.id,slug:r.slug,label:r.label??null,unavailable:state!=='CONFIGURED'||!r.active||r.parent_id!==null&&!r.parent_active||!r.label}:null;
 const root=rows.find(r=>r.parent_id===null),child=rows.find(r=>r.parent_id!==null);
 const common={catalogState:state,catalogVersion:Number(catalog?.version??0),defaultLocale:catalog?.default_locale??null,selectionUnavailable:rows.some(r=>selection(r)!.unavailable)};
 if(category==='places')return {placesTaxonomy:placesTaxonomyReadSchema.parse({...common,category:selection(root),subcategory:selection(child)})};
 if(category==='people')return {peopleSector:peopleSectorReadSchema.parse({...common,sector:selection(root)})};
 return {curatedTerm:curatedTermReadSchema.parse({...common,term:selection(root)})};
}
