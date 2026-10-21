-- Open Library becomes a second Book provider.
--
-- Google Books stays the first choice; when it fails provider-side (5xx, timeout, network,
-- upstream quota) or has no key, Book search and resolve fall back to Open Library. A Book
-- added that way keeps its own identity, ('open_library','edition','OL…M'), so it resolves
-- again from Open Library and never collides with a Google volume id.
--
-- 0029 declared the provider as an inline VALUE check. Widening it admits one more value and
-- touches no row: every existing identifier already satisfies the new list.
LOCK TABLE public.entity_identifiers IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.entity_identifiers DROP CONSTRAINT entity_identifiers_provider_check;
ALTER TABLE public.entity_identifiers
 ADD CONSTRAINT entity_identifiers_provider_check CHECK(provider IN ('google_books','open_library','tmdb','igdb','google_places'));
