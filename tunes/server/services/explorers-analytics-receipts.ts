import type {
  AnalyticsReceipt,
  AnalyticsReceiptRepository,
} from "./explorers-analytics-service";
import { randomUUID } from "node:crypto";

interface QueryResult {
  rowCount?: number | null;
  rows: Array<{
    event_id: string;
    payload_hash: string;
    status: "pending" | "committed" | "failed";
    strapi_document_id: string | null;
    lease_id: string | null;
    last_error?: string | null;
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
  ...(row.lease_id ? { leaseId: row.lease_id } : {}),
  ...(row.status === "failed" && row.last_error?.startsWith("retryable:") !== true
    ? { indeterminate: true }
    : {}),
});

export class PostgresAnalyticsReceiptRepository
  implements AnalyticsReceiptRepository
{
  constructor(
    private readonly executor: QueryExecutor,
    private readonly createLeaseId: () => string = randomUUID,
  ) {}

  async begin(eventId: string, payloadHash: string): Promise<AnalyticsReceipt> {
    const leaseId = this.createLeaseId();
    const inserted = await this.executor.query(
      `
        INSERT INTO explorers_analytics_receipts
          (event_id, payload_hash, status, lease_id, created_at, updated_at)
        VALUES ($1, $2, 'pending', $3, NOW(), NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id, payload_hash, status, strapi_document_id, lease_id
      `,
      [eventId, payloadHash, leaseId],
    );
    if (inserted.rows[0]) return toReceipt(inserted.rows[0], true, false);

    const recovered = await this.executor.query(
      `UPDATE explorers_analytics_receipts
          SET status='pending', lease_id=$3, last_error=NULL, updated_at=NOW()
        WHERE event_id=$1 AND payload_hash=$2 AND status='failed'
          AND last_error LIKE 'retryable:%'
        RETURNING event_id,payload_hash,status,strapi_document_id,lease_id,last_error`,
      [eventId, payloadHash, leaseId],
    );
    if (recovered.rows[0]) return toReceipt(recovered.rows[0], true, true);

    const expired = await this.executor.query(
      `UPDATE explorers_analytics_receipts
          SET status='failed', last_error='indeterminate:publish outcome unknown', updated_at=NOW()
        WHERE event_id=$1 AND payload_hash=$2 AND status='pending'
          AND updated_at < NOW() - INTERVAL '2 minutes'
        RETURNING event_id,payload_hash,status,strapi_document_id,lease_id,last_error`,
      [eventId, payloadHash],
    );
    if (expired.rows[0]) return toReceipt(expired.rows[0], false, false);

    const existing = await this.executor.query(
      `
        SELECT event_id, payload_hash, status, strapi_document_id, lease_id, last_error
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

  async commit(eventId: string, documentId: string, leaseId: string): Promise<void> {
    const committed = await this.executor.query(
      `
        UPDATE explorers_analytics_receipts
        SET status = 'committed', strapi_document_id = $2,
            last_error = NULL, updated_at = NOW()
        WHERE event_id = $1 AND lease_id = $3 AND status = 'pending'
      `,
      [eventId, documentId, leaseId],
    );
    if ((committed.rowCount ?? committed.rows.length) !== 1) {
      throw new Error("Analytics receipt lease was lost before commit");
    }
  }

  async fail(eventId: string, message: string, leaseId: string, disposition: "retryable" | "indeterminate"): Promise<void> {
    const failed = await this.executor.query(
      `
        UPDATE explorers_analytics_receipts
        SET status = 'failed', last_error = $4 || ':' || $2, updated_at = NOW()
        WHERE event_id = $1 AND lease_id = $3 AND status = 'pending'
      `,
      [eventId, message.slice(0, 500), leaseId, disposition],
    );
    if ((failed.rowCount ?? failed.rows.length) !== 1) {
      throw new Error("Analytics receipt lease was lost before failure recording");
    }
  }
}
