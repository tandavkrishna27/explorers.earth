# CI and baseline execution inventory

Inventory began at source `79ef17d0b88c7e11b49d618fc7c888a513f29fa8`. Current-source validation is recorded at `efd3b819510976f5dcd275b5147ed998020dea76` in [the exact-head hosted record](evidence/2026-09-30/hosted-efd3b819.md) and [local screenshot record](evidence/2026-09-30/local-fixture-efd3b819/record.md). This is not a green replacement-feature baseline. [Ticket 1.3](../replatform-audit/tickets/ticket-1-3.md) owns trigger changes and required-check configuration.

## GitHub required checks

The initial read-only inventory found `required_status_checks: null` and an HTTP 404 for the disabled required-check subresource. Ticket 1.3 then initialized main protection. A fresh read-only `gh api repos/tandavkrishna27/explorers.earth/branches/main/protection/required_status_checks` on 2026-09-30 returned `strict: true`, contexts exactly **`replatform-required` and `music-required`**, both associated with GitHub Actions app ID **15368**. The [settings evidence](evidence/main-protection-settings.json) records the before/request/after comparison and existing administrator bypass. Workflow job names are not additional required contexts.

## Existing lanes and deferred run record

| Lane | Current source / command | Authority and interpretation | 1.1 result |
|---|---|---|---|
| Frontend unit/type/lint/build | `explorers-earth/package.json`: `npm run test:unit`, `npx tsc -b`, `npm run lint`, `npm run build` | Vitest containment; build includes static generation | Hosted exact-head jobs success; see record |
| Existing browser smoke | Five bounded Playwright jobs in `.github/workflows/ci.yml` | Current UI specs, many mocks/intercepts; not replacement real-API parity | Five hosted jobs success; local About/Use Cases screenshots separately |
| Public Music read-only | Root `music:test:public-fast`, `music:test:public-pr`, `music:fixture:public:verify` | Mocked/PR-safe and harness verification; not a real replacement API result | Current Music browser job success; individual command coverage is not inferred from job name |
| Music real fixture | Backend `database` and `platform-fixture` jobs in `.github/workflows/test.yml` | Disposable real PG/current Music identity and route graph, not canonical account/category data | Both hosted jobs success; local provision/check/seed twice/six route probes success |
| Full performance/recovery | Music nightly/load/chaos and recovery drills | Separate milestone/operations lanes | `load-chaos` skipped by ordinary PR policy; recovery drill deferred |

`docs/testing.md` documents existing commands and the fixture authority contract. `explorers-earth/playwright.config.ts` uses one worker, two CI retries, traces retained on failure and screenshots only on failure. `chromium-pr-safe` matches all `.spec.ts` files while Music fixture/live and visual project patterns overlap; a bare `playwright test` cannot be reported as a bounded lane. Existing `explorers-earth/e2e/{books,movies,games,apps,products,people,locations,guides,analytics,account-lifecycle,category-navigation,music*}.spec.ts` are coverage seeds, often mocked, and need real route-graph replacement checks as their owning tickets land.

The audited workflows included `.github/workflows/ci.yml`, `explorers.yml`, `tunes.yml`, `tunes-deploy.yml`, `test.yml`, `music-reconcile.yml` and the expired temporary direct-deploy workflow. Ticket 1.3 subsequently separated validation and release authority, retired the temporary workflow, and established the two required aggregates; its [check map](ci-check-map.md) and hosted evidence hold the current trigger record. No QA or production deployment is claimed here.

## Baseline execution gate

The current-source run records now document source SHA, authority, command/steps, results and desktop/mobile captures. A Windows reserved port range includes 55178, the hardcoded category-navigation fixture port; its local suite was not run and no application/test config was changed. Hosted category lanes passed at the exact head. Use real replacement-API browser runs only after canonical route/persona fixtures and egress containment land. Do not mark a matrix scenario passed from a mocked test, an old snapshot, a workflow definition or a skipped project. The current baseline handoff is documented; per-scenario replacement acceptance remains **open**.
