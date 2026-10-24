import type { Express, Request, Response } from "express";
import {listSlugPredicate} from '../application/collectionSlug';
import type { Pool } from "pg";
import { PUBLIC_RECOMMENDATION_CATEGORIES, type PublicCategory } from "../publicProfile/publicProfilePolicy";

/**
 * Server-side share metadata and real 404s for the SPA's HTML routes (PROD-03, PROD-04).
 *
 * Host nginx sends every HTML request that matches no static file here (location
 * @share in deploy/nginx/explorers.conf), with the original request URI in
 * X-Explorers-Path. This answers with the status the page deserves and a body of
 * the form
 *
 *   <!--# include virtual="/__explorers_shell/head.html" -->{meta}<!--# include virtual="/__explorers_shell/tail.html" -->
 *
 * which nginx's SSI filter expands from the release's own rendered shell. So the
 * API never holds a copy of index.html (its image contains no SPA build, and the
 * release swap stays one atomic symlink), and the status set here - 200 or 404 -
 * is the status the client sees.
 *
 * Only `{meta}` is built from data. Every value in it is HTML-escaped, which also
 * makes it SSI-inert: an SSI command needs a literal `<!--#`, and `<` never
 * survives escaping.
 *
 * Every read predicate is the public reader's (postgresPublicProfileGateway.ts
 * resolveAccount, the projections' listGate, mediaRepository isPublicAttachment):
 * a preview can never name or picture anything the public page would not show.
 * Nothing is cached in-process, for the same reason the public profile service
 * runs with ttlMs 0: a privacy change must hold on the very next request.
 */

export const SHARE_SHELL_HEAD = "/__explorers_shell/head.html";
export const SHARE_SHELL_TAIL = "/__explorers_shell/tail.html";
export const SHARE_PATH_HEADER = "x-explorers-path";
export const SHARE_DEFAULT_IMAGE_PATH = "/images/explorershero.png";
const SITE_NAME = "explorers";
const DEFAULT_DESCRIPTION = "Recommend places, movies, books, games, apps, products and people you love - and share them with one link.";
const DESCRIPTION_LIMIT = 200;

/**
 * First path segments the SPA owns outright (AuthRoutes.tsx, ProtectedRoutes.tsx,
 * AppRoutes.tsx). share-page-routes.test.ts reads those files and fails when a
 * route appears that this list does not cover.
 */
export const SPA_EXACT_PATHS: readonly string[] = [
  "/", "/login", "/register", "/forgot-password", "/reset-password", "/reset-link-sent", "/email-verification",
  "/email-confirmed", "/contact", "/about", "/use-cases", "/privacy", "/cookies", "/terms", "/google-auth/callback",
  "/reactivate", "/reactivate-confirm", "/onboarding", "/profile", "/analytics", "/settings", "/home", "/hub", "/404",
];
/** First segments whose whole subtree belongs to the SPA (owner views and redirects). */
export const SPA_PREFIXES: readonly string[] = ["recommendations", "guides", "music"];
/** ProtectedRoutes' `:listId/new` and `:placeId/edit`, which outrank `:username/*`. */
const SPA_SECOND_SEGMENTS = new Set(["new", "edit"]);

const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
/** PublicRoutes.tsx: `<category>/<keyword>/<value>` pages that are views of the whole category. */
const CATEGORY_FACETS: Partial<Record<PublicCategory, string>> = {
  movies: "genre", games: "genre", books: "subject", people: "sector",
};

const CATEGORY_LABELS: Record<PublicCategory, string> = {
  places: "Places", movies: "Movies & Shows", books: "Books", games: "Games", guides: "Guides",
  apps: "Apps & Tools", products: "Products", people: "People",
};

export type ShareRoute =
  | { kind: "app" }
  | { kind: "notFound" }
  | { kind: "profile"; handle: string }
  | { kind: "category"; handle: string; category: PublicCategory }
  | { kind: "list"; handle: string; category: PublicCategory; slug: string };

function isCategory(value: string): value is PublicCategory {
  return (PUBLIC_RECOMMENDATION_CATEGORIES as readonly string[]).includes(value);
}

/** Maps a request URI onto the SPA's routes. Pure: no data is consulted. */
export function classifySharePath(requestUri: string): ShareRoute {
  const rawPath = requestUri.split(/[?#]/, 1)[0] ?? "";
  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) return { kind: "notFound" };
  const path = rawPath.length > 1 ? rawPath.replace(/\/$/, "") : rawPath;
  let segments: string[];
  try {
    segments = path.split("/").slice(1).map((segment) => decodeURIComponent(segment));
  } catch {
    return { kind: "notFound" };
  }
  if (segments.some((segment) => segment === "" || segment.includes("/"))) {
    return path === "/" ? { kind: "app" } : { kind: "notFound" };
  }
  if (SPA_EXACT_PATHS.includes(path)) return { kind: "app" };
  const [first, second, third, fourth, ...rest] = segments;
  if (SPA_PREFIXES.includes(first)) return { kind: "app" };
  if (segments.length === 2 && SPA_SECOND_SEGMENTS.has(second)) return { kind: "app" };

  if (!HANDLE_PATTERN.test(first)) return { kind: "notFound" };
  const handle = first;
  if (second === undefined) return { kind: "profile", handle };
  if (!isCategory(second) || rest.length) return { kind: "notFound" };
  const category = second;
  if (third === undefined) return { kind: "category", handle, category };
  const facet = CATEGORY_FACETS[category];
  if (facet && third === facet) return fourth !== undefined && segments.length === 4 ? { kind: "category", handle, category } : { kind: "notFound" };
  if (category === "places") {
    if (third === "map" && fourth === undefined) return { kind: "category", handle, category };
    if (fourth === "placesmap") return { kind: "category", handle, category };
    if (fourth === "map") return SLUG_PATTERN.test(third) ? { kind: "list", handle, category, slug: third } : { kind: "notFound" };
  }
  if (fourth !== undefined || !SLUG_PATTERN.test(third)) return { kind: "notFound" };
  return { kind: "list", handle, category, slug: third };
}

export type ShareMeta = { title: string; description: string; image: string; url: string; type: "website" | "profile" };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function plain(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  // Control characters have no place in a meta attribute; collapse whitespace so a
  // multi-line bio reads as one line in a card.
  const text = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** The head fragment nginx splices into the shell. Every interpolation is escaped. */
export function renderShareHead(meta: ShareMeta): string {
  const title = escapeHtml(meta.title), description = escapeHtml(meta.description);
  const url = escapeHtml(meta.url), image = escapeHtml(meta.image);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join("");
}

export function renderShareDocument(meta: ShareMeta): string {
  return `<!--# include virtual="${SHARE_SHELL_HEAD}" -->${renderShareHead(meta)}<!--# include virtual="${SHARE_SHELL_TAIL}" -->`;
}

const ACCOUNT_GATE = "a.status='active' AND a.onboarding_status='complete' AND a.public_profile=true";

/** resolveAccount's predicate; the picture only when isPublicAttachment would serve it and it is ready. */
export const SHARE_PROFILE_SQL = `SELECT a.id,a.handle,a.display_name,a.bio_plain,
    (SELECT pm.media_id FROM profile_media pm JOIN media_assets m ON m.id=pm.media_id AND m.account_id=pm.account_id
      WHERE pm.account_id=a.id AND pm.slot='profile' AND m.status='ready') AS profile_media_id
  FROM creator_accounts a JOIN account_presentation p ON p.account_id=a.id
  WHERE a.handle_key=lower($1) AND ${ACCOUNT_GATE}`;

export const SHARE_CATEGORY_SQL = `SELECT 1 FROM account_category_settings s
  WHERE s.account_id=$1 AND s.category=$2 AND s.is_public`;

/** The projections' listGate, plus isPublicAttachment's collection-cover arm for the image. */
export const SHARE_LIST_SQL = `SELECT c.title,c.description,
    (SELECT cm.media_id FROM collection_media cm JOIN media_assets m ON m.id=cm.media_id AND m.account_id=cm.account_id
      WHERE cm.collection_id=c.id AND cm.account_id=c.account_id AND cm.slot='cover' AND m.purpose='collection'
        AND m.status='ready') AS cover_media_id
  FROM collections c JOIN account_category_settings s ON s.account_id=c.account_id AND s.category=c.category
  WHERE c.account_id=$1 AND c.category=$2 AND ${listSlugPredicate('c','$3')} AND s.is_public
    AND c.archived_at IS NULL AND c.visibility='public' AND c.publication_state='published'`;

type ProfileRow = { id: string; handle: string; display_name: string | null; bio_plain: string | null; profile_media_id: string | null };
type ListRow = { title: string; description: string | null; cover_media_id: string | null };

export type SharePage = { status: 200 | 404; meta: ShareMeta };

export class SharePageService {
  constructor(private readonly pool: Pick<Pool, "query">, private readonly origin: string) {}

  private absolute(path: string): string {
    return `${this.origin}${path}`;
  }

  private media(id: string | null | undefined): string | undefined {
    return id ? this.absolute(`/api/explorers/v1/media/${id}/content`) : undefined;
  }

  private site(path: string): ShareMeta {
    return { title: SITE_NAME, description: DEFAULT_DESCRIPTION, image: this.absolute(SHARE_DEFAULT_IMAGE_PATH),
      url: this.absolute(path), type: "website" };
  }

  async page(requestUri: string): Promise<SharePage> {
    const route = classifySharePath(requestUri);
    const path = (requestUri.split(/[?#]/, 1)[0] || "/").replace(/(.)\/$/, "$1");
    if (route.kind === "app") return { status: path === "/404" ? 404 : 200, meta: this.site(path) };
    // The not-found page is never canonical for the path that produced it.
    if (route.kind === "notFound") return { status: 404, meta: this.site("/404") };

    const profile = (await this.pool.query<ProfileRow>(SHARE_PROFILE_SQL, [route.handle])).rows[0];
    if (!profile) return { status: 404, meta: this.site("/404") };
    const name = plain(profile.display_name, 80) || profile.handle;
    const profileImage = this.media(profile.profile_media_id) ?? this.absolute(SHARE_DEFAULT_IMAGE_PATH);
    // og:url carries the account's own casing of the handle, so every spelling of
    // the URL shares one canonical.
    const base = `/${encodeURIComponent(profile.handle)}`;

    if (route.kind === "profile") {
      return { status: 200, meta: { type: "profile", url: this.absolute(base), image: profileImage,
        title: `${name} (@${profile.handle}) · ${SITE_NAME}`,
        description: plain(profile.bio_plain, DESCRIPTION_LIMIT) || `${name}'s recommendations on ${SITE_NAME}.` } };
    }

    const label = CATEGORY_LABELS[route.category];
    if (route.kind === "category") {
      const open = (await this.pool.query(SHARE_CATEGORY_SQL, [profile.id, route.category])).rowCount;
      if (!open) return { status: 404, meta: this.site("/404") };
      return { status: 200, meta: { type: "website", url: this.absolute(`${base}/${route.category}`), image: profileImage,
        title: `${name}'s ${label} · ${SITE_NAME}`, description: `${label} recommended by ${name} on ${SITE_NAME}.` } };
    }

    const list = (await this.pool.query<ListRow>(SHARE_LIST_SQL, [profile.id, route.category, route.slug])).rows[0];
    if (!list) return { status: 404, meta: this.site("/404") };
    const title = plain(list.title, 120) || label;
    return { status: 200, meta: { type: "website", url: this.absolute(`${base}/${route.category}/${encodeURIComponent(route.slug)}`),
      image: this.media(list.cover_media_id) ?? profileImage,
      title: `${title} · ${name} · ${SITE_NAME}`,
      description: plain(list.description, DESCRIPTION_LIMIT) || `${label} recommended by ${name} on ${SITE_NAME}.` } };
  }
}

function requestedPath(request: Request): string {
  const header = request.get(SHARE_PATH_HEADER);
  return typeof header === "string" && header.length <= 2048 ? header : "/404";
}

export function setupExplorersSharePageRoutes(app: Express, service: Pick<SharePageService, "page">): void {
  app.get("/api/explorers/v1/share-page", async (request: Request, response: Response) => {
    let page: SharePage;
    try {
      page = await service.page(requestedPath(request));
    } catch (error) {
      // nginx answers 5xx with the static shell (error_page in @share), so the SPA still renders.
      console.warn("Share page read failed:", error);
      response.status(503).type("text/plain").set("Cache-Control", "no-store").send("share page unavailable");
      return;
    }
    // no-store, as for index.html: the expanded document names this release's hashed
    // assets, and a cached copy outliving the release breaks the page.
    response.status(page.status).type("text/html").set("Cache-Control", "no-store").send(renderShareDocument(page.meta));
  });
}
