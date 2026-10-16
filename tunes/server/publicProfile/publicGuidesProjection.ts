import type {Pool, PoolClient} from 'pg';
import {publicProfileCursorStart} from './publicProfileContract';
import {GUIDE_SECTION_BLOCK_VERSION, guideSectionBlocksSchema} from '../../shared/explorersGuideContract';

/**
 * Ticket 5.3. The public Guides read.
 *
 * Before this there was no public guides projection at all - Apps, Books, Games, Movies,
 * People, Places and Products each had one and Guides did not - so a published guide was
 * reachable only through Strapi. That is why PublicGuideModal and PublicGuideDetailPage
 * were the last Guides consumers left on it.
 *
 * A guide is not a list of recommendations, so this projection does not go through
 * collection_items. It reads the collection, its guide fields and its ordered sections.
 *
 * Three gates, each applied here rather than inherited: the account must be publicly
 * eligible, the Guides category must be public, and the guide itself must be public and
 * published. They are in SQL, not a post-filter, so an unpublished guide never occupies a
 * page count, a cursor position or a byte budget - and a later refactor that drops a
 * filter cannot silently expose one.
 *
 * Sections paginate. A section may be 256KB and a guide may hold 200, so a guide's own
 * page is bounded and continues by cursor, which is what the ticket means by "public
 * pagination beyond initial section previews".
 */
const gate = `a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public`;
const guideGate = `c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;
const sectionGate = `gs.archived_at IS NULL`;

async function scope(db: Pick<Pool, 'query'>, username: string) {
 return (await db.query(`SELECT a.id,a.handle,a.revision::text AS account_revision,coalesce(cs.revision::text,'0') AS content_revision
  FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='guides'
  LEFT JOIN account_category_content_state cs ON cs.account_id=a.id AND cs.category='guides'
  WHERE a.handle_key=lower($1) AND ${gate}`, [username])).rows[0];
}
const sameScope = (a: any, b: any) => !!a && !!b && a.id === b.id && a.account_revision === b.account_revision && a.content_revision === b.content_revision;

const mediaUrl = (mediaId: string | null) => (mediaId ? `/api/explorers/v1/media/${mediaId}/content` : null);

/**
 * One section, in the shape the public guide views read.
 *
 * A section whose stored block version is not the one this code understands is OMITTED
 * rather than partially rendered. A public page showing half a day's itinerary, with no
 * indication that the rest was not understood, is worse than showing one day fewer.
 */
function projectSection(row: any) {
 if (row.block_version !== GUIDE_SECTION_BLOCK_VERSION) return null;
 const blocks = guideSectionBlocksSchema.safeParse(row.blocks);
 if (!blocks.success) return null;
 const data = blocks.data;
 return {
  documentId: row.id,
  Title: row.title,
  // 0-based in storage, 1-based in the UI, resolved in exactly one place.
  Sequence: row.display_order + 1,
  Description: row.description,
  Timeline: data.timeline,
  Transport: data.transport,
  Stay: data.stay,
  Recommendation_Activity: data.activities,
  Budget: data.budget,
  Map_Details: data.mapDetails,
  Packing_List: data.packingList.items,
  Pre_Tasks: data.preTasks.items,
  Section_tags: data.tags,
 };
}

/** One guide's sections, bounded and continuing by the last order seen. */
async function sections(db: PoolClient, accountId: string, collectionId: string, limit: number, offset: number) {
 const rows = (await db.query(`SELECT gs.id,gs.title,gs.description,gs.display_order,gs.block_version,gs.blocks
  FROM guide_sections gs
  WHERE gs.account_id=$1 AND gs.collection_id=$2 AND ${sectionGate}
  ORDER BY gs.display_order,gs.id LIMIT $3 OFFSET $4`, [accountId, collectionId, limit + 1, offset])).rows;
 const hasMore = rows.length > limit;
 const projected = rows.slice(0, limit).map(projectSection).filter((section): section is NonNullable<ReturnType<typeof projectSection>> => section !== null);
 return {sections: projected, nextCursor: hasMore ? `o${offset + limit}` : null};
}

function projectGuide(row: any, account: {id: string; handle: string}) {
 return {
  documentId: row.id,
  Title: row.title,
  Description: row.description,
  Guide_Type: row.guide_type,
  // A guide only reaches this projection when it is public and published, so the flag the
  // consumer reads is true by construction rather than by a column lookup.
  Visibility: true,
  Estimated_Budget: row.estimated_budget === null ? null : Number(row.estimated_budget),
  Budget_Type: row.budget_type,
  is_Multicity: row.multi_city ?? false,
  slug: row.slug,
  Guide_Media: row.cover_media_id ? [{url: mediaUrl(row.cover_media_id), name: row.title}] : [],
  Place_Details: row.place_snapshot ?? {},
  Number_Of_Days: row.number_of_days,
  Category: row.categories ?? [],
  Best_Time_To_Visit: row.best_time_to_visit ?? [],
  Guide_Tags: row.tags ?? [],
  // Stored blocks, not rendered HTML. The public renderer sanitises what it draws; handing
  // it a pre-built HTML string here would move that decision somewhere it cannot be seen.
  Tips_Notes: row.tips_notes,
  account: {documentId: account.id, username: account.handle},
  is_pinned: row.pin_order !== null,
  pin_order: row.pin_order === null ? null : Number(row.pin_order),
  display_order: row.display_order,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
 };
}

const GUIDE_COLUMNS = `c.id,c.title,c.description,c.slug,c.display_order,c.pin_order,c.created_at,c.updated_at,
 cm.media_id AS cover_media_id,
 d.guide_type,d.multi_city,d.number_of_days,d.estimated_budget::text AS estimated_budget,d.budget_type,
 d.best_time_to_visit,d.categories,d.tags,d.tips_notes,d.place_snapshot`;
const GUIDE_JOIN = `FROM collections c
 JOIN creator_accounts a ON a.id=c.account_id
 JOIN account_category_settings s ON s.account_id=a.id AND s.category=c.category
 LEFT JOIN collection_media cm ON cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover'
 LEFT JOIN guide_collection_details d ON d.collection_id=c.id AND d.account_id=c.account_id`;

/**
 * The public guides of one creator, or one guide by slug.
 *
 * The scope is re-read after the rows and compared: a guide unpublished while this page
 * was being built means the page is discarded rather than served, which is the same rule
 * every other public projection follows.
 */
export async function publicGuidesProjection(pool: Pool, username: string, limit: number, cursor?: string, slug?: string) {
 const offset = publicProfileCursorStart(cursor);
 if (!Number.isInteger(limit) || limit < 1 || limit > 24) throw new Error('Invalid Guides page size');
 const db = await pool.connect();
 let observed: any;
 let result: any;
 try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout='2000ms'");
  observed = await scope(db, username);
  if (!observed) {await db.query('COMMIT'); return undefined;}
  const rows = (await db.query(`SELECT ${GUIDE_COLUMNS} ${GUIDE_JOIN}
   WHERE a.id=$1 AND c.category='guides' AND ${gate} AND ${guideGate} AND ($2::text IS NULL OR c.slug=$2)
   ORDER BY c.pin_order NULLS LAST,c.display_order,c.id LIMIT $3 OFFSET $4`,
   [observed.id, slug ?? null, slug ? 1 : limit + 1, slug ? 0 : offset])).rows;
  if (slug && !rows.length) {await db.query('COMMIT'); return undefined;}
  const guides = [];
  for (const row of rows.slice(0, slug ? 1 : limit)) {
   if (Buffer.byteLength(JSON.stringify(row), 'utf8') > 131072) throw new Error('Public guide exceeds read bound');
   // A single guide read gets its sections; a list page gets none, because a list of
   // guides does not render their days and fetching them would make the page unbounded.
   const page = slug ? await sections(db, observed.id, row.id, 12, offset) : {sections: [], nextCursor: null};
   guides.push({
    ...projectGuide(row, observed),
    guide_sections: page.sections,
    guide_sections_next_cursor: page.nextCursor,
    // Strapi kept a parent-level summary; it is derived here rather than stored twice.
    Guide_Section_Details: page.sections.map((section) => ({documentId: section.documentId, Title: section.Title, Sequence: section.Sequence})),
   });
  }
  result = {guides};
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4 * 1024 * 1024) throw new Error('Public Guides page exceeds read bound');
  await db.query('COMMIT');
 } catch (error) {
  await db.query('ROLLBACK');
  throw error;
 } finally {
  db.release();
 }
 return sameScope(observed, await scope(pool, username)) ? result : undefined;
}
