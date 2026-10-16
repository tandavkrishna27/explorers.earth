# The route-graph invariant — ticket 1.2's open obligation

**2026-10-08.** Step 11 of [the sequence](remaining-work-sequence.md). Written because
`scripts/replatform-route-parity.ts` now points failing CI runs at this file.

## What the invariant says

[Ticket 1.2](tickets/ticket-1-2.md) (restated at `epics/epic-01.md:106`) requires the platform
fixture runtime to mount **the same canonical application route graph as the replacement
production runtime**, asserting "auth, profiles, content, analytics, lifecycle and Music routes
are present as their owning epics land", with external providers injected as fixtures.

The 2026-10-05 independent review found the invariant passing **vacuously**: the inventory
probed six legacy/Strapi/analytics paths and the test pinned the count to exactly `6`, so a
missing canonical route could not fail it.

## What was actually wrong, which is one level deeper than "under-probed"

The review's diagnosis was right and incomplete. The inventory listed no canonical routes
because **the fixture runtime does not serve any.**

- `docker-compose.replatform.yml:56` and `:106` set **`EXPLORERS_API_MODE: legacy-music`**.
- `server/apiMode.ts` makes that selection explicit and total: `legacy-music` starts
  `config/music-startup`, not `auth/canonicalStartup`.
- The legacy composition in `server/routes/index.ts` mounts, from the whole Explorers set,
  only `setupExplorersAnalyticsRoutes` (`:191`) and `setupExplorersPublicProfileRoutes`
  (`:186`). It mounts **no** Better Auth group, no `/health/live`, and none of the
  `/api/explorers/v1` owner routes.

So the fixture is not a canonical runtime with a thin inventory. It is the **legacy** runtime,
and the invariant is unsatisfied at its root. An inventory extension cannot make it pass; it
can only make it tell the truth.

## What changed on 2026-10-08, and what it costs

The inventory now carries five canonical probes beside the original six, and the expected
count is **derived from the inventory** rather than typed in, so adding a probe without a
response fails loudly instead of silently raising a number nobody re-checked:

| Probe | Expectation | What it proves |
|---|---|---|
| `GET /health/live` | 200, `status` = `live` | the canonical app is the thing answering, not the legacy server |
| `POST /api/auth/sign-in/social` | 403, `error.code` = `FORBIDDEN` | the Better Auth group is mounted **with its origin guard ahead of the handler** |
| `GET /api/explorers/v1/me` | 401, `error.code` = `UNAUTHENTICATED` | canonical profile identity |
| `GET /api/explorers/v1/account/lifecycle` | 401, `error.code` = `UNAUTHENTICATED` | canonical account lifecycle |
| `GET /api/explorers/v1/collections` | 401, `error.code` = `UNAUTHENTICATED` | canonical owner content |

**Every expectation is measured, not read off a handler.** Each was taken from the real
`createCanonicalApp` via supertest, and that measurement is now a standing contract in
`tunes/server/test/contracts/platform-route-signatures.test.ts`, which drives the same probe
list against the real app. That test is what stops the inventory describing nothing — an
internally consistent inventory was precisely the earlier failure. It needs **no container**,
which is also measured rather than assumed: none of the five paths touches the database, and
the test asserts the stub pool recorded zero queries, so if a future route starts querying on
an unauthenticated request the test says so.

The probe mechanism gained two things it needed for canonical routes: a request `method`
(the auth-origin probe is a POST) and dotted field paths (canonical errors are
`{error:{code,message,requestId}}`, nested, where every legacy probe asserted a flat field).

### The cost: `platform:test:routes` will fail in CI, by design

`.github/workflows/test.yml:302-310` provisions the fixture and runs
`npm run platform:test:routes`, which calls `verifyPlatformIngress`. Against a
`legacy-music` fixture, the five canonical probes are absent, so **that job now fails.**

That is the ticket's mandated behaviour — "a canonical route promised by a landed epic and
missing from the fixture graph is a failure, not a skip" — and it is the first time the
invariant has been able to fail at all. The failure message carries its own diagnosis rather
than a bare mismatch, naming the mode, the cause and this file.

**If that red is not wanted yet, the revert is one commit** and it restores the vacuous pass;
it does not restore correctness.

## The part of the ticket that cannot be satisfied as written

The 1.2 correction asks for two things that a single-mode runtime cannot both provide:

- "Do not weaken or delete the existing six probes" — but `/api/check`, `/api/csrf-token`,
  `/api/user/reactivate` and the `/api/users/me` Strapi boundary are **legacy-only** surfaces.
  The canonical app serves none of them.
- "Extend the inventory with the landed canonical routes" — which the legacy runtime does not
  serve.

One runtime cannot answer both sets. So closing this obligation requires an owner decision
about sequencing, and it is not an engineering detail:

1. **Flip the fixture to `EXPLORERS_API_MODE: canonical`** and retire the legacy six with the
   legacy server in step 12. This is the end state, and it is a real package: canonical
   startup needs its own environment (`EXPLORERS_PUBLIC_ORIGIN`, the Google client
   configuration, canonical schema readiness), and the existing fixture E2E lanes are built on
   legacy endpoints, so they move with it.
2. **Run both graphs in the fixture** during the transition — two services behind the one
   ingress — so both probe sets pass until the legacy half retires. More fixture surface, but
   the invariant goes green honestly rather than vacuously.
3. **Accept the red** until step 12 reaches the fixture, treating the failure as the tracking
   signal it now is.

Option 1 is the destination either way; the choice is whether the fixture moves now or the
job stays red until step 12. **Neither is mine to pick**, and neither is a reason to delete a
probe.

## Preserved unchanged

The production half of the invariant is untouched: production must still reject fixture
session authority even though the route graph is equivalent, asserted by
`assertCanonicalPlatformRouteGraph` and its existing case in
`platform-route-parity.test.ts`.

## Reproducing

```bash
# the inventory's own behaviour, and the canonical signatures against the real app
npm test --prefix tunes -- --run server/test/contracts/platform-route-parity.test.ts \
  server/test/contracts/platform-route-signatures.test.ts

# the live fixture ingress (needs the provisioned fixture; fails while it is legacy-music)
npm run platform:local -- provision && npm run platform:test:routes
```

## What it would actually take to make this green — costed 2026-10-09

The invariant's own message says the remedy is to run the canonical composition. That had
been carried as an open-ended "owner decision". It is not open-ended; it is a bounded change
plus exactly one decision. Both are written out here so nobody re-derives them.

### The change, in full

The image's `CMD` is already `["node", "dist/server/api.js"]` — the mode-selecting
entrypoint — so flipping the variable is sufficient to switch startup. In
`docker-compose.replatform.yml`, for the `tunes` service:

1. `EXPLORERS_API_MODE: canonical` instead of `legacy-music`.
2. Add the four variables `resolveExplorersAuthConfig` requires:
   `EXPLORERS_PUBLIC_ORIGIN` (`http://127.0.0.1:51474` — a local HTTP origin is accepted,
   and it already matches `ALLOWED_ORIGINS`), `EXPLORERS_AUTH_SECRET` (≥32 characters),
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
3. Move the healthcheck off `/api/music-fixture/readiness`. That route is registered by
   `server/routes/musicFixtureProbe.ts` in the legacy composition only, so under canonical
   startup `compose up --wait` would fail on an unhealthy container before any probe ran.
   `canonicalApp.ts:65` mounts `/health/live`, which is also one of the five routes the
   invariant demands.

**No real credentials are needed, and this is worth stating plainly because it is the
assumption that made this look bigger than it is:** `betterAuth.ts` checks
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for *presence only* and
`EXPLORERS_AUTH_SECRET` for *length only*. Nothing contacts Google at startup, and the five
canonical probes do not exercise sign-in. Fixture placeholders in the same style as the
`SESSION_SECRET` and `STRAPI_JWT_SECRET` values already in that file are sufficient.

Everything else canonical startup needs is already configured on that service:
`MUSIC_DATABASE_USER: music_runtime_login` and `MUSIC_DATABASE_MIGRATOR_USER: music_migrator`
satisfy `verifyMusicRuntimeDatabaseConnection`, the migration gate runs ahead of it so
`checkMusicDatabaseReadiness` has its schema, and `EXPLORERS_MEDIA_ENVIRONMENT: local`
already selects the filesystem object store.

### The one decision, and why it is not a fixture tweak

`tunes/server/test/deployment/music-deployment-files.test.ts:33` is titled *"selects legacy
API startup for every Compose service using the Tunes API image"* and asserts
`legacy-music` across **all three** compose files — `docker-compose.yml`
(`tunes-blue`/`tunes-green`, i.e. production), `docker-compose.music-test.yml` and
`docker-compose.replatform.yml` — and asserts each uses the image's default entrypoint.

So `EXPLORERS_API_MODE` is a **coordinated cutover switch, pinned consistent between
production and the fixtures by a deliberate guard**. Moving the fixture alone means editing
that guard to carve out an exception, which asserts that fixture and production startup may
diverge. That is the decision, and it belongs to whoever owns the cutover sequence — not to
a feature branch, and not to an agent tidying a red check.

**Do not** flip the fixture and amend the guard to make this green. If the sequence calls
for the fixture to lead production, amend the guard deliberately, with that intent in the
commit, and expect the five probes to start passing as a result.

### Correction: the change above is necessary but NOT sufficient

The costed change in the previous section would switch the fixture to canonical startup. It
would **not** make `platform-fixture` green, and anyone acting on that section alone would
be surprised. Ticket 1.2's own text, which I should have read before costing this, says why:

> Closing it needs an owner decision on sequencing, because this ticket asks for two things
> one runtime cannot both provide — keep the six legacy probes (`/api/check`,
> `/api/csrf-token`, `/api/user/reactivate` and the `/api/users/me` Strapi boundary are
> legacy-only) *and* require canonical routes the legacy runtime does not serve.

So the probe set is **self-contradictory against any single runtime**. Today five canonical
probes fail. Flip the mode and the six legacy probes fail instead — a different red, not a
green one. The two sets cannot both pass in one composition, which is the whole of the
sequencing decision: what should the fixture prove, and during which phase of the cutover.

Two further constraints from the same ticket, both of which outrank a tidy-up:

- **"Coordinator allocation is required before any writer starts."**
  `scripts/replatform-route-parity.ts` and
  `tunes/server/test/contracts/platform-route-parity.test.ts` are shared files every epic
  landing a canonical route must extend. The ticket asks for an exclusive window and no
  overlapping writers.
- **"Preserve the production half of the invariant unchanged"** — production must still
  reject fixture session authority even once the route graph is equivalent.

The previous section therefore stands only as an inventory of *what the canonical half
costs*, not as a fix. The `music-deployment-files.test.ts` cross-file pin remains a real
second obstacle. Neither is the blocker on its own: **the blocker is that the acceptance
criteria contradict each other and someone has to choose.**

## OWNER DECISION, 2026-10-09: leave it red and accept it at merge

Asked and answered. Of the four options costed above and in the handoff — accept the red,
flip the fixture to canonical and amend the cross-compose guard, narrow the probe set, or
downgrade the gate to advisory — the owner chose **accept the red at merge**.

So this is no longer an open question, and the practical consequences are:

- **`platform-fixture` and `music-required` stay failing, by design and by decision.** Do
  not "fix" them. Not by deleting a probe, not by lowering
  `EXPECTED_PLATFORM_PROBE_COUNT`, not by reverting `b4975654`, and not by flipping
  `EXPLORERS_API_MODE` on the fixture.
- **Merging PR #121 requires accepting one known-failing required check.** That is the
  decision, taken deliberately with the alternatives priced.
- The canonical cutover work stays unscheduled. The costing in the sections above remains
  valid for whenever it is picked up, including the correction that the mode flip alone
  trades five failures for six.
- Step 12's server-side remainder stays gated behind that cutover — except what was already
  measured dead in **both** runtimes, which is deleted (`30475300`, 378 lines, green in CI).

