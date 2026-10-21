import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  SHARE_CATEGORY_SQL, SHARE_LIST_SQL, SHARE_PROFILE_SQL, SharePageService, classifySharePath, escapeHtml,
  setupExplorersSharePageRoutes,
} from "../routes/explorersSharePageRoutes";

const ORIGIN = "https://explorers.test";
const DEFAULT_IMAGE = `${ORIGIN}/images/explorershero.png`;
const ACCOUNT = "11111111-1111-4111-8111-111111111111";

type Fixture = {
  profile?: Record<string, unknown>;
  publicCategories?: string[];
  lists?: Record<string, Record<string, unknown>>;
};

/**
 * Stands in for Postgres by answering only what the SQL's own predicates would.
 * The fixture holds what is PUBLIC; anything absent from it plays the part of a
 * hidden, private, draft or archived row - the database's gate filtering it out.
 * The predicates themselves are pinned separately below.
 */
function fakePool(fixture: Fixture) {
  const queries: unknown[][] = [];
  const pool = {
    async query(sql: string, params: unknown[]) {
      queries.push(params);
      if (sql === SHARE_PROFILE_SQL) {
        const p = fixture.profile;
        return { rows: p && String(p.handle).toLowerCase() === String(params[0]).toLowerCase() ? [p] : [], rowCount: p ? 1 : 0 };
      }
      if (sql === SHARE_CATEGORY_SQL) {
        const open = fixture.publicCategories?.includes(String(params[1])) ?? false;
        return { rows: open ? [{}] : [], rowCount: open ? 1 : 0 };
      }
      if (sql === SHARE_LIST_SQL) {
        const row = fixture.publicCategories?.includes(String(params[1])) ? fixture.lists?.[`${params[1]}/${params[2]}`] : undefined;
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  return { pool, queries };
}

const ada = { id: ACCOUNT, handle: "Ada", display_name: "Ada Lovelace", bio_plain: "Engines & poetry.", profile_media_id: "aaaaaaaa-0000-4000-8000-000000000001" };

function app(fixture: Fixture) {
  const instance = express();
  setupExplorersSharePageRoutes(instance, new SharePageService(fakePool(fixture).pool, ORIGIN));
  return instance;
}

const get = (fixture: Fixture, path: string) =>
  request(app(fixture)).get("/api/explorers/v1/share-page").set("X-Explorers-Path", path);

function meta(html: string, key: string): string | undefined {
  const match = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)" />`));
  return match?.[1];
}

describe("share page routing", () => {
  it.each([
    ["/", "app"], ["/about", "app"], ["/login?next=/x", "app"], ["/recommendations/books/123/add", "app"],
    ["/guides/abc/edit", "app"], ["/somelist/new", "app"], ["/google-auth/callback", "app"], ["/404", "app"],
    ["/ada", "profile"], ["/ada/", "profile"], ["/ada/books", "category"], ["/ada/movies/genre/drama", "category"],
    ["/ada/places/map", "category"], ["/ada/places/kyoto/placesmap", "category"], ["/ada/people/sector/science", "category"],
    ["/ada/books/favourites", "list"], ["/ada/places/kyoto/map", "list"], ["/ada/guides/a-week-in-rome", "list"],
    ["/ada/music", "notFound"], ["/ada/books/a/b", "notFound"], ["/ada/movies/genre", "notFound"],
    ["/a%2Fb", "notFound"], ["/%E0%A4%A", "notFound"], ["//evil.example", "notFound"], ["/a//b", "notFound"],
    ["/<script>", "notFound"], ["/ada/books/<x>", "notFound"],
  ])("%s -> %s", (path, kind) => {
    expect(classifySharePath(path).kind).toBe(kind);
  });

  it("covers every route the SPA declares outside :username/*", () => {
    // Break caught: a new top-level SPA page that this list does not know would be
    // read as a handle and answered 404, so the page renders with a 404 status.
    const root = resolve(import.meta.dirname, "..", "..", "..", "explorers-earth", "src", "routes");
    const paths: string[] = [];
    for (const file of ["AuthRoutes.tsx", "AppRoutes.tsx"]) {
      for (const m of readFileSync(resolve(root, file), "utf8").matchAll(/path="([^"]+)"/g)) paths.push(m[1]);
    }
    for (const m of readFileSync(resolve(root, "ProtectedRoutes.tsx"), "utf8").matchAll(/path="([^"]+)"/g)) {
      if (m[1] !== "/*") paths.push(m[1].startsWith("/") ? m[1] : `/${m[1]}`);
    }
    expect(paths.length).toBeGreaterThan(40);
    const concrete = paths.filter((p) => p !== "*" && p !== "/404")
      .map((p) => p.replace(/:[A-Za-z]+/g, "some-id").replace(/\*$/, "deep/path"));
    const misread = concrete.filter((p) => classifySharePath(p).kind !== "app");
    expect(misread).toEqual([]);
  });
});

describe("share page document", () => {
  it("wraps escaped meta in the shell's SSI includes and answers 200 for a public profile", async () => {
    const response = await get({ profile: ada }, "/ada");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text.startsWith('<!--# include virtual="/__explorers_shell/head.html" -->')).toBe(true);
    expect(response.text.endsWith('<!--# include virtual="/__explorers_shell/tail.html" -->')).toBe(true);
    expect(response.text).toContain("<title>Ada Lovelace (@Ada) · explorers</title>");
    expect(meta(response.text, "og:title")).toBe("Ada Lovelace (@Ada) · explorers");
    expect(meta(response.text, "description")).toBe("Engines &amp; poetry.");
    expect(meta(response.text, "og:description")).toBe("Engines &amp; poetry.");
    expect(meta(response.text, "og:url")).toBe(`${ORIGIN}/Ada`);
    expect(meta(response.text, "og:type")).toBe("profile");
    expect(meta(response.text, "og:image")).toBe(`${ORIGIN}/api/explorers/v1/media/${ada.profile_media_id}/content`);
    expect(meta(response.text, "twitter:card")).toBe("summary_large_image");
    expect(response.text).toContain(`<link rel="canonical" href="${ORIGIN}/Ada" />`);
  });

  it("uses the list's title, description and cover for a public list", async () => {
    const fixture = { profile: ada, publicCategories: ["books"],
      lists: { "books/favourites": { title: "Favourite books", description: "Ones I reread.", cover_media_id: "cccccccc-0000-4000-8000-000000000002" } } };
    const response = await get(fixture, "/ada/books/favourites?utm_source=x");
    expect(response.status).toBe(200);
    expect(meta(response.text, "og:title")).toBe("Favourite books · Ada Lovelace · explorers");
    expect(meta(response.text, "og:description")).toBe("Ones I reread.");
    expect(meta(response.text, "og:image")).toBe(`${ORIGIN}/api/explorers/v1/media/cccccccc-0000-4000-8000-000000000002/content`);
    // The query string never reaches the canonical.
    expect(meta(response.text, "og:url")).toBe(`${ORIGIN}/Ada/books/favourites`);
  });

  it("falls back from the list cover to the profile picture, then to the site default", async () => {
    const lists = { "apps/tools": { title: "Tools", description: null, cover_media_id: null } };
    const withPicture = await get({ profile: ada, publicCategories: ["apps"], lists }, "/ada/apps/tools");
    expect(meta(withPicture.text, "og:image")).toBe(`${ORIGIN}/api/explorers/v1/media/${ada.profile_media_id}/content`);
    expect(meta(withPicture.text, "og:description")).toBe("Apps &amp; Tools recommended by Ada Lovelace on explorers.");
    const bare = await get({ profile: { ...ada, profile_media_id: null }, publicCategories: ["apps"], lists }, "/ada/apps/tools");
    expect(meta(bare.text, "og:image")).toBe(DEFAULT_IMAGE);
    const profile = await get({ profile: { ...ada, profile_media_id: null, bio_plain: null } }, "/ada");
    expect(meta(profile.text, "og:image")).toBe(DEFAULT_IMAGE);
    expect(meta(profile.text, "og:description")).toBe("Ada Lovelace&#39;s recommendations on explorers.");
  });

  it("serves app pages 200 with the site's default metadata and the path as canonical", async () => {
    const response = await get({}, "/about");
    expect(response.status).toBe(200);
    expect(meta(response.text, "og:title")).toBe("explorers");
    expect(meta(response.text, "og:url")).toBe(`${ORIGIN}/about`);
    expect(meta(response.text, "og:image")).toBe(DEFAULT_IMAGE);
  });

  it("answers 404 with the SPA shell for unknown paths, handles and sub-paths", async () => {
    for (const path of ["/no-such-handle", "/ada/music", "/ada/books/a/b", "/404", "/%E0%A4%A", "/.env"]) {
      const response = await get({ profile: ada, publicCategories: ["books"] }, path);
      expect(response.status, path).toBe(404);
      expect(response.text, path).toContain('<!--# include virtual="/__explorers_shell/tail.html" -->');
      expect(response.text, path).not.toContain("Ada");
    }
  });

  it("answers 404 without the header, so a bare API call learns nothing", async () => {
    const response = await request(app({ profile: ada })).get("/api/explorers/v1/share-page");
    expect(response.status).toBe(404);
  });

  it("answers 503 when the read fails, which nginx turns into the static shell", async () => {
    const instance = express();
    setupExplorersSharePageRoutes(instance, { page: async () => { throw new Error("db down"); } });
    const response = await request(instance).get("/api/explorers/v1/share-page").set("X-Explorers-Path", "/ada");
    expect(response.status).toBe(503);
    expect(response.text).not.toContain("db down");
  });
});

describe("share page leakage", () => {
  const hidden = { title: "Secret list", description: "Do not show", cover_media_id: "dddddddd-0000-4000-8000-000000000003" };

  it("never names a hidden profile, private category, or unpublished list", async () => {
    // Hidden profile: the account gate returns no row.
    const gone = await get({}, "/ada");
    expect(gone.status).toBe(404);
    expect(gone.text).not.toMatch(/Ada|Lovelace/);
    // Private category: the profile is public, the category is not.
    const privateCategory = await get({ profile: ada, publicCategories: [], lists: { "books/secret": hidden } }, "/ada/books");
    expect(privateCategory.status).toBe(404);
    expect(privateCategory.text).not.toMatch(/Ada|Lovelace/);
    // List in a private category, and a list the gate filters (draft, private, archived).
    for (const fixture of [{ profile: ada, publicCategories: [], lists: { "books/secret": hidden } },
      { profile: ada, publicCategories: ["books"], lists: {} }]) {
      const response = await get(fixture, "/ada/books/secret");
      expect(response.status).toBe(404);
      expect(response.text).not.toMatch(/Secret|Do not show|dddddddd|Ada/);
    }
  });

  it("reads only through the public reader's gates", () => {
    // Break caught: a preview query without these predicates would print the title
    // of a draft, private or archived list, or of a non-public account, into HTML
    // that any client - not only the SPA's gated views - receives.
    for (const gate of ["a.status='active'", "a.onboarding_status='complete'", "a.public_profile=true"]) {
      expect(SHARE_PROFILE_SQL).toContain(gate);
    }
    expect(SHARE_PROFILE_SQL).toContain("pm.slot='profile'");
    expect(SHARE_PROFILE_SQL).toContain("m.status='ready'");
    expect(SHARE_CATEGORY_SQL).toContain("s.is_public");
    for (const gate of ["s.is_public", "c.archived_at IS NULL", "c.visibility='public'", "c.publication_state='published'",
      "cm.slot='cover'", "m.purpose='collection'", "m.status='ready'"]) {
      expect(SHARE_LIST_SQL).toContain(gate);
    }
    // Only fields a public page shows; never contact details or private settings.
    for (const sql of [SHARE_PROFILE_SQL, SHARE_LIST_SQL]) expect(sql).not.toMatch(/mobile|email|address/i);
  });
});

describe("share meta escaping", () => {
  const hostile = `"><script>alert(1)</script><!--# exec cmd="id" --> ' & $x \u0000`;

  it("escapes every HTML-significant character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("keeps hostile profile and list text inert in HTML and in nginx SSI", async () => {
    const fixture = { profile: { ...ada, display_name: hostile, bio_plain: hostile }, publicCategories: ["movies"],
      lists: { "movies/x": { title: hostile, description: hostile, cover_media_id: null } } };
    for (const path of ["/ada", "/ada/movies", "/ada/movies/x"]) {
      const response = await get(fixture, path);
      expect(response.status, path).toBe(200);
      const head = response.text.replace(/^<!--# include virtual="[^"]+" -->/, "").replace(/<!--# include virtual="[^"]+" -->$/, "");
      expect(head, path).not.toContain("<script");
      // The only SSI commands are the two includes this module writes.
      expect(head, path).not.toContain("<!--#");
      expect(head, path).not.toContain("\u0000");
      expect(head, path).toContain("&lt;script&gt;");
      // No attribute can be closed early: every quote inside a value is escaped.
      for (const tag of head.match(/<meta [^>]*>/g) ?? []) expect(tag, path).toMatch(/^<meta (?:property|name)="[^"]+" content="[^"]*" \/>$/);
    }
  });

  it("truncates long descriptions to one line", async () => {
    const response = await get({ profile: { ...ada, bio_plain: `line one
${"x".repeat(400)}` } }, "/ada");
    const description = meta(response.text, "og:description")!;
    expect(description.startsWith("line one x")).toBe(true);
    expect(description.endsWith("…")).toBe(true);
    expect(description.length).toBeLessThanOrEqual(200);
  });
});
