import type {PoolClient} from 'pg';
import {assertAppEnrichmentWorkerCapabilityMatrix} from './app-enrichment-worker-role';
import {assertAppEnrichmentRetentionCapabilityMatrix} from './app-enrichment-retention-role';
const roles=['app_enrichment_worker','app_enrichment_worker_owner','app_enrichment_retention','app_enrichment_retention_owner'] as const;
const attributes=['rolcanlogin','rolsuper','rolcreatedb','rolcreaterole','rolinherit','rolreplication','rolbypassrls'] as const;
/** Migration transaction only: role creation and temporary grants roll back with 0056. */
export async function prepareAppWorkerCustody(client:Pick<PoolClient,'query'>):Promise<void> {
 const authority=await client.query<{privileged:boolean}>('SELECT rolsuper AS privileged FROM pg_catalog.pg_roles WHERE rolname=current_user');
 if(authority.rows.length!==1||authority.rows[0].privileged!==true)throw new Error('Privileged Apps worker migration authority required');
 const missing:string[]=[];
 for(const role of roles){
  const existing=await client.query<Record<typeof attributes[number],boolean>>('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=$1',[role]);
  if(existing.rows.length>1||existing.rows.some(row=>attributes.some(attribute=>row[attribute])))throw new Error('Unsafe Apps worker custody');
  if(!existing.rows.length)missing.push(role);
 }
 const membership=await client.query(`SELECT true AS unsafe FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid JOIN pg_catalog.pg_roles member ON member.oid=m.member
 WHERE granted.rolname=ANY($1::text[]) OR member.rolname=ANY($1::text[]) LIMIT 1`,[[...roles]]);
 if(membership.rows.length)throw new Error('Unsafe Apps worker custody');
 const authorityDependencies=await client.query(`SELECT true AS unsafe FROM pg_catalog.pg_shdepend d
 JOIN pg_catalog.pg_roles r ON r.oid=d.refobjid
 WHERE d.refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND r.rolname=ANY($1::text[])
 AND d.deptype IN ('a','o','i')
 -- pg_shdepend is a cluster-shared catalog. Without this predicate the guard sees
 -- authority these roles hold in *other* databases of the same cluster, so the second
 -- database ever migrated through 0056 fails closed: 0056 creates GRANTs (deptype 'a')
 -- and function ownerships (deptype 'o') that sealAppWorkerCustody never drops.
 -- dbid=0 is retained deliberately: shared-object authority must still refuse.
 AND (d.dbid=0 OR d.dbid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()))
 LIMIT 1`,[[...roles]]);
 if(authorityDependencies.rows.length)throw new Error('Unsafe Apps worker existing object authority');
 // Names are fixed source-owned capabilities, never external login identifiers.
 for(const role of missing)await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
 await client.query('GRANT CREATE ON SCHEMA public TO app_enrichment_worker_owner,app_enrichment_retention_owner');
}
export async function sealAppWorkerCustody(client:Pick<PoolClient,'query'>):Promise<void> {
 await client.query('REVOKE CREATE ON SCHEMA public FROM app_enrichment_worker_owner');
 await client.query('REVOKE CREATE ON SCHEMA public FROM app_enrichment_worker');
 await client.query('REVOKE CREATE ON SCHEMA public FROM app_enrichment_retention_owner,app_enrichment_retention');
 // The existing runtime provisioner establishes this same PUBLIC boundary. Seal it
 // before the new capabilities can inherit world-executable functions or temp DDL.
 await client.query('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC');
 await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
 await client.query("DO $$ BEGIN EXECUTE pg_catalog.format('REVOKE TEMPORARY ON DATABASE %I FROM %s',pg_catalog.current_database(),'PUBLIC'); END $$");
 await assertAppEnrichmentWorkerCapabilityMatrix(client);
 await assertAppEnrichmentRetentionCapabilityMatrix(client);
}
