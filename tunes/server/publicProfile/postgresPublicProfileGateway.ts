import {publicGamesProjection,type GamePublicOperation} from './publicGamesProjection';
import {publicMoviesProjection} from './publicMoviesProjection';
import type { Pool } from "pg";
import type { PublicProfileGateway } from "./publicProfileService";
import type { PublicCategory } from "./publicProfilePolicy";
import {publicBooksProjection} from './publicBooksProjection';
import {publicAppsProjection} from './publicAppsProjection';
import {publicProductsProjection} from './publicProductsProjection';
import {publicPeopleProjection,publicPeopleSectorProjection} from './publicPeopleProjection';
import {publicPlacesProjection} from './publicPlacesProjection';
import {publicGuidesProjection} from './publicGuidesProjection';

const flag: Record<string, string> = { places: "public_recommendations", guides: "public_guides",
  movies: "public_movie", books: "public_books", games: "public_games", apps: "public_apps",
  products: "public_products", people: "public_people" };

/** Compatibility shell only; category content remains an Epic 3/7 dependency. */
export class PostgresPublicProfileGateway implements PublicProfileGateway {
  constructor(private readonly db: Pool,private readonly movieCursorSecret="") {}
  async resolveGamesAccount(username:string):Promise<Record<string,unknown>|undefined>{
    const row=(await this.db.query("SELECT a.id FROM creator_accounts a JOIN account_category_settings s ON s.account_id=a.id AND s.category='games' WHERE a.handle_key=lower($1) AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile AND s.is_public LIMIT 1",[username])).rows[0];
    return row?{documentId:row.id,public_profile:'Yes',public_games:'Yes'}:undefined;
  }

  async resolveHandleRedirect(username: string): Promise<string | undefined> {
    // Only while the hold lasts, and only to an account that is still publicly visible: a
    // redirect must never reveal an account that the old handle itself would not have shown.
    const row = (await this.db.query<{ handle: string }>(`SELECT a.handle FROM account_handle_holds h
      JOIN creator_accounts a ON a.id=h.account_id
      WHERE h.handle_key=lower($1) AND h.held_until>now() AND a.handle IS NOT NULL AND a.handle_key<>h.handle_key
        AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile=true`, [username])).rows[0];
    return row?.handle;
  }

  async resolveAccount(username: string): Promise<Record<string, unknown> | undefined> {
    const result = await this.db.query(`SELECT a.id,a.handle,a.display_name,a.account_type,a.bio_plain,a.bio_rich,
      a.public_address,a.profile_place_details,a.public_profile,a.auto_pinning,a.mobile_number,a.mobile_number_visible,
      a.created_at,p.social_links,p.theme_settings,pm_profile.media_id AS profile_media_id,pm_background.media_id AS background_media_id
      FROM creator_accounts a JOIN account_presentation p ON p.account_id=a.id
      LEFT JOIN profile_media pm_profile ON pm_profile.account_id=a.id AND pm_profile.slot='profile'
      LEFT JOIN profile_media pm_background ON pm_background.account_id=a.id AND pm_background.slot='background'
      WHERE a.handle_key=lower($1) AND a.status='active' AND a.onboarding_status='complete' AND a.public_profile=true`, [username]);
    const a = result.rows[0];
    if (!a) return undefined;
    const settings = await this.db.query("SELECT category,is_public,pinned_order FROM account_category_settings WHERE account_id=$1", [a.id]);
    const feed = await this.db.query(`SELECT f.id,f.media_id,f.external_url,f.source,f.media_type,f.caption,f.details
      FROM profile_feed_items f LEFT JOIN media_assets m ON m.id=f.media_id AND m.account_id=f.account_id
      WHERE f.account_id=$1 AND (f.media_id IS NULL OR m.status='ready') ORDER BY f.display_order`, [a.id]);
    const social: Record<string, unknown> = { theme_settings: a.theme_settings ?? {} };
    if (Array.isArray(a.social_links)) for (const link of a.social_links) {
      if (link?.visible === true && typeof link.platform === "string" && typeof link.url === "string")
        social[link.platform] = { link: link.url, visibility: true };
    }
    const publicShell: Record<string, unknown> = {
      documentId: a.id, username: a.handle, Account_Name: a.display_name, Account_Type: a.account_type,
      Bio: a.bio_plain ?? a.bio_rich, Bio_1: a.bio_plain, Public_Profile_Address: a.public_address,
      profile_place_details: a.profile_place_details, public_profile: "Yes", auto_pinning: a.auto_pinning,
      createdAt: a.created_at, social_media: social,
      Feed_Data: feed.rows.map((item) => ({ ...item.details, id: item.id,
        documentId: item.media_id ?? item.id, url: item.media_id
          ? `/api/explorers/v1/media/${item.media_id}/content` : item.external_url,
        type: item.media_type, caption: item.caption, uploadSource: item.source })),
      profile_picture: a.profile_media_id ? { url: `/api/explorers/v1/media/${a.profile_media_id}/content` } : null,
      bg_picture: a.background_media_id ? { url: `/api/explorers/v1/media/${a.background_media_id}/content` } : null,
      ...(a.mobile_number_visible ? { mobile_number: a.mobile_number, mobile_number_visibility: true } : {}),
    };
    for (const [category, legacyFlag] of Object.entries(flag)) publicShell[legacyFlag] = settings.rows.some((row) => row.category === category && row.is_public) ? "Yes" : "No";
    // How many lists (guides, for Guides) each public category shows a visitor. The SPA
    // hides a pinned tab whose count is 0 without touching the owner's pin, so the tab
    // returns on the next read after something is published. Private categories are absent.
    const publicCounts = await this.db.query(`SELECT category,count(*)::int AS lists FROM collections
      WHERE account_id=$1 AND visibility='public' AND publication_state='published' AND archived_at IS NULL
      GROUP BY category`, [a.id]);
    publicShell.public_navigation_counts = Object.fromEntries(Object.entries(flag)
      .filter(([category]) => settings.rows.some((row) => row.category === category && row.is_public))
      .map(([category, legacyFlag]) => [legacyFlag, publicCounts.rows.find((row) => row.category === category)?.lists ?? 0]));
    // The compatibility shell addresses nav tabs by legacy visibility flag, not by
    // category: navPinning's NAV_TAB_ORDER holds public_* ids and isTabVisible reads
    // account[tabId]. Emitting bare category names made every manual pin fall through
    // normalizePinnedTabs' filter, leaving the nav profile-only.
    publicShell.pinned_nav_tabs = settings.rows
      .filter((row) => row.pinned_order !== null)
      .sort((x, y) => x.pinned_order - y.pinned_order)
      .map((row) => flag[row.category])
      .filter((value): value is string => Boolean(value));
    return publicShell;
  }

  async resolveCategory(username: string, category: PublicCategory, limit=12,cursor?:string,operation?:GamePublicOperation): Promise<unknown> {
    return category==='games'?publicGamesProjection(this.db,username,limit,cursor,undefined,this.movieCursorSecret,operation):category==='movies'?publicMoviesProjection(this.db,username,limit,cursor,undefined,this.movieCursorSecret):category==='books'?publicBooksProjection(this.db,username,limit,cursor):category==='apps'?publicAppsProjection(this.db,username,limit,cursor):category==='products'?publicProductsProjection(this.db,username,limit,cursor):category==='people'?publicPeopleProjection(this.db,username,limit,cursor):category==='places'?publicPlacesProjection(this.db,username,limit,cursor,undefined,this.movieCursorSecret):category==='guides'?publicGuidesProjection(this.db,username,limit,cursor):{ items: [], nextCursor: null };
  }
  async resolveDetail(username:string,category:PublicCategory,slug:string,limit=12,cursor?:string,operation?:GamePublicOperation): Promise<unknown> {
    return category==='games'?publicGamesProjection(this.db,username,limit,cursor,slug,this.movieCursorSecret,operation):category==='movies'?publicMoviesProjection(this.db,username,limit,cursor,slug,this.movieCursorSecret):category==='books'?publicBooksProjection(this.db,username,limit,cursor,slug):category==='apps'?publicAppsProjection(this.db,username,limit,cursor,slug):category==='products'?publicProductsProjection(this.db,username,limit,cursor,slug):category==='people'?publicPeopleProjection(this.db,username,limit,cursor,slug):category==='places'?publicPlacesProjection(this.db,username,limit,cursor,slug,this.movieCursorSecret):category==='guides'?publicGuidesProjection(this.db,username,limit,cursor,slug):undefined;
  }
  async resolvePeopleSector(username:string,sectorSlug:string,limit:number,cursor?:string):Promise<unknown>{return publicPeopleSectorProjection(this.db,username,sectorSlug,limit,cursor,this.movieCursorSecret);}
  async resolveMovieGenre(username:string,genreSlug:string,limit:number,cursor?:string):Promise<unknown>{return publicMoviesProjection(this.db,username,limit,cursor,undefined,this.movieCursorSecret,genreSlug);}

}
