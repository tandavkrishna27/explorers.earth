# Plan B — Paste-a-link enrichment with fetch-to-own-S3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner paste a URL when adding a Product, App or Person, see the title, description and images found there, confirm which to keep, and have the confirmed images stored in our own private S3 and shown on the public page.

**Architecture:** Two on-demand owner routes. *Observe* fetches the pasted page through a new hardened open-host fetcher (SSRF floor, robots honoured, denylist, request-metered budget), decodes it **in a worker thread**, and returns candidate text fields plus candidate remote image URLs together with an HMAC over that candidate set — nothing is stored. *Accept* verifies the HMAC, fetches only the images the owner selected, stores each through `MediaService.createMedia`, and attaches them inside a three-phase command receipt. Public visibility then comes from Plan A's gate.

**Tech Stack:** TypeScript (strict), Node `https` with pinned DNS, `node:worker_threads`, PostgreSQL via `pg`, Express, Vitest, React 18.

**Prerequisite:** **Plan A must land first.** Products and people images go into `recommendation_media`, which only becomes publicly servable once Plan A widens the gate and its projections.

**Revision:** v2, after a security review and an integration review. v1 had one critical exploitable defect and four blockers; each correction is marked **[v1 defect]**.

---

## Decisions implemented

| Decision | Choice |
|---|---|
| Categories | **Products, Apps, People** |
| Host policy | **Any public host**, robots.txt honoured, plus a denylist editable without a deploy |
| Images | **Owner confirms each** before anything is fetched or stored |
| Trigger | **On demand**, request-metered per account |
| Blocked sites | **Fail gracefully** to manual entry plus upload. No bot-detection evasion. |

## Scope boundary

The retired implementation evaded bot detection — a stealth plugin, spoofed `Referer`/`Origin` to bypass Instagram, LinkedIn via DuckDuckGo. **None of that is reinstated.** This fetcher identifies itself honestly, honours robots.txt and honours a block. Sites that refuse automated access — Instagram and LinkedIn especially — will fail, and the owner falls back to manual entry plus upload. People benefits least of the three.

`tunes/server/utils/priceParsing.ts:5-6` records the prohibition in epic-04 and epic-07. It was raised with the owner, who directed this work to proceed on the terms above. No tombstoned path is revived.

## Security posture: what actually contains this

Stated once, because v1 got the emphasis wrong.

**The real SSRF containment is TLS identity, not the address policy.** `https:`-and-443-only, plus `rejectUnauthorized:true` with `servername` set to the request hostname (`bookCoverFetch.ts:23`) and `checkServerIdentity` (`appEnrichmentFetch.ts:4,70`). An internal service cannot present a certificate valid for the attacker's hostname, so the request is never written. This matters because `publicAddress()` **does** admit our own Hetzner and AWS global IPv6 — verified: `2a01:4f8:1:2::3` and `2600:1f00:1234::1` both return `true`. The address policy is a floor, not the wall.

**Confirmed sound and to be preserved verbatim:** DNS resolved once, every returned address checked, then pinned into the connect `lookup` with `autoSelectFamily:false` — no in-request rebinding window. One whole-call deadline plus `maxRequests` bounding total work, not per hop. Redirect re-validation that rejects scheme and port changes. `169.254.169.254` and every IPv6 special form refused (`::1`, `::ffff:10.0.0.1`, `64:ff9b::/96`, `fc00::/7`, `fe80::/10`, 6to4, `2001:db8::`). `media.ts:106`'s sniff-forced content type plus `X-Content-Type-Options: nosniff` on every media response, which closes stored XSS — no polyglot can be served as a document.

**Do not edit `publicAddress()`.** It is shared with the book-cover and movie-poster fetchers. Note the consequence: `:16` rejects all of `2001::/16`, and the caller rejects if **any** resolved address fails, so a host with a `2001::/16` AAAA record is unfetchable. That is a product failure to surface gracefully, never a reason to widen a shared floor. Task 2 adds a contract test pinning its rejection set so a Plan-B-driven widening fails CI.

**Add a network-layer egress floor** outside the application: deny RFC1918, `127/8`, `169.254/16`, `fc00::/7`, `fe80::/10` and **our own VPC/Hetzner prefixes** for the fetching process. In-process filtering is one bug from total; this is the only control that survives a mistake in Task 2.

## What this plan does NOT need (verified)

- **No migration.** `recommendation_media` and `recommendation_app_screenshots` are already in all three `TG_TABLE_NAME` allowlists and all three `scope_sql` recommendation-join arms of the *current* content-revision functions, which live in `tunes/migrations/0054_explorers_place_individual_pins.sql:313,347,381` — not 0035. Both guards accept `purpose:'recommendation'` with the four image MIMEs and ≤ 5 MiB, matching our image profile exactly.
- **No new `isPublicAttachment` arm.** Products and people reuse the generic arm Plan A widens; apps reuses its typed arm.
- **No change to `appEnrichmentFetch.ts`.** It is sealed by contract tests, and relaxing its `allowedHosts` would break it anyway — `urlFor` at `:91` independently requires `allowedHosts.includes(url.hostname)`, so an empty list rejects every URL. Plan B adds a separate fetcher.
- **No new media purpose.** `purpose:'recommendation'` carries a 5 MiB limit (`media.ts:28-29`) and satisfies every guard.
- **No new error codes.** `RATE_LIMITED` and `PROVIDER_UNAVAILABLE` already exist (`explorersContract.ts:130`).

---

## Task 1: Robots policy, standards-compliant and fail-closed

Nothing in the repo reads a third party's robots.txt — every existing hit serves our own. This is the gate that makes open-host fetching defensible, so it must actually work.

**[v1 defect — it failed open in the cases that matter]** v1 used `path.startsWith(rule.path)` with no wildcard support, so `Disallow: /*` — how Amazon's robots.txt is built, and Amazon is named in v1's own risk list — matched nothing and read as full permission. It consulted only the first `User-agent: *` group, matched our token by exact equality, treated a failing fetch as permission, and its `"unreadable"` branch was unreachable for garbage input, so the test named "fails closed on an unparsable body" only ever exercised the oversized case.

**Files:**
- Create: `tunes/server/services/robotsPolicy.ts`
- Test: `tunes/server/test/contracts/robots-policy.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseRobots, robotsAllows } from "../../services/robotsPolicy";

describe("robots policy", () => {
  it("honours a wildcard disallow", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /private\n"), "/private/x")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /private\n"), "/public")).toBe(true);
  });

  // RFC 9309 2.2.3. Without this, a blanket wildcard disallow reads as permission.
  it("supports the * wildcard", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /*\n"), "/anything")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /gp/*/reviews\n"), "/gp/abc/reviews")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /gp/*/reviews\n"), "/gp/abc/other")).toBe(true);
  });

  it("supports the $ end anchor", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /*.php$\n"), "/a/b.php")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /*.php$\n"), "/a/b.php?x=1")).toBe(true);
  });

  // RFC 9309 2.2.1: all records matching the token are merged.
  it("merges every group matching our token", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a\n\nUser-agent: *\nDisallow: /b\n");
    expect(robotsAllows(rules, "/a")).toBe(false);
    expect(robotsAllows(rules, "/b")).toBe(false);
  });

  it("matches our product token case-insensitively and ignores version suffixes", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: explorersearthbot/2.0\nAllow: /products\nDisallow: /\n");
    expect(robotsAllows(rules, "/products/1")).toBe(true);
    expect(robotsAllows(rules, "/other")).toBe(false);
  });

  it("applies the longest matching rule, allow winning a tie", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /a\nAllow: /a/b\n");
    expect(robotsAllows(rules, "/a/b/c")).toBe(true);
    expect(robotsAllows(rules, "/a/x")).toBe(false);
  });

  it("matches path and query together", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /s?k=\n"), "/s?k=shoes")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /s?k=\n"), "/s")).toBe(true);
  });

  it("compares percent-encoding equivalently", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /caf%C3%A9\n"), "/caf%C3%A9/x")).toBe(false);
  });

  it("treats an empty disallow as permission", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:\n"), "/anything")).toBe(true);
  });

  it("allows everything when robots.txt is absent or 4xx", () => {
    expect(robotsAllows("absent", "/a")).toBe(true);
  });

  // RFC 9309 2.3.1.4. A site shedding load, or refusing bots with 503, must not read as consent.
  it("disallows everything when robots.txt is unavailable", () => {
    expect(robotsAllows("unavailable", "/a")).toBe(false);
  });

  it("fails closed on an oversized body", () => {
    expect(robotsAllows(parseRobots("x".repeat(500_001)), "/a")).toBe(false);
  });

  // [v1 defect] v1 returned {groups:[]} here, which allowed everything.
  it("fails closed on a body with no parsable directives", () => {
    expect(robotsAllows(parseRobots("<!doctype html><html><body>Not found</body></html>"), "/a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
cd tunes && npx vitest run server/test/contracts/robots-policy.test.ts
```

- [ ] **Step 3: Implement**

Signature: `parseRobots(body: string | undefined): RobotsRules` where `RobotsRules = {groups: […]} | "absent" | "unavailable" | "unreadable"`, and `robotsAllows(rules, pathAndQuery)`.

Required behaviour, each pinned by a test above:
- `absent` (404/410, or no robots route) → allow. `unavailable` (5xx, timeout, connection error) → **deny all**. `unreadable` (over 500 KB, or a body that yields zero valid directives) → deny all.
- Group selection: collect **every** group whose agent list contains a token matching ours case-insensitively, comparing only up to any `/` so `explorersearthbot/2.0` matches; merge their rules. Fall back to the union of all `*` groups.
- Rule matching: translate the rule into an anchored matcher where `*` is "any sequence" and a trailing `$` anchors the end; compare against `pathname + search`, both percent-decoded consistently. Longest **rule literal** wins; a tie goes to `allow`.
- The caller must treat a non-`text/plain` robots response as `unreadable`, so an SPA's HTML 404 cannot read as permission.

Implement rule matching by escaping the literal, replacing `\*` with `.*`, and anchoring — not by a hand-rolled scanner. Bound the rule count (1 000) and each rule's length (2 000).

- [ ] **Step 4: Run, confirm pass, commit**

```bash
cd tunes && npx vitest run server/test/contracts/robots-policy.test.ts
git add tunes/server/services/robotsPolicy.ts tunes/server/test/contracts/robots-policy.test.ts
git commit -m "feat(enrichment): standards-compliant robots.txt gate that fails closed"
```

---

## Task 2: Open-host hardened fetcher

**Files:**
- Create: `tunes/server/services/linkEnrichmentFetch.ts`
- Test: `tunes/server/test/contracts/link-enrichment-fetch.test.ts`
- Test: `tunes/server/test/contracts/public-address-policy.test.ts`

- [ ] **Step 1: Pin the shared address policy before anything depends on it**

Create `public-address-policy.test.ts` asserting `publicAddress()`'s exact rejection set — every case listed under "Security posture" above, plus the Hetzner/AWS globals it **does** admit. This exists so a future "our fetcher can't reach site X" bug cannot be fixed by widening a floor three fetchers share.

- [ ] **Step 2: Write the failing fetcher tests**

Use the deterministic fixture seam (`Fixture` with `resolve`/`connect`, `bookCoverFetch.ts:21`) so no test performs real I/O. Each assertion below is the specific one that bites — a bare "rejects" would pass for the wrong reason.

```ts
it("refuses a host that resolves to a private address", /* assert connect never called */);
it("refuses a same-host redirect whose second resolve is private", /* THE real SSRF bypass: resolve count 2, connect count 1 */);
it("refuses a cross-host redirect under same-host policy", /* assert resolve count 1 */);
it("refuses a denylisted host before resolving it", /* assert resolve never called */);
it("refuses a denylisted parent domain for a subdomain", /* cdn.blocked.example */);
it("refuses a host whose robots disallows the path", /* assert the page connect never called */);
it("refuses when robots is unavailable (5xx)", /* assert the page connect never called */);
it("re-checks robots after a same-host redirect into a disallowed path", /* assert rejection */);
it("caches robots per host for an hour", /* second fetch: robots connect count still 1 */);
it("refuses a declared length over the cap", /* assert the body iterator was never consumed */);
it("refuses when streamed bytes exceed the cap", /* assert the generator was abandoned at the cap */);
it("refuses a body delivering below the minimum throughput", /* assert rejection before the deadline */);
it("refuses an image whose magic bytes contradict its content-type", /* assert the FETCHER rejects, since media.ts re-sniffs independently */);
it("refuses a response with a non-identity content-encoding", /* gzip */);
it("refuses a duplicate Content-Type header", /* via rawHeaders */);
it("refuses an incomplete body", /* complete() false, or length !== bytes */);
it("refuses a bracketed IP literal host", /* https://[::1]/ */);
it("refuses a trailing-dot host", /* https://example.com./ */);
it("does not retry 403, 429 or 503", /* assert connect count 1 and a typed graceful outcome */);
it("sends no Referer or Origin", /* assert the header set */);
it("accepts a well-formed html document", /* assert bytes, mimeType and final URL */);
```

- [ ] **Step 3: Implement**

Import `publicAddress` from `bookCoverFetch.ts:9` (already exported). **`sniff` is not exported** — export it there or copy it.

**[v1 defect]** v1 said to copy `bookCoverFetch`'s option set. Copy **`appEnrichmentFetch`'s** instead; `bookCoverFetch`'s omits five controls:
- `urlFor` (`appEnrichmentFetch.ts:91`): rejects strings over 4096, `/[\x00-\x20\x7f\\]/`, non-`https:`, userinfo, `url.hash`, any port but 443.
- the hostname regex at `:82` verbatim — `/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/` plus `isIP(h)===0` and length ≤ 253. **This is the mechanism**, and v1 only described the rule in prose. `isIP(hostname)!==0` does **not** reject `[::1]` — verified, `isIP("[::1]")` is `0` — and the regex is also what rejects the trailing dot that otherwise bypasses the denylist.
- the 64-address cap (`:96`), `maxHeaderSize:16384` and `maxHeadersCount=64` (`:70,:72`).
- response `content-encoding !== identity` → reject (`:104`). Setting the *request* header is not the same thing.
- `admitsContentType` (`:34-40`) permitting at most one explicit `utf-8`, `nativeContentType` (`:42-46`) returning `undefined` on a duplicate Content-Type from `rawHeaders`, and `:109`'s `complete()` **and** `Content-Length === bytes`.

Host policy as a discriminated union so "any host" is expressible without loosening a shared validator:

```ts
export type LinkHostPolicy = { kind: "any"; denylist: readonly string[] } | { kind: "allowlist"; hosts: readonly string[] };
export type LinkProfile = "html" | "image" | "robots";
```

Profiles: `html` admits only `text/html`, caps 1 MiB, deadline 10 s. `image` admits the four image MIMEs, caps 5 MiB to match the `recommendation` purpose limit, deadline 15 s, and requires `sniff(bytes) === mimeType`. `robots` admits only `text/plain`, caps 500 KB, deadline 2 s, is not itself robots-gated, and **is** denylist- and `publicAddress`-gated.

Add a **minimum throughput** check: abort if the body delivers under 8 KB/s over any 5-second window. Without it, each fetch holds its slot for the whole deadline and 64 slow targets kill the feature (see Task 3).

Robots: resolve the gate for the **sourceUrl host and every image host** before connecting, re-check after each same-host redirect, and cache per host in an **LRU with a hard entry count (1 000) and byte ceiling**. v1's unbounded host-keyed cache let wildcard DNS insert an entry per observation.

Identify honestly: `User-Agent: ExplorersEarthBot (+https://explorers.earth/bot)`, `Accept-Encoding: identity`, no `Referer`, no `Origin`. Do not retry `403`/`429`/`503`; return a typed outcome the route maps to a graceful message.

- [ ] **Step 4: Run, confirm pass, commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-fetch.test.ts server/test/contracts/public-address-policy.test.ts
git add tunes/server/services/linkEnrichmentFetch.ts tunes/server/test/contracts/
git commit -m "feat(enrichment): open-host fetcher with the full appEnrichment hardening"
```

---

## Task 3: Request-metered budget

**[v1 defect]** v1 metered **observations** at 30/account/minute. One observation costs roughly 30 outbound requests once robots, redirects, the re-observe and ten image fetches with their own robots are counted — so v1 authorised ~900 requests/account/minute, with no global ceiling and nothing keyed on the destination. With N accounts that is a reflector operating from our IP with our honest User-Agent, and the first consequence is our own IP blocklisted.

**Files:**
- Create: `tunes/server/services/linkEnrichmentBudget.ts`
- Test: `tunes/server/test/contracts/link-enrichment-budget.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("meters outbound requests, not observations", /* 1 observation consuming 5 requests costs 5 */);
it("refuses the request past the per-account window", /* 200 then the 201st throws RATE_LIMITED */);
it("re-admits after the window elapses", /* clock + 60_001ms, one more succeeds */);
it("anchors the window at the first call, not a sliding window", /* fixed-window behaviour pinned */);
it("refuses past a global per-window request ceiling", /* independent of account count */);
it("refuses past a per-destination-host ceiling", /* same host from two accounts */);
it("allows only one in-flight request per account", /* reserveAccount twice throws */);
it("caps concurrent image bytes by reserving the profile maximum up front", /* not the declared length */);
it("releases every reservation idempotently", /* double release frees one slot */);
it("keeps the feature's caller ceiling below the global one", /* enrichment cannot starve the process */);
```

- [ ] **Step 2: Run, confirm failure, implement**

Copy `GameProviderCoordinator`'s structure (`gameProviderBudget.ts:4-12`) — `reserveCaller`, `reserveMemory`, `reserveAccount`, `rate`, injected `now()`, idempotent `once()` releases, and the fixed window anchored at the first call (`at: r?.at ?? now`). Add what it lacks: a **global** per-window request ceiling, a **per-destination-host** ceiling (and per-/24 and per-/48 on the resolved address), and a feature caller ceiling well under `LIMITS.callers = 64` so enrichment cannot consume every slot.

`reserveMemory` must be called **before buffering**, reserving the profile maximum — the declared `Content-Length` is attacker-controlled and may be absent. Cap concurrent image fetches per account at 1.

- [ ] **Step 3: Confirm pass and commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-budget.test.ts
git add tunes/server/services/linkEnrichmentBudget.ts tunes/server/test/contracts/link-enrichment-budget.test.ts
git commit -m "feat(enrichment): request-metered budget with global and per-destination ceilings"
```

---

## Task 4: Denylist, in a canonical module

**[v1 defect]** v1 said to modify `tunes/server/services/system-settings.ts`. **That file does not exist.** The real one is `system-settings-service.ts`: it exposes only `getSettingValue` and `getAppUrl`, has **no setter**, talks to the legacy Drizzle `storage` singleton rather than a `pg.Pool`, and is never mounted from `canonicalApp.ts`. Importing it into the canonical closure would drag the Drizzle layer in.

The table itself is fine and needs no migration: `0001_runtime_baseline.sql:239-249` gives `key text UNIQUE, value text NOT NULL, category text NOT NULL, …`, and `0010_least_privilege_runtime_role.sql:21` grants `music_runtime` select/insert/update/delete on all public tables with no later revoke. **`category` is `NOT NULL` with no default**, so every insert must supply it.

**Files:**
- Create: `tunes/server/services/linkEnrichmentDenylist.ts` (canonical, `pg.Pool`)
- Test: `tunes/server/test/contracts/link-enrichment-denylist.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("refuses a denylisted host and its subdomains", /* blocked.example, cdn.blocked.example */);
it("does not refuse a host that merely ends with the denied string", /* notblocked.example, xblocked.example */);
it("normalises case, punycode and a trailing dot on both write and read", /* BLOCKED.Example, blöcked.example, blocked.example. */);
it("denies everything when the stored value is unparsable", /* 'not json' */);
it("denies everything when the read fails", /* inject a failing query */);
it("denies everything when the row is absent", /* distinct from unparsable */);
it("re-reads within a bounded TTL so an edit takes effect without a restart", /* clock-driven */);
it("keeps denying on a refresh failure rather than reverting to the last good value", /* fail closed */);
it("bounds the entry count and each entry's length", /* reject an oversized list */);
```

The absent-row case matters: v1 made it fail *open* by construction, so a `DELETE` or a key typo would silently disable the only lever for answering a complaint. Seed the row with `[]` and treat a missing row as deny-all.

- [ ] **Step 2: Implement**

Normalise every host on **write and read**: lowercase, `new URL`/`domainToASCII` for punycode, strip a trailing dot. Match as `host === denied || host.endsWith("." + denied)`. Read per fetch through a TTL cache (60 s) with a bounded entry count, failing closed on a refresh error.

- [ ] **Step 3: Give it a write surface, or say there is none**

**[v1 defect]** v1 promised "editable without a deploy" but added no route or CLI, and `/api/system-settings` is tombstoned (`musicRetirementPolicy.ts:30`). Either add a `tunes/scripts/` CLI subcommand for set/list/remove — the cheapest honest option — or state in the plan and the risk register that the denylist is edited by direct SQL on the production database. Do not leave the claim unqualified.

- [ ] **Step 4: Confirm pass and commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-denylist.test.ts
git add tunes/server/services/linkEnrichmentDenylist.ts tunes/server/test/contracts/link-enrichment-denylist.test.ts tunes/scripts/
git commit -m "feat(enrichment): fail-closed host denylist with a write surface"
```

---

## Task 5: Decode in a worker thread

**[v1 defect — critical and exploitable]** v1's own task header said untrusted HTML must not be parsed inline, and its implementation step then specified "a regex/streaming extractor over the bounded body". A regex cannot be interrupted: it does not yield to the event loop and ignores `AbortSignal`. An attacker page returning 1 MiB of `"<meta "` with no closing `>` gives any og:image pattern quadratic behaviour — roughly 10¹² character steps — and the whole Express process, which also serves every public page, stops answering. One request, one owner account.

What the worker buys is not tidiness: `resourceLimits` so an OOM kills a worker rather than the server, and `terminate()` on a deadline so a runaway parse can be killed. The existing code also uses a real tokenizer, not regex (`appEnrichmentProviderCore.mjs:217`), with a JSON-LD block cap at `:234`.

**Files:**
- Create: `tunes/server/application/linkEnrichmentDecode.ts` (host side)
- Create: `tunes/server/services/linkEnrichmentDecoderThread.mjs` (worker)
- Test: `tunes/server/test/contracts/link-enrichment-decode.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("extracts Open Graph title, description and images", …);
it("falls back to <title> and meta description", …);
it("extracts JSON-LD Product name, description and image array", …);
it("resolves relative image URLs against the document URL", …);
it("discards non-https and data: image URLs", …);
it("caps candidates at 10 images and bounds every string", …);
it("caps the number of JSON-LD blocks it will parse", /* 1000 blocks: bounded, not all parsed */);
it("bounds JSON-LD nesting depth", /* deeply nested object rejected, not traversed */);
it("rejects invalid UTF-8 and NUL bytes", …);
it("strips control characters that the owner contract would reject", /* VT and FF in og:description */);

// The oracle for the critical defect. [v1 defect] v1's "never executes script content"
// was vacuous with a regex extractor: no DOM is loaded, so it could not fail.
it("terminates a pathological body within the deadline instead of blocking", async () => {
  const body = "<meta ".repeat(180_000); // ~1 MiB, no '>' and no quote
  const started = Date.now();
  await expect(decodeLinkDocument(body, "https://x.example/p")).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(3_000);
});

it("keeps the host responsive while a pathological body decodes", async () => {
  const slow = decodeLinkDocument("<meta ".repeat(180_000), "https://x.example/p").catch(() => undefined);
  // The event loop must still turn. On the main thread this assertion cannot pass.
  const ticks = await new Promise<number>(done => { let n = 0; const t = setInterval(() => { if (++n >= 5) { clearInterval(t); done(n); } }, 10); });
  expect(ticks).toBe(5);
  await slow;
});

it("does not harvest an og:image inside a comment, noscript, svg or template", …);
```

The last two are the ones that distinguish a worker from a regex. Keep them.

- [ ] **Step 2: Run, confirm failure, implement**

Host side: `decodeLinkDocument(body, documentUrl)` posts to a worker, reusing the custody and lifecycle pattern of `tunes/server/services/appEnrichmentOwnedDecoder.ts` — `createAppDecoderCustody` (`:34`), `resourceLimits` (`:68`), the deadline timer and `worker.terminate()` (`:71,:76`), and `withAdmission` with a concurrency cap (`:36-37`).

Worker side: a **linear tokenizer**, never a backtracking regex. Cap JSON-LD blocks at 20, parse each through a bounded JSON reader with a depth limit (32) and node budget, and decode strictly as UTF-8 rejecting NUL, as `decodeProviderUtf8` does (`providerCore:214-216`).

Bound and normalise every output: title ≤ 300, description ≤ 2 000 with control characters stripped (`text(8192)` rejects `[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]` and lone surrogates — `explorersProductContract.ts:101` — and real `og:description` routinely carries a vertical tab, so without normalisation accept would 422 on ordinary pages), at most 10 image URLs, each ≤ 2 048 and `https:` only.

- [ ] **Step 3: Confirm pass and commit**

```bash
cd tunes && npx vitest run server/test/contracts/link-enrichment-decode.test.ts
git add tunes/server/application/linkEnrichmentDecode.ts tunes/server/services/linkEnrichmentDecoderThread.mjs tunes/server/test/contracts/link-enrichment-decode.test.ts
git commit -m "feat(enrichment): decode fetched pages in a terminable worker thread"
```

---

## Task 6: Observe and accept commands

**Files:**
- Create: `tunes/shared/explorersLinkEnrichmentContract.ts`
- Create: `tunes/server/application/linkEnrichmentImport.ts`
- Test: `tunes/server/test/explorers/link-enrichment.integration.test.ts` (run after Task 8 mounts the router)

- [ ] **Step 1: Define the contract, with a signed candidate set**

**[v1 defect — the claim was false]** v1 said accept "re-validates against a fresh observe of the same sourceUrl, so a client cannot smuggle an arbitrary URL into the image fetcher." A client can, trivially and with no race: host a page whose `og:image` is the target URL and paste that page. The candidate set is attacker-defined on **both** fetches by construction. The re-observe was therefore not a security control, it doubled accept's outbound cost, and it broke every honest site serving signed or cache-busted CDN URLs (S3 presigned, Cloudinary, Shopify), which legitimately differ on the second fetch.

State plainly in the code: **the image fetcher's own gate is the only control.** The signed set authorises nothing about the fetch; every image URL runs the full gate independently.

```ts
export const observeLinkSchema = z.object({
  url: z.string().url().max(2048).refine(v => new URL(v).protocol === "https:", "https is required"),
}).strict();
export const linkCandidateSchema = z.object({
  title: z.string().max(300).nullable(), description: z.string().max(2000).nullable(),
  imageUrls: z.array(z.string().url().max(2048)).max(10),
  sourceUrl: z.string().url(), observedAt: z.string(), candidateToken: z.string().max(512),
}).strict();
export const acceptLinkSchema = z.object({
  expectedRevision: z.number().int().nonnegative(), candidateToken: z.string().max(512),
  fields: z.array(z.enum(["title", "description"])).max(2),
  imageUrls: z.array(z.string().url().max(2048)).max(10),
}).strict();
```

`observeLinkSchema` carries no `expectedRevision` — observe mutates nothing. `z.string().url()` alone admits `javascript:`, `file:` and `http:`, hence the refine, so a bad scheme is a 422 at the contract boundary rather than something the fetcher must catch.

`candidateToken` is an HMAC over `{accountId, recommendationId, sourceUrl, sorted imageUrls, title, description, observedAt, nonce}` with a 10-minute TTL and a single-use nonce. Accept verifies the MAC, the TTL, that `chosen ⊆ signed`, and burns the nonce. `application_command_receipts` already provides single-use plus `replay_until` (`bookCoverImport.ts:28-29`), so persisting the observation under an opaque id is an equally good variant.

**`description` is not a People override key.** `personDisplayFieldsSchema` (`explorersPersonContract.ts:41-61`) is `{headline, locationText, avatarUrl, primaryPlatform, socialUrls, skillsTags, externalFollowerCountText}`. `recommendation_display_overrides` has no key validation at the DB level, so a bad write **succeeds** — and then `editableOwnerRecommendationSchema`'s superRefine runs `personDisplayFieldsSchema.safeParse` on **read** (`explorersOwnerContentContract.ts:65-66`) and raises "Inconsistent category overrides" forever, permanently breaking `GET /recommendations/:id/editable` for that recommendation. So the accepted-field enum must be **per category**: `title`/`description` for products and apps, `title`/`headline` for people.

- [ ] **Step 2: Write the failing integration tests**

```ts
it("observes candidates without storing anything", /* assert no media_assets row */);
it("authorizes the actor on :id before any outbound request", /* foreign account: fetcher call count 0, 404 */);
it("stores only the images the owner accepted", /* 3 candidates, accept 1, exactly 1 attached */);
it("rejects an image URL that was not in the signed set", /* 422, fetcher not called for it */);
it("rejects a replayed candidate token", /* second accept 409 */);
it("rejects an expired candidate token", /* clock + 11 min, 422 */);
it("is idempotent under a replayed Idempotency-Key", /* same response, no second upload */);
it("refuses to exceed the 20-id recommendation_media bound", /* 422, owner read still parses */);
it("refuses rather than discarding when apps already has ten screenshots", /* 422, no orphan */);
it("surfaces a target 403 as a graceful failure, not a 500", …);
it("surfaces a zero-byte image as a graceful failure, not a 500", …);
it("refuses when the account is over budget", /* 429 RATE_LIMITED */);
it("deletes uploaded bytes when attachment fails", async () => {
  // [v1 defect] v1 asserted pending_delete. With a working storage fixture the
  // compensation path completes, so the terminal state is 'deleted' — see
  // book-cover-import.integration.test.ts:83, which observes pending_delete only
  // because it sets failDelete first.
  expect(status).toBe("deleted");
  expect(storageFixture.has(key)).toBe(false);
  expect(attachedRows).toBe(0);
  expect(revisionAfter).toBe(revisionBefore);
  expect(receipt).toMatchObject({ status: "retired", response: null });
});
```

Every HTTP test needs `.set("origin", config.baseURL)` — `mutation` returns 403 otherwise — and no query parameters, which it rejects with 422.

- [ ] **Step 3: Implement**

Order is load-bearing: **authorize the actor against `:id` first, then take the budget, then fetch.** Any arrangement where network I/O precedes the ownership check makes observe an SSRF primitive for any authenticated user against any recommendation id.

Follow `bookCoverImport.ts` for the rest: a fresh advisory-lock namespace integer (44035 is book covers, 44024 is media upload, 44031 is category revisions — pick an unused one and comment it), the `pending` → staged → `completed`/`retired` receipt, `this.media.usingConnection(db)`, `createMedia(actor, {purpose:'recommendation', filename, mimeType, length, bytes}, context, readyWrite)` with the receipt staged inside `readyWrite`, the compensating delete, and the unlock in `finally`.

Use a **constant server-side filename** such as `'link-image'`: `media.ts:106` requires `/^[\w. -]{1,255}$/`, so any filename derived from a remote URL path throws.

Attachment, with both caps enforced as refusals rather than silent drops:

```ts
 // recommendationDtoSchema caps mediaIds at 20 (explorersContract.ts:71,116); exceeding it
 // makes the owner AND public reads fail to parse. Refuse instead.
 if (category !== 'apps' && existingCount + accepted.length > 20) throw new RecommendationFailure(422, 'Media limit reached');
 if (category === 'apps') await writeAppScreenshots(db, id, accountId, [...existing, ...accepted]);
 else for (const [position, mediaId] of accepted.entries())
   await db.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,$4)', [id, accountId, mediaId, existingCount + position]);
```

**[v1 defects]** The argument order is `writeAppScreenshots(db, recommendationId, accountId, mediaIds)` (`appCatalogRepository.ts:39`) — v1 swapped the middle two. And v1's `.slice(0, 10)` kept `existing` first, so with ten screenshots already present every accepted image was fetched, uploaded, then discarded, leaving orphans; passing the full list lets `writeAppScreenshots` raise a clean 422 above ten (`appCatalogRepository.ts:40`).

Accepted text fields go through `recommendation_display_overrides` as `explorersAppEnrichmentRepository.ts:79-81` does — read `FOR UPDATE`, merge, write back, bump `recommendations.revision` only if changed — using the per-category key set from Step 1.

- [ ] **Step 4: Confirm pass and commit** (after Task 8)

```bash
cd tunes && npx vitest run --config vitest.integration.config.ts server/test/explorers/link-enrichment.integration.test.ts
git add tunes/shared/explorersLinkEnrichmentContract.ts tunes/server/application/linkEnrichmentImport.ts tunes/server/test/explorers/
git commit -m "feat(enrichment): observe and accept with a signed candidate set"
```

---

## Task 7: Routes, with their own origin check and policy arm

**Files:**
- Create: `tunes/server/routes/explorersLinkEnrichmentRoutes.ts`
- Modify: `tunes/server/policies/musicSurfacePolicy.ts`
- Modify: `tunes/server/test/contracts/runtime-surface-inventory.test.ts:11,22-24`
- Modify: `.github/workflows/test.yml:224`

- [ ] **Step 1: Register the routes with file-local helpers**

Registrations must be literal strings — interpolated or looped paths are invisible to the AST inventory (`explorersRecommendationRoutes.ts:97-98`).

```ts
  routes.post('/api/explorers/v1/recommendations/:id/link-enrichment/observe', …);
  routes.post('/api/explorers/v1/recommendations/:id/link-enrichment/accept', …);
  routes.all('/api/explorers/v1/recommendations/:id/link-enrichment/observe', unsupported);
  routes.all('/api/explorers/v1/recommendations/:id/link-enrichment/accept', unsupported);
```

These paths collide with no retirement rule — the `scrape` family covers `/api/products`, `/api/people`, `/api/apps`, `/api/proxy-image` and their unprefixed twins, and nothing prefixes `/api/explorers`.

**[v1 defect — this one is a vulnerability if missed]** v1's snippet used `mutation` and `unsupported`, which are **function-locals of `explorersRecommendationRoutes.ts`** (`:34-35`). A new router file must define its own — and `mutation` is where the CSRF defence lives (`:38`, `request.get('origin') !== config.baseURL` → 403). A router that omits it turns this feature into **CSRF-to-SSRF**: any page could make a signed-in owner's browser trigger outbound fetches and, on accept, publish attacker-chosen images to that owner's public profile. Follow `explorersAppEnrichmentRoutes.ts:17`'s per-file pattern.

Add error-to-status arms for the budget rejection (`429 RATE_LIMITED`) and a graceful target failure (`PROVIDER_UNAVAILABLE`), plus `MediaInputError`. Without them each reaches `sendActorError` → **500**, defeating three of Task 6's tests.

- [ ] **Step 2: Add a new source-gated policy arm**

**[v1 defect]** Every arm of `decisionForRoute` is gated on `route.source`. v1 said to add the entries to the block ending at `:226`, which begins at `:187` with `route.source === "tunes/server/routes/explorersRecommendationRoutes.ts"` — so entries there match nothing and both POSTs fall through to the fail-closed default at `:278`, classifying as tombstones. Add a **new** arm keyed on `explorersLinkEnrichmentRoutes.ts`, shaped like the App-enrichment block at `:178-186`. Do not list the `ALL` guards; they are tombstones by design (`:232-234`).

- [ ] **Step 3: Register the integration test in the PR lane**

Add `server/test/explorers/link-enrichment.integration.test.ts` to the explicit list on the `run:` line at `.github/workflows/test.yml:224`.

- [ ] **Step 4: Commit** (regeneration happens in Task 9)

```bash
git add tunes/server/routes/explorersLinkEnrichmentRoutes.ts tunes/server/policies/musicSurfacePolicy.ts .github/workflows/test.yml
git commit -m "feat(enrichment): routes with a file-local origin check and policy arm"
```

---

## Task 8: Mount the router

**[v1 defect]** No task in v1 mounted it — and the contract suite would have passed anyway, because `inventoryRuntimeSurfaces` is a pure AST walk over `tunes/server` (`inventory-runtime-surfaces.ts:130-141`) and cannot tell a mounted router from an unmounted one. The counts, the matrix and the containment tests are all blind to it.

**Files:**
- Modify: `tunes/server/auth/canonicalApp.ts:107-113`
- Test: `tunes/server/test/explorers/link-enrichment.integration.test.ts`

- [ ] **Step 1: Write the failing test** — an HTTP request to the observe route must return 401/403/422 rather than 404.
- [ ] **Step 2: Add the `setupExplorersLinkEnrichmentRoutes(app, …)` call** alongside the other `setupExplorers*Routes` calls.
- [ ] **Step 3: Run Task 6's full integration suite** — all of it depends on this mount.
- [ ] **Step 4: Commit.**

---

## Task 9: Composition, quotas and the outbound log

**Files:**
- Modify: `tunes/server/auth/canonicalApp.ts`
- Create: `tunes/server/services/linkEnrichmentAudit.ts`
- Test: `tunes/server/test/contracts/link-enrichment-composition.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("composes a live fetcher with the database denylist and the budget", …);
it("performs no I/O when enrichment is disabled by configuration", async () => {
  // [v1 defect] v1 asserted on construction, which never fetches. Drive a request.
  const response = await request(app).post(observeUrl).set("origin", config.baseURL).send({ url: "https://x.example/p" });
  expect(fetcher.calls).toBe(0);
  expect(response.status).toBe(404);
});
it("records every outbound request with its resolved address", …);
it("refuses past the per-account stored-asset quota", …);
it("refuses an image whose pixel dimensions exceed the cap", …);
```

- [ ] **Step 2: Implement composition**

Construct as `canonicalApp.ts:107` does for book covers, adding `linkFetcher?` to the options type on `constructCanonicalApp` (`:52-57`); `createCanonicalApp` and `createCanonicalAppWithCustody` type their options as `Parameters<typeof constructCanonicalApp>[2]` (`:172-173`), so the test seam propagates for free. Gate the whole feature behind an explicit option so it can be switched off, as Apps enrichment is by `options.appEnrichmentChoices ?? []` (`:108`).

- [ ] **Step 3: Add the outbound audit log**

**[v1 defect]** v1 recorded nothing for observe — the SSRF, probe and reflector primitive — so there was no way to answer an abuse report or identify which account scanned what. Append-only: account id, recommendation id, requested URL, **resolved IP and family**, final URL after redirects, status, byte count, outcome, timestamp. The resolved address is the field that matters and the one nothing currently captures.

- [ ] **Step 4: Add storage quotas and image bounds**

Per-account stored-asset count and total-byte quotas, since the feature otherwise makes us an abuse-hosting CDN at a stable public URL. Cap pixel dimensions — a valid 5 MiB PNG can be 50 000 × 50 000, which our server never decodes but every viewer's browser does — and strip EXIF, since we would otherwise republish third parties' GPS and embedded payloads verbatim.

- [ ] **Step 5: Regenerate the committed documents — after this task, not before**

The committed inventory stores a `line` per route, so Task 8's edit to `canonicalApp.ts` shifts the lines of every route registered there. No test catches a stale `line` (`authorizationMatrixFromInventory` drops it), so regenerate last:

```bash
cd tunes && npx tsx scripts/inventory-runtime-surfaces.ts --write && npx tsx scripts/generate-music-authorization-matrix.ts
node -e "const i=require('../docs/architecture/music-runtime-surface-inventory.json');console.log('routes',i.routes.length,'events',i.events.length,'jobs',i.jobs.length)"
```

Order matters: the matrix reads the inventory **file**. Baseline before this plan is `routes 199 events 15 jobs 37`. Update the pins at `runtime-surface-inventory.test.ts:22-24` to the regenerated numbers and the arithmetic comment at `:11` — four new routes, plus one job per `setTimeout`/`setInterval` in the new services.

- [ ] **Step 6: Run the full contract suite and commit**

```bash
cd tunes && npx vitest run server/test/contracts/
```

Expected: PASS, including `runtime-surface-inventory`, `music-authorization-matrix` and `music-security-containment` — the last confirms the tombstoned paths still answer 410.

---

## Risks accepted, recorded once

- **Open-host fetching rehosts third parties' images.** Per-image owner confirmation is the mitigation; the panel must say plainly that accepting copies the image onto our storage. The legal exposure is broader than a curated allowlist would carry, and the owner has accepted it. The denylist is the response lever — note it is per-hostname whack-a-mole with no org or ASN control, and that `amazon.com` and `images-na.ssl-images-amazon.com` are separate entries.
- **Sites that block automation will fail.** No evasion. Instagram and LinkedIn will mostly refuse.
- **Residual blind scanning.** Even with TLS identity containment, an attacker can distinguish port-443 liveness by timing, metered per account. The outbound log and the network egress floor are the answers.
- **`Cache-Control: public, max-age=300`** on media (`explorersMediaRoutes.ts:72`) keeps takedown-pending bytes in shared caches for five minutes.
- **The old Puppeteer path stays retired** along with its 248-finding CVE suppression. Nothing here launches a browser.

## Out of scope

- Books, movies and games — they already have working provider imports.
- Reviving any tombstoned path. All four stay 410.
- Changing `appEnrichmentFetch.ts` or the Apps registry. Plan B is additive.
- A GPT/MCP plugin that searches and returns a URL for the owner to upload. The owner's own idea, genuinely cheaper because the fetch happens on the user's side — separate work.
