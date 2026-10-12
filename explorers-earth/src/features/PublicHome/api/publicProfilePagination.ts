import type { PublicCategory } from "./publicProfileGatewayClient";
import type { PublicPagePayload } from "./usePublicPagedResource";

export const PUBLIC_PROFILE_PAGE_SIZE = 12;
export type PublicProfilePageSize = 12 | 24;
export function validatePublicPageSize(pageSize: PublicProfilePageSize): PublicProfilePageSize {
  if (pageSize !== 12 && pageSize !== 24) return invalid();
  return pageSize;
}
export const PUBLIC_PROFILE_PAGE_FIELDS = {
  places: { root: "recommendationLists", child: "recommended_places" },
  movies: { root: "movieLists", child: "recommended_movies" },
  books: { root: "bookLists", child: "recommended_books" },
  games: { root: "gameLists", child: "recommended_games" },
  guides: { root: "guides", child: "guide_sections" },
  apps: { root: "appLists", child: "recommended_apps" },
  products: { root: "productLists", child: "recommended_products" },
  people: { root: "personLists", child: "recommended_people" },
} as const satisfies Record<PublicCategory, { root: string; child: string }>;

function invalid(): never { throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE"); }
function documentRow(value: unknown): Record<string, unknown> & { documentId: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const row = value as Record<string, unknown>;
  if (typeof row.documentId !== "string" || !row.documentId.trim()) return invalid();
  return row as Record<string, unknown> & { documentId: string };
}

export function readPublicPageRows(data: PublicPagePayload, category: PublicCategory, detail: boolean, pageSize: PublicProfilePageSize = PUBLIC_PROFILE_PAGE_SIZE): unknown[] {
  validatePublicPageSize(pageSize);
  if (!data || typeof data !== "object" || Array.isArray(data)) return invalid();
  const { root, child } = PUBLIC_PROFILE_PAGE_FIELDS[category];
  const roots = data[root];
  if (!Array.isArray(roots)) return invalid();
  let rows: unknown = roots;
  if (detail) {
    if (roots.length === 0) throw new Error("PUBLIC_PROFILE_404");
    if (roots.length !== 1) return invalid();
    rows = documentRow(roots[0])[child];
  }
  if (!Array.isArray(rows)) return invalid();
  // Preserve null slots for raw cursor cardinality; the rendered merge omits them.
  rows.forEach((row) => { if (row !== null) documentRow(row); });
  return rows;
}

export function mergePublicPage(previous: PublicPagePayload, next: PublicPagePayload, category: PublicCategory, detail: boolean, pageSize: PublicProfilePageSize = PUBLIC_PROFILE_PAGE_SIZE): PublicPagePayload {
  const previousRows = readPublicPageRows(previous, category, detail, pageSize);
  const nextRows = readPublicPageRows(next, category, detail, pageSize);
  const { root, child } = PUBLIC_PROFILE_PAGE_FIELDS[category];
  const seen = new Set<string>();
  const rows = [...previousRows, ...nextRows].filter((row) => {
    if (row === null) return false;
    const id = documentRow(row).documentId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (!detail) return { ...previous, [root]: rows };
  const parent = documentRow(previous[root][0]);
  if (parent.documentId !== documentRow(next[root][0]).documentId) return invalid();
  return { ...previous, [root]: [{ ...parent, [child]: rows }] };
}

function placeParent(data: PublicPagePayload): Record<string, unknown> & {documentId:string} {
  readPublicPageRows(data,'places',true);
  const parent=documentRow(data.recommendationLists[0]);
  for(const field of ['collection_revision','category_content_revision']) {
    if(typeof parent[field]!=='string'||!/^\d+$/.test(parent[field] as string))return invalid();
  }
  if(typeof parent.eligibility_fingerprint!=='string'||! /^[a-f0-9]{64}$/.test(parent.eligibility_fingerprint))return invalid();
  for(const field of ['eligible_item_count','eligible_pin_count']) {
    if(!Number.isSafeInteger(parent[field])||(parent[field] as number)<0)return invalid();
  }
  if((parent.eligible_pin_count as number)>(parent.eligible_item_count as number))return invalid();
  return parent;
}

export function placePageCursor(data:PublicPagePayload):string|null {
  const cursor=placeParent(data).recommended_places_next_cursor;
  if(cursor===null)return null;
  if(typeof cursor!=='string'||cursor.length>2048||!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(cursor))return invalid();
  return cursor;
}

export function mergePlacePage(previous:PublicPagePayload,next:PublicPagePayload,pageSize:PublicProfilePageSize=PUBLIC_PROFILE_PAGE_SIZE):PublicPagePayload {
  const old=placeParent(previous),fresh=placeParent(next);
  for(const field of ['documentId','collection_revision','category_content_revision','eligible_item_count','eligible_pin_count','eligibility_fingerprint']) {
    if(old[field]!==fresh[field])throw Error('PUBLIC_PROFILE_409');
  }
  const cursor=placePageCursor(next);
  const before=readPublicPageRows(previous,'places',true,pageSize),incoming=readPublicPageRows(next,'places',true,pageSize);
  const ids=new Set(before.map(row=>documentRow(row).documentId));
  if(ids.size!==before.length)return invalid();
  const nextIds=new Set<string>();
  for(const row of incoming){const id=documentRow(row).documentId;if(nextIds.has(id)||previous!==next&&ids.has(id))return invalid();nextIds.add(id);}
  const merged=mergePublicPage(previous,next,'places',true,pageSize);
  const rows=(merged.recommendationLists[0] as Record<string,unknown>).recommended_places;
  if((rows as unknown[]).length>(fresh.eligible_item_count as number)||cursor===null&&(rows as unknown[]).length!==fresh.eligible_item_count)return invalid();
  return {...merged,recommendationLists:[{...old,...fresh,recommended_places:rows}]};
}

/** Child traversals are list-local and retain their original list/category fences. */
export async function completePlacesPreviews(value:unknown,read:(slug:string,cursor:string)=>Promise<unknown>,signal:AbortSignal):Promise<PublicPagePayload> {
  const data=value as PublicPagePayload;
  readPublicPageRows(data,'places',false);
  const lists:unknown[]=[];
  for(const raw of data.recommendationLists) {
    if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
    let current:PublicPagePayload={recommendationLists:[raw]};
    const parent=placeParent(current);
    if(typeof parent.slug!=='string'||!parent.slug)return invalid();
    const seen=new Set<string>();
    let cursor=placePageCursor(current);
    while(cursor!==null) {
      if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
      if(seen.has(cursor))return invalid();
      seen.add(cursor);
      const next=await read(parent.slug,cursor) as PublicPagePayload;
      if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
      const incoming=readPublicPageRows(next,'places',true);
      if(!incoming.length)return invalid();
      current=mergePlacePage(current,next);
      cursor=placePageCursor(current);
    }
    const rows=readPublicPageRows(current,'places',true);
    if(rows.length!==parent.eligible_item_count)return invalid();
    lists.push(current.recommendationLists[0]);
  }
  return {...data,recommendationLists:lists};
}
