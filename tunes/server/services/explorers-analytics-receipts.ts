import type {
  AnalyticsReceipt,
  AnalyticsReceiptRepository,
} from "./explorers-analytics-service";

interface QueryResult {
  rows: Array<{
    event_id: string;
    payload_hash: string;
    status: "pending" | "committed" | "failed";
    strapi_document_id: string | null;
  }>;
}

export interface QueryExecutor {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
}

const toReceipt = (
  row: QueryResult["rows"][number],
  acquired: boolean,
  recovered: boolean,
): AnalyticsReceipt => ({
  acquired,
  recovered,
  payloadHash: row.payload_hash,
  status: row.status,
  documentId: row.strapi_document_id || undefined,
});

export class PostgresAnalyticsReceiptRepository
  implements AnalyticsReceiptRepository
{
  constructor(private readonly executor: QueryExecutor) {}

  async begin(eventId: string, payloadHash: string): Promise<AnalyticsReceipt> {
    const inserted = await this.executor.query(
      `
        INSERT INTO explorers_analytics_receipts
          (event_id, payload_hash, status, created_at, updated_at)
        VALUES ($1, $2, 'pending', NOW(), NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id, payload_hash, status, strapi_document_id
      `,
      [eventId, payloadHash],
    );
    if (inserted.rows[0]) return toReceipt(inserted.rows[0], true, false);

    const recovered = await this.executor.query(
      `
        UPDATE explorers_analytics_receipts
        SET status = 'pending', last_error = NULL, updated_at = NOW()
        WHERE event_id = $1
          AND payload_hash = $2
          AND (
            status = 'failed'
            OR (
              status = 'pending'
              AND updated_at < NOW() - INTERVAL '2 minutes'
            )
          )
        RETURNING event_id, payload_hash, status, strapi_document_id
      `,
      [eventId, payloadHash],
    );
    if (recovered.rows[0]) return toReceipt(recovered.rows[0], true, true);

    const existing = await this.executor.query(
      `
        SELECT event_id, payload_hash, status, strapi_document_id
        FROM explorers_analytics_receipts
        WHERE event_id = $1
        LIMIT 1
      `,
      [eventId],
    );
    if (!existing.rows[0]) {
      throw new Error("Analytics receipt disappeared after idempotency collision");
    }
    return toReceipt(existing.rows[0], false, false);
  }

  async commit(eventId: string, documentId: string): Promise<void> {
    await this.executor.query(
      `
        UPDATE explorers_analytics_receipts
        SET status = 'committed', strapi_document_id = $2,
            last_error = NULL, updated_at = NOW()
        WHERE event_id = $1
      `,
      [eventId, documentId],
    );
  }

  async fail(eventId: string, message: string): Promise<void> {
    await this.executor.query(
      `
        UPDATE explorers_analytics_receipts
        SET status = 'failed', last_error = $2, updated_at = NOW()
        WHERE event_id = $1
      `,
      [eventId, message.slice(0, 500)],
    );
  }
}
