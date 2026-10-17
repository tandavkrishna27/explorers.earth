# Media correctness, CI regressions, and cutover readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make owner media work correctly and visibly for all eight recommendation categories, fix the two genuine regressions that the first honest CI run exposed, and record exactly what must be true before a production release.

**Status:** findings verified 2026-10-17 by four independent investigations against `main` at `8469a063`. Phases 0–1 need no decision. Phase 2 is blocked on two owner decisions. Phases 4–5 are owner-gated.

---

## Findings (all verified, with the corrections they produced)

| # | Finding | Severity | Decision needed |
|---|---|---|---|
| A1 | Apps fixture seal pins a stale SHA of `music-local-private-files.ps1` | blocks a CI lane on every platform | no |
| A2 | Anonymous visitors to public profiles now fire `/api/auth/get-session` | real regression, 18/18 lane failure | no |
| A3 | `real-stack lifecycle` two-owner identity race | pre-existing, never green | no (triage) |
| A4 | `real-stack books` 2 cases time out on `locator.click` | new lane, never ran | no (triage) |
| B1 | Re-editing a product/person **silently detaches all its photos** | data loss | no |
| B2 | books/movies/games list covers emit URLs the gate refuses | latent defect | no |
| B3 | 6 categories' cover joins lack `status='ready'` | 404 images | no |
| B4 | products/people uploads are a dead end (no public consumer) | broken feature | **yes** |
| B5 | places creator-upload leg is publicly invisible | broken feature | **yes** |
| B6 | `publicPlacesProjection.ts:25-26` comment contradicts the code | trap | no |
| C1 | Schema-drift fingerprint can fail **after** `/api/register` is 410 | deploy hazard | no (verify first) |
| D1 | Reviving scraping is "forbidden by epic-04 and epic-07" | policy | **yes, separate** |

Three corrections this investigation forced on earlier conclusions in this effort:
- The gate function is `isPublicAttachment`; `isPubliclyVisible` does not exist.
- The products/people gate exclusion is **correct**, not a bug — it matches a read model with no media in it. Widening it alone would publish unreferenced assets.
- There were **no hung CI jobs**; that claim came from misreading the clock. 20 of 21 jobs completed normally.

### Why PR #119 looked green

The 2026-10-06 qualification run was a **lane-filtered `workflow_dispatch`**, and in this workflow a lane the filter excludes still reports `success` with every step skipped. So `profile-tabs`, `real-stack books` and the other lanes never executed PR #119's code before it merged. "Reports success" is not "actually ran" — the mirror of the already-recorded trap that "named in no workflow" is not "never ran".

---

## Phase 0 — Unblock the sealed CI lane

### Task 0.1: Re-pin the Apps fixture seal

**Files:** Modify `tunes/scripts/apps-browser-fixture.ts:945`

This seal was broken by an earlier edit in this effort to `tunes/scripts/music-local-private-files.ps1` that did not update the pinned constant. Not a line-ending artifact: the git blob and the working file both hash to the same value.

- [ ] **Step 1: Confirm the mismatch**

```bash
git show HEAD:tunes/scripts/music-local-private-files.ps1 | sha256sum
grep -n "d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764" tunes/scripts/apps-browser-fixture.ts
```
Expected: actual `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0`, constant `d35c7b8a…`.

- [ ] **Step 2: Replace the constant** with `a43bb8db3ae88ae440fb73d77801a400d2b5fadc0151fd6ac10e61a3cd26bac0`.

- [ ] **Step 3: Verify no other seal pins the same file**

```bash
grep -rn "d35c7b8a92813890d5074a9088ff6d690610322deb0684d0c52b26774a5ff764" --include=*.ts --include=*.json . | grep -v node_modules
```
Expected: no remaining hits.

- [ ] **Step 4: Commit.** `fix(apps): re-pin the private-files seal to the current helper`

**Caveat to carry:** a seal that pins a sibling script by content hash will break again on the next edit to that script. Consider, in a follow-up, whether the seal should pin behaviour rather than bytes — out of scope here.

---

## Phase 1 — Correctness fixes that need no decision

Order matters: B1 first, because it is losing owner data today.

### Task 1.1: Stop re-edits from detaching product/person photos

**Files:** Modify `explorers-earth/src/features/Products/components/dashboard/AddProductPage.tsx:69-83`, `explorers-earth/src/features/People/components/dashboard/AddPersonPage.tsx:77-91`

Both forms initialise state from `observed.detail` but never rehydrate `media` from `observed.detail.mediaIds`. `AddAppPage.tsx:85` and `AddGamePage.tsx:39` do. So a re-edit submits `mediaIds: []` and detaches every prior upload.

- [ ] **Step 1: Write the failing test** — a re-edit of a recommendation that already has media must send those ids back unchanged. Model it on the existing rehydrate coverage for Apps/Games.
- [ ] **Step 2: Run it; expect failure** showing `mediaIds: []`.
- [ ] **Step 3: Rehydrate `media`** from `observed.detail.mediaIds`, mapping each id to `{ id, url: \`/api/explorers/v1/media/${id}/content\` }`, matching the shape set at `AddProductPage.tsx:109`.
- [ ] **Step 4: Run tests; expect pass.**
- [ ] **Step 5: Commit.**

### Task 1.2: Admit books/movies/games list covers to the gate

**Files:** Modify `tunes/server/repositories/mediaRepository.ts:74`; extend `tunes/server/test/explorers-media.integration.test.ts:44`

`git log -L 68,77` proves the `collection_media` category list grew one ticket at a time (`places,products,people` → `+guides` → `+apps`) and these three were never appended. Unlike products/people, a public consumer **already exists** (`publicBooksProjection.ts:62`, `publicMoviesProjection.ts:89`, `publicGamesProjection.ts:158`), so the omission is a defect and widening is correct.

- [ ] **Step 1: Write failing integration cases** — extend the fixture loop at `:44` from `["apps","places"]` to all five, reusing the cover block at `:86-89` and the withdrawal table at `:90-99`.
- [ ] **Step 2: Run; expect the three new categories to fail the cover assertion.**
- [ ] **Step 3: Add `'books','movies','games'`** to the category list at `mediaRepository.ts:74`.
- [ ] **Step 4: Run; expect pass.**
- [ ] **Step 5: Commit.**

### Task 1.3: Require `status='ready'` on every cover join

**Files:** Modify the cover joins in `publicAppsProjection.ts`, `publicBooksProjection.ts`, `publicMoviesProjection.ts`, `publicGamesProjection.ts`, `publicProductsProjection.ts`, `publicGuidesProjection.ts`

Only Places (`publicPlacesProjection.ts:126`) and People (`publicPeopleProjection.ts:95,118`) add `EXISTS(... m.status='ready')`. Elsewhere an unready cover yields a URL that 404s.

- [ ] **Step 1: Write a failing case** — a cover whose media is `uploading` must not appear in the projection.
- [ ] **Step 2: Run; expect failure.**
- [ ] **Step 3: Add the `EXISTS(... status='ready')` guard** to each of the six, copying the Places form verbatim.
- [ ] **Step 4: Run the whole explorers-earth unit lane serially** — per prior experience this lane is the only cross-ticket gate that catches DTO-shape regressions.
- [ ] **Step 5: Commit.**

### Task 1.4: Stop anonymous visitors triggering an auth session fetch

**Files:** Modify `explorers-earth/src/components/AuthSyncManager.tsx:24`

`useEffect(() => { void authClient.refresh(); }, [])` is unconditional, and `authClient.ts:19` opens with `fetch("/api/auth/get-session")`. Before the merge this was a `useQuery` with `skip: !isAuthenticated`, so an anonymous public profile made zero auth calls. Two requests appear under StrictMode in dev, one in production — either way it is unnecessary load and latency on the most cacheable pages, and it is what fails `profile-tabs` 18/18 on `deniedAuthority === 0`.

- [ ] **Step 1: Reproduce** by running the `profile-tabs` lane locally and confirming `deniedAuthority` is 2.
- [ ] **Step 2: Decide the guard at review time** — the options are (a) skip the refresh when no session cookie is present, (b) skip it on public profile routes, (c) have `authClient.refresh()` itself short-circuit when there is no plausible session. Prefer the narrowest that restores `skip: !isAuthenticated` semantics without reintroducing the Apollo dependency the merge removed.
- [ ] **Step 3: Implement and re-run the lane; expect 18/18 pass.**
- [ ] **Step 4: Confirm authenticated SSO still works** — this code path exists to sync Explorer identity with Music, so verify a signed-in session still refreshes. Do not fix the test by loosening the harness allowlist.
- [ ] **Step 5: Commit.**

### Task 1.5: Correct the Places projection comment and the key collision

**Files:** Modify `tunes/server/publicProfile/publicPlacesProjection.ts:25-26`

The comment claims photos are "concatenated with the owner's own uploads"; the code never concatenates. Worse, `media_details.imageDetails` means `recommendation_media` on the owner side (`placesViewModel.ts:109-110`) and `recommendation_place_photos` on the public side — one key, two tables.

- [ ] **Step 1:** Rewrite the comment to state what the code does, and note the owner/public divergence explicitly.
- [ ] **Step 2:** Commit. (Documentation only — behaviour is settled by Task 2.2.)

---

## Phase 2 — Blocked on owner decisions

### Decision D-1: products and people snapshot uploads

Owners can upload "Snapshots" (`AddProductPage.tsx:223`, `AddPersonPage.tsx:242`); they are stored in `recommendation_media`, shown back to the owner, and no public projection reads them. Both categories currently show **zero** public imagery of any kind: `AddPersonPage.tsx:135` hard-codes `avatarUrl: null`, and nothing ever writes product `imageUrls` (no provider exists).

- **Complete it** — add an inline `recommendation_media` read to `publicProductsProjection.ts` and `publicPeopleProjection.ts` (copy `publicBooksProjection.ts:23-24`, same 20-item cap), **then** add `'products','people'` to both `mediaRepository.ts:101` and the `required_category IS NULL` branch at `:102`. Projection and gate must land together.
- **Remove it** — delete the Snapshots input and upload handler, stop sending `mediaIds`, and refine `mediaIds` out for these categories at `explorersContract.ts:104` the way `appScreenshots` and `placePhotos` already are.

Do **not** widen the gate alone.

### Decision D-2: places creator uploads

Provider-origin photos go to `photoMediaIds` and are public; creator-origin uploads go to `mediaIds` and are not (`useAddRecommendation.ts:321-325`).

- **Make them public** — read `recommendation_media` in `publicPlacesProjection.ts`, concatenating after `photos` as the comment already claims, and add `'places'` to `mediaRepository.ts:102`.
- **Route them properly** — send creator-origin uploads to `photoMediaIds` instead, drop the `mediaIds` leg from the places commands (`placesClient.ts:120,123,134,149,151`), and fix the owner emission.

---

## Phase 3 — Triage the two never-green lanes

- [ ] **Task 3.1:** `real-stack lifecycle` — `lifecycle.spec.ts:198` expected owner A's account id and got owner B's on a second consecutive refresh. Determine whether this is a genuine cross-owner session leak or harness reuse; a real leak is a security bug and would outrank Phase 1.
- [ ] **Task 3.2:** `real-stack books` — `books.spec.ts:205` times out on `locator.click` at 120s, desktop and mobile. Establish whether the element never appears (product defect) or appears late (budget).

Both lanes have never been observed green, so neither is a merge regression. The workflow's own rule is to promote a lane into the required set only once observed green.

---

## Phase 4 — Production cutover (owner-gated, do not start from here)

Full detail: `docs/replatform-audit/production-cutover-runbook.md`. Material additions from this investigation:

1. **Verify the live `public` schema matches the fingerprint stored for `0021` before dispatching.** `migrate.ts:200-203` recomputes a full schema fingerprint; any hand-added index, `drizzle-kit push`, or unversioned application table throws `schema drift after 0021`. This is the highest-probability failure **and it fails late** — by then `install_registration_compatibility_route` has already rerouted `POST /api/register` to a permanent 410 with no transaction journal to revert, and the schema epoch is pinned `pending` at `0056`, forcing every retry to the identical digest and commit. Check with a `pg_dump --schema-only` diff against a fixture replayed to 0021.
2. **Rollback is one-way.** Once the compatibility floor reaches `0056`, every pre-`0056` digest is refused (`rollback refused: digest older than schema compatibility floor`). Plan forward-fix only. Take `pg_dump` **and** `pg_dumpall --globals-only` — a plain dump misses the four cluster roles `0056` creates and the database-level ACL revokes.
3. **The migrations themselves are safe.** Zero `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/`ALTER COLUMN TYPE`/`SET NOT NULL`/`RENAME` across all 35. Every `DELETE FROM` is inside a `CREATE FUNCTION` body, not executed. Locking on the one populated legacy table (`users`) is catalog-only and milliseconds. The single backfill touches tables that are empty in production.
4. **`DB_MIGRATOR_USER` must be a true superuser** — `0056` requires `rolsuper`, stricter than the gate's own preflight, and it is the 35th of 35 files.
5. **`sealAppWorkerCustody` revokes `EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC` cluster-wide.** If any 0021-era code path relies on a `PUBLIC` function grant rather than its explicit `music_runtime` grants, the **old slot breaks the moment 0056 commits — while it is still serving traffic.** Worth a deliberate check.
6. **Accept that `POST /api/register` returns 410 permanently** and `tunes-register-compat` becomes a standing service.
7. ✅ **Verified present:** `MUSIC_DEPLOY_STATE_HMAC_KEY`, `TUNES_DEPLOY_KNOWN_HOSTS`, `TUNES_DEPLOY_SSH_FINGERPRINT` as `tunes-production` environment secrets; all 12 environment-policy conditions; dispatch inputs `validated_run_id=38932754560` and `music_validated_run_id=38932754401`.
8. Still to confirm on the host: the four new `:?` vars in `production.env` with real values, the host `docker-compose.yml` at `8469a063`, a valid `music-schema-floor.tsv`, no stale `deployment-transactions/.current`, exactly one file in `deployment-routing/`, and public TLS reachability for the 20-second promotion probe.

In `legacy-music` mode the four media vars are render-gated but never runtime-validated, so junk values deploy cleanly and only fail on the canonical flip. Set them correctly now.

---

## Phase 5 — Paste-a-link enrichment (parked, needs a policy reversal)

Not scheduled. Recorded here so the scope is known.

`priceParsing.ts:5-6` states the scrape endpoints are tombstoned and **"reviving it is forbidden by epic-04 and epic-07."** Restoring it needs that decision overturned first, and for People it reverses a documented choice not to copy third parties' profile images.

If it is ever taken up:
- The template already exists and ships: `BookCoverImportService` (`books.google.com`) and `MovieMediaImportService` (`image.tmdb.org`) both fetch a remote image and store it as owned media in our S3, with a three-phase command receipt so remote I/O stays outside the transaction.
- `appEnrichmentFetch.ts` is a hardened configurable-host fetcher — SSRF re-checked per redirect hop via `publicAddress()`, DNS pinned into the connect, byte caps re-counted while streaming, magic bytes cross-checked against the declared MIME. It is built and **dormant**: `canonicalApp.ts:108` passes an empty source list.
- The tombstones are **path-scoped**, so a canonical route such as `/api/explorers/v1/recommendations/:id/product-enrichment` collides with none of the retirement guards or the 410 contract. The cost is the fail-closed allowlist plus regenerating two committed inventory JSONs and the `199/15/37` route-count pins.
- The genuinely new risk is **arbitrary-host** fetching: everything live is host-pinned, and the config validator refuses an empty or IP-bearing allowlist. Owner enrichment routes also have no HTTP rate limit today.
- Puppeteer was retired along with its 248-finding CVE suppression and should stay retired.

---

## Not in scope

- Switching production to the canonical backend. No shipped compose file sets `EXPLORERS_API_MODE: canonical` for the live topology, and `/health/ready` in `legacy-music` actively requires Strapi secrets.
- The frontend deploy path (`explorers.yml` is `if: ${{ false }}`; Netlify is not connected).
- Removing `codex/unified-replatform` from `ci.yml`/`test.yml` and its contract in `replatform-workflow-authority.test.ts:20` — still a wanted follow-up, same commit.
