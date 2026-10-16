# Current command custody

Inspected from integration source on 2026-10-05, and corrected the same day against a completed independent read-only review. No browser or test run is implied, and nothing here authorizes one.

## The outer CLI: `platform:test:e2e`

`package.json` defines `platform:test:e2e` as `node scripts/replatform-e2e.mjs` and `platform:release` as `tsx scripts/platform-release.ts`. The current browser runner is a protected finite delivered-slice runner.

`parseArguments` (`scripts/replatform-e2e.mjs:46-52`) requires **exactly six argument tokens** and accepts **exactly three flags**:

```
--milestone delivered-auth-profile-books
--ack TASK4_FIXTURE_OWNED_DISPOSABLE_PG15
--receipt <absolute fresh directory directly under the OS temp dir, named replatform-e2e-<8-64 chars>>
```

Any unknown, duplicated or missing flag fails (`:47`); a wrong scope or acknowledgement fails (`:48`); a receipt path that is relative, nested deeper than the temp root, mis-named or already existing fails (`:49`), as does a symlinked or non-owned parent (`:50`). `assertEnvironment` (`:43-45`) additionally refuses to run under `NODE_ENV=production` or with any ambient database, Docker, hosted-fixture or production-authority variable set. Despite the compatibility name of the scope token, its current manifest has auth / profile / Books / lifecycle / Movies / Games lanes.

**Flags that do not exist on this outer CLI** — numeric `--milestone 1|2`, `--project desktop-chromium|mobile-chromium`, and `--environment local|qa` — **are proposed interfaces, not executable current commands.** Do not invoke the hypothetical generic command and do not weaken the current guard to support it.

## Correction: `--suite` is live, on the inner fixture runner

A prior revision of this doc listed `--suite` alongside those three non-existent flags. That was an overcorrection and must be scoped.

`--suite` **does not exist on the `platform:test:e2e` CLI** (`parseArguments:47` rejects it as an unknown flag). But `--suite` **is a live, load-bearing flag of the inner fixture runner**:

- `scripts/replatform-e2e.mjs:172` builds the child selector `lane.name === 'auth' || lane.name === 'lifecycle' ? ['--suite', lane.name] : []` and passes it to `tunes/scripts/profile-browser-fixture.ts`.
- `scripts/replatform-e2e.mjs:166` pins the `tunes` package scripts and **fails qualification** if they drift: `explorers:test:auth-browser` must equal `tsx scripts/profile-browser-fixture.ts --suite auth`, `explorers:test:lifecycle-browser` must equal `tsx scripts/profile-browser-fixture.ts --suite lifecycle`, and `explorers:test:profile-browser` must equal `tsx scripts/profile-browser-fixture.ts` with **no** `--suite`.

An executor who reads "`--suite` is not executable" and rewrites `profile-browser-fixture.ts` to drop the flag, or edits those `tunes` scripts, will trip the `:166` pin and hard-fail protected qualification. **`--suite` on the inner runner is a working interface to preserve, not a documentation error to remove.**

## Correction: real config and project names

`explorers-earth/playwright.replatform.config.ts` does not exist in this inspected tree, and neither do the project names `desktop-chromium` / `mobile-chromium`. The actual configs and their actual project names are:

| Lane | Config | Project names |
|---|---|---|
| auth, profile | `explorers-earth/playwright.config.ts` | `chromium-pr-safe` |
| books | `explorers-earth/e2e/replatform/books.playwright.config.ts` | `books-desktop`, `books-mobile` |
| lifecycle | `explorers-earth/e2e/replatform/lifecycle.playwright.config.ts` | `lifecycle-chromium` |
| movies | `explorers-earth/e2e/replatform/movies.playwright.config.ts` | `movies-desktop`, `movies-mobile` |
| games | `explorers-earth/e2e/replatform/games.playwright.config.ts` | `games-desktop`, `games-mobile` |

`explorers-earth/e2e/replatform/analytics.playwright.config.ts` also exists with projects `analytics-desktop` / `analytics-mobile`, but there is **no analytics lane in the runner or the manifest**, so it has no invoking command and its authored cases are unattested. Each config declares its own guarded fixture runner, `retries: 0` and `reporter: 'line'`.

## Correction: state the counts, with the tree each belongs to

A prior revision said only that "counts and configs are source-bound", which gave an executor nothing to verify against. Both numbers, verified 2026-10-05:

| Tree | auth | profile | books | lifecycle | movies | games | **total identities** |
|---|---|---|---|---|---|---|---|
| **Committed HEAD** (`225d83e5`) | 6 | 2 | 20 | 10 | 24 | 20 | **82** |
| **Current working tree** (dirty overlay) | 6 | **6** | 20 | **12** | 24 | 20 | **88** |

Source: `explorers-earth/e2e/replatform/suite-manifest.json` lane `identities` arrays, with the lane `count` declarations in `scripts/replatform-e2e.mjs:11` edited **in lockstep** — both files are modified in the working tree, so the 88 figure is overlay scope and the 82 figure is what any exact-SHA hosted or committed claim may cite.

Consequences for anyone quoting a number:

- **Any "delivered 88" or "12 accepted lifecycle cases" claim is working-tree only.** It is not attestable at `225d83e5` and must not be presented as committed scope. The dirty source must be independently reviewed before qualification.
- Because `replatform-e2e.mjs:11` and the manifest must agree, a lane count cannot be raised in one file alone. `validateManifest:54` compares the manifest's lane *names* against `Object.keys(lanes)`, and `validateManifest:55` fails with `Lane inventory/config mismatch` unless each lane's `runner`, `config`, `spec` path, `projects` **and** `identities.length === lanes[name].count` all match — plus, for Games, an exact identity-set equality against the ten pinned titles at `:12`. This is a coordinator-owned shared edit requiring an exclusive window, not a per-writer change.
- The aggregate 82 is the **sum of six lanes**. It is not a Games count and must never be reported as one; Games is 20 of it, Books 20, Movies 24.

## Correction: the pending ledger under-reports, and is floored

`validateManifest` (`scripts/replatform-e2e.mjs:54`) requires `manifest.pending.length >= 7` (and `manifest.limits.length >= 4`), with every pending entry carrying `ticket`, `obligation` and `status === 'pending'`.

The manifest has **exactly 7** pending entries — 2.4, 3.4, 3.5, 4/5, 6.1–6.3, 7.1/7.2, 8.1–8.4. It therefore sits **exactly on the floor**, with two effects that must both be recorded:

1. **The ledger under-reports.** Obligations for **8.5, 9.1/9.2 and 10.1/10.2/10.3** are absent from it. A reader treating `pending` as the outstanding-work register will miss the recovery drill, the public discovery surface and the linked creator tools entirely.
2. **Removing any obligation hard-fails qualification.** At exactly 7, deleting one entry drops below the floor and the runner refuses to run with `Invalid delivered-slice manifest or pending ledger`. So the ledger cannot be trimmed to look closer to done — but the correct remedy is to **add** the missing obligations, never to raise or remove the floor.

## Standing custody rules

Each new category ticket owns its guarded real-backend fixture, exact discovery and browser qualification contract, coordinating manifest registration as a separately reviewed shared edit. Ticket 3.5 owns a QA-specific guarded acceptance interface if one is needed; ticket 7.3 consumes reviewed category/Music runners rather than requiring one unrestricted generic wrapper. Their original desktop/mobile/local/QA behavior obligations remain mandatory even though the historical CLI spelling is superseded.

Add `scripts/replatform-e2e.mjs`, `explorers-earth/e2e/replatform/suite-manifest.json` and `tunes/scripts/*-browser-fixture.ts` to the coordinator-reserved set: every category and lifecycle package must touch them, and the runner's source freeze is **subtree-wide**, not per-file, so two writers in the same freeze roots cannot qualify in parallel.

An executor's source preflight must record: actual script, config and runner; exact expected discovery; source hashes; supported Node and npm (`replatform-e2e.mjs:157` demands exactly `24.21.0`, while all three `package.json` files declare `^24.21.0` — see the CI audit's pinning item); attested database authority; owned receipt and resource names; environment rejection rules; and the first failure. Do not expand CI, and do not perform unchanged full-suite runs, to resolve a documentation mismatch.
