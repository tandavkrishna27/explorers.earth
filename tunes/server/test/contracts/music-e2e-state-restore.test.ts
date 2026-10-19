import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_MUSIC_MIGRATION_CHAIN } from "../../../shared/music-migration-contract";

async function loadRestoreContract(): Promise<Record<string, unknown>> {
  try {
    const modulePath: string = "../../../scripts/music-e2e-state-restore.mjs";
    return await import(modulePath);
  } catch {
    return {};
  }
}

async function loadC11CopyCorruptionContract(): Promise<Record<string, unknown>> {
  try {
    const modulePath: string = "../music-e2e-state-restore-test-helper";
    return await import(modulePath);
  } catch {
    return {};
  }
}

const c11MigrationCopyHeader = "COPY public.music_schema_migrations (id, checksum, schema_checksum, applied_at) FROM stdin;";
const c11PlaylistCopyHeader = "COPY public.playlists (id, user_id, name, description, is_visible_to_guests, created_at, updated_at) FROM stdin;";
const c11MigrationRowOne = `0001_runtime_baseline\t${"a".repeat(64)}\t${"b".repeat(64)}\t2026-08-29 01:00:00+00`;
const c11MigrationRowTwo = `0002_identity_lifecycle\t${"c".repeat(64)}\t${"d".repeat(64)}\t2026-08-29 01:00:01+00`;
const c11PlaylistRow = "123\t7\tRestore qualification\t\\N\tt\t2026-08-29 01:00:02\t2026-08-29 01:00:02";

function c11CopyDumpFixture(): Buffer {
  return Buffer.from([
    "-- PostgreSQL database dump",
    c11MigrationCopyHeader,
    c11MigrationRowOne,
    c11MigrationRowTwo,
    "\\.",
    "COPY public.users (id, username) FROM stdin;",
    "7\te2e-public-music-restore-owner",
    "\\.",
    c11PlaylistCopyHeader,
    c11PlaylistRow,
    "\\.",
    "-- PostgreSQL database dump complete",
    "",
  ].join("\n"), "utf8");
}

type DerivedTrigger = { table: string; name: string; enabled: string; type: number; function?: string };

function nativeMigrationTriggers(): DerivedTrigger[] {
  return EXPECTED_MUSIC_MIGRATION_CHAIN.filter(id => Number(id.slice(0, 4)) >= 43 && Number(id.slice(0, 4)) <= 50)
    .flatMap(id => {
      const sql = readFileSync(resolve(`migrations/${id}.sql`), "utf8");
      const declarations = [...sql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+) (AFTER|BEFORE) ([\s\S]*?) ON public\.([a-z_]+)\s+([\s\S]*?)EXECUTE FUNCTION public\.([a-z_]+)\(\);/g)];
      return declarations.map(([, name, timing, events, table, body, fn]) => {
        const type = (body.includes("FOR EACH ROW") ? 1 : 0) | (timing === "BEFORE" ? 2 : 0)
          | (/\bINSERT\b/.test(events) ? 4 : 0) | (/\bDELETE\b/.test(events) ? 8 : 0)
          | (/\bUPDATE\b/.test(events) ? 16 : 0);
        return { table, name, enabled: "O", type,
          ...(name.includes("_content_revision_") ? { function: fn } : {}) };
      });
    });
}

describe("Music E2E transactional state restore", () => {
  it("derives an immutable restore target only from the exact fixture container fingerprint", async () => {
    // Production break caught: label-only inspection followed by execution by
    // mutable Compose name leaves a TOCTOU window and under-specifies target.
    const contract = await loadRestoreContract();
    const attest = contract.attestMusicFixtureRestoreContainer as undefined | ((value: unknown) => { containerId: string });
    expect(attest).toBeTypeOf("function");
    if (!attest) return;
    const containerId = "a".repeat(64);
    const exact = {
      Id: containerId,
      Name: "/explorers-music-fixture-postgres-1",
      Config: {
        Image: "postgres:15-alpine",
        Labels: {
          "com.explorers.music.fixture": "true",
          "com.explorers.music.project": "explorers-music-fixture",
          "com.docker.compose.project": "explorers-music-fixture",
          "com.docker.compose.service": "postgres",
          "com.docker.compose.container-number": "1",
          "com.docker.compose.oneoff": "False",
        },
      },
      State: { Running: true, Health: { Status: "healthy" } },
      HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "55432" }] } },
      Mounts: [
        { Type: "volume", Name: "explorers-music-fixture_music-fixture-postgres", Destination: "/var/lib/postgresql/data", RW: true },
        { Type: "bind", Destination: "/run/secrets/music-db-migrator", RW: false },
      ],
    };
    expect(attest(exact)).toEqual({ containerId });
    for (const hostile of [
      { ...exact, Id: "b".repeat(64), Name: "/production-postgres" },
      { ...exact, Config: { ...exact.Config, Image: "postgres:latest" } },
      { ...exact, HostConfig: { PortBindings: { "5432/tcp": [{ HostIp: "0.0.0.0", HostPort: "55432" }] } } },
      { ...exact, Mounts: [...exact.Mounts, { Type: "bind", Destination: "/host", RW: true }] },
    ]) expect(() => attest(hostile)).toThrow("fixture restore container authority is invalid");
  });

  it("builds one exact single-transaction psql operation around the private plain dump", async () => {
    // Production break caught: splitting TRUNCATE and replay across child
    // processes can commit a destructive partial restore before replay fails.
    const contract = await loadRestoreContract();
    const build = contract.buildMusicFixtureRestoreOperation as undefined | ((input: {
      containerId: string;
      dataDump: Buffer;
    }) => { file: string; args: string[]; input: Buffer });

    expect(build).toBeTypeOf("function");
    if (!build) return;
    const marker = "COPY public.users (id) FROM stdin;\n1\n\\.\n";
    const operation = build({ containerId: "a".repeat(64), dataDump: Buffer.from(marker) });

    expect(operation.file).toBe(process.platform === "win32" ? "docker.exe" : "docker");
    expect(operation.args).toEqual([
      "exec", "-i", "a".repeat(64),
      "psql", "-X", "-v", "ON_ERROR_STOP=1", "--single-transaction",
      "-U", "music_migrator", "-d", "music_fixture",
    ]);
    const sql = operation.input.toString("utf8");
    expect(sql.match(/TRUNCATE TABLE/g)).toHaveLength(1);
    expect(sql.match(/COPY public\.users \(id\) FROM stdin;/g)).toHaveLength(1);
    expect(sql.indexOf("TRUNCATE TABLE")).toBeLessThan(sql.indexOf(marker));
    expect(sql.indexOf(marker)).toBeLessThan(sql.lastIndexOf("ENABLE ALWAYS TRIGGER music_publication_operation_immutability"));
  });

  it("uses the exact frozen production table, migration, and trigger authority", async () => {
    // Production break caught: a dynamic public-table query or incomplete
    // trigger inventory could truncate an unexpected table or replay through a
    // trigger whose semantics mutate the captured bytes.
    const contract = await loadRestoreContract();
    expect(contract.MUSIC_FIXTURE_TABLES).toEqual([
      "account_category_content_state", "account_category_pin_state", "account_category_settings", "account_lifecycle_operations", "account_memberships", "account_music_identity", "account_presentation", "account_recovery_proofs",
      "activity_logs", "analytics_event_receipts", "analytics_events", "analytics_snapshots", "api_tokens", "app_enrichment_acceptances", "app_enrichment_bindings", "app_enrichment_entitlements", "app_enrichment_generation_retirements", "app_enrichment_generations", "app_enrichment_job_candidates", "app_enrichment_jobs", "app_enrichment_retention_policy", "app_enrichment_snapshots", "app_enrichment_source_approvals", "app_enrichment_worker_run_authorities", "app_enrichment_worker_runs", "app_entity_details", "application_command_receipts", "auth_account", "auth_session", "auth_user",
      "auth_verification", "book_entity_details", "book_recommendation_context", "canonical_music_numeric_retirements", "category_recommendation_pins", "collection_items", "collection_location_links", "collection_media", "collection_place_pins", "collections", "creator_accounts", "deletion_feedback", "email_logs", "email_suppressions", "email_templates", "entities", "entity_identifiers",
      "explorers_analytics_receipts", "guest_interactions", "guide_collection_details", "guide_section_photos", "guide_sections", "initial_account_bindings", "media_assets", "media_objects",
      "movie_entity_details", "movie_entity_provider_genres", "movie_provider_genre_terms", "movie_recommendation_context", "music_credential_revocation_operations", "music_identity_lifecycle_operations", "music_identity_tombstones", "music_owner_operations",
      "music_publication_operation_archive", "music_publication_operations", "music_reactivation_tokens", "music_request_quota",
      "music_schema_migrations", "page_contents", "person_entity_details", "person_suppression_actions", "place_collection_details", "place_entity_details", "place_pin_draft_chunks", "place_pin_draft_items", "place_pin_drafts", "place_recommendation_context", "places_chunk_validation_dirty", "places_collection_mutation_state", "places_pin_validation_dirty", "playback_states", "played_songs", "playlist_songs",
      "playlists", "product_entity_details", "product_recommendation_context", "profile_feed_items", "profile_media", "recommendation_app_screenshots", "recommendation_book_covers", "recommendation_display_overrides", "recommendation_media", "recommendation_movie_media", "recommendation_place_photos", "recommendation_taxonomy", "recommendations", "seo_settings", "session", "songs", "system_settings", "taxonomy_catalogs", "taxonomy_import_receipts", "taxonomy_legacy_slug_mappings", "taxonomy_source_mappings", "taxonomy_term_translations", "taxonomy_terms", "team_members", "user_activity",
      "user_profiles", "user_security_state", "user_sessions", "users", "widgets", "youtube_api_calls", "youtube_api_usage",
      "youtube_music", "youtube_music_playlists", "youtube_playlists", "youtube_tokens",
    ]);
    expect(contract.MUSIC_FIXTURE_MIGRATION_IDS).toEqual([
      "0001_runtime_baseline", "0002_identity_lifecycle", "0003_identity_lifecycle_hardening",
      "0004_identity_delete_saga", "0005_resource_bound_deletion_history", "0006_numeric_identity_lock",
      "0007_identity_provider_snapshot", "0008_credential_revocation_operations",
      "0009_credential_revocation_history_immutability", "0010_least_privilege_runtime_role",
      "0011_durable_publication_idempotency", "0012_publication_replay_expiry_guard",
      "0013_publication_operation_database_clock", "0014_durable_reactivation_authority",
      "0015_publication_operation_archive", "0016_publication_operation_retention",
      "0017_publication_idempotency_key_retirement", "0018_transactional_queue_replacement",
      "0019_queue_visibility_control", "0020_public_snapshot_revision", "0021_explorers_analytics_receipts",
      "0022_explorers_identity",
      "0023_explorers_authorization",
      "0024_explorers_profile_media",
      "0025_explorers_media_attachment_guard",
      "0026_explorers_media_slot_compatibility",
      "0027_explorers_lifecycle",
      "0028_explorers_recovery_proof_retention",
      "0029_explorers_recommendations",
      "0030_explorers_media_purpose_guard",
      "0031_explorers_content_revision",
      "0032_explorers_owner_page_indexes",
      "0033_explorers_recommendation_display_overrides",
      "0034_explorers_books_provider_context", "0035_explorers_book_cover_import", "0036_explorers_analytics_events", "0037_explorers_movies_provider_context", "0038_explorers_movie_media",
      "0039_music_venue_account_ownership",
      "0040_canonical_music_venue_provisioning",
      "0041_canonical_music_venue_release",
      "0042_canonical_music_venue_release_function",
      "0043_explorers_apps_provider_context",
      "0044_explorers_products_offer_context",
      "0045_explorers_people_catalog",
      "0046_explorers_places_catalog",
      "0047_explorers_place_photo_media",
      "0048_explorers_place_location_aggregate",
      "0049_explorers_collection_location_links",
      "0050_explorers_guide_sections",
      "0051_explorers_launch_controls",
      "0052_canonical_music_numeric_retirement", "0053_explorers_taxonomy_catalogs", "0054_explorers_place_individual_pins", "0055_explorers_app_enrichment", "0056_explorers_app_enrichment_jobs", "0057_retire_music_category", "0058_explorers_place_photo_backfill", "0059_explorers_person_suppression_audit", "0060_explorers_guide_budget_tier",
    ]);
    const expectedTriggers: Array<{table:string;name:string;enabled:string;type:number;function?:string}> = [
      { table: "account_music_identity", name: "account_music_identity_immutable", enabled: "O", type: 19 },
      // 0039's deferred ownership triggers. CREATE CONSTRAINT TRIGGER is AFTER and FOR
      // EACH ROW, so tgtype is ROW(1) plus its events: INSERT(4)+UPDATE(16)=21, DELETE(8)=9.
      { table: "account_music_identity", name: "account_music_identity_owner_retained", enabled: "O", type: 9 },
      { table: "users", name: "users_music_venue_owned", enabled: "O", type: 21 },
      { table: "canonical_music_numeric_retirements", name: "canonical_music_numeric_retirement_insert", enabled: "O", type: 7 },
      { table: "canonical_music_numeric_retirements", name: "canonical_music_numeric_retirement_immutable", enabled: "O", type: 27 },
      { table: "users", name: "users_music_numeric_id_immutable", enabled: "O", type: 19 },
      { table: "auth_session", name: "auth_session_version_before_insert", enabled: "O", type: 7 },
      { table: "collection_media", name: "collection_media_ready_guard", enabled: "O", type: 21 },
      { table: "entities", name: "entity_recommendation_kind_guard", enabled: "O", type: 17 },
      { table: "media_assets", name: "media_asset_reference_guard", enabled: "O", type: 17 },
      { table: "music_credential_revocation_operations", name: "music_credential_revocation_history_immutability", enabled: "A", type: 27 },
      { table: "music_identity_lifecycle_operations", name: "music_lifecycle_operation_state", enabled: "O", type: 19 },
      { table: "music_identity_tombstones", name: "music_identity_tombstone_immutability", enabled: "O", type: 19 },
      { table: "music_identity_tombstones", name: "music_identity_tombstone_insert", enabled: "O", type: 7 },
      { table: "music_publication_operation_archive", name: "music_publication_operation_archive_immutability", enabled: "A", type: 27 },
      { table: "music_publication_operations", name: "music_publication_operation_immutability", enabled: "A", type: 31 },
      { table: "music_reactivation_tokens", name: "music_reactivation_token_identity_immutability", enabled: "O", type: 19 },
      { table: "profile_feed_items", name: "profile_feed_ready_guard", enabled: "O", type: 21 },
      { table: "profile_media", name: "profile_media_ready_guard", enabled: "O", type: 21 },
      { table: "recommendation_media", name: "recommendation_media_ready_guard", enabled: "O", type: 21 },
      { table: "recommendations", name: "recommendation_entity_kind_guard", enabled: "O", type: 21 },
      { table: "users", name: "users_music_identity_immutability", enabled: "O", type: 19 },
      { table: "users", name: "users_music_identity_insert", enabled: "O", type: 7 },
      { table: "users", name: "users_reject_unauthorized_music_identity_delete", enabled: "O", type: 11 },
      { table: "users", name: "users_retain_music_identity_tombstone", enabled: "O", type: 9 },
    ];
    expectedTriggers.push({table:'recommendation_book_covers',name:'recommendation_book_cover_ready_guard',enabled:'O',type:21},{table:'media_assets',name:'media_asset_book_cover_reverse_guard',enabled:'O',type:17},{table:'recommendations',name:'recommendation_book_cover_category_guard',enabled:'O',type:17});
    for(const [event,type] of [['insert',4],['update',16],['delete',8]] as const)expectedTriggers.push({table:'recommendation_book_covers',name:'recommendation_book_covers_content_revision_'+event,enabled:'O',type,function:'explorers_content_revision_'+event});
    expectedTriggers.push({table:'entities',name:'entities_book_details_kind_guard',enabled:'O',type:17},{table:'book_entity_details',name:'book_entity_details_kind_guard',enabled:'O',type:21},{table:'book_recommendation_context',name:'book_recommendation_context_category_guard',enabled:'O',type:21},{table:'recommendations',name:'recommendations_book_context_category_guard',enabled:'O',type:17});
    for(const [event,type] of [['insert',4],['update',16],['delete',8]] as const)expectedTriggers.push({table:'book_recommendation_context',name:'book_recommendation_context_content_revision_'+event,enabled:'O',type,function:'explorers_content_revision_'+event});
    expectedTriggers.push({table:"collections",name:"collections_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"collections",name:"collections_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"collections",name:"collections_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"recommendations",name:"recommendations_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"recommendations",name:"recommendations_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"recommendations",name:"recommendations_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"collection_items",name:"collection_items_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"collection_items",name:"collection_items_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"collection_items",name:"collection_items_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"collection_media",name:"collection_media_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"collection_media",name:"collection_media_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"collection_media",name:"collection_media_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"recommendation_media",name:"recommendation_media_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"recommendation_media",name:"recommendation_media_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"recommendation_media",name:"recommendation_media_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"category_recommendation_pins",name:"category_recommendation_pins_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"category_recommendation_pins",name:"category_recommendation_pins_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"category_recommendation_pins",name:"category_recommendation_pins_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"account_category_pin_state",name:"account_category_pin_state_content_revision_insert",enabled:"O",type:4,function:"explorers_content_revision_insert"});
    expectedTriggers.push({table:"account_category_pin_state",name:"account_category_pin_state_content_revision_update",enabled:"O",type:16,function:"explorers_content_revision_update"});
    expectedTriggers.push({table:"account_category_pin_state",name:"account_category_pin_state_content_revision_delete",enabled:"O",type:8,function:"explorers_content_revision_delete"});
    expectedTriggers.push({table:"creator_accounts",name:"creator_accounts_content_revision_lifecycle",enabled:"O",type:17,function:"explorers_content_revision_lifecycle"});
    for(const [event,type] of [['insert',4],['update',16],['delete',8]] as const) expectedTriggers.push({table:'recommendation_display_overrides',name:`recommendation_display_overrides_content_revision_${event}`,enabled:'O',type,function:`explorers_content_revision_${event}`});
    expectedTriggers.push({table:'recommendation_taxonomy',name:'recommendation_taxonomy_parent_lock',enabled:'O',type:31});
    expectedTriggers.push({table:'recommendation_taxonomy',name:'recommendation_taxonomy_constraint',enabled:'O',type:29});
    expectedTriggers.push({table:'movie_entity_details',name:'movie_details_constraint',enabled:'O',type:21});
    expectedTriggers.push({table:'entities',name:'movie_details_entity_constraint',enabled:'O',type:17});
    expectedTriggers.push({table:'entity_identifiers',name:'movie_details_identity_constraint',enabled:'O',type:29});
    expectedTriggers.push({table:'movie_entity_provider_genres',name:'movie_genre_parent_lock',enabled:'O',type:31});
    expectedTriggers.push({table:'movie_entity_provider_genres',name:'movie_genres_constraint',enabled:'O',type:29});
    expectedTriggers.push({table:'movie_entity_details',name:'movie_genres_details_constraint',enabled:'O',type:21});
    expectedTriggers.push({table:'recommendation_taxonomy',name:'recommendation_taxonomy_catalog_lock',enabled:'O',type:31});
    expectedTriggers.push({table:'taxonomy_terms',name:'explorers_taxonomy_terms_shape',enabled:'O',type:29});
    expectedTriggers.push({table:'recommendation_taxonomy',name:'explorers_taxonomy_assignments_shape',enabled:'O',type:29});
    expectedTriggers.push({table:'taxonomy_catalogs',name:'explorers_taxonomy_catalog_labels',enabled:'O',type:29});
    expectedTriggers.push({table:'taxonomy_term_translations',name:'explorers_taxonomy_translation_labels',enabled:'O',type:29});
    expectedTriggers.push({table:'taxonomy_legacy_slug_mappings',name:'explorers_taxonomy_legacy_routes',enabled:'O',type:29});
    expectedTriggers.push({table:'taxonomy_import_receipts',name:'taxonomy_import_receipt_immutable',enabled:'O',type:27});
    expectedTriggers.push({table:'taxonomy_terms',name:'taxonomy_tree_lock',enabled:'O',type:23});
    expectedTriggers.push({table:'taxonomy_terms',name:'taxonomy_tree_constraint',enabled:'O',type:21});
    expectedTriggers.push({table:'movie_recommendation_context',name:'movie_context_constraint',enabled:'O',type:23});
    expectedTriggers.push({table:'recommendations',name:'movie_context_replacement_constraint',enabled:'O',type:19});
    expectedTriggers.push({table:'recommendation_movie_media',name:'movie_media_parent_lock',enabled:'O',type:31});
    expectedTriggers.push({table:'recommendation_movie_media',name:'movie_media_source_guard',enabled:'O',type:29});
    expectedTriggers.push({table:'recommendations',name:'movie_media_recommendation_reverse_guard',enabled:'O',type:17});
    expectedTriggers.push({table:'media_assets',name:'movie_media_asset_reverse_guard',enabled:'O',type:17});
    expectedTriggers.push({table:'entities',name:'movie_media_entity_reverse_guard',enabled:'O',type:17});
    expectedTriggers.push({table:'movie_entity_details',name:'movie_media_facts_reverse_guard',enabled:'O',type:25});
    expectedTriggers.push({table:'entity_identifiers',name:'movie_media_identity_reverse_guard',enabled:'O',type:25});
    for(const table of ['recommendation_movie_media','movie_recommendation_context','recommendation_taxonomy']) for(const [event,type] of [['insert',4],['update',16],['delete',8]] as const) expectedTriggers.push({table,name:table+'_content_revision_'+event,enabled:'O',type,function:'explorers_content_revision_'+event});
    expectedTriggers.push(...nativeMigrationTriggers());
    const placesSql = readFileSync(resolve("migrations/0054_explorers_place_individual_pins.sql"), "utf8");
    const placesTriggers = [...placesSql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+) (AFTER|BEFORE) ([\s\S]*?) ON public\.([a-z_]+)\s+([\s\S]*?)EXECUTE FUNCTION public\.([a-z_]+)\(\);/g)].map(([,name,timing,events,table,body,fn]) => ({ table, name, enabled: "O", type: (body.includes("FOR EACH ROW") ? 1 : 0) | (timing === "BEFORE" ? 2 : 0) | (/\bINSERT\b/.test(events) ? 4 : 0) | (/\bDELETE\b/.test(events) ? 8 : 0) | (/\bUPDATE\b/.test(events) ? 16 : 0), ...(name === "collection_place_pins_revision" ? { function: fn } : {}) }));
    expect(placesTriggers).toHaveLength(17);
    expectedTriggers.push(...placesTriggers);
    // Apps 0055 writes its relations unqualified, so the same derivation accepts an optional
    // public. prefix. Deriving instead of restating keeps the frozen fingerprint honest about
    // the committed SQL: a CONSTRAINT TRIGGER is AFTER and carries no BEFORE bit.
    const appsSql = readFileSync(resolve("migrations/0055_explorers_app_enrichment.sql"), "utf8");
    const appsTriggers = [...appsSql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+) (AFTER|BEFORE) ([\s\S]*?) ON (?:public\.)?([a-z_]+)\s+([\s\S]*?)EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(\);/g)].map(([,name,timing,events,table,body]) => ({ table, name, enabled: "O", type: (body.includes("FOR EACH ROW") ? 1 : 0) | (timing === "BEFORE" ? 2 : 0) | (/\bINSERT\b/.test(events) ? 4 : 0) | (/\bDELETE\b/.test(events) ? 8 : 0) | (/\bUPDATE\b/.test(events) ? 16 : 0) }));
    expect(appsTriggers).toHaveLength(14);
    expect(appsTriggers).toContainEqual({ table: "entities", name: "app_enrichment_entity_origin_guard", enabled: "O", type: 19 });
    expectedTriggers.push(...appsTriggers);
    const workerSql=readFileSync(resolve("migrations/0056_explorers_app_enrichment_jobs.sql"),"utf8");
    const workerTriggers=[...workerSql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+) (AFTER|BEFORE) ([\s\S]*?) ON (?:public\.)?([a-z_]+)\s+([\s\S]*?)EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(\);/g)].map(([,name,timing,events,table,body])=>({table,name,enabled:"O",type:(body.includes("FOR EACH ROW")?1:0)|(timing==="BEFORE"?2:0)|(/\bINSERT\b/.test(events)?4:0)|(/\bDELETE\b/.test(events)?8:0)|(/\bUPDATE\b/.test(events)?16:0)}));
    expect(workerTriggers).toHaveLength(6);
    expectedTriggers.push(...workerTriggers);
    const suppressionSql=readFileSync(resolve("migrations/0059_explorers_person_suppression_audit.sql"),"utf8");
    const suppressionTriggers=[...suppressionSql.matchAll(/CREATE (?:CONSTRAINT )?TRIGGER ([a-z_]+) (AFTER|BEFORE) ([\s\S]*?) ON (?:public\.)?([a-z_]+)\s+([\s\S]*?)EXECUTE FUNCTION (?:public\.)?([a-z_]+)\(\);/g)].map(([,name,timing,events,table,body])=>({table,name,enabled:"O",type:(body.includes("FOR EACH ROW")?1:0)|(timing==="BEFORE"?2:0)|(/\bINSERT\b/.test(events)?4:0)|(/\bDELETE\b/.test(events)?8:0)|(/\bUPDATE\b/.test(events)?16:0)}));
    expect(suppressionTriggers).toEqual([{table:"person_suppression_actions",name:"person_suppression_actions_append_only",enabled:"O",type:27}]);
    expectedTriggers.push(...suppressionTriggers);
    expect(contract.MUSIC_FIXTURE_TRIGGER_FINGERPRINTS).toEqual(expectedTriggers.sort((a,b)=>a.table.localeCompare(b.table)||a.name.localeCompare(b.name)));
    expect(Object.isFrozen(contract.MUSIC_FIXTURE_TABLES)).toBe(true);
    expect(Object.isFrozen(contract.MUSIC_FIXTURE_MIGRATION_IDS)).toBe(true);
    expect(Object.isFrozen(contract.MUSIC_FIXTURE_TRIGGER_FINGERPRINTS)).toBe(true);
  });

  it("binds every migrated revision function to bounded replay and keeps native integrity guards active", async () => {
    const contract = await loadRestoreContract();
    const build = contract.buildMusicFixtureRestoreOperation as (input: { containerId: string; dataDump: Buffer }) => { input: Buffer };
    const marker = "SELECT 'native-replay-marker';\n";
    const sql = build({ containerId: "a".repeat(64), dataDump: Buffer.from(marker) }).input.toString("utf8");
    const native = nativeMigrationTriggers();
    expect(sql).toContain("ALTER TABLE public.\"collection_place_pins\" DISABLE TRIGGER collection_place_pins_revision;");
    expect(sql).toContain("ALTER TABLE public.\"collection_place_pins\" ENABLE TRIGGER collection_place_pins_revision;");
    for (const name of ["places_pin_validation_final", "places_chunk_validation_final", "place_pin_drafts_immutable", "place_pin_draft_chunks_immutable", "place_pin_draft_items_immutable"]) expect(sql).not.toContain(`DISABLE TRIGGER ${name};`);
    expect(native).toHaveLength(48);
    const revisions = native.filter(entry => entry.function);
    expect(revisions).toHaveLength(26);
    expect(revisions.filter(entry => entry.table === "guide_section_photos").map(entry => entry.name).sort())
      .toEqual(["guide_section_photos_content_revision_delete", "guide_section_photos_content_revision_insert"]);
    const fingerprints = contract.MUSIC_FIXTURE_TRIGGER_FINGERPRINTS as DerivedTrigger[];
    const allRevisions = fingerprints.filter(entry => entry.function);
    const expectedMappings = allRevisions.map(({ table, name, function: fn }) => `${table}|${name}|${fn}`).sort();
    const mappingArrays = [...sql.matchAll(/actual_revision_functions IS DISTINCT FROM ARRAY\[(.*?)\]::text\[\]/g)];
    expect(mappingArrays).toHaveLength(2);
    for (const [, values] of mappingArrays) expect([...values.matchAll(/'([^']+)'/g)].map(match => match[1]))
      .toEqual(expectedMappings);
    for (const { table, name } of [...allRevisions, ...revisions]) {
      const disable = `ALTER TABLE public."${table}" DISABLE TRIGGER ${name};`;
      const enable = `ALTER TABLE public."${table}" ENABLE TRIGGER ${name};`;
      expect(sql.split(disable)).toHaveLength(2);
      expect(sql.split(enable)).toHaveLength(2);
      expect(sql.indexOf(disable)).toBeLessThan(sql.indexOf("TRUNCATE TABLE"));
      expect(sql.indexOf(marker)).toBeLessThan(sql.indexOf("SET CONSTRAINTS ALL IMMEDIATE;"));
      expect(sql.indexOf("SET CONSTRAINTS ALL IMMEDIATE;")).toBeLessThan(sql.indexOf(enable));
      expect(sql.indexOf(enable)).toBeLessThan(sql.lastIndexOf("DO $music_restore_authority$"));
    }
    const guards = native.filter(entry => !entry.function);
    expect(guards).toHaveLength(22);
    for (const { name } of guards) expect(sql).not.toContain(`DISABLE TRIGGER ${name};`);
    const disabled = [...sql.matchAll(/DISABLE TRIGGER ([a-z_]+);/g)].map(match => match[1]).sort();
    expect(disabled).toEqual([...allRevisions.map(entry => entry.name), "users_music_identity_insert",
      "music_identity_tombstone_insert", "canonical_music_numeric_retirement_insert",
      "music_publication_operation_immutability"].sort());
  });

  it("derives table and migration allowlists from the checked-in runtime manifest", async () => {
    // Production break caught: a second hand-maintained inventory can remain
    // internally consistent while silently drifting from the schema authority.
    const contract = await loadRestoreContract();
    const manifest = JSON.parse(readFileSync(resolve(
      "../fixtures/db/music-runtime-table-manifest.json",
    ), "utf8")) as {
      schemaVersion: string;
      migrationChain: { engine: string; expectedId: string; files: string[]; controlTables: string[] };
      tables: Array<{ name: string }>;
    };
    expect(manifest.schemaVersion).toBe("music-runtime-table-manifest/v1");
    expect(contract.MUSIC_FIXTURE_TABLES).toEqual([
      ...new Set([...manifest.tables.map(({ name }) => name), ...manifest.migrationChain.controlTables]),
    ].sort());
    expect(contract.MUSIC_FIXTURE_MIGRATION_IDS).toEqual([...EXPECTED_MUSIC_MIGRATION_CHAIN]);
    expect(manifest.migrationChain.files).toEqual(EXPECTED_MUSIC_MIGRATION_CHAIN.map((id) => `${id}.sql`));
    const source = readFileSync(resolve("scripts/music-e2e-state-restore.mjs"), "utf8");
    expect(source).toContain("music-runtime-table-manifest.json");
    expect(source).not.toContain("export const MUSIC_FIXTURE_TABLES = Object.freeze([");
    expect(source).not.toContain("export const MUSIC_FIXTURE_MIGRATION_IDS = Object.freeze([");
  });

  it("refuses malformed immutable container authority before allocating restore input", async () => {
    // Production break caught: executing by a mutable name or caller-controlled
    // target could replay the private dump into a non-fixture database.
    const contract = await loadRestoreContract();
    const build = contract.buildMusicFixtureRestoreOperation as (input: {
      containerId: string;
      dataDump: Buffer;
    }) => unknown;
    expect(build).toBeTypeOf("function");
    if (!build) return;
    expect(() => build({ containerId: "explorers-music-fixture-postgres-1", dataDump: Buffer.from("safe") }))
      .toThrow("fixture restore authority is invalid");
    expect(() => build({ containerId: "a".repeat(64), dataDump: Buffer.from("safe") })).not.toThrow();
  });

  it("classifies a failed replay as rolled back only when the pre-attempt hash is unchanged", async () => {
    // Production break caught: a failed child could be reported generically
    // without proving whether the destructive replay committed partial state.
    const contract = await loadRestoreContract();
    const run = contract.runMusicFixtureRestoreTransaction as undefined | ((input: {
      containerId: string;
      dataDump: Buffer;
      snapshotHash: string;
      captureHash: () => string;
      execute: (operation: unknown) => { status: number | null };
    }) => { ok: boolean; stage?: string; code?: string });
    expect(run).toBeTypeOf("function");
    if (!run) return;
    const mutatedHash = "b".repeat(64);
    expect(run({
      containerId: "a".repeat(64),
      dataDump: Buffer.from("SELECT 1;\n"),
      snapshotHash: "c".repeat(64),
      captureHash: () => mutatedHash,
      execute: () => ({ status: 1 }),
    })).toEqual({ ok: false, stage: "database-restore", code: "replay-failed-rolled-back" });

    let captures = 0;
    expect(run({
      containerId: "a".repeat(64),
      dataDump: Buffer.from("SELECT 1;\n"),
      snapshotHash: "c".repeat(64),
      captureHash: () => (++captures === 1 ? mutatedHash : "d".repeat(64)),
      execute: () => ({ status: 1 }),
    })).toEqual({ ok: false, stage: "database-restore", code: "rollback-unverified" });
  });

  it("accepts a restore only when the committed hash equals the stored snapshot", async () => {
    // Production break caught: child exit zero alone cannot prove the replay
    // restored the exact snapshot bytes.
    const contract = await loadRestoreContract();
    const run = contract.runMusicFixtureRestoreTransaction as (input: {
      containerId: string;
      dataDump: Buffer;
      snapshotHash: string;
      captureHash: () => string;
      execute: (operation: unknown) => { status: number | null };
    }) => { ok: boolean; stage?: string; code?: string; beforeHash?: string; afterHash?: string };
    expect(run).toBeTypeOf("function");
    if (!run) return;
    const snapshotHash = "c".repeat(64);
    expect(run({
      containerId: "a".repeat(64), dataDump: Buffer.from("SELECT 1;\n"), snapshotHash,
      captureHash: () => snapshotHash, execute: () => ({ status: 0 }),
    })).toEqual({ ok: true, beforeHash: snapshotHash, afterHash: snapshotHash });
    expect(run({
      containerId: "a".repeat(64), dataDump: Buffer.from("SELECT 1;\n"), snapshotHash,
      captureHash: () => "d".repeat(64), execute: () => ({ status: 0 }),
    })).toEqual({ ok: false, stage: "verification", code: "restore-mismatch" });
  });

  it("binds the live state service to attested immutable authority and the atomic restore helper", () => {
    // Production break caught: the state service retained the old dynamic
    // two-process TRUNCATE+replay even after the safe helper existed.
    const source = readFileSync(resolve("scripts/music-e2e-state-service.mjs"), "utf8");
    const captureSource = readFileSync(resolve("scripts/music-e2e-state-capture.mjs"), "utf8");
    expect(source).toContain("attestMusicFixtureRestoreContainer");
    expect(source).toContain("runMusicFixtureRestoreTransaction");
    expect(source).toContain("createMusicMutationGuard");
    expect(source).toContain('"/restore-final"');
    expect(source).toContain("requestMusicFixturePrivateProfileSnapshot");
    expect(captureSource).toContain('/__music-fixture/profile-state/snapshot');
    expect(source).toContain('/__music-fixture/profile-state/restore');
    expect(source).toContain('profileHash');
    expect(source).toContain('profileRevision');
    expect(source).not.toMatch(/method:\s*"PUT"[\s\S]{0,240}public_music/);
    expect(source).not.toContain("SELECT string_agg(format('%I.%I'");
    expect(source).not.toContain('"explorers-music-fixture-postgres-1", ...args');
  });

  it("corrupts only a populated playlist row after a completed populated migration COPY block", async () => {
    // Break caught: appending arbitrary SQL after the complete dump does not
    // prove a later COPY failure rolls back rows accepted from an earlier COPY.
    const contract = await loadC11CopyCorruptionContract();
    const corrupt = contract.corruptC11LaterCopyRow as undefined | ((
      dataDump: Buffer,
      options: { maximumBytes: number },
    ) => { dataDump: Buffer; earlierRows: number; targetRows: number; corruptedRow: number });
    expect(corrupt).toBeTypeOf("function");
    if (!corrupt) return;

    const source = c11CopyDumpFixture();
    const sourceBefore = Buffer.from(source);
    const targetRowOffset = source.indexOf(Buffer.from(`${c11PlaylistCopyHeader}\n${c11PlaylistRow}`, "utf8"))
      + Buffer.byteLength(`${c11PlaylistCopyHeader}\n`, "utf8");
    const earlierTerminatorOffset = source.indexOf(Buffer.from(`${c11MigrationRowTwo}\n\\.\n`, "utf8"))
      + Buffer.byteLength(`${c11MigrationRowTwo}\n\\.\n`, "utf8");
    const result = corrupt(source, { maximumBytes: source.length });

    expect(result.earlierRows).toBe(2);
    expect(result.targetRows).toBe(1);
    expect(result.corruptedRow).toBe(1);
    expect(source.equals(sourceBefore)).toBe(true);
    expect(result.dataDump.length).toBe(source.length);
    expect(targetRowOffset).toBeGreaterThan(earlierTerminatorOffset);
    expect(result.dataDump.subarray(0, targetRowOffset).equals(source.subarray(0, targetRowOffset))).toBe(true);
    expect(result.dataDump.subarray(targetRowOffset, targetRowOffset + 3).toString("utf8")).toBe("x00");
    expect(result.dataDump.subarray(targetRowOffset + 3).equals(source.subarray(targetRowOffset + 3))).toBe(true);
  });

  it("refuses ambiguous, malformed, reordered, empty, or over-bound COPY inputs with one safe code", async () => {
    // Break caught: a permissive test mutator can target an unintended row or
    // append uncontrolled SQL when the frozen dump structure drifts.
    const contract = await loadC11CopyCorruptionContract();
    const corrupt = contract.corruptC11LaterCopyRow as undefined | ((
      dataDump: Buffer,
      options: { maximumBytes: number } | undefined,
    ) => unknown);
    expect(corrupt).toBeTypeOf("function");
    if (!corrupt) return;

    const exact = c11CopyDumpFixture();
    const text = exact.toString("utf8");
    const migrationBlock = [c11MigrationCopyHeader, c11MigrationRowOne, c11MigrationRowTwo, "\\."].join("\n");
    const playlistBlock = [c11PlaylistCopyHeader, c11PlaylistRow, "\\."].join("\n");
    const exactBound = { maximumBytes: exact.length };
    const hostileCases: Array<[string, Buffer, { maximumBytes: number } | undefined]> = [
      ["missing bound", exact, undefined],
      ["missing earlier block", Buffer.from(text.replace(`${migrationBlock}\n`, "")), exactBound],
      ["empty earlier block", Buffer.from(text.replace(migrationBlock, `${c11MigrationCopyHeader}\n\\.`)), exactBound],
      ["missing later block", Buffer.from(text.replace(`${playlistBlock}\n`, "")), exactBound],
      ["empty later block", Buffer.from(text.replace(playlistBlock, `${c11PlaylistCopyHeader}\n\\.`)), exactBound],
      ["later block precedes earlier", Buffer.from(
        text.replace(`${migrationBlock}\n`, "").replace(`${playlistBlock}\n`, `${playlistBlock}\n${migrationBlock}\n`),
      ), exactBound],
      ["duplicate later block", Buffer.from(text.replace("-- PostgreSQL database dump complete", `${playlistBlock}\n-- PostgreSQL database dump complete`)), exactBound],
      ["malformed target identifier", Buffer.from(text.replace(c11PlaylistRow, c11PlaylistRow.replace(/^123/, "abc"))), exactBound],
      ["carriage return", Buffer.from(text.replace(/\n/g, "\r\n")), exactBound],
      ["nul byte", Buffer.concat([exact.subarray(0, -1), Buffer.from([0]), exact.subarray(-1)]), exactBound],
      ["invalid utf8", Buffer.concat([exact.subarray(0, -1), Buffer.from([0xff]), exact.subarray(-1)]), exactBound],
      ["over caller bound", exact, { maximumBytes: exact.length - 1 }],
    ];

    for (const [name, hostile, options] of hostileCases) {
      expect(() => corrupt(hostile, options), name).toThrow("C11_COPY_CORRUPTION_REFUSED");
    }
  });
});
