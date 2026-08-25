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
  ADD COLUMN IF NOT EXISTS lease_id text;
