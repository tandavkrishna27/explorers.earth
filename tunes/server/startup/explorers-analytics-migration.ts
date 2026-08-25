interface MigrationExecutor {
  query(sql: string): Promise<unknown>;
}

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
