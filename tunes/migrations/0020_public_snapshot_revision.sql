ALTER TABLE users
  ADD COLUMN public_snapshot_revision BIGINT NOT NULL DEFAULT 0;

GRANT UPDATE(public_snapshot_revision) ON users TO music_runtime;
