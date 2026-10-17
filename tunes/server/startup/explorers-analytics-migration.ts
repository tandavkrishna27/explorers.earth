interface MigrationExecutor {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
}

export const EXPLORERS_ANALYTICS_SCHEMA_MARKER = "explorers-analytics-receipts-v1";

const EXPLORERS_ANALYTICS_RECEIPTS_DDL = `
  CREATE TABLE IF NOT EXISTS explorers_analytics_receipts (
    event_id text PRIMARY KEY,
    payload_hash text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    strapi_document_id text,
    last_error text,
    lease_id text,
    created_at timestamp NOT NULL DEFAULT NOW(),
    updated_at timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT explorers_analytics_receipts_status_check
      CHECK (status IN ('pending', 'committed', 'failed'))
  );

  ALTER TABLE explorers_analytics_receipts
    ADD COLUMN IF NOT EXISTS lease_id text
`;

/**
 * Pre-traffic readiness gate for the analytics-only table. This is isolated
 * from the separately owned user-sync migration work and is safe on every
 * process start because the DDL is idempotent.
 */
export async function ensureExplorersAnalyticsSchema(
  executor: MigrationExecutor,
): Promise<void> {
  await executor.query(EXPLORERS_ANALYTICS_RECEIPTS_DDL);
}

/** Read-only fixture-runtime proof that the admin migration completed first. */
export async function verifyExplorersAnalyticsSchema(
  executor: MigrationExecutor,
  marker: string | undefined,
): Promise<void> {
  if (marker !== EXPLORERS_ANALYTICS_SCHEMA_MARKER) {
    throw new Error("fixture analytics schema attestation marker is missing or mismatched");
  }
  const result = await executor.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'explorers_analytics_receipts'
    ORDER BY column_name
  `) as { rows?: Array<{ column_name?: string }> };
  const columns = new Set((result.rows ?? []).map((row) => row.column_name));
  for (const required of ["event_id", "payload_hash", "status", "strapi_document_id", "last_error", "lease_id", "created_at", "updated_at"]) {
    if (!columns.has(required)) throw new Error("fixture analytics schema attestation failed");
  }
}
