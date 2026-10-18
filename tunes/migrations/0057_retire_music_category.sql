-- P3-6: retire the 'music' content category. Data first, then constraints, so the
-- narrowed CHECKs validate against rows that are already clean. No table is dropped
-- here; the Music schema itself goes in a later migration.

-- A stored first view of the removed Music page falls back to the default.
UPDATE account_presentation
   SET theme_settings = jsonb_set(theme_settings, '{landingTab}', '"all-recommendations"')
 WHERE theme_settings->>'landingTab' = 'music';

-- Normalise EVERY stored categoryOrder, not just those containing "music": keep only
-- surviving categories, first occurrence wins. The contract bounds the length (.max(9))
-- but not uniqueness, so nine non-music entries with duplicates are valid today and
-- would fail .max(8) after narrowing if left alone. The jsonb_typeof guard matters: the
-- table only constrains the OUTER value to be an object, and jsonb_array_elements on a
-- non-array aborts the whole migration.
UPDATE account_presentation p
   SET theme_settings = jsonb_set(p.theme_settings, '{recommendations,categoryOrder}',
         COALESCE((SELECT jsonb_agg(to_jsonb(kept.cat) ORDER BY kept.first_pos)
                     FROM (SELECT e.value #>> '{}' AS cat, min(e.ordinality) AS first_pos
                             FROM jsonb_array_elements(p.theme_settings->'recommendations'->'categoryOrder')
                                  WITH ORDINALITY AS e(value, ordinality)
                            WHERE e.value #>> '{}' IN ('places','guides','movies','books','games','apps','products','people')
                            GROUP BY e.value #>> '{}') kept), '[]'::jsonb))
 WHERE jsonb_typeof(p.theme_settings->'recommendations'->'categoryOrder') = 'array';

-- A categoryOrder that exists but is NOT an array is already invalid under the
-- contract. Remove it rather than abort; the SPA falls back to its default order.
UPDATE account_presentation
   SET theme_settings = theme_settings #- '{recommendations,categoryOrder}'
 WHERE jsonb_typeof(theme_settings->'recommendations') = 'object'
   AND theme_settings->'recommendations' ? 'categoryOrder'
   AND jsonb_typeof(theme_settings->'recommendations'->'categoryOrder') <> 'array';

DELETE FROM account_category_settings WHERE category = 'music';

-- Compact display_order to 0..n-1 per account, and pinned_order to 0..k-1 over the
-- pinned rows. Both unique constraints are DEFERRABLE INITIALLY DEFERRED (0022), so
-- transient collisions inside these statements are allowed.
UPDATE account_category_settings s
   SET display_order = r.rn - 1
  FROM (SELECT account_id, category,
               row_number() OVER (PARTITION BY account_id ORDER BY display_order, category) AS rn
          FROM account_category_settings) r
 WHERE s.account_id = r.account_id AND s.category = r.category
   AND s.display_order IS DISTINCT FROM r.rn - 1;

UPDATE account_category_settings s
   SET pinned_order = r.rn - 1
  FROM (SELECT account_id, category,
               row_number() OVER (PARTITION BY account_id ORDER BY pinned_order, category) AS rn
          FROM account_category_settings WHERE pinned_order IS NOT NULL) r
 WHERE s.account_id = r.account_id AND s.category = r.category
   AND s.pinned_order IS DISTINCT FROM r.rn - 1;

-- The compaction queued deferred unique checks. ALTER TABLE on a table with pending
-- trigger events fails with 55006, so fire them now. This also surfaces any real
-- collision here, as a clear error, instead of at COMMIT.
SET CONSTRAINTS account_category_display_order_uq, account_category_pinned_order_uq IMMEDIATE;

-- Deleting Music analytics loses that history deliberately: the rows describe a product
-- that no longer exists. analytics_event_receipts.event_id references analytics_events
-- ON DELETE RESTRICT (0036), so receipts are detached first, the same way
-- purge_expired_analytics_events does; a detached receipt still answers a replayed
-- client event as a retired duplicate.
UPDATE analytics_event_receipts
   SET retired_at = coalesce(retired_at, clock_timestamp()), event_id = NULL
 WHERE event_id IN (SELECT id FROM analytics_events WHERE category = 'music' OR page = 'public-music');

DELETE FROM analytics_events WHERE category = 'music' OR page = 'public-music';

ALTER TABLE account_category_settings DROP CONSTRAINT account_category_settings_category_check;
ALTER TABLE account_category_settings ADD CONSTRAINT account_category_settings_category_check
  CHECK (category IN ('places','guides','movies','books','games','apps','products','people'));

ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_category_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_category_check
  CHECK (category IN ('places','guides','movies','books','games','apps','products','people'));

ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_page_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_page_check
  CHECK (page IN ('public-profile','public-home','recommendation-detail','public-movies','public-books',
                  'public-games','public-apps','public-products','public-people','public-guides'));
