# Plan B — Paste-a-link enrichment with fetch-to-own-S3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner paste a URL when adding a Product, App or Person, see the title, description and images found there, confirm which of them to keep, and have the confirmed images stored in our own private S3 and shown on the public page.

**Architecture:** Two on-demand owner routes. *Observe* fetches the pasted page through a new hardened open-host fetcher (SSRF floor, robots honoured, denylist, per-account budget) and returns candidate text fields plus candidate **remote** image URLs — nothing is stored yet. *Accept* fetches only the images the owner selected, stores each through `MediaService.createMedia`, and attaches them to the category's existing media table inside a three-phase command receipt. Public visibility then comes for free from Plan A's gate.

**Tech Stack:** TypeScript (strict), Node `https` with pinned DNS, PostgreSQL via `pg`, Express, Vitest, React 18.

**Prerequisite:** **Plan A must land first.** Plan B stores products and people images in `recommendation_media`, which only becomes publicly servable once Plan A widens the gate (`mediaRepository.ts:101-102`). Without it, enrichment would store images the public can never load.

---

## Decisions implemented

| Decision | Choice |
|---|---|
| Categories | **Products, Apps, People** |
| Host policy | **Any public host**, robots.txt honoured, plus a denylist editable without a deploy |
| Images | **Owner confirms each** before anything is fetched or stored |
| Trigger | **On demand** when the owner pastes, with a per-account budget |
| Blocked sites | **Fail gracefully** to manual entry plus upload. No bot-detection evasion. |

## Scope boundary stated once

The retired implementation worked partly by evading bot detection — a stealth plugin, spoofed `Referer`/`Origin` headers to bypass Instagram's protections, LinkedIn routed via DuckDuckGo. **None of that is reinstated.** This fetcher identifies itself honestly, honours robots.txt and honours a block. The consequence is accepted up front: for sites that refuse automated access — Instagram and LinkedIn in particular — enrichment will fail and the owner falls back to manual entry plus upload. People will therefore benefit least of the three categories.

`tunes/server/utils/priceParsing.ts:5-6` records that the old endpoints are tombstoned and that "reviving it is forbidden by epic-04 and epic-07". That prohibition was raised with the owner, who directed this work to proceed on the terms above. This plan deliberately does **not** revive any tombstoned path.

## What this plan does NOT need (verified)

Because Plan A makes `recommendation_media` publicly servable for products and people, and `recommendation_app_screenshots` already is for apps:

- **No migration.** No new attachment table, so no guard triggers, and no edit to the three `TG_TABLE_NAME` allowlists (the current versions live in `tunes/migrations/0054_explorers_place_individual_pins.sql`, not 0035).
- **No new `isPublicAttachment` arm.** Products and people reuse the generic arm; apps reuses its typed arm.
- **No change to `appEnrichmentFetch.ts`.** It is in live use by Apps enrichment and sealed by contract tests. Relaxing its `allowedHosts` validator would *break* it anyway: the URL gate at `appEnrichmentFetch.ts:90` independently requires `allowedHosts.includes(url.hostname)`, so an empty list rejects every URL. Plan B adds a **separate** fetcher and leaves that one untouched.
- **No new media purpose.** `purpose:'recommendation'` already carries a 5 MiB limit (`tunes/server/application/media.ts:28-29`) and satisfies every attachment guard.

## Staging without a staging table

Unattached `media_assets` rows are already the staging mechanism: the gate requires an attachment, so a stored-but-unattached asset is owner-visible and publicly refused, and `MediaRepository.abandoned` (`mediaRepository.ts:149-166`) sweeps `ready` assets with no attachment after 24 hours. Accept therefore stores and attaches in one flow, and a failure path deletes what it uploaded — exactly as `bookCoverImport.ts:66` does.

---

## File structure

| File | Responsibility |
|---|---|
| `tunes/server/services/robotsPolicy.ts` | **New.** Fetch, parse and cache a host's robots.txt; answer "may we fetch this path". Nothing in the repo does this today. |
| `tunes/server/services/linkEnrichmentFetch.ts` | **New.** Open-host hardened fetcher with an HTML profile and an image profile. |
| `tunes/server/services/linkEnrichmentBudget.ts` | **New.** Per-account and global budget, modelled on `GameProviderCoordinator`. |
| `tunes/server/application/linkEnrichmentDecode.ts` | **New.** Pure extraction of title/description/image URLs from fetched HTML. |
| `tunes/server/application/linkEnrichmentImport.ts` | **New.** Observe and accept commands, three-phase receipt. |
| `tunes/server/routes/explorersLinkEnrichmentRoutes.ts` | **New.** Two owner POSTs plus their `ALL` 405 guards. |
| `tunes/shared/explorersLinkEnrichmentContract.ts` | **New.** Zod request/response contracts. |
| `tunes/server/policies/musicSurfacePolicy.ts` | Allowlist the two new routes as `explorers-owner`. |
| `explorers-earth/src/features/*/components/dashboard/LinkEnrichmentPanel.tsx` | **New.** Shared owner panel; mounted by Products, Apps and People add/edit pages. |

---

## Task 1: Robots policy

Nothing in the repo reads a third-party robots.txt — verified by searching `robots`, `robotstxt`, `user-agent:` and `disallow`; every hit is our own served `robots.txt` or a `<meta name="robots">`. This is built from scratch, and it is the gate that makes open-host fetching defensible.

**Files:**
- Create: `tunes/server/services/robotsPolicy.ts`
- Test: `tunes/server/test/contracts/robots-policy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseRobots, robotsAllows } from "../../services/robotsPolicy";

describe("robots policy", () => {
  it("honours a wildcard disallow", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /private\n");
    expect(robotsAllows(rules, "/private/thing")).toBe(false);
    expect(robotsAllows(rules, "/public")).toBe(true);
  });

  it("prefers our own user-agent group over the wildcard", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: ExplorersEarthBot\nAllow: /products\nDisallow: /\n");
    expect(robotsAllows(rules, "/products/1")).toBe(true);
    expect(robotsAllows(rules, "/other")).toBe(false);
  });

  it("applies the longest matching rule, allow winning a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a/b\n");
    expect(robotsAllows(rules, "/a/b/c")).toBe(true);
    expect(robotsAllows(rules, "/a/x")).toBe(false);
  });

  it("treats an empty disallow as permission", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "/anything")).toBe(true);
  });

  it("fails closed on an unparsable or oversized body", () => {
    expect(robotsAllows(parseRobots("x".repeat(500_001)), "/a")).toBe(false);
  });

  it("allows everything when robots.txt is absent", () => {
    expect(robotsAllows(parseRobots(undefined), "/a")).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd tunes && npx vitest run server/test/contracts/robots-policy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Third-party robots.txt. Nothing in this repository read one before: the only robots
 * code served our own. Open-host fetching is only defensible if a site's stated wishes
 * are honoured, so this is a gate, not a nicety.
 *
 * Deliberately conservative: an absent robots.txt permits (that is the standard), but an
 * oversized or unparsable one refuses, because we cannot claim consent we could not read.
 */
export type RobotsRules = { groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> } | "unreadable" | "absent";
export const USER_AGENT = "ExplorersEarthBot";

export function parseRobots(body: string | undefined): RobotsRules {
  if (body === undefined) return "absent";
  if (body.length > 500_000) return "unreadable";
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; path: string }> }> = [];
  let current: { agents: string[]; rules: Array<{ allow: boolean; path: string }> } | undefined;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase(), value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase()); lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) { current = { agents: ["*"], rules: [] }; groups.push(current); }
      lastWasAgent = false;
      // An empty Disallow is explicit permission; an empty Allow says nothing.
      if (value === "") { if (field === "disallow") current.rules.push({ allow: true, path: "/" }); }
      else current.rules.push({ allow: field === "allow", path: value });
    } else lastWasAgent = false;
  }
  return { groups };
}

export function robotsAllows(rules: RobotsRules, path: string): boolean {
  if (rules === "absent") return true;
  if (rules === "unreadable") return false;
  const ours = rules.groups.find(g => g.agents.includes(USER_AGENT.toLowerCase()));
  const group = ours ?? rules.groups.find(g => g.agents.includes("*"));
  if (!group) return true;
  // Longest match wins; a tie goes to allow, per the de facto standard.
  let best: { allow: boolean; path: string } | undefined;
  for (const rule of group.rules) {
    if (!path.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
cd tunes && npx vitest run server/test/contracts/robots-policy.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add tunes/server/services/robotsPolicy.ts tunes/server/test/contracts/robots-policy.test.ts
git commit -m "feat(enrichment): honour a third-party robots.txt"
```

---

## Task 2: Open-host hardened fetcher

Copy the hardening of `bookCoverFetch.ts` — which pins its host *in the type system* (`servername:'books.google.com'` is a literal type) — and generalise the host while keeping every other control. The SSRF floor is host-independent, which is why opening the host list does not weaken it.

**Files:**
- Create: `tunes/server/services/linkEnrichmentFetch.ts`
- Test: `tunes/server/test/contracts/link-enrichment-fetch.test.ts`

- [ ] **Step 1: Write the failing tests**

Drive them through the deterministic fixture seam, exactly as `bookCoverFetch.ts` does (`Fixture` with `resolve`/`connect`), so no test performs real I/O.

```ts
it("refuses a host that resolves to a private address", async () => {
  const fetcher = createLinkFetcher({ profile: "html", fixture: { mode: "deterministic-fixture", resolve: async () => [{ address: "10.0.0.5", family: 4 }], connect: async () => { throw new Error("must not connect"); } } });
  await expect(fetcher.fetch("https://example.com/p")).rejects.toThrow();
});

it("refuses a denylisted host before resolving it", async () => {
  const fetcher = createLinkFetcher({ profile: "html", denylist: ["blocked.example"], fixture: { mode: "deterministic-fixture", resolve: async () => { throw new Error("must not resolve"); }, connect: async () => { throw new Error("must not connect"); } } });
  await expect(fetcher.fetch("https://blocked.example/p")).rejects.toThrow();
});

it("refuses a path robots.txt disallows", async () => { /* robots fixture returns Disallow: /p */ });
it("refuses a declared length over the cap", async () => { /* connect returns length 6 MiB */ });
it("refuses when streamed bytes exceed the cap", async () => { /* body yields 6 MiB in chunks */ });
it("refuses an image whose magic bytes contradict its content-type", async () => { /* image profile, png header, jpeg type */ });
it("refuses a redirect to a different host under same-host policy", async () => { /* 302 cross-host */ });
it("accepts a well-formed html document", async () => { /* status 200, text/html, small body */ });
```

Fill each stub using the fixture shape; every one must assert a rejection or a concrete success value, not merely "does not throw".

- [ ] **Step 2: Run and confirm failure**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-fetch.test.ts
```

- [ ] **Step 3: Implement**

Reuse these verbatim from `tunes/server/services/bookCoverFetch.ts`: `publicAddress()` (export and import it rather than copying — it is already exported at `:9`), `connect()`'s option set (`agent:false`, `family`, `autoSelectFamily:false`, `servername` set to the request hostname, `rejectUnauthorized:true`, and the `lookup` callback returning the pinned literal address), and `sniff()`.

Differences to implement deliberately:

```ts
export type LinkHostPolicy = { kind: "any"; denylist: readonly string[] } | { kind: "allowlist"; hosts: readonly string[] };
export type LinkProfile = "html" | "image";
```

- URL gate: `https:` only, length ≤ 2048, no userinfo, port absent or `443`, hostname must be a dotted name and **not** an IP literal, and — for `kind:"any"` — hostname must not match the denylist (compare the full hostname and any parent domain suffix, so `cdn.blocked.example` is covered by `blocked.example`).
- Robots: before connecting, fetch `https://<host>/robots.txt` through this same fetcher with an internal `robots` profile (cap 500 KB, 2 s deadline, cached per host for 1 hour, and **not** itself robots-gated), then `robotsAllows(rules, url.pathname)`. A robots fetch that errors is treated as `"absent"`; a robots fetch that returns a body too large is `"unreadable"` and therefore refuses.
- Profiles: `html` admits only `text/html` and caps at 1 MiB; `image` admits `image/png|jpeg|webp|gif`, caps at 5 MiB to match the `recommendation` purpose limit (`media.ts:28-29`), and requires `sniff(bytes) === declared mimeType`.
- Redirects: at most 3, `same-host` only, each hop re-validated through the full gate including `publicAddress` — mirroring `appEnrichmentFetch.ts:96`, which re-checks per hop.
- Identify honestly: send `User-Agent: ExplorersEarthBot (+https://explorers.earth/bot)` and `Accept-Encoding: identity`. Do not set `Referer` or `Origin`. Do not retry a `403`, `429` or `503` — surface it so the caller can fall back to manual entry.

- [ ] **Step 4: Run and confirm pass, then commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-fetch.test.ts
git add tunes/server/services/linkEnrichmentFetch.ts tunes/server/test/contracts/link-enrichment-fetch.test.ts
git commit -m "feat(enrichment): open-host fetcher with the pinned-host hardening retained"
```

---

## Task 3: Per-account budget

Owner enrichment routes have **no** HTTP rate limit today; `express-rate-limit` is applied only to public reads. An on-demand fetcher behind owner auth is an outbound-request amplifier, so this is required, not optional.

**Files:**
- Create: `tunes/server/services/linkEnrichmentBudget.ts`
- Test: `tunes/server/test/contracts/link-enrichment-budget.test.ts`

- [ ] **Step 1: Write the failing tests**

Model the shape on `GameProviderCoordinator` (`tunes/server/services/gameProviderBudget.ts`), including its injected clock so tests are deterministic.

```ts
it("allows 30 observations per account per minute and refuses the 31st", () => { /* advance clock, assert 429 */ });
it("refuses a second concurrent request for the same account", () => { /* reserveAccount twice */ });
it("releases a slot idempotently", () => { /* call release twice, assert one slot freed */ });
it("caps global concurrent callers", () => { /* reserveCaller beyond the ceiling throws busy */ });
it("caps concurrent image bytes in flight", () => { /* reserveMemory beyond ceiling throws busy */ });
```

- [ ] **Step 2: Run, confirm failure, then implement**

Copy `GameProviderCoordinator`'s four mechanisms verbatim in structure: `reserveCaller()` against a global ceiling, `reserveAccount()` as a `Set` giving one in flight per account, `rate(account)` as a fixed 60 s window anchored at the first call with a 30-per-account cap and a 10 000 distinct-account ceiling, and `reserveMemory(n)` for concurrent image bytes. Every reservation returns an idempotent `once()` release so a double release cannot leak a slot.

- [ ] **Step 3: Confirm pass and commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-budget.test.ts
git add tunes/server/services/linkEnrichmentBudget.ts tunes/server/test/contracts/link-enrichment-budget.test.ts
git commit -m "feat(enrichment): per-account and global fetch budget"
```

---

## Task 4: Denylist, editable without a deploy

`system_settings` is in the canonical chain (`tunes/migrations/0001_runtime_baseline.sql`), so the denylist needs **no migration**.

**Files:**
- Modify: `tunes/server/services/system-settings.ts`
- Test: `tunes/server/test/contracts/link-enrichment-denylist.test.ts`

- [ ] **Step 1: Confirm the table's shape before relying on it**

```bash
cd tunes && grep -n "system_settings" migrations/0001_runtime_baseline.sql
grep -n "export" server/services/system-settings.ts | head -20
```

If `system_settings` is not a key/value shape that can hold a JSON array, stop and add a four-line migration creating `enrichment_host_denylist(host text primary key, added_at timestamptz not null default now())` with a `music_runtime` grant, and append it to the chain per `tunes/shared/music-migration-contract.ts` (constant at `:1`, chain array `:56-59`, markers array `:116-119`, plus `music-migration-contract.test.ts:28,75` and `docs/architecture/music-documentation-contract.json`).

- [ ] **Step 2: Write the failing test**

```ts
it("refuses a denylisted host and its subdomains", async () => {
  await setEnrichmentDenylist(pool, ["blocked.example"]);
  expect(await enrichmentHostDenied(pool, "blocked.example")).toBe(true);
  expect(await enrichmentHostDenied(pool, "cdn.blocked.example")).toBe(true);
  expect(await enrichmentHostDenied(pool, "notblocked.example")).toBe(false);
});

it("treats an unreadable denylist as denying everything", async () => {
  await pool.query("UPDATE system_settings SET value='not json' WHERE key='enrichment_host_denylist'");
  expect(await enrichmentHostDenied(pool, "anything.example")).toBe(true);
});
```

The second case is the important one: a corrupt denylist must fail **closed**, or a bad write silently reopens every blocked host.

- [ ] **Step 3: Implement, confirm pass, commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-denylist.test.ts
git add tunes/server/services/system-settings.ts tunes/server/test/contracts/link-enrichment-denylist.test.ts
git commit -m "feat(enrichment): host denylist that fails closed"
```

---

## Task 5: Decode fetched HTML into candidates

Untrusted HTML must not be parsed inline. The codebase already isolates this: `appEnrichmentOwnedDecoder.ts` runs decoding in a worker thread under a custody policy. Match that rather than parsing in the request path.

**Files:**
- Create: `tunes/server/application/linkEnrichmentDecode.ts`
- Test: `tunes/server/test/contracts/link-enrichment-decode.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("extracts Open Graph title, description and images", () => { /* og:title, og:description, og:image */ });
it("falls back to <title> and meta description", () => {});
it("extracts JSON-LD Product name, description and image array", () => {});
it("resolves relative image URLs against the document URL", () => {});
it("discards non-https and data: image URLs", () => {});
it("caps candidates at 10 images and bounds every string", () => {});
it("never executes script content", () => { /* body containing <script>throw</script> decodes cleanly */ });
```

The retired decoder's helpers are recoverable for reference — `git show c7d8a6b7^:tunes/server/utils/scrapeUtils.ts` has `extractMeta`, `extractTitle`, `extractJsonLd`, `parseProductJsonLd`, `decodeHtmlEntities` — but reimplement rather than restore, because the old file also carried the evasion behaviour this plan excludes.

- [ ] **Step 2: Run, confirm failure, implement as a pure function over a string**

Bound every output: title ≤ 300 chars, description ≤ 2000, at most 10 image URLs, each ≤ 2048 chars and `https:` only. Return `{ title?, description?, imageUrls: string[] }`. No DOM library that executes script; a regex/streaming extractor over the bounded body is sufficient and is what the bounds exist to permit.

- [ ] **Step 3: Confirm pass and commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-decode.test.ts
git add tunes/server/application/linkEnrichmentDecode.ts tunes/server/test/contracts/link-enrichment-decode.test.ts
git commit -m "feat(enrichment): bounded decode of fetched page metadata"
```

---

## Task 6: Observe and accept commands

**Files:**
- Create: `tunes/shared/explorersLinkEnrichmentContract.ts`
- Create: `tunes/server/application/linkEnrichmentImport.ts`
- Test: `tunes/server/test/explorers/link-enrichment.integration.test.ts`

- [ ] **Step 1: Define the contract**

```ts
export const observeLinkSchema = z.object({ url: z.string().url().max(2048), expectedRevision: z.number().int().nonnegative() }).strict();
export const linkCandidateSchema = z.object({ title: z.string().max(300).nullable(), description: z.string().max(2000).nullable(),
  imageUrls: z.array(z.string().url().max(2048)).max(10), sourceUrl: z.string().url(), observedAt: z.string() }).strict();
export const acceptLinkSchema = z.object({ expectedRevision: z.number().int().nonnegative(), sourceUrl: z.string().url().max(2048),
  fields: z.array(z.enum(["title", "description"])).max(2), imageUrls: z.array(z.string().url().max(2048)).max(10) }).strict();
```

Accept carries the **URLs the owner chose**, re-validated server side against a fresh observe of the same `sourceUrl`, so a client cannot smuggle an arbitrary URL into the image fetcher.

- [ ] **Step 2: Write the failing integration tests**

```ts
it("observes candidates without storing anything", async () => { /* assert no media_assets row created */ });
it("stores only the images the owner accepted", async () => { /* 3 candidates, accept 1, assert exactly 1 media row attached */ });
it("rejects an accepted URL that the page does not actually offer", async () => { /* 422 */ });
it("is idempotent under a replayed Idempotency-Key", async () => { /* second call returns the first response, no second upload */ });
it("deletes uploaded bytes when attachment fails", async () => { /* force a stale revision, assert media pending_delete */ });
it("refuses when the account is over budget", async () => { /* 429 */ });
it("surfaces a 403 from the target as a graceful failure, not a 500", async () => {});
```

- [ ] **Step 3: Implement, following `bookCoverImport.ts` structure exactly**

Copy its flow, substituting the attachment target. Specifically reuse: the advisory lock with its **own** namespace integer — `44035` is the book-cover receipt serializer, `44024` is the media upload gate, `44031` is the category content-revision namespace, so pick an unused one and comment it; the `application_command_receipts` three-phase lifecycle (`pending` at `bookCoverImport.ts:35` → staged updates `:43,:47` → `completed` `:61` or `retired` + media deletion `:66`); `this.media.usingConnection(db)` so the upload shares the reserved connection; the `createMedia(actor, {purpose:'recommendation', filename, mimeType, length, bytes}, context, readyWrite)` call with the receipt staged **inside** `readyWrite`; and the lock release in `finally`.

Attachment target by category:

```ts
 // Products and people reuse the generic table Plan A made public; apps uses its typed one.
 if (category === 'apps') await writeAppScreenshots(db, accountId, id, [...existing, ...accepted].slice(0, 10));
 else for (const [position, mediaId] of accepted.entries())
   await db.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,$4)', [id, accountId, mediaId, existingCount + position]);
```

Accepted text fields go through the existing display-overrides path, mirroring `explorersAppEnrichmentRepository.ts:79-81`: read `recommendation_display_overrides … FOR UPDATE`, merge, write back, and bump `recommendations.revision` only if something changed.

- [ ] **Step 4: Confirm pass and commit**

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers/link-enrichment.integration.test.ts
git add tunes/shared/explorersLinkEnrichmentContract.ts tunes/server/application/linkEnrichmentImport.ts tunes/server/test/explorers/link-enrichment.integration.test.ts
git commit -m "feat(enrichment): observe and accept commands with a durable receipt"
```

---

## Task 7: Routes, policy and the generated inventory

Three artifacts move together here. Getting this wrong fails the contract suite rather than production, but it fails it loudly.

**Files:**
- Create: `tunes/server/routes/explorersLinkEnrichmentRoutes.ts`
- Modify: `tunes/server/policies/musicSurfacePolicy.ts`
- Modify: `docs/architecture/music-runtime-surface-inventory.json`, `docs/architecture/music-authorization-matrix.json`
- Modify: `tunes/server/test/contracts/runtime-surface-inventory.test.ts:13-23`
- Modify: `.github/workflows/test.yml:225`

- [ ] **Step 1: Register the routes, literally**

Registrations must be literal string arguments — interpolated or looped paths are invisible to the AST inventory (`explorersRecommendationRoutes.ts:97-98` says so). Follow `:116` and its guard at `:129`:

```ts
  routes.post('/api/explorers/v1/recommendations/:id/link-enrichment/observe',mutation((a,id,b,c)=>enrichment.observe(a,id,b,c),'linkEnrichmentObserve'));
  routes.post('/api/explorers/v1/recommendations/:id/link-enrichment/accept',mutation((a,id,b,c)=>enrichment.accept(a,id,b,c),'linkEnrichmentAccept'));
  routes.all('/api/explorers/v1/recommendations/:id/link-enrichment/observe',unsupported);
  routes.all('/api/explorers/v1/recommendations/:id/link-enrichment/accept',unsupported);
```

These paths are canonical and collide with **none** of the retirement guards: the tombstones cover `/api/products`, `/api/people`, `/api/apps`, `/api/proxy-image` and their unprefixed twins, so the 410 `SURFACE_REMOVED` contract is untouched.

- [ ] **Step 2: Allowlist both as `explorers-owner`**

The allowlist is fail-closed — an undeclared route classifies as a tombstone (`musicSurfacePolicy.ts:215-218`). Add both POSTs, one method and path at a time, to the block that ends at `:226`. Do **not** list the `ALL` guards; they classify as tombstones by design (`:233-234`).

- [ ] **Step 3: Regenerate both documents, in this order**

The matrix reads the inventory **file**, so a reversed order rebuilds it from a stale inventory.

```bash
cd tunes && npx tsx scripts/inventory-runtime-surfaces.ts --write && npx tsx scripts/generate-music-authorization-matrix.ts
```

- [ ] **Step 4: Update the count pins to the regenerated values**

`runtime-surface-inventory.test.ts:21-23` pins exact counts. Read the regenerated JSON and set them to the actual numbers — do not guess:

```bash
cd tunes && node -e "const i=require('../docs/architecture/music-runtime-surface-inventory.json');console.log('routes',i.routes.length,'events',i.events.length,'jobs',i.jobs.length)"
```

Expect routes to rise by 4 (two POSTs plus two `ALL` guards) and jobs to rise by the number of `setTimeout`/`setInterval` calls the new fetcher and robots cache introduce — `appEnrichmentFetch.ts`'s deadline timer is already counted as a job at `:25`, so the new fetcher's will be too. Update the arithmetic comment at `:13` to explain the delta, in the style already there.

- [ ] **Step 5: Register the new integration test in the PR lane**

`.github/workflows/test.yml:225` names every integration file explicitly. Add `server/test/explorers/link-enrichment.integration.test.ts`, or it never runs on a PR.

- [ ] **Step 6: Run the full contract suite and commit**

```bash
cd tunes && npx vitest run server/test/contracts/
```

Expected: PASS, including `runtime-surface-inventory`, `music-authorization-matrix` and `music-security-containment` — the last confirms the tombstoned paths still answer 410.

```bash
git add tunes/server/routes/explorersLinkEnrichmentRoutes.ts tunes/server/policies/musicSurfacePolicy.ts docs/architecture/ tunes/server/test/contracts/runtime-surface-inventory.test.ts .github/workflows/test.yml
git commit -m "feat(enrichment): register the observe and accept routes with regenerated inventory"
```

---

## Task 8: Owner panel

One shared component, mounted by all three add/edit pages. Model it on `AppEnrichmentPanel.tsx`, whose acceptance discipline is the pattern to copy.

**Files:**
- Create: `explorers-earth/src/features/shared/components/LinkEnrichmentPanel.tsx`
- Modify: `AddProductPage.tsx`, `AddAppPage.tsx`, `AddPersonPage.tsx`
- Test: `explorers-earth/src/features/shared/components/__tests__/linkEnrichmentPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it("stores nothing until the owner accepts", async () => { /* observe, assert no accept call */ });
it("accepts only the checked fields and images", async () => { /* check 1 of 3 images, assert payload */ });
it("resets the selection when the owner or route changes", async () => {});
it("blocks accepting while manual edits are unsaved", async () => {});
it("shows a manual-entry fallback when the site refuses", async () => { /* 403 -> message, upload still available */ });
it("disables every control while a command is in flight", async () => {});
```

- [ ] **Step 2: Implement, carrying over three structural choices from `AppEnrichmentPanel.tsx`**

Selection scoped to one observation (`{sourceUrl, fields[], imageUrls[]}`), so two observations cannot be mixed into one acceptance (`:8`). Selection reset on any scope change (`:15`, keyed on account, generation, resource, route). And a single `locked` predicate gating every control (`:13`), with the explicit warning that unsaved manual edits are not included (`:21-22`).

Add what Apps does not have: a per-image checkbox with the **remote** preview and its source link, plus the sentence that accepting copies that image onto Explorers' own storage. The owner is told what the action does before they take it.

- [ ] **Step 3: Confirm pass, run the serial lane, commit**

```bash
cd explorers-earth && npx vitest run src/features/shared && npx vitest run --no-file-parallelism
git add explorers-earth/src/features
git commit -m "feat(enrichment): owner panel that confirms each field and image"
```

---

## Task 9: Wire the fetcher into production composition

`appEnrichmentFetch` ships **dormant** — `canonicalApp.ts:108` passes `options.appEnrichmentChoices ?? []`, and only the fixture app supplies a registry. Plan B's fetcher must be deliberately switched on, with the denylist read from the database rather than baked in.

**Files:**
- Modify: `tunes/server/auth/canonicalApp.ts`
- Test: `tunes/server/test/contracts/link-enrichment-composition.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("composes a live fetcher with the database denylist and a budget", () => { /* assert the service is constructed with both */ });
it("performs no I/O when enrichment is disabled by configuration", () => { /* assert fetch is never called */ });
```

The second keeps the dormant-by-configuration property: enrichment must be switchable off without removing the code.

- [ ] **Step 2: Implement, confirm pass, commit**

Construct the service as `canonicalApp.ts:107` does for book covers — `new LinkEnrichmentService(pool, new MediaService(pool, options.mediaStorage), options.linkFetcher)` — defaulting `options.linkFetcher` to a live fetcher whose host policy is `{ kind: "any", denylist }` read from the database, and gate the whole feature behind an explicit option so it can be disabled.

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-composition.test.ts
git add tunes/server/auth/canonicalApp.ts tunes/server/test/contracts/link-enrichment-composition.test.ts
git commit -m "feat(enrichment): compose the live fetcher with the database denylist"
```

---

## Risks accepted, recorded once

- **Open-host fetching rehosts third parties' images.** The per-image owner confirmation is the mitigation: a human decides before anything is stored, and the panel says plainly what accepting does. The legal exposure is broader than a curated allowlist would carry, and the owner has accepted that; the denylist is the lever for responding to a complaint without a deploy.
- **Sites that block automation will fail.** No evasion is added, so Instagram and LinkedIn will mostly refuse. The fallback is manual entry plus upload, which Plan A makes publicly visible.
- **SSRF is the one risk open hosts do not increase.** `publicAddress()` is host-independent and is re-checked per redirect hop with DNS pinned into the connect. Reuse it; do not write a second address policy.
- **Amazon's terms prohibit scraping**, and its product images are the most likely target. A denylist entry is the mechanism if that becomes a problem.
- **The old Puppeteer path stays retired** along with its 248-finding CVE suppression. Nothing here launches a browser.

## Out of scope

- Books, movies and games — they already have real provider imports (Google Books, TMDB) that fetch and store correctly.
- Reviving any tombstoned path. All four stay 410.
- Changing `appEnrichmentFetch.ts` or the Apps enrichment registry. Plan B is additive.
- A GPT/MCP plugin that searches and hands back a URL. Worth noting as the owner's own idea and a genuinely cheaper path, since it puts the fetch on the user's side — but it is a separate piece of work.
