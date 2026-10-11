import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=()=>readFileSync(new URL('../../../migrations/0053_explorers_taxonomy_catalogs.sql',import.meta.url),'utf8');
// Source contracts only: these assertions do not prove PostgreSQL behavior.
it('source only: durable catalogs start unavailable without invented vocabulary',()=>{
 const source=sql();
 for(const table of ['taxonomy_catalogs','taxonomy_source_mappings','taxonomy_legacy_slug_mappings','taxonomy_import_receipts'])expect(source).toContain(`CREATE TABLE public.${table}`);
 expect(source).toContain("VALUES ('places'),('people')");
 expect(source).toContain("DEFAULT 'UNCONFIGURED'");expect(source).toContain('DEFAULT 0');
 expect(source).toContain('default_locale IS NULL');expect(source).toContain('Missing approved default label');
 expect(source).not.toMatch(/INSERT INTO public\.taxonomy_terms/);
});
it('source only: every writer receives deferred hierarchy and assignment shape checks',()=>{
 const source=sql();
 expect(source).toContain('parent.parent_id IS NOT NULL');expect(source).toContain("child.category='people'");
 expect(source).toContain('root.position=0');expect(source).toContain('child.position=1');
 expect(source).toContain('child_term.parent_id=root.term_id');expect(source).toContain("assignment.category='people'");
 for(const table of ['taxonomy_terms','recommendation_taxonomy','taxonomy_catalogs','taxonomy_term_translations'])expect(source).toMatch(new RegExp(`AFTER INSERT OR UPDATE OR DELETE ON public\\.${table} DEFERRABLE INITIALLY DEFERRED`));
 expect(source).toContain('ancestor.active');expect(source).toContain('term.active');
});
it('source only: lock protocol and privileges preserve existing revision authority',()=>{
 const source=sql();
 expect(source).toContain('SHARE ROW EXCLUSIVE');expect(source).toContain('BEFORE catalog');
 expect(source).toContain('CREATE TRIGGER recommendation_taxonomy_catalog_lock');
 expect(source).toContain('FOR UPDATE');expect(source).toContain('BEFORE INSERT OR UPDATE OR DELETE ON public.recommendation_taxonomy');
 expect(source).toContain('GRANT SELECT ON public.taxonomy_catalogs,public.taxonomy_source_mappings,public.taxonomy_legacy_slug_mappings TO music_runtime');
 expect(source).not.toMatch(/GRANT[^;]*taxonomy_import_receipts/);
 expect(source).toContain('Taxonomy import receipt is immutable');
 expect(source).toContain('Legacy mapping conflicts with canonical slug');
 expect(source).toContain('PRIMARY KEY(category,source_host,entity_kind,document_id)');
 expect(source).toContain('PRIMARY KEY(category,legacy_slug)');
 expect(source.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
 expect(source).toContain('CREATE OR REPLACE FUNCTION public.purge_explorers_account_content');expect(source).not.toContain('content_revision');
 expect(source).toContain('REFERENCES public.taxonomy_terms(id,category) ON DELETE RESTRICT');
});
