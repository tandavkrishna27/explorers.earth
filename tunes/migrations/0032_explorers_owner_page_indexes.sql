-- Owner pages use these prefixes for keyset seeks in active, archived and all
-- status views. No table/function privilege or revision trigger is changed.
CREATE INDEX collections_owner_order_idx ON public.collections(account_id,category,display_order,id);
CREATE INDEX recommendations_owner_id_idx ON public.recommendations(account_id,category,id);
CREATE INDEX collection_items_owner_page_idx ON public.collection_items(account_id,category,recommendation_id,collection_id);
-- Selected-collection pages need a different order prefix. Actual EXPLAIN with
-- 1001 members otherwise sorted all members and performed 1001 parent lookups.
CREATE INDEX collection_items_owner_collection_order_idx ON public.collection_items(account_id,category,collection_id,display_order,recommendation_id);
