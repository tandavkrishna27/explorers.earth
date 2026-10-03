import type { Pool } from "pg";

const capabilityRole = "music_runtime";
const safeRoleName = /^[a-z_][a-z0-9_]{1,62}$/;
const safePassword = /^[A-Za-z0-9_-]{43,256}$/;
const expectedRuntimeTables = [
  "account_category_content_state",
  "account_category_pin_state",
  "account_category_settings",
  "account_lifecycle_operations",
  "account_memberships",
  "account_music_identity",
  "account_presentation",
  "account_recovery_proofs",
  "activity_logs",
  "analytics_event_receipts",
  "analytics_events",
  "analytics_snapshots",
  "api_tokens",
  "application_command_receipts",
  "auth_account",
  "auth_session",
  "auth_user",
  "auth_verification",
  "book_entity_details",
  "book_recommendation_context",
  "category_recommendation_pins",
  "collection_items",
  "collection_media",
  "collections",
  "creator_accounts",
  "deletion_feedback",
  "email_logs",
  "email_templates",
  "entities",
  "entity_identifiers",
  "explorers_analytics_receipts",
  "guest_interactions",
  "initial_account_bindings",
  "media_assets",
  "media_objects",
  "movie_entity_details",
  "movie_entity_provider_genres",
  "movie_provider_genre_terms",
  "movie_recommendation_context",
  "music_credential_revocation_operations",
  "music_identity_lifecycle_operations",
  "music_identity_tombstones",
  "music_owner_operations",
  "music_publication_operation_archive",
  "music_publication_operations",
  "music_reactivation_tokens",
  "music_schema_migrations",
  "page_contents",
  "playback_states",
  "played_songs",
  "playlist_songs",
  "playlists",
  "profile_feed_items",
  "profile_media",
  "recommendation_book_covers",
  "recommendation_display_overrides",
  "recommendation_media",
  "recommendation_taxonomy",
  "recommendations",
  "seo_settings",
  "session",
  "songs",
  "system_settings",
  "taxonomy_term_translations",
  "taxonomy_terms",
  "team_members",
  "user_activity",
  "user_profiles",
  "user_security_state",
  "user_sessions",
  "users",
  "widgets",
  "youtube_api_calls",
  "youtube_api_usage",
  "youtube_music",
  "youtube_music_playlists",
  "youtube_playlists",
  "youtube_tokens",
] as const;
const expectedRuntimeSequences = [
  "activity_logs_id_seq",
  "analytics_snapshots_id_seq",
  "api_tokens_id_seq",
  "email_logs_id_seq",
  "email_templates_id_seq",
  "guest_interactions_id_seq",
  "page_contents_id_seq",
  "playback_states_id_seq",
  "played_songs_id_seq",
  "playlist_songs_id_seq",
  "playlists_id_seq",
  "seo_settings_id_seq",
  "songs_id_seq",
  "system_settings_id_seq",
  "team_members_id_seq",
  "user_activity_id_seq",
  "user_profiles_id_seq",
  "user_sessions_id_seq",
  "users_id_seq",
  "widgets_id_seq",
  "youtube_api_calls_id_seq",
  "youtube_api_usage_id_seq",
  "youtube_music_id_seq",
  "youtube_music_playlists_id_seq",
  "youtube_playlists_id_seq",
  "youtube_tokens_id_seq",
] as const;
const expectedRuntimeFunctions = [
  "enforce_music_identity_immutability()",
  "enforce_music_identity_insert()",
  "enforce_music_lifecycle_operation_state()",
  "enforce_music_publication_operation_immutability()",
  "enforce_music_reactivation_token_identity()",
  "enforce_music_tombstone_immutability()",
  "enforce_music_tombstone_insert()",
  "explorers_assert_no_unready_references()",
  "explorers_assert_ready_attachment()",
  "explorers_content_revision_delete()",
  "explorers_content_revision_insert()",
  "explorers_content_revision_lifecycle()",
  "explorers_content_revision_update()",
  "finalize_music_identity_deletion(integer,text,text)",
  "guard_book_entity_details()",
  "guard_book_recommendation_context()",
  "guard_movie_context()",
  "guard_movie_details()",
  "guard_movie_genres()",
  "guard_recommendation_book_cover()",
  "guard_recommendation_entity_kind()",
  "guard_recommendation_media()",
  "guard_recommendation_taxonomy()",
  "guard_taxonomy_tree()",
  "lock_movie_genre_parent()",
  "lock_music_identity_pair(text,text)",
  "lock_music_numeric_user_id(integer)",
  "lock_recommendation_taxonomy_parent()",
  "lock_taxonomy_tree()",
  "music_compact_publication_operations(integer)",
  "music_lookup_publication_operation_archive(integer,text)",
  "provision_music_runtime_login(name,text)",
  "purge_expired_account_recovery_proofs(integer)",
  "purge_expired_analytics_events(integer)",
  "purge_explorers_account_content(uuid,uuid)",
  "reject_account_music_identity_mutation()",
  "reject_music_credential_revocation_history_mutation()",
  "reject_music_publication_archive_mutation()",
  "reject_unauthorized_music_identity_delete()",
  "retain_music_identity_tombstone_on_delete()",
  "stamp_explorers_session_version()",
  "validate_movie_context(uuid,text,bigint[])",
] as const;

export interface MusicRuntimeLoginInput {
  loginRole: string;
  password: string;
}

interface MusicRoleAttributes {
  canLogin: boolean;
  inherit: boolean;
  superuser: boolean;
  createRole: boolean;
  createDb: boolean;
  replication: boolean;
  bypassRls: boolean;
}

export interface MusicRuntimeRoleGraph {
  loginRole: string;
  loginAttributes?: MusicRoleAttributes;
  capabilityAttributes?: MusicRoleAttributes;
  loginClosure: string[];
  capabilityClosure: string[];
  capabilityMembers: Array<{
    memberRole: string;
    adminOption: boolean;
    inheritOption: boolean;
    setOption: boolean;
  }>;
  incomingMemberships: MusicRuntimeIncomingMembership[];
  cycleDetected: boolean;
}

export interface MusicRuntimeIncomingMembership {
  rootRole: string;
  grantedRole: string;
  memberRole: string;
  grantorRole: string;
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
  depth: number;
  cycle: boolean;
}

export interface MusicRuntimeDatabaseConnection {
  connectionString: string;
  user: string;
}

export async function verifyMusicRuntimeDatabaseConnection(
  connection: MusicRuntimeDatabaseConnection,
  migratorRole: string,
): Promise<void> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: connection.connectionString, max: 1 });
  try {
    const initialGraph = await readMusicRuntimeRoleGraph(pool, connection.user);
    validateMusicRuntimeRoleGraph(initialGraph);
    const result = await pool.query<{
      current_user: string;
      can_connect_database: boolean;
      can_create_database_objects: boolean;
      can_create_temporary_objects: boolean;
      can_use_schema: boolean;
      can_create_schema_objects: boolean;
    }>(`SELECT current_user,
        has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect_database,
        has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects,
        has_database_privilege(current_user,current_database(),'TEMP') AS can_create_temporary_objects,
        has_schema_privilege(current_user,'public','USAGE') AS can_use_schema,
        has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects`);
    const role = result.rows[0];
    if (!role || role.current_user !== connection.user
        || !role.can_connect_database || role.can_create_database_objects || role.can_create_temporary_objects
        || !role.can_use_schema || role.can_create_schema_objects) {
      throw new Error("runtime database authentication or role attestation failed");
    }
    await assertMusicRuntimeSetRoleBoundary(pool, migratorRole);
    await assertMusicRuntimeDirectPrivilegeBoundary(pool, connection.user, migratorRole);
    const finalGraph = await readMusicRuntimeRoleGraph(pool, connection.user);
    validateMusicRuntimeRoleGraph(finalGraph);
    if (JSON.stringify(finalGraph) !== JSON.stringify(initialGraph)) {
      throw new Error("runtime database authentication or role attestation failed");
    }
  } catch {
    throw new Error("runtime database authentication or role attestation failed");
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function assertMusicMigratorAuthority(
  ownerPool: Pick<Pool, "query">,
  input: { runtimeLoginRole: string },
): Promise<void> {
  if (!safeRoleName.test(input.runtimeLoginRole) || input.runtimeLoginRole === capabilityRole) {
    throw new Error("runtime database login is invalid");
  }
  const authority = (await ownerPool.query<{
    current_user: string; rolsuper: boolean; rolcreaterole: boolean;
    owns_database: boolean; can_create_database_objects: boolean; can_create_schema_objects: boolean;
  }>(`SELECT current_user,roles.rolsuper,roles.rolcreaterole,
      database.datdba=roles.oid AS owns_database,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects
    FROM pg_roles roles JOIN pg_database database ON database.datname=current_database()
    WHERE roles.rolname=current_user`)).rows[0];
  if (!authority || authority.current_user === input.runtimeLoginRole || authority.current_user === capabilityRole
      || (!authority.rolsuper && !authority.rolcreaterole)
      || (!authority.rolsuper && !authority.owns_database)
      || !authority.can_create_database_objects || !authority.can_create_schema_objects) {
    throw new Error("migration gate database role lacks distinct owner/role-bootstrap authority");
  }
}

export async function assertMusicRuntimeCapabilityPreflight(
  ownerPool: Pick<Pool, "query">,
  input: { runtimeLoginRole: string },
): Promise<void> {
  if (!safeRoleName.test(input.runtimeLoginRole) || input.runtimeLoginRole === capabilityRole) {
    throw new Error("runtime database login is invalid");
  }
  const existing = (await ownerPool.query<{
    rolcanlogin: boolean; rolinherit: boolean; rolsuper: boolean; rolcreaterole: boolean;
    rolcreatedb: boolean; rolreplication: boolean; rolbypassrls: boolean; membership_count: number;
  }>(`SELECT role.rolcanlogin,role.rolinherit,role.rolsuper,role.rolcreaterole,
      role.rolcreatedb,role.rolreplication,role.rolbypassrls,
      (SELECT count(*)::int FROM pg_auth_members membership WHERE membership.member=role.oid) AS membership_count
    FROM pg_roles role WHERE role.rolname=$1`, [capabilityRole])).rows[0];
  const members = await readMusicRuntimeIncomingMemberships(ownerPool, input.runtimeLoginRole);
  if (!safeMusicRuntimeIncomingMemberships(members, input.runtimeLoginRole, true)) {
    throw new Error("runtime capability role has unsafe reverse membership");
  }
  if (!existing) return;
  if (existing.rolcanlogin || !existing.rolinherit || existing.rolsuper || existing.rolcreaterole
      || existing.rolcreatedb || existing.rolreplication || existing.rolbypassrls
      || existing.membership_count !== 0) {
    throw new Error("runtime capability role has unsafe attributes or membership");
  }
}

interface MusicRuntimeCapabilityMember {
  memberRole: string;
  adminOption: boolean;
  inheritOption: boolean;
  setOption: boolean;
}

async function readMusicRuntimeIncomingMemberships(
  pool: Pick<Pool, "query">,
  loginRole: string,
): Promise<MusicRuntimeIncomingMembership[]> {
  return (await pool.query<{
    root_role: string; granted_role: string; member_role: string; grantor_role: string;
    admin_option: boolean; inherit_option: boolean; set_option: boolean; depth: number; cycle: boolean;
  }>(`WITH RECURSIVE incoming(root_role,granted_oid,member_oid,grantor_oid,admin_option,inherit_option,set_option,path,cycle,depth) AS (
      SELECT root.rolname,membership.roleid,membership.member,membership.grantor,membership.admin_option,
        COALESCE((to_jsonb(membership)->>'inherit_option')::boolean,true),
        COALESCE((to_jsonb(membership)->>'set_option')::boolean,true),
        ARRAY[root.oid,membership.member],membership.member=root.oid,1
      FROM pg_roles root
      JOIN pg_auth_members membership ON membership.roleid=root.oid
      WHERE root.rolname IN ($1,$2)
      UNION ALL
      SELECT incoming.root_role,membership.roleid,membership.member,membership.grantor,membership.admin_option,
        COALESCE((to_jsonb(membership)->>'inherit_option')::boolean,true),
        COALESCE((to_jsonb(membership)->>'set_option')::boolean,true),
        incoming.path||membership.member,membership.member=ANY(incoming.path),incoming.depth+1
      FROM incoming
      JOIN pg_auth_members membership ON membership.roleid=incoming.member_oid
      WHERE NOT incoming.cycle
    )
    SELECT incoming.root_role,granted.rolname AS granted_role,member.rolname AS member_role,
      grantor.rolname AS grantor_role,incoming.admin_option,incoming.inherit_option,
      incoming.set_option,incoming.depth,incoming.cycle
    FROM incoming
    JOIN pg_roles granted ON granted.oid=incoming.granted_oid
    JOIN pg_roles member ON member.oid=incoming.member_oid
    JOIN pg_roles grantor ON grantor.oid=incoming.grantor_oid
    ORDER BY incoming.root_role,incoming.depth,granted.rolname,member.rolname,grantor.rolname,
      incoming.admin_option,incoming.inherit_option,incoming.set_option`, [loginRole, capabilityRole])).rows.map((row) => ({
    rootRole: row.root_role,
    grantedRole: row.granted_role,
    memberRole: row.member_role,
    grantorRole: row.grantor_role,
    adminOption: row.admin_option,
    inheritOption: row.inherit_option,
    setOption: row.set_option,
    depth: row.depth,
    cycle: row.cycle,
  }));
}

function safeMusicRuntimeIncomingMemberships(
  memberships: readonly MusicRuntimeIncomingMembership[],
  loginRole: string,
  allowUnprovisioned: boolean,
): boolean {
  if (allowUnprovisioned && memberships.length === 0) return true;
  const membership = memberships[0];
  return memberships.length === 1 && Boolean(membership
    && membership.rootRole === capabilityRole && membership.grantedRole === capabilityRole
    && membership.memberRole === loginRole && membership.depth === 1 && !membership.cycle
    && !membership.adminOption && membership.inheritOption && membership.setOption);
}

function safeConfiguredCapabilityMembership(
  membership: MusicRuntimeCapabilityMember | undefined,
  loginRole: string,
): boolean {
  return Boolean(membership && membership.memberRole === loginRole
    && !membership.adminOption && membership.inheritOption && membership.setOption);
}

export async function readMusicRuntimeRoleGraph(
  pool: Pick<Pool, "query">,
  loginRole: string,
): Promise<MusicRuntimeRoleGraph> {
  if (!safeRoleName.test(loginRole) || loginRole === capabilityRole || loginRole === "postgres") {
    throw new Error("runtime database login is invalid");
  }
  const rows = (await pool.query<{
    record_kind: "role" | "incoming"; source_role: string | null; rolcanlogin: boolean | null;
    rolinherit: boolean | null; rolsuper: boolean | null; rolcreaterole: boolean | null;
    rolcreatedb: boolean | null; rolreplication: boolean | null; rolbypassrls: boolean | null;
    granted_role: string | null; cycle: boolean;
    incoming_root_role: string | null; incoming_granted_role: string | null;
    incoming_member_role: string | null; incoming_grantor_role: string | null;
    incoming_admin_option: boolean | null; incoming_inherit_option: boolean | null;
    incoming_set_option: boolean | null; incoming_depth: number | null;
  }>(`WITH RECURSIVE music_role_closure(source_oid,granted_oid,path,cycle) AS (
      SELECT source.oid,membership.roleid,ARRAY[source.oid,membership.roleid],membership.roleid=source.oid
      FROM pg_roles source
      JOIN pg_auth_members membership ON membership.member=source.oid
      WHERE source.rolname IN ($1,$2)
      UNION ALL
      SELECT closure.source_oid,membership.roleid,closure.path||membership.roleid,
        membership.roleid=ANY(closure.path)
      FROM music_role_closure closure
      JOIN pg_auth_members membership ON membership.member=closure.granted_oid
      WHERE NOT closure.cycle
    ), music_incoming_membership(root_role,granted_oid,member_oid,grantor_oid,admin_option,inherit_option,set_option,path,cycle,depth) AS (
      SELECT root.rolname,membership.roleid,membership.member,membership.grantor,membership.admin_option,
        COALESCE((to_jsonb(membership)->>'inherit_option')::boolean,true) AS inherit_option,
        COALESCE((to_jsonb(membership)->>'set_option')::boolean,true) AS set_option,
        ARRAY[root.oid,membership.member],membership.member=root.oid,1
      FROM pg_roles root
      JOIN pg_auth_members membership ON membership.roleid=root.oid
      WHERE root.rolname IN ($1,$2)
      UNION ALL
      SELECT incoming.root_role,membership.roleid,membership.member,membership.grantor,membership.admin_option,
        COALESCE((to_jsonb(membership)->>'inherit_option')::boolean,true),
        COALESCE((to_jsonb(membership)->>'set_option')::boolean,true),
        incoming.path||membership.member,membership.member=ANY(incoming.path),incoming.depth+1
      FROM music_incoming_membership incoming
      JOIN pg_auth_members membership ON membership.roleid=incoming.member_oid
      WHERE NOT incoming.cycle
    )
    SELECT 'role'::text AS record_kind,source.rolname AS source_role,source.rolcanlogin,source.rolinherit,
      source.rolsuper,source.rolcreaterole,source.rolcreatedb,source.rolreplication,source.rolbypassrls,
      granted.rolname AS granted_role,COALESCE(closure.cycle,false) AS cycle,
      NULL::name AS incoming_root_role,NULL::name AS incoming_granted_role,
      NULL::name AS incoming_member_role,NULL::name AS incoming_grantor_role,
      NULL::boolean AS incoming_admin_option,NULL::boolean AS incoming_inherit_option,
      NULL::boolean AS incoming_set_option,NULL::integer AS incoming_depth
    FROM pg_roles source
    LEFT JOIN music_role_closure closure ON closure.source_oid=source.oid
    LEFT JOIN pg_roles granted ON granted.oid=closure.granted_oid
    WHERE source.rolname IN ($1,$2)
    UNION ALL
    SELECT 'incoming'::text,NULL::name,NULL::boolean,NULL::boolean,NULL::boolean,NULL::boolean,
      NULL::boolean,NULL::boolean,NULL::boolean,NULL::name,incoming.cycle,
      incoming.root_role,granted.rolname,member.rolname,grantor.rolname,
      incoming.admin_option,incoming.inherit_option,incoming.set_option,incoming.depth
    FROM music_incoming_membership incoming
    JOIN pg_roles granted ON granted.oid=incoming.granted_oid
    JOIN pg_roles member ON member.oid=incoming.member_oid
    JOIN pg_roles grantor ON grantor.oid=incoming.grantor_oid
    ORDER BY record_kind,source_role,granted_role,incoming_root_role,incoming_depth,
      incoming_granted_role,incoming_member_role,incoming_grantor_role`, [loginRole, capabilityRole])).rows;
  const attributes = (role: string): MusicRoleAttributes | undefined => {
    const row = rows.find((candidate) => candidate.record_kind === "role" && candidate.source_role === role);
    return row ? {
      canLogin: row.rolcanlogin === true,
      inherit: row.rolinherit === true,
      superuser: row.rolsuper === true,
      createRole: row.rolcreaterole === true,
      createDb: row.rolcreatedb === true,
      replication: row.rolreplication === true,
      bypassRls: row.rolbypassrls === true,
    } : undefined;
  };
  const closure = (role: string) => Array.from(new Set(rows
    .filter((row) => row.record_kind === "role" && row.source_role === role && row.granted_role)
    .map((row) => row.granted_role!))).sort();
  const incomingMemberships = rows.filter((row) => row.record_kind === "incoming"
      && row.incoming_root_role && row.incoming_granted_role && row.incoming_member_role
      && row.incoming_grantor_role && row.incoming_depth !== null)
    .map((row) => ({
      rootRole: row.incoming_root_role!,
      grantedRole: row.incoming_granted_role!,
      memberRole: row.incoming_member_role!,
      grantorRole: row.incoming_grantor_role!,
      adminOption: row.incoming_admin_option === true,
      inheritOption: row.incoming_inherit_option === true,
      setOption: row.incoming_set_option === true,
      depth: row.incoming_depth!,
      cycle: row.cycle,
    }));
  const capabilityMembers = incomingMemberships.filter((membership) => membership.rootRole === capabilityRole
      && membership.grantedRole === capabilityRole && membership.depth === 1)
    .map((membership) => ({
      memberRole: membership.memberRole,
      adminOption: membership.adminOption,
      inheritOption: membership.inheritOption,
      setOption: membership.setOption,
    }));
  return {
    loginRole,
    loginAttributes: attributes(loginRole),
    capabilityAttributes: attributes(capabilityRole),
    loginClosure: closure(loginRole),
    capabilityClosure: closure(capabilityRole),
    capabilityMembers,
    incomingMemberships,
    cycleDetected: rows.some((row) => row.cycle),
  };
}

export function validateMusicRuntimeRoleGraph(graph: MusicRuntimeRoleGraph): void {
  const safeAttributes = (attributes: MusicRoleAttributes | undefined, canLogin: boolean) => Boolean(attributes
    && attributes.canLogin === canLogin && attributes.inherit
    && !attributes.superuser && !attributes.createRole && !attributes.createDb
    && !attributes.replication && !attributes.bypassRls);
  if (!graph || !safeRoleName.test(graph.loginRole) || graph.loginRole === capabilityRole
      || graph.cycleDetected || !safeAttributes(graph.loginAttributes, true)
      || !safeAttributes(graph.capabilityAttributes, false)
      || graph.loginClosure.length !== 1 || graph.loginClosure[0] !== capabilityRole
      || graph.capabilityClosure.length !== 0
      || graph.capabilityMembers.length !== 1
      || !safeConfiguredCapabilityMembership(graph.capabilityMembers[0], graph.loginRole)
      || !safeMusicRuntimeIncomingMemberships(graph.incomingMemberships, graph.loginRole, false)) {
    throw new Error("runtime database role graph has unsafe attributes, cycle, or membership");
  }
}

export async function assertMusicRuntimeSetRoleBoundary(
  runtimePool: Pick<Pool, "connect">,
  forbiddenRole: string,
): Promise<void> {
  if (!safeRoleName.test(forbiddenRole) || forbiddenRole === capabilityRole) {
    throw new Error("runtime database role boundary is invalid");
  }
  const client = await runtimePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE music_runtime");
    const current = (await client.query<{ current_user: string }>("SELECT current_user")).rows[0]?.current_user;
    if (current !== capabilityRole) throw new Error("runtime database SET ROLE boundary failed");
    let denied = false;
    try {
      await client.query("SELECT set_config('role',$1,true)", [forbiddenRole]);
    } catch (error) {
      denied = (error as { code?: unknown }).code === "42501";
    }
    await client.query("ROLLBACK").catch(() => undefined);
    if (!denied) throw new Error("runtime database SET ROLE boundary failed");
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("runtime database SET ROLE boundary failed");
  } finally {
    client.release();
  }
}

export interface MusicRuntimeProvisionOptions {
  /** Optional provenance written atomically with the role, never after COMMIT. */
  ownershipComment?: string;
}

export async function provisionMusicRuntimeLogin(
  ownerPool: Pick<Pool, "connect">,
  input: MusicRuntimeLoginInput,
  options: MusicRuntimeProvisionOptions = {},
): Promise<void> {
  validateInput(input);
  const ownershipComment = options.ownershipComment;
  if (ownershipComment !== undefined && (typeof ownershipComment !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(ownershipComment))) {
    throw new Error("runtime database ownership comment is invalid");
  }
  const client = await ownerPool.connect();
  try {
    await client.query("BEGIN");
    if (ownershipComment !== undefined) {
      const existing = (await client.query<{ ownership_comment: string | null }>(
        "SELECT shobj_description(oid,'pg_authid') AS ownership_comment FROM pg_roles WHERE rolname=$1", [input.loginRole],
      )).rows;
      if (existing.length && (existing.length !== 1 || existing[0].ownership_comment !== ownershipComment)) {
        throw new Error("runtime database ownership comment does not match");
      }
    }
    const existingMembers = await readMusicRuntimeIncomingMemberships(client, input.loginRole);
    if (!safeMusicRuntimeIncomingMemberships(existingMembers, input.loginRole, true)) {
      throw new Error("runtime capability role has unsafe reverse membership");
    }
    await client.query("SELECT provision_music_runtime_login($1::name,$2::text)", [input.loginRole, input.password]);
    validateMusicRuntimeRoleGraph(await readMusicRuntimeRoleGraph(client, input.loginRole));
    const authority = (await client.query<{
      current_user: string;
      current_database: string;
      database_owner: string;
    }>(`SELECT current_user,current_database(),owner.rolname AS database_owner
      FROM pg_database database JOIN pg_roles owner ON owner.oid=database.datdba
      WHERE database.datname=current_database()`)).rows[0];
    if (!authority || !authority.current_user || !authority.current_database || !authority.database_owner) {
      throw new Error("runtime database privilege provisioning failed");
    }
    const database = quoteIdentifier(authority.current_database);
    const migrator = quoteIdentifier(authority.current_user);
    const databaseOwner = quoteIdentifier(authority.database_owner);
    const login = quoteIdentifier(input.loginRole);
    const publicPrincipal = "PUBLIC";

    await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM PUBLIC`);
    await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${login}`);
    await client.query(`REVOKE ALL PRIVILEGES ON DATABASE ${database} FROM ${capabilityRole}`);
    await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${capabilityRole}`);
    await client.query(`GRANT CONNECT,CREATE,TEMPORARY ON DATABASE ${database} TO ${databaseOwner}`);
    if (authority.current_user !== authority.database_owner) {
      await client.query(`GRANT CONNECT,CREATE,TEMPORARY ON DATABASE ${database} TO ${migrator}`);
    }

    for (const principal of ["PUBLIC", login, capabilityRole]) {
      await client.query(`REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${principal}`);
      await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${principal}`);
      await client.query(`REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM ${principal}`);
      await client.query(`REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM ${principal}`);
    }
    await client.query(`GRANT USAGE ON SCHEMA public TO ${capabilityRole}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${capabilityRole}`);
    await client.query(`GRANT USAGE,SELECT,UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${capabilityRole}`);
    await client.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${capabilityRole}`);
    await client.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON account_category_content_state FROM ${capabilityRole}`);
    await client.query(`REVOKE ALL PRIVILEGES ON FUNCTION explorers_content_revision_insert(),
      explorers_content_revision_update(),explorers_content_revision_delete(),explorers_content_revision_lifecycle()
      FROM ${capabilityRole}`);
    await client.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON music_schema_migrations FROM ${capabilityRole}`);
    await client.query(`GRANT SELECT ON music_schema_migrations TO ${capabilityRole}`);
    await client.query(`REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON music_credential_revocation_operations FROM ${capabilityRole}`);
    await client.query(`REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON user_security_state,initial_account_bindings,account_recovery_proofs FROM ${capabilityRole}`);
    await client.query(`REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON application_command_receipts,deletion_feedback,account_lifecycle_operations FROM ${capabilityRole}`);
    await client.query(`REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON entities,collections,recommendations,account_category_pin_state FROM ${capabilityRole}`);
    await client.query(`REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON entity_identifiers,book_entity_details,movie_entity_details,movie_entity_provider_genres FROM ${capabilityRole}`);
    await client.query(`REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON taxonomy_terms,taxonomy_term_translations,movie_provider_genre_terms FROM ${capabilityRole}`);
    await client.query(`REVOKE ALL ON FUNCTION guard_movie_details(),guard_movie_genres(),lock_movie_genre_parent(),guard_taxonomy_tree(),lock_taxonomy_tree(),validate_movie_context(uuid,text,bigint[]),guard_movie_context(),guard_recommendation_taxonomy(),lock_recommendation_taxonomy_parent() FROM ${capabilityRole}`);
    await client.query(`REVOKE ALL ON FUNCTION guard_book_entity_details(),guard_book_recommendation_context(),guard_recommendation_book_cover() FROM ${capabilityRole}`);
    await client.query(`REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON analytics_events,analytics_event_receipts FROM ${capabilityRole}`);
    await client.query(`REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON account_music_identity FROM ${capabilityRole}`);
    await client.query(`GRANT SELECT,INSERT ON music_credential_revocation_operations TO ${capabilityRole}`);
    await client.query(`REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON music_publication_operations FROM ${capabilityRole}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON music_publication_operations TO ${capabilityRole}`);
    await client.query(`REVOKE UPDATE,TRUNCATE,REFERENCES,TRIGGER
      ON music_owner_operations FROM ${capabilityRole}`);
    await client.query(`GRANT SELECT,INSERT,DELETE ON music_owner_operations TO ${capabilityRole}`);
    await client.query(`REVOKE ALL PRIVILEGES ON music_publication_operation_archive FROM ${capabilityRole}`);
    await client.query(`REVOKE DELETE,TRUNCATE,REFERENCES,TRIGGER
      ON music_identity_tombstones,music_reactivation_tokens FROM ${capabilityRole}`);
    await client.query(`GRANT SELECT,INSERT,UPDATE ON music_reactivation_tokens TO ${capabilityRole}`);
    await client.query(`REVOKE ALL PRIVILEGES ON FUNCTION provision_music_runtime_login(name,text) FROM ${capabilityRole}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM ${publicPrincipal}`);
    if (ownershipComment !== undefined) {
      // The validated alphabet excludes quotes/backslashes and the identifier uses
      // the existing quoting routine. Failure rolls back role creation and grants.
      await client.query(`COMMENT ON ROLE ${login} IS '${ownershipComment}'`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyMusicRuntimeLogin(
  ownerPool: Pick<Pool, "query">,
  runtimePool: Pick<Pool, "query" | "connect">,
  input: Pick<MusicRuntimeLoginInput, "loginRole">,
): Promise<void> {
  if (!safeRoleName.test(input.loginRole) || input.loginRole === capabilityRole || input.loginRole === "postgres") {
    throw new Error("runtime database login is invalid");
  }
  const initialGraph = await readMusicRuntimeRoleGraph(ownerPool, input.loginRole);
  validateMusicRuntimeRoleGraph(initialGraph);
  const ownerRole = (await ownerPool.query<{ current_user: string }>("SELECT current_user")).rows[0]?.current_user;
  if (!ownerRole || !safeRoleName.test(ownerRole) || ownerRole === capabilityRole || ownerRole === input.loginRole) {
    throw new Error("runtime database owner role is invalid");
  }
  await assertMusicRuntimeSetRoleBoundary(runtimePool, ownerRole);
  await assertMusicRuntimeDirectPrivilegeBoundary(runtimePool, input.loginRole, ownerRole);
  const finalGraph = await readMusicRuntimeRoleGraph(ownerPool, input.loginRole);
  validateMusicRuntimeRoleGraph(finalGraph);
  if (JSON.stringify(finalGraph) !== JSON.stringify(initialGraph)) {
    throw new Error("runtime database role graph changed during attestation");
  }
}

async function assertMusicRuntimeDirectPrivilegeBoundary(
  runtimePool: Pick<Pool, "query" | "connect">,
  loginRole: string,
  approvedOwnerRole: string,
): Promise<void> {
  if (!safeRoleName.test(approvedOwnerRole) || approvedOwnerRole === capabilityRole || approvedOwnerRole === loginRole) {
    throw new Error("runtime database owner role is invalid");
  }
  const runtime = (await runtimePool.query<{
    current_user: string; can_connect_database: boolean; can_create_database_objects: boolean;
    can_create_temporary_objects: boolean; can_use_schema: boolean; can_create_schema_objects: boolean;
    database_owner: string; schema_owner: string;
  }>(`SELECT current_user,
      has_database_privilege(current_user,current_database(),'CONNECT') AS can_connect_database,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_database_objects,
      has_database_privilege(current_user,current_database(),'TEMP') AS can_create_temporary_objects,
      has_schema_privilege(current_user,'public','USAGE') AS can_use_schema,
      has_schema_privilege(current_user,'public','CREATE') AS can_create_schema_objects,
      (SELECT owner.rolname FROM pg_database database JOIN pg_roles owner ON owner.oid=database.datdba
        WHERE database.datname=current_database()) AS database_owner,
      (SELECT owner.rolname FROM pg_namespace namespace JOIN pg_roles owner ON owner.oid=namespace.nspowner
        WHERE namespace.nspname='public') AS schema_owner`)).rows[0];
  if (!runtime || runtime.current_user !== loginRole || !runtime.can_connect_database
      || runtime.can_create_database_objects || runtime.can_create_temporary_objects
      || !runtime.can_use_schema || runtime.can_create_schema_objects
      || runtime.database_owner !== approvedOwnerRole || runtime.schema_owner !== "pg_database_owner") {
    throw new Error("runtime database privilege matrix is unsafe");
  }
  await assertMusicRuntimeObjectPrivilegeMatrix(runtimePool, loginRole, approvedOwnerRole);
  for (const statement of [
    "SET session_replication_role='replica'",
    "CREATE TEMP TABLE music_runtime_temp_attestation(id integer)",
    "CREATE TABLE music_runtime_schema_attestation(id integer)",
    "TRUNCATE TABLE users",
    "INSERT INTO account_category_content_state DEFAULT VALUES",
    "UPDATE account_category_content_state SET revision=revision WHERE false",
    "DELETE FROM analytics_events WHERE false",
    "UPDATE analytics_events SET element=element WHERE false",
    "DELETE FROM analytics_event_receipts WHERE false",
    "UPDATE analytics_event_receipts SET input_hash=input_hash WHERE false",
    "DELETE FROM account_category_content_state WHERE false",
    "TRUNCATE TABLE account_category_content_state",
    "SELECT explorers_content_revision_insert()",
    "SELECT explorers_content_revision_update()",
    "SELECT explorers_content_revision_delete()",
    "SELECT explorers_content_revision_lifecycle()",
    "UPDATE music_credential_revocation_operations SET reason=reason WHERE false",
    "DELETE FROM music_credential_revocation_operations WHERE false",
    "DELETE FROM music_publication_operations WHERE false",
    "UPDATE music_owner_operations SET status_code=status_code WHERE false",
    "SELECT * FROM music_publication_operation_archive LIMIT 0",
    "INSERT INTO music_publication_operation_archive(music_user_id,idempotency_key_hash,request_fingerprint,request_mode,completed_at,expires_at) VALUES (1,repeat('0',64),repeat('0',64),'public',clock_timestamp()-interval '24 hours',clock_timestamp())",
    "UPDATE music_publication_operation_archive SET request_mode=request_mode WHERE false",
    "DELETE FROM music_publication_operation_archive WHERE false",
    "DELETE FROM music_identity_tombstones WHERE false",
    "DELETE FROM music_reactivation_tokens WHERE false",
    "UPDATE music_schema_migrations SET checksum=checksum WHERE false",
    "DELETE FROM music_schema_migrations WHERE false",
    "INSERT INTO music_schema_migrations(id,checksum,schema_checksum) VALUES ('runtime_attestation_probe',repeat('0',64),repeat('0',64))",
    "ALTER TABLE music_credential_revocation_operations DISABLE TRIGGER music_credential_revocation_history_immutability",
    "DROP TRIGGER music_credential_revocation_history_immutability ON music_credential_revocation_operations",
    "CREATE OR REPLACE FUNCTION reject_music_credential_revocation_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$",
  ]) await requirePrivilegeDenial(runtimePool, statement);
}

async function assertMusicRuntimeObjectPrivilegeMatrix(
  runtimePool: Pick<Pool, "query">,
  loginRole: string,
  approvedOwnerRole: string,
): Promise<void> {
  const tableRows = (await runtimePool.query<{
    object_name: string; object_owner: string;
    can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean;
    can_truncate: boolean; can_references: boolean; can_trigger: boolean;
  }>(`SELECT class.relname AS object_name,owner.rolname AS object_owner,
      has_table_privilege(current_user,class.oid,'SELECT') AS can_select,
      has_table_privilege(current_user,class.oid,'INSERT') AS can_insert,
      has_table_privilege(current_user,class.oid,'UPDATE') AS can_update,
      has_table_privilege(current_user,class.oid,'DELETE') AS can_delete,
      has_table_privilege(current_user,class.oid,'TRUNCATE') AS can_truncate,
      has_table_privilege(current_user,class.oid,'REFERENCES') AS can_references,
      has_table_privilege(current_user,class.oid,'TRIGGER') AS can_trigger
    FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN pg_roles owner ON owner.oid=class.relowner
    WHERE namespace.nspname='public' AND class.relkind IN ('r','p','v','m','f')
    ORDER BY class.relname`)).rows;
  if (!sameRuntimeInventory(tableRows.map((row) => row.object_name), expectedRuntimeTables)
      || tableRows.some((row) => row.object_owner !== approvedOwnerRole)
      || tableRows.some((row) => {
    const expected = row.object_name === "music_schema_migrations" || row.object_name === "account_category_content_state" || ["taxonomy_terms","taxonomy_term_translations","movie_provider_genre_terms"].includes(row.object_name)
      ? [true, false, false, false]
      : ["analytics_events","analytics_event_receipts"].includes(row.object_name)
        ? [true,true,false,false]
      : row.object_name === "account_music_identity"
        ? [true, true, false, false]
      : row.object_name === "entity_identifiers" || row.object_name === "book_entity_details" || ["movie_entity_details","movie_entity_provider_genres"].includes(row.object_name)
        ? [true, true, false, false]
      : row.object_name === "music_publication_operation_archive"
        ? [false, false, false, false]
      : row.object_name === "music_credential_revocation_operations"
        ? [true, true, false, false]
      : row.object_name === "music_publication_operations"
          ? [true, true, true, false]
      : row.object_name === "music_owner_operations"
          ? [true, true, false, true]
        : row.object_name === "music_identity_tombstones" || row.object_name === "music_reactivation_tokens"
          ? [true, true, true, false]
        : row.object_name === "user_security_state" || row.object_name === "initial_account_bindings"
          || row.object_name === "account_recovery_proofs"
          || row.object_name === "application_command_receipts"
          || row.object_name === "deletion_feedback"
          || row.object_name === "account_lifecycle_operations"
          || row.object_name === "entities"
          || row.object_name === "collections"
          || row.object_name === "recommendations"
          || row.object_name === "account_category_pin_state"
          ? [true, true, true, false]
        : [true, true, true, true];
    return JSON.stringify([row.can_select,row.can_insert,row.can_update,row.can_delete]) !== JSON.stringify(expected)
      || row.can_truncate || row.can_references || row.can_trigger;
  })) throw new Error("runtime database privilege matrix is unsafe");

  const sequenceRows = (await runtimePool.query<{
    object_name: string; object_owner: string; can_usage: boolean; can_select: boolean; can_update: boolean;
  }>(`SELECT class.relname AS object_name,owner.rolname AS object_owner,
      has_sequence_privilege(current_user,class.oid,'USAGE') AS can_usage,
      has_sequence_privilege(current_user,class.oid,'SELECT') AS can_select,
      has_sequence_privilege(current_user,class.oid,'UPDATE') AS can_update
    FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
      JOIN pg_roles owner ON owner.oid=class.relowner
    WHERE namespace.nspname='public' AND class.relkind='S'
    ORDER BY class.relname`)).rows;
  if (!sameRuntimeInventory(sequenceRows.map((row) => row.object_name), expectedRuntimeSequences)
      || sequenceRows.some((row) => row.object_owner !== approvedOwnerRole
        || !row.can_usage || !row.can_select || !row.can_update)) {
    throw new Error("runtime database privilege matrix is unsafe");
  }

  const functionRows = (await runtimePool.query<{
    function_signature: string; object_owner: string; can_execute: boolean;
  }>(`SELECT procedure.oid::regprocedure::text AS function_signature,owner.rolname AS object_owner,
      has_function_privilege(current_user,procedure.oid,'EXECUTE') AS can_execute
    FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
      JOIN pg_roles owner ON owner.oid=procedure.proowner
    WHERE namespace.nspname='public' ORDER BY procedure.oid::regprocedure::text`)).rows;
  if (!sameRuntimeInventory(functionRows.map((row) => row.function_signature), expectedRuntimeFunctions)
      || functionRows.some((row) => row.object_owner !== approvedOwnerRole || row.can_execute
        !== (row.function_signature !== "provision_music_runtime_login(name,text)"
          && !/^explorers_content_revision_(insert|update|delete|lifecycle)\(\)$/.test(row.function_signature)
          && !["guard_movie_details()","guard_movie_genres()","lock_movie_genre_parent()","guard_taxonomy_tree()","lock_taxonomy_tree()","validate_movie_context(uuid,text,bigint[])","guard_movie_context()","guard_recommendation_taxonomy()","lock_recommendation_taxonomy_parent()"].includes(row.function_signature)
          && !/^guard_book_(entity_details|recommendation_context)\(\)$/.test(row.function_signature) && row.function_signature!=="guard_recommendation_book_cover()"))) {
    throw new Error("runtime database privilege matrix is unsafe");
  }

  const unexpectedSources = Number((await runtimePool.query<{ count: string }>(`WITH principals AS (
      SELECT
        (SELECT oid FROM pg_roles WHERE rolname=$1) AS login_oid,
        (SELECT oid FROM pg_roles WHERE rolname=$2) AS capability_oid
    ), grants AS (
      SELECT acl.grantee,acl.is_grantable FROM pg_database database
        CROSS JOIN LATERAL aclexplode(COALESCE(database.datacl,acldefault('d',database.datdba))) acl
        WHERE database.datname=current_database()
      UNION ALL
      SELECT acl.grantee,acl.is_grantable FROM pg_namespace namespace
        CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl,acldefault('n',namespace.nspowner))) acl
        WHERE namespace.nspname='public'
      UNION ALL
      SELECT acl.grantee,acl.is_grantable FROM pg_class class
        JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(class.relacl,
          acldefault(CASE WHEN class.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,class.relowner))) acl
        WHERE namespace.nspname='public' AND class.relkind IN ('r','p','v','m','f','S')
      UNION ALL
      SELECT acl.grantee,acl.is_grantable FROM pg_proc procedure
        JOIN pg_namespace namespace ON namespace.oid=procedure.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl,acldefault('f',procedure.proowner))) acl
        WHERE namespace.nspname='public'
    ) SELECT count(*)::text AS count FROM grants,principals
      WHERE grants.grantee=0 OR grants.grantee=principals.login_oid
        OR (grants.grantee=principals.capability_oid AND grants.is_grantable)`, [loginRole, capabilityRole])).rows[0]?.count ?? "1");
  if (unexpectedSources !== 0) throw new Error("runtime database privilege grant source is unsafe");

  const columnAclCount = Number((await runtimePool.query<{ count: string }>(`SELECT count(*)::text AS count
    FROM pg_attribute attribute
    JOIN pg_class class ON class.oid=attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid=class.relnamespace
    WHERE namespace.nspname='public' AND class.relkind IN ('r','p','v','m','f')
      AND attribute.attnum>0 AND NOT attribute.attisdropped
      AND attribute.attacl IS NOT NULL AND cardinality(attribute.attacl)>0`)).rows[0]?.count ?? "1");
  if (columnAclCount !== 0) throw new Error("runtime database column privilege source is unsafe");
}

function sameRuntimeInventory(actual: string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function validateInput(input: MusicRuntimeLoginInput): void {
  if (!safeRoleName.test(input.loginRole) || input.loginRole === capabilityRole || input.loginRole === "postgres") {
    throw new Error("runtime database login is invalid");
  }
  const decoded = Buffer.from(input.password, "base64url");
  if (!safePassword.test(input.password) || decoded.length < 32 || decoded.toString("base64url") !== input.password) {
    throw new Error("runtime database credential is invalid");
  }
}

function quoteIdentifier(value: string): string {
  if (!value || value.length > 63 || value.includes("\0")) throw new Error("runtime database identifier is invalid");
  return `"${value.replaceAll('"', '""')}"`;
}

async function requirePrivilegeDenial(pool: Pick<Pool, "connect">, statement: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(statement);
      await client.query("ROLLBACK");
      throw new Error("runtime database privilege attestation failed");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if ((error as { code?: unknown }).code !== "42501") throw error;
    }
  } finally {
    client.release();
  }
}
