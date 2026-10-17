# Ticket 4.1 TMDB genre authority mapping proposal

Owner clarification: "We use from TMDB only currently." This authorizes provider-derived genre categories, with no custom production genre list. Canonical category remains `movies` for movie and TV entities; provider identity remains kind plus ID. No caller may create global terms.

Primary provenance checked 2026-10-03: https://developer.themoviedb.org/reference/genre-movie-list and https://developer.themoviedb.org/reference/genre-tv-list establish the official `/3/genre/movie/list` and `/3/genre/tv/list` endpoints. https://developer.themoviedb.org/openapi/tmdb-api.json returned both complete official response examples through a bounded read-only PowerShell request. The examples have German localized names for several IDs, rather than a complete English response. IDs and source-kind membership below are verified against these examples; English labels are proposed standard translations, with exact live `language=en` compatibility still unqualified without authorized provider credentials. Do not describe them as a captured live English response.

## Exact proposed mapping

| Kind | Provider genre ID | English label / translation | Canonical slug |
| --- | ---: | --- | --- |
| movie | 28 | Action | action |
| movie | 12 | Adventure | adventure |
| movie | 16 | Animation | animation |
| movie | 35 | Comedy | comedy |
| movie | 80 | Crime | crime |
| movie | 99 | Documentary | documentary |
| movie | 18 | Drama | drama |
| movie | 10751 | Family | family |
| movie | 14 | Fantasy | fantasy |
| movie | 36 | History | history |
| movie | 27 | Horror | horror |
| movie | 10402 | Music | music |
| movie | 9648 | Mystery | mystery |
| movie | 10749 | Romance | romance |
| movie | 878 | Science Fiction | science-fiction |
| movie | 10770 | TV Movie | tv-movie |
| movie | 53 | Thriller | thriller |
| movie | 10752 | War | war |
| movie | 37 | Western | western |
| tv | 10759 | Action & Adventure | action-adventure |
| tv | 16 | Animation | animation |
| tv | 35 | Comedy | comedy |
| tv | 80 | Crime | crime |
| tv | 99 | Documentary | documentary |
| tv | 18 | Drama | drama |
| tv | 10751 | Family | family |
| tv | 10762 | Kids | kids |
| tv | 9648 | Mystery | mystery |
| tv | 10763 | News | news |
| tv | 10764 | Reality | reality |
| tv | 10765 | Sci-Fi & Fantasy | sci-fi-fantasy |
| tv | 10766 | Soap | soap |
| tv | 10767 | Talk | talk |
| tv | 10768 | War & Politics | war-politics |
| tv | 37 | Western | western |

35 explicit provider mappings produce 27 root terms (parent null), active true, English locale `en`, deterministic position in the ordered first-occurrence movie list then TV-only list. The only merges are identical provider IDs and equivalent standard labels: 16,35,80,99,18,10751,9648,37. Movie Action28 and Adventure12 remain separate from TV Action & Adventure10759. Movie Science Fiction878 and Fantasy14 remain separate from TV Sci-Fi & Fantasy10765. Movie War10752 remains separate from TV War & Politics10768. No genre split, custom synonym, caller label merge or lossy ID rewriting. UUIDs are generated database identities; mapping is resolved by reviewed category/slug, not assumed IDs.

## Seed and upgrade contract

Seed only explicit rows into taxonomy terms, English translations and kind/ID mapping in migration0037 after independent mapping review. Do not populate fixture mappings into production. Migration failure rolls back the whole seed/schema transaction. Global term deletion remains restricted while mapped/associated. Runtime resolves provider genres by exact kind/ID mapping; unknown genre returns recoverable `MOVIE_GENRE_MAPPING_UNAVAILABLE`, rolls back recommendation and command receipt, and requires explicit maintenance review. Provider names remain ordered immutable entity facts and do not overwrite global labels. Terms are retained through owner deletion and recovery; recommendation associations cascade as owned data.

Review required before inserting production seeds: exact English translations and the eight deliberate cross-kind merges. Further localized translations and live catalog refresh are not implemented by this proposal. Live TMDB search/detail/watch-provider compatibility and Package B media/UI/public acceptance remain open.
