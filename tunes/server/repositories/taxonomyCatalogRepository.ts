import type {PoolClient} from 'pg';
export class TaxonomyCatalogRepository {
 constructor(private readonly db:PoolClient){}
 async metadata(category:string){return (await this.db.query('SELECT state,version,default_locale FROM taxonomy_catalogs WHERE category=$1',[category])).rows[0];}
 async page(category:string,requestedLocale:string|null,defaultLocale:string,limit:number,after?:{position:number;id:string}){
  return (await this.db.query(`SELECT t.id,t.category,t.slug,t.parent_id AS "parentId",t.position,
   COALESCE(requested.label,approved.label) AS label,
   CASE WHEN requested.label IS NOT NULL THEN requested.locale ELSE approved.locale END AS "resolvedLocale",
   approved.label AS "defaultLabel"
   FROM taxonomy_terms t
   LEFT JOIN taxonomy_terms p ON p.id=t.parent_id AND p.category=t.category
   LEFT JOIN taxonomy_term_translations requested ON requested.term_id=t.id AND requested.locale=$2
   LEFT JOIN taxonomy_term_translations approved ON approved.term_id=t.id AND approved.locale=$3
   WHERE t.category=$1 AND t.active AND (t.parent_id IS NULL OR (p.active AND p.parent_id IS NULL))
   AND (t.parent_id IS NULL OR t.category='places')
   AND ($4::integer IS NULL OR (t.position,t.id)>($4::integer,$5::uuid))
   ORDER BY t.position,t.id LIMIT $6`,[category,requestedLocale,defaultLocale,after?.position??null,after?.id??null,limit+1])).rows;
 }
}
