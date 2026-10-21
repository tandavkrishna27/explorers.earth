import pg from 'pg';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrateMusicDatabase} from '../../db/migrate';
import {applyTaxonomyCatalogImport,dryRunTaxonomyCatalogImport} from '../../services/taxonomyCatalogImport';
import {TaxonomyCatalogRepository} from '../../repositories/taxonomyCatalogRepository';
import {resolveTaxonomyApplyInput} from '../../../scripts/apply-reviewed-taxonomy';
/** Disposable PostgreSQL only: dry-run, apply, unchanged re-apply and the People sector read. */
const enabled=process.env.EXPLORERS_T3_POSTGRES_TEST==='1'&&!!process.env.DATABASE_URL_TEST;
const suite=enabled?describe.sequential:describe.skip;
const databaseName=`explorers_people_sectors_${process.pid}`;
let admin:pg.Pool,pool:pg.Pool;
suite('reviewed People sector apply against PostgreSQL',()=>{
 const input=resolveTaxonomyApplyInput('people');
 beforeAll(async()=>{
  admin=new pg.Pool({connectionString:process.env.DATABASE_URL_TEST,max:1});await admin.query(`CREATE DATABASE ${databaseName}`);
  const url=new URL(process.env.DATABASE_URL_TEST!);url.pathname=`/${databaseName}`;pool=new pg.Pool({connectionString:url.toString(),max:4});await migrateMusicDatabase(pool);
 },300000);
 afterAll(async()=>{await pool?.end();if(admin){await admin.query(`DROP DATABASE ${databaseName}`);await admin.end();}},120000);
 it('starts UNCONFIGURED and dry-run plans 20 sectors without writing',async()=>{
  const plan=await dryRunTaxonomyCatalogImport(pool,input);
  expect(plan).toMatchObject({category:'people',observedCatalogVersion:0,catalogVersion:1,changed:true,conflicts:[]});
  expect(plan.changes.filter(change=>change.startsWith('term:add:'))).toHaveLength(20);
  expect((await new TaxonomyCatalogRepository(pool as never).metadata('people'))?.state).toBe('UNCONFIGURED');
  expect((await pool.query("SELECT count(*)::int AS n FROM taxonomy_import_receipts WHERE category='people'")).rows[0].n).toBe(0);
 });
 it('applies once with a receipt, and re-applying is an unchanged no-op',async()=>{
  const first=await applyTaxonomyCatalogImport(pool,input,'integration reviewer');
  expect(first).toMatchObject({changed:true,catalogVersion:1,reviewedBy:'integration reviewer',conflicts:[]});
  const again=await applyTaxonomyCatalogImport(pool,input,'integration reviewer');
  expect(again).toMatchObject({changed:false,catalogVersion:1,conflicts:[]});
  const repeat=await applyTaxonomyCatalogImport(pool,input,'integration reviewer');
  expect(repeat.receiptId).toBe(again.receiptId);
  const receipts=(await pool.query("SELECT changed,catalog_version::int AS catalog_version,reviewed_by FROM taxonomy_import_receipts WHERE category='people' ORDER BY created_at")).rows;
  expect(receipts).toEqual([{changed:true,catalog_version:1,reviewed_by:'integration reviewer'},{changed:false,catalog_version:1,reviewed_by:'integration reviewer'}]);
  expect((await dryRunTaxonomyCatalogImport(pool,input))).toMatchObject({changed:false,catalogVersion:1,conflicts:[]});
 });
 it('the People sector read is CONFIGURED and returns the sectors in order, with English fallback',async()=>{
  const repo=new TaxonomyCatalogRepository(pool as never),meta=await repo.metadata('people');
  expect(meta).toMatchObject({state:'CONFIGURED',default_locale:'en'});
  const rows=await repo.page('people','fr',meta!.default_locale,24,undefined);
  expect(rows.map((row:{defaultLabel:string})=>row.defaultLabel)).toEqual([...input.terms].sort((a,b)=>a.position-b.position).map(term=>term.labels.en));
  expect(rows[0]).toMatchObject({slug:'travel'});
 });
});
