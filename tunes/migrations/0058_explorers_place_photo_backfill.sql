-- Move historic Places creator uploads into the typed photo table. Ticket P5-7.
--
-- Before Plan A (PR #122) a creator's own Places uploads were attached through the
-- generic recommendation_media leg. No public Places read looks there - the public gate
-- resolves generic media only for books, movies and games, and publicPlacesProjection
-- reads recommendation_place_photos alone - so those photos were visible to the owner and
-- never to anyone else. Plan A routed new uploads into recommendation_place_photos and
-- left the existing rows where they were.
--
-- This runs before any sweep could treat them as anything but attached: a row stays
-- referenced (by one table or the other) at every point, and nothing is deleted from
-- media_assets. Rows move only when the asset satisfies 0047's place-photo guard (ready,
-- purpose 'recommendation', a bounded image), appended after the recommendation's
-- existing typed slots in their generic display_order. Two kinds of row stay put:
-- - anything that does not fit in the ten slots 0047 allows, and
-- - any asset the typed guard would refuse.
-- They remain referenced, so they are never swept, exactly as before this migration.
-- A generic row whose asset is already a typed photo of the same recommendation is a
-- duplicate and is removed; the typed row keeps the asset attached.
LOCK TABLE public.recommendations,public.recommendation_media,public.recommendation_place_photos IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM public.recommendation_media rm
 USING public.recommendation_place_photos p
 WHERE p.recommendation_id=rm.recommendation_id AND p.account_id=rm.account_id AND p.media_id=rm.media_id;

WITH candidates AS (
 SELECT rm.recommendation_id,rm.account_id,rm.media_id,
  row_number() OVER (PARTITION BY rm.recommendation_id ORDER BY rm.display_order,rm.media_id) AS position
 FROM public.recommendation_media rm
 JOIN public.recommendations r ON r.id=rm.recommendation_id AND r.account_id=rm.account_id AND r.category='places'
 JOIN public.media_assets m ON m.id=rm.media_id AND m.account_id=rm.account_id
 WHERE m.status='ready' AND m.purpose='recommendation'
   AND m.mime_type IN ('image/png','image/jpeg','image/gif','image/webp') AND m.byte_size BETWEEN 1 AND 5242880
), slotted AS (
 SELECT c.*,coalesce((SELECT max(p.slot_index) FROM public.recommendation_place_photos p
   WHERE p.recommendation_id=c.recommendation_id),-1)+c.position AS slot_index
 FROM candidates c
), moved AS (
 INSERT INTO public.recommendation_place_photos(recommendation_id,account_id,slot_index,media_id)
 SELECT recommendation_id,account_id,slot_index,media_id FROM slotted WHERE slot_index<=9
 RETURNING recommendation_id,account_id,media_id
)
DELETE FROM public.recommendation_media rm USING moved
 WHERE rm.recommendation_id=moved.recommendation_id AND rm.account_id=moved.account_id AND rm.media_id=moved.media_id;
