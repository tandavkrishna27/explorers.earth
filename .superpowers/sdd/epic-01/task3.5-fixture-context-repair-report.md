# Ticket 3.5 Package A: generated fixture context repair

Frozen input: `37b7ea57ef926c19eeb3b32e41a2131817fa9cf1`. The hosted C0 and image failures reported the existing Music fixture context synchronization assertion. The runtime inventory check previously qualified a different producer and did not close this producer dependency.

## Diagnosis and repair

The normal `scripts/generate-music-fixture-dockerignore.mjs` producer obtains tracked production files through `git ls-files`. Package A introduced three eligible source files, absent from both tracked fixture context manifests: `explorers-earth/src/bootstrap.ts`, `explorers-earth/src/lib/publicRuntimeConfig.ts`, and `explorers-earth/src/lib/publicRuntimeContract.ts`.

Ran the unchanged producer with `--write`. Each manifest gained exactly those three explicit admissions (six inserted lines total). No generator, assertion, exclusion, workflow, source code, or default-deny policy changed. New tests and runtime renderer scripts are not admitted by this existing fixture producer. Package B remains separately owned.

## Verification

Clean detached qualification worktree: `C:/Users/TK/.codex/tmp/qa-fixture-context-37b`, exact frozen commit above, normal Tunes `npm ci` including auth-runtime postinstall, Node 24.21.0.

- RED: unchanged producer `--check` exited 1 with `Music fixture Docker context manifest is stale.`
- RED: selected synchronization test failed once in one canonical test file; six unrelated tests were unselected. Earlier shared checkout execution also collected an unrelated copied scratch repository, so its doubled result was not used for qualification.
- GREEN: unchanged producer `--check` exited 0 in both the clean qualification worktree and isolated integration worktree.
- GREEN: complete `server/test/contracts/music-compose-safety.test.ts`: one file, seven tests passed, zero skipped; 492 ms.
- Final source scope: `.dockerignore` (3 additions), `explorers-earth/Dockerfile.music-fixture.dockerignore` (3 additions), and this report only. The qualified clean generated manifests match the integration producer output. No hosted success is claimed until independent review and an exact-commit run.

Generated file SHA256 (LF working bytes): `.dockerignore` `bd7859df6e85ae027b2792a8647b6bfac41b53245fb54cf97770ab6da8952981`; `explorers-earth/Dockerfile.music-fixture.dockerignore` `84d062d0043dc7e223b1dede1ac266df6a99da36bbdc48a9a1dbb2f7b7ad46c7`. The producer check normalizes Git checkout line endings.

No containers, services, cloud resources, or deployment were started for this repair. The detached qualification checkout is retained for review. Broader Package A test/image proof is recorded in `task3.5-qa-web-runtime-report.md`; this repair qualifies only the existing fixture producer and safety contracts.

Future producer closure: adding tracked frontend source must refresh and check both the runtime surface inventory and this exact fixture context generator. Verifying one does not qualify the other.
