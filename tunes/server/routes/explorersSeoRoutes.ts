import type { Express } from "express";
import type { Pool } from "pg";

const EXPLORERS_BASE_URL = "https://explorers.earth";
const SITEMAP_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const SITEMAP_PROFILE_LIMIT = 1000;

export const EXPLORERS_STATIC_SITEMAP_URLS = [
  { loc: `${EXPLORERS_BASE_URL}/`, changefreq: "weekly", priority: 1.0 },
  { loc: `${EXPLORERS_BASE_URL}/about`, changefreq: "monthly", priority: 0.8 },
  { loc: `${EXPLORERS_BASE_URL}/use-cases`, changefreq: "monthly", priority: 0.8 },
  { loc: `${EXPLORERS_BASE_URL}/contact`, changefreq: "monthly", priority: 0.8 },
  { loc: `${EXPLORERS_BASE_URL}/privacy`, changefreq: "monthly", priority: 0.7 },
  { loc: `${EXPLORERS_BASE_URL}/terms`, changefreq: "monthly", priority: 0.7 },
  { loc: `${EXPLORERS_BASE_URL}/cookies`, changefreq: "monthly", priority: 0.6 },
  { loc: `${EXPLORERS_BASE_URL}/login`, changefreq: "monthly", priority: 0.5 },
  { loc: `${EXPLORERS_BASE_URL}/register`, changefreq: "monthly", priority: 0.5 },
] as const;

/** Mirrors the committed static robots.txt and points crawlers at the canonical sitemap. */
export const CANONICAL_ROBOTS_TXT = [
  "User-agent: *",
  "Allow: /",
  "",
  "Disallow: /api/",
  "Disallow: /login",
  "Disallow: /register",
  "",
  `Sitemap: ${EXPLORERS_BASE_URL}/sitemap.xml`,
  "",
].join("\n");

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface SitemapUrl { loc: string; lastmod?: string; changefreq?: string; priority?: number }

/** Byte-identical shape to seo-routes.ts:38 so the public document does not change. */
export function buildSitemapXml(urls: readonly SitemapUrl[]): string {
  const today = new Date().toISOString().split("T")[0];
  const entries = urls
    .map((u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq || "weekly"}</changefreq>
    <priority>${u.priority ?? 0.5}</priority>
  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}

/**
 * Every predicate here is the public profile reader's
 * (publicProfile/postgresPublicProfileGateway.ts resolveAccount), so the sitemap
 * cannot advertise a profile that reader answers 404 for.
 *
 * `a.updated_at` ALONE carries lastmod: account_category_settings has no
 * updated_at column (migrations/0022_explorers_identity.sql) and naming one
 * fails the query at runtime — invisibly, because the degraded path answers 200.
 *
 * `a.handle IS NOT NULL` is deliberately absent: the reader does not apply it and
 * creator_accounts_complete_valid already forces it for complete onboarding.
 */
export const PUBLIC_PROFILE_SITEMAP_SQL = `
  SELECT a.handle,
         a.updated_at,
         COALESCE(ARRAY_AGG(s.category ORDER BY s.category)
                  FILTER (WHERE s.is_public), '{}') AS public_categories
    FROM creator_accounts a
    JOIN account_presentation p ON p.account_id = a.id
    LEFT JOIN account_category_settings s ON s.account_id = a.id
   WHERE a.status = 'active'
     AND a.onboarding_status = 'complete'
     AND a.public_profile = true
   GROUP BY a.id, a.handle, a.updated_at
   ORDER BY a.handle
   LIMIT $1`;

function isoDay(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().split("T")[0];
}

export async function publicProfileSitemapUrls(pool: Pick<Pool, "query">): Promise<SitemapUrl[]> {
  const result = await pool.query(PUBLIC_PROFILE_SITEMAP_SQL, [SITEMAP_PROFILE_LIMIT]);
  const urls: SitemapUrl[] = [];
  for (const row of result.rows as Array<{ handle: string | null; updated_at: unknown; public_categories: unknown }>) {
    if (!row.handle) continue;
    const lastmod = isoDay(row.updated_at);
    urls.push({ loc: `${EXPLORERS_BASE_URL}/${row.handle}`, lastmod, changefreq: "weekly", priority: 0.9 });
    const categories = Array.isArray(row.public_categories) ? row.public_categories : [];
    for (const category of categories) {
      if (typeof category !== "string" || !category) continue;
      urls.push({ loc: `${EXPLORERS_BASE_URL}/${row.handle}/${category}`, lastmod, changefreq: "weekly", priority: 0.8 });
    }
  }
  return urls;
}

/**
 * Canonical robots.txt and sitemap, read from creator_accounts instead of Strapi.
 *
 * The rendered document is cached for an hour LAZILY, on first request. Warming it
 * at mount would fire a query during composition, which the composition contracts
 * assert never happens.
 */
export function setupExplorersSeoRoutes(app: Express, pool: Pick<Pool, "query">): void {
  let cache: { xml: string; timestamp: number } | undefined;

  app.get("/robots.txt", (_request, response) => {
    response.type("text/plain").set("Cache-Control", "public, max-age=3600").send(CANONICAL_ROBOTS_TXT);
  });

  const serveSitemap = async (_request: unknown, response: import("express").Response): Promise<void> => {
    if (cache && Date.now() - cache.timestamp < SITEMAP_CACHE_TTL) {
      response.type("application/xml").set("Cache-Control", "public, max-age=3600").send(cache.xml);
      return;
    }
    try {
      const xml = buildSitemapXml([...EXPLORERS_STATIC_SITEMAP_URLS, ...(await publicProfileSitemapUrls(pool))]);
      cache = { xml, timestamp: Date.now() };
      response.type("application/xml").set("Cache-Control", "public, max-age=3600").send(xml);
    } catch (error) {
      // A 5xx would teach crawlers the document is broken; serving the static pages
      // keeps the site indexable. X-Sitemap-Degraded is what distinguishes this from
      // a healthy but empty site — without it a permanently broken query is invisible.
      console.warn("Canonical sitemap degraded to static pages:", error);
      response.type("application/xml")
        .set("Cache-Control", "no-store")
        .set("X-Sitemap-Degraded", "true")
        .send(buildSitemapXml(EXPLORERS_STATIC_SITEMAP_URLS));
    }
  };

  app.get("/api/explorers-sitemap.xml", serveSitemap);
  app.get("/sitemap.xml", serveSitemap);
}
