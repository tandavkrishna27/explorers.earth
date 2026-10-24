-- GD-23 / GD-31 / GD-05. A guide day (one guide_sections row) becomes ONE ordered list.
--
-- Not a new table: a day is already a section, its places already live in the section's
-- block JSON, and 0050's registry trigger already finds photos anywhere in that JSON
-- ($.**.photos[*].mediaId). So the list is blocks.items (array order = position) with an
-- optional timeLabel per item, at block version v2, and every v1 row is rewritten here:
-- morning, then afternoon, then evening, each in its stored order, labelled with its slot.
-- The budget projection is flattened the same way. Transport segments are keyed by entry
-- localId and need no change.
--
-- Trap: the UPDATE fires the DEFERRED registry trigger, and PostgreSQL refuses ALTER TABLE
-- on a table with pending trigger events (55006). The registry triggers are made IMMEDIATE
-- for this transaction first, so their events fire at the end of the UPDATE statement.
LOCK TABLE public.guide_collection_details,public.guide_sections IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.guide_collection_details ADD COLUMN start_date date
 CHECK(start_date IS NULL OR start_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31');

-- A duplicate entry handle inside one day would make two v2 items indistinguishable. Fail
-- loudly with the offending sections rather than guessing which entry to keep.
DO $$
DECLARE offending text;
BEGIN
 SELECT string_agg(DISTINCT d.id::text,',') INTO offending FROM (
  SELECT s.id FROM public.guide_sections s
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.blocks->'timeline'->'morning','[]'::jsonb)
   || coalesce(s.blocks->'timeline'->'afternoon','[]'::jsonb) || coalesce(s.blocks->'timeline'->'evening','[]'::jsonb)) e
  WHERE s.block_version='guide-section-blocks/v1'
  GROUP BY s.id,e->>'localId' HAVING count(*)>1) d;
 IF offending IS NOT NULL THEN
  RAISE EXCEPTION 'Guide sections hold duplicate entry handles: %',offending USING ERRCODE='23514';
 END IF;
END $$;

ALTER TABLE public.guide_sections DROP CONSTRAINT guide_sections_block_version_check;
ALTER TABLE public.guide_sections ADD CONSTRAINT guide_sections_block_version_check
 CHECK(block_version IN ('guide-section-blocks/v1','guide-section-blocks/v2'));
-- Day titles are optional now ("Day N" is the position, shown by the UI).
ALTER TABLE public.guide_sections DROP CONSTRAINT guide_sections_title_check;
ALTER TABLE public.guide_sections ADD CONSTRAINT guide_sections_title_check CHECK(length(title)<=200 AND title=btrim(title));

SET CONSTRAINTS public.guide_section_media_registry,public.guide_section_photo_registry IMMEDIATE;

UPDATE public.guide_sections s SET
 block_version='guide-section-blocks/v2',
 -- A stored "Day 3" would be wrong the moment days are moved, so positional titles go.
 title=CASE WHEN btrim(s.title) ~ '^Day [0-9]{1,3}$' THEN '' ELSE btrim(s.title) END,
 blocks=(s.blocks - 'version' - 'timeline' - 'budget') || jsonb_build_object(
  'version','guide-section-blocks/v2',
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('kind','place','localId',p.value->>'localId','timeLabel',slot.label,'place',p.value)
     ORDER BY slot.ord,p.ord)
    FROM (VALUES ('morning',1),('afternoon',2),('evening',3)) AS slot(label,ord)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.blocks->'timeline'->slot.label,'[]'::jsonb)) WITH ORDINALITY AS p(value,ord)),'[]'::jsonb),
  'budget',jsonb_build_object('entries',coalesce((SELECT jsonb_agg(b.value ORDER BY slot.ord,b.ord)
    FROM (VALUES ('morning',1),('afternoon',2),('evening',3)) AS slot(label,ord)
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.blocks->'budget'->slot.label,'[]'::jsonb)) WITH ORDINALITY AS b(value,ord)),'[]'::jsonb)))
WHERE s.block_version='guide-section-blocks/v1';

SET CONSTRAINTS public.guide_section_media_registry,public.guide_section_photo_registry DEFERRED;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.guide_sections WHERE block_version<>'guide-section-blocks/v2') THEN
  RAISE EXCEPTION 'Guide section block migration incomplete' USING ERRCODE='23514';
 END IF;
END $$;
ALTER TABLE public.guide_sections DROP CONSTRAINT guide_sections_block_version_check;
ALTER TABLE public.guide_sections ADD CONSTRAINT guide_sections_block_version_check CHECK(block_version='guide-section-blocks/v2');

-- Manage's day count is the number of days (GD-20). Guides with no sections keep theirs.
UPDATE public.guide_collection_details d SET number_of_days=c.n
 FROM (SELECT collection_id,count(*)::int AS n FROM public.guide_sections WHERE archived_at IS NULL GROUP BY collection_id) c
 WHERE c.collection_id=d.collection_id AND c.n BETWEEN 1 AND 365 AND d.number_of_days IS DISTINCT FROM c.n;
