-- A game's release year, platforms and genres (GMS-X01). A game is stored as a manual
-- entity; picking an IGDB search hit fills these, and the owner can type them instead.
-- One row per game entity, written with it by the manual resolve and read by the owner
-- and public game projections. No row means none were given.
--
-- The writer inserts only for an entity whose kind is 'game' (INSERT ... SELECT ... WHERE
-- kind='game'), and the projections join on the game they already read, so no kind
-- trigger is added. Element lengths are bounded by the shared contract; the table bounds
-- the counts and keeps every element non-empty.
CREATE TABLE public.game_entity_details (
 entity_id uuid PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
 release_year smallint CHECK(release_year IS NULL OR release_year BETWEEN 1900 AND 2100),
 platforms text[] NOT NULL DEFAULT '{}' CHECK(cardinality(platforms)<=12 AND array_position(platforms,'') IS NULL AND array_position(platforms,NULL) IS NULL),
 genres text[] NOT NULL DEFAULT '{}' CHECK(cardinality(genres)<=12 AND array_position(genres,'') IS NULL AND array_position(genres,NULL) IS NULL)
);

GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_entity_details TO music_runtime;
