-- 0068: category data shape (DS-04, DS-06, DS-09, DS-14; Apps one link; Games developer).
-- Additive and reversible by code: no column is dropped, every old row stays readable.
--
-- Products, one "Where to buy" link (DS-04). product_url stays the shared entity's NOT NULL
-- identity (0044); the owner's link is the per-recommendation offer buy_url. Rows saved with
-- only a product URL get it copied into buy_url so both old shapes read as one link. This
-- UPDATE fires the 0044 content-revision triggers for the affected accounts, which is the
-- intended invalidation of their owner/public snapshots.
-- Products affiliate disclosure (DS-14): per recommendation, default off.
-- Apps one link: download_url is kept but no longer written; a distinct download link moves
-- into other_links (at most 4 {label,url} pairs; element rules live in the contract, as
-- CHECK cannot run a subquery).
-- Games developer: from IGDB involved_companies or typed by the owner.
-- Specifications cap (DS-06) and People rating/follower count (DS-02, DS-09) are write-side
-- contract rules only: existing rows keep their 200-row specs, ratings and follower text.
LOCK TABLE public.product_entity_details,public.product_recommendation_context,public.app_entity_details,public.game_entity_details IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.product_recommendation_context ADD COLUMN affiliate_disclosed boolean NOT NULL DEFAULT false;
UPDATE public.product_recommendation_context context SET buy_url=details.product_url
 FROM public.recommendations recommendation
 JOIN public.product_entity_details details ON details.entity_id=recommendation.entity_id
 WHERE recommendation.id=context.recommendation_id AND recommendation.account_id=context.account_id
  AND recommendation.category='products' AND context.buy_url IS NULL;

ALTER TABLE public.app_entity_details ADD COLUMN other_links jsonb NOT NULL DEFAULT '[]'
 CHECK(jsonb_typeof(other_links)='array' AND jsonb_array_length(other_links)<=4);
UPDATE public.app_entity_details SET other_links=jsonb_build_array(jsonb_build_object('label','Download','url',download_url))
 WHERE download_url IS NOT NULL AND download_url<>app_url;

ALTER TABLE public.game_entity_details ADD COLUMN developer text
 CHECK(developer IS NULL OR (length(developer) BETWEEN 1 AND 200 AND developer=btrim(developer)));
