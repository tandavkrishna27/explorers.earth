import type {Pool,PoolClient} from 'pg';

export const appEnrichmentWorkerCapability='app_enrichment_worker';
export const appEnrichmentWorkerOwner='app_enrichment_worker_owner';
export const appEnrichmentWorkerEntrypoints=Object.freeze([
 'app_enrichment_worker_enroll_run(uuid,text,text,text,text,text,text,bigint,text)',
 'app_enrichment_worker_claim(uuid,text,text,text,text,bigint,text)',
 'app_enrichment_worker_check_fetch(uuid,uuid,uuid,text)',
 'app_enrichment_worker_renew(uuid,uuid,uuid)',
 'app_enrichment_worker_complete(uuid,uuid,uuid,text,uuid[],jsonb)',
 'app_enrichment_worker_finish_outcome(uuid,uuid,uuid,text,bigint)',
 'app_enrichment_worker_reuse_success(uuid,text)',
 'app_enrichment_worker_record_run(uuid,text,text,timestamp with time zone,timestamp with time zone,jsonb)',
]);
const safeRole=/^[a-z_][a-z0-9_]{1,62}$/;
const ownerHelpers=Object.freeze([
 'app_enrichment_worker_approval_guard()', 'app_enrichment_worker_job_guard()',
 'app_enrichment_worker_lock_candidates(uuid[])',
 'app_enrichment_worker_binding_eligible(uuid,uuid,bigint)',
 'app_enrichment_worker_lease_json(app_enrichment_jobs)',
]);
const ownerRead=new Set(['creator_accounts','recommendations','app_enrichment_bindings','app_enrichment_source_approvals','entities','account_category_settings','collections','collection_items','app_enrichment_generations','app_enrichment_generation_retirements','app_enrichment_jobs','app_enrichment_job_candidates','app_enrichment_snapshots','app_enrichment_entitlements','app_enrichment_worker_runs','app_enrichment_worker_run_authorities']);
const ownerInsert=new Set(['app_enrichment_jobs','app_enrichment_job_candidates','app_enrichment_snapshots','app_enrichment_entitlements','app_enrichment_worker_runs','app_enrichment_worker_run_authorities']);
const ownerUpdate=new Set(['creator_accounts','recommendations','app_enrichment_bindings','app_enrichment_source_approvals','app_enrichment_jobs','app_enrichment_worker_run_authorities']);
/** Migration seal: compares actual effective table/column/function authority before
 * COMMIT. Usable with the migration's existing client; creates no pool or grants. */
export async function assertAppEnrichmentWorkerCapabilityMatrix(db:Pick<PoolClient,'query'>):Promise<void>{
 for(const role of [appEnrichmentWorkerOwner,appEnrichmentWorkerCapability]){
  const attrs=(await db.query('SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1',[role])).rows;
  if(attrs.length!==1||Object.values(attrs[0]).some(Boolean))throw new Error('Worker capability attributes unsafe');
  const memberships=(await db.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role])).rows;
  if(memberships.length)throw new Error('Worker capability memberships unsafe');
  if(role===appEnrichmentWorkerOwner&&(await db.query('SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role])).rows.length)throw new Error('Worker definer owner is reachable by another role');
  const schema=(await db.query("SELECT nspname,has_schema_privilege($1,oid,'CREATE') AS create, nspowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AS owned FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'",[role])).rows;
  if(schema.some(r=>r.create||r.owned))throw new Error('Worker capability schema unsafe');
  const database=(await db.query("SELECT has_database_privilege($1,current_database(),'CREATE') AS create,has_database_privilege($1,current_database(),'TEMPORARY') AS temporary,(SELECT datdba=(SELECT oid FROM pg_roles WHERE rolname=$1) FROM pg_database WHERE datname=current_database()) AS owned",[role])).rows[0];
  if(database.create||database.temporary||database.owned)throw new Error('Worker capability database unsafe');
  const relations=(await db.query(`SELECT c.relname,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AS owned,
   has_table_privilege($1,c.oid,'SELECT') AS select, has_table_privilege($1,c.oid,'INSERT') AS insert,has_table_privilege($1,c.oid,'UPDATE') AS update,
   has_table_privilege($1,c.oid,'DELETE') OR has_table_privilege($1,c.oid,'TRUNCATE') OR has_table_privilege($1,c.oid,'REFERENCES') OR has_table_privilege($1,c.oid,'TRIGGER') AS forbidden,
   has_any_column_privilege($1,c.oid,'SELECT') AS column_select,has_any_column_privilege($1,c.oid,'INSERT') AS column_insert,has_any_column_privilege($1,c.oid,'UPDATE') AS column_update,has_any_column_privilege($1,c.oid,'REFERENCES') AS column_references
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')`,[role])).rows;
  const trusted=role===appEnrichmentWorkerOwner;
  const read=trusted?ownerRead:new Set(['app_enrichment_jobs']),insert=trusted?ownerInsert:new Set<string>(),update=trusted?ownerUpdate:new Set<string>();
  if(relations.some(r=>r.owned||r.forbidden||r.column_references||r.select!==read.has(r.relname)||r.column_select!==read.has(r.relname)||r.insert!==insert.has(r.relname)||r.column_insert!==insert.has(r.relname)||r.update!==update.has(r.relname)||r.column_update!==update.has(r.relname))||[...read].some(name=>!relations.some(r=>r.relname===name)))throw new Error('Worker capability relation matrix unsafe');
  const sequences=(await db.query("SELECT has_sequence_privilege($1,c.oid,'USAGE') OR has_sequence_privilege($1,c.oid,'SELECT') OR has_sequence_privilege($1,c.oid,'UPDATE') OR c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AS forbidden FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'",[role])).rows;
  if(sequences.some(r=>r.forbidden))throw new Error('Worker capability sequence matrix unsafe');
  const functions=(await db.query("SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.proconfig,owner.rolname AS owner,has_function_privilege($1,p.oid,'EXECUTE') AS execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles owner ON owner.oid=p.proowner WHERE n.nspname='public'",[role])).rows;
  const expectedOwned=[...appEnrichmentWorkerEntrypoints,...ownerHelpers].sort();
  const expectedExecute=trusted?[...expectedOwned,'app_enrichment_canonical_json(jsonb)','app_enrichment_safe_host(text)','app_enrichment_immutable_payload()'].sort():[...appEnrichmentWorkerEntrypoints].sort();
  if(JSON.stringify(functions.filter(r=>r.execute).map(r=>r.signature).sort())!==JSON.stringify(expectedExecute)||JSON.stringify(functions.filter(r=>r.owner===role).map(r=>r.signature).sort())!==JSON.stringify(trusted?expectedOwned:[]))throw new Error('Worker capability function matrix unsafe');
  if(functions.filter(r=>expectedOwned.includes(r.signature)).some(r=>r.owner!==appEnrichmentWorkerOwner||JSON.stringify(r.proconfig)!==JSON.stringify(['search_path=pg_catalog'])||r.prosecdef!==appEnrichmentWorkerEntrypoints.includes(r.signature)))throw new Error('Worker definer function custody unsafe');
 }
}
export type AppWorkerRoleApproval={loginRole:string;databaseName:string};
/** Verifies an already expressly provisioned isolated login. Creates no resources,
 * credentials or defaults. NOINHERIT login pools must select the worker capability
 * on every connection before handing the pool to the repository. */
export async function verifyAppEnrichmentWorkerLogin(pool:Pool,approval:AppWorkerRoleApproval):Promise<void>{
 if(!safeRole.test(approval.loginRole)||!safeRole.test(approval.databaseName)||['music_runtime',appEnrichmentWorkerCapability,appEnrichmentWorkerOwner].includes(approval.loginRole))throw new Error('Invalid worker custody approval');
 const db=await pool.connect();
 try{
  const identity=(await db.query('SELECT session_user AS login,current_user AS capability,current_database() AS database')).rows[0];
  if(identity?.login!==approval.loginRole||identity.capability!==appEnrichmentWorkerCapability||identity.database!==approval.databaseName)throw new Error('Worker connection identity mismatch');
  const roles=(await db.query('SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=ANY($1::text[])',[[approval.loginRole,appEnrichmentWorkerCapability,appEnrichmentWorkerOwner]])).rows;
  if(roles.length!==3||roles.some(r=>r.rolcanlogin!==(r.rolname===approval.loginRole)||r.rolsuper||r.rolcreatedb||r.rolcreaterole||r.rolreplication||r.rolbypassrls||r.rolinherit))throw new Error('Worker role attributes unsafe');
  const memberships=(await db.query('SELECT member.rolname AS member,parent.rolname AS parent,m.admin_option FROM pg_auth_members m JOIN pg_roles member ON member.oid=m.member JOIN pg_roles parent ON parent.oid=m.roleid WHERE member.rolname=ANY($1::text[])',[[approval.loginRole,appEnrichmentWorkerCapability,appEnrichmentWorkerOwner]])).rows;
  if(memberships.length!==1||memberships[0].member!==approval.loginRole||memberships[0].parent!==appEnrichmentWorkerCapability||memberships[0].admin_option)throw new Error('Worker memberships unsafe');
  const database=(await db.query("SELECT has_database_privilege($1,current_database(),'CREATE') AS create,has_database_privilege($1,current_database(),'TEMPORARY') AS temporary",[approval.loginRole])).rows[0];
  if(database.create||database.temporary)throw new Error('Worker database privileges unsafe');
  const schema=(await db.query("SELECT nspname,has_schema_privilege($1,oid,'CREATE') AS create FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname<>'information_schema'",[approval.loginRole])).rows;
  if(schema.some(r=>r.create))throw new Error('Worker schema privileges unsafe');
  const capabilitySchema=(await db.query("SELECT has_schema_privilege($1,'public','CREATE') AS create,has_schema_privilege($2,'public','CREATE') AS owner_create",[appEnrichmentWorkerCapability,appEnrichmentWorkerOwner])).rows[0];
  if(capabilitySchema.create||capabilitySchema.owner_create)throw new Error('Worker definer schema custody unsafe');
  await assertAppEnrichmentWorkerCapabilityMatrix(db);
  // Test BOTH session login and selected capability; NOINHERIT can conceal a direct
  // grant on the login when only current_user is examined.
  for(const role of [approval.loginRole,appEnrichmentWorkerCapability]){
   const relations=(await db.query(`SELECT n.nspname,c.relname,c.relkind,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AS owned,
    has_table_privilege($1,c.oid,'SELECT') AS select,has_any_column_privilege($1,c.oid,'SELECT') AS column_select,
    has_table_privilege($1,c.oid,'INSERT') OR has_table_privilege($1,c.oid,'UPDATE') OR has_table_privilege($1,c.oid,'DELETE') OR has_table_privilege($1,c.oid,'TRUNCATE') OR has_table_privilege($1,c.oid,'REFERENCES') OR has_table_privilege($1,c.oid,'TRIGGER') AS mutation,
    has_any_column_privilege($1,c.oid,'INSERT') OR has_any_column_privilege($1,c.oid,'UPDATE') OR has_any_column_privilege($1,c.oid,'REFERENCES') AS column_mutation
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')`,[role])).rows;
   if(relations.some(r=>r.owned||r.mutation||r.column_mutation||r.select!==(role===appEnrichmentWorkerCapability&&r.relname==='app_enrichment_jobs')||r.column_select!==(role===appEnrichmentWorkerCapability&&r.relname==='app_enrichment_jobs')))throw new Error('Worker relation privilege matrix unsafe');
   const sequences=(await db.query("SELECT c.relname,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=$1) AS owned,has_sequence_privilege($1,c.oid,'USAGE') OR has_sequence_privilege($1,c.oid,'SELECT') OR has_sequence_privilege($1,c.oid,'UPDATE') AS granted FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'",[role])).rows;
   if(sequences.some(r=>r.granted||r.owned))throw new Error('Worker sequence privileges unsafe');
   const functions=(await db.query("SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.proconfig,owner.rolname AS owner,has_function_privilege($1,p.oid,'EXECUTE') AS execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles owner ON owner.oid=p.proowner WHERE n.nspname='public'",[role])).rows;
   const executed=functions.filter(r=>r.execute);
   const expected=role===appEnrichmentWorkerCapability?[...appEnrichmentWorkerEntrypoints].sort():[];
   if(JSON.stringify(executed.map(r=>r.signature).sort())!==JSON.stringify(expected)||executed.some(r=>!r.prosecdef||r.owner!==appEnrichmentWorkerOwner||JSON.stringify(r.proconfig)!==JSON.stringify(['search_path=pg_catalog'])))throw new Error('Worker function privilege matrix unsafe');
  }
 }finally{db.release();}
}
