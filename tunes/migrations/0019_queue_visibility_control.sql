ALTER TABLE users
  ADD COLUMN allow_queue_visibility BOOLEAN NOT NULL DEFAULT false;

GRANT UPDATE(allow_queue_visibility) ON users TO music_runtime;
