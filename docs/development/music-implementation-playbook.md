# Music identity implementation playbook

Decision A: after verified Explorer authentication and completed Account
selection/onboarding, provision person-owned Music state keyed by immutable
Account context. Every eligible Explorer receives core personal Music; venue
and premium features remain separately entitlement-gated.

## Safe golden path

```text
nvm use
npm ci
npm run music:bootstrap
npm run music:doctor
npm run music:up -- --detach --wait
npm run music:test:smoke
npm run music:down
```

The initial root `npm ci` is the only launcher prerequisite. It installs the
root-owned `tsx`/typed-config runtime; `music:bootstrap` installs both child
lockfiles and does not replace its own active root dependency tree.

Use the canonical public JSON form `npm run --silent <music-command> --
--format json`; `--silent` is required so stdout is exactly one machine-parseable
JSON envelope. The target is ten minutes
cold and five minutes warm on Windows and Ubuntu; record actual timing in the
run artifact. Use only `docker-compose.music-test.yml`, project
`explorers-music-fixture`, PostgreSQL 15, deterministic fixture Strapi and the
generated disposable `.env.music.test`. The isolated topology exposes fake
Strapi on `127.0.0.1:51337`, an actual production build/process of Tunes on
`127.0.0.1:55000`, and an actual Explorers build served by its Nginx process on
`127.0.0.1:55173`; health dependencies gate each service. A fixture-only Tunes
readiness route queries PostgreSQL and reads the fake Strapi current-user
contract. Explorers' fixture Nginx configuration proxies that same route to
Tunes without any production endpoint. `music:test:smoke` verifies direct
Strapi evidence, Tunes -> PostgreSQL/Strapi mediation, the Explorers build, and
the Explorers -> Tunes path.

## Safety sequence

1. Run `music:doctor`; it checks Node ^24.21.0, npm/Compose availability,
   required files, typed/ranged control values, fixture version and gates, free
   ports/disk, and the exact disposable `DATABASE_URL_TEST` target. The same
   typed schema is invoked by Tunes startup whenever `MUSIC_MODE` is enabled.
2. Never call live Strapi without `--mode live`, a separate read-only
   credential, and TK's identity-owner endpoint review.
3. Preserve fixture volumes by default. Use `music:down -- --volumes
   --confirm-project explorers-music-fixture` only for the labeled project.
4. Before C12 production mutation, obtain TK's separate explicit approval and
   a signed preflight. A local empty database is not proof.
5. On the disposable PostgreSQL 15 target, run `npm run music:db:status -- --target test`, `npm run music:db:migrate -- --target test`, then `npm run music:db:verify -- --target test`. These commands reject ambient
   `DATABASE_URL`; schema push is not a migration substitute.

## Incident recovery

Use the final JSON `checkpoint` artifact to resume only the same commit,
fixture version, gate values and environment fingerprint. On interruption use
`music:down`, retain volumes, inspect the checkpoint, then restart `doctor`.
Disable provisioning using `MUSIC_PROVISIONING_KILL_SWITCH=true`; reconciliation
remains disabled until an explicit cohort and row ceiling are approved.
