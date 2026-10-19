-- A guide's budget tier (Backpacker ... Ultra-Luxury), which the guide wizard has always
-- asked for and, until now, discarded.
--
-- It is not budget_type. budget_type qualifies an estimated amount ('per-person' or
-- 'total') and is meaningless without one; a tier describes the trip's spending level and
-- needs no amount. Overloading budget_type would have broken its amount CHECK, so the tier
-- gets its own nullable column. Existing rows stay NULL: no tier was ever stored, and none
-- is guessed.
LOCK TABLE public.guide_collection_details IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.guide_collection_details
 ADD COLUMN budget_tier text
 CHECK(budget_tier IS NULL OR budget_tier IN ('backpacker','budget','mid-range','luxury','ultra-luxury'));
