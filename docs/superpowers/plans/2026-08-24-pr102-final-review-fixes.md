# PR 102 Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the three verified Codex findings by making the production image bootable, preserving authorized empty unlisted publications, and reporting all high/critical image vulnerabilities without weakening the actionable-vulnerability gate.

**Architecture:** Keep production-safe server utilities outside the Vite development module so the runtime graph contains only production dependencies. Treat publication authorization independently from playlist population. Split image scanning into a blocking actionable scan and a complete non-blocking disclosure scan whose report is retained by CI.

**Tech Stack:** TypeScript, Express, Vitest, esbuild, Docker, GitHub Actions, Anchore Grype.

**Spec:** GitHub PR 102 Codex review threads on commit `64a3b06061`.

## Global Constraints

- Preserve the existing isolated branch and do not touch the unrelated `explorers-earth/public/sitemap.xml` working-tree change.
- Use red-green TDD for every behavior change.
- Do not add Vite or Nano ID to production dependencies.
- Keep fixable high/critical vulnerabilities blocking image publication.
- Make unfixed high/critical findings visible and retain their report for audit.

---

### Task 1: Production-safe server utility boundary and image startup proof

**Files:**
- Create: `tunes/server/runtime.ts`
- Modify: `tunes/server/app.ts`
- Modify: `tunes/server/vite.ts`
- Modify: `.github/workflows/tunes.yml`
- Test: `tunes/server/test/deployment/music-deployment-files.test.ts`

**Interfaces:**
- Produces: `log(message: string, source?: string): void` and `serveStatic(app: Express): void` from `server/runtime.ts`.
- Consumes: the existing `setupVite(app, server)` development-only interface.

- [x] Add a deployment contract that rejects production imports from `./vite` and requires an exact-image production-graph smoke step.
- [x] Run the focused deployment contract and confirm failure on the current code.
- [x] Move `log` and `serveStatic` into `server/runtime.ts`; update production imports while leaving Vite-only code in `server/vite.ts`.
- [x] Add a bounded Docker smoke step after image construction that loads the real production app/runtime graph without binding a listener.
- [x] Run the focused deployment contract, scoped TypeScript, production build, and exact image startup reproduction; confirm all pass at the intended boundary.

### Task 2: Authorized empty unlisted publication

**Files:**
- Modify: `tunes/server/repositories/musicDomainRepository.ts`
- Test: `tunes/server/test/music-domain-repository.test.ts`
- Test: `tunes/server/test/music-surface-routes.test.ts`

**Interfaces:**
- Produces: `resolveGuestResource(slug, capability)` returns `{ state: "unlisted", noindex: true, playlist: PublicPlaylist }` for every valid active unlisted capability, including an empty playlist.
- Preserves: private, revoked, invalid-capability, and public behavior.

- [x] Add a repository regression test with `has_visible_playlist: false` proving a valid unlisted capability receives an empty playlist.
- [x] Run the focused repository test and confirm it fails because `playlist` is undefined.
- [x] Remove the content-existence condition from the authorized unlisted return branch.
- [x] Add or refine the HTTP regression assertion proving the empty representation returns 200 with `X-Robots-Tag: noindex, nofollow`.
- [x] Run repository and surface-route suites and confirm both pass.

### Task 3: Complete vulnerability disclosure plus actionable gate

**Files:**
- Modify: `.github/workflows/tunes.yml`
- Test: `tunes/server/test/deployment/music-deploy-workflow-security.test.ts`

**Interfaces:**
- Produces: one blocking `only-fixed: true` high/critical scan and one full `only-fixed: false` disclosure scan with `continue-on-error: true` and an uploaded SARIF artifact.
- Preserves: no image push before the blocking scan succeeds.

- [x] Add a workflow-security regression test requiring distinct actionable and complete scan steps, full-scan non-blocking semantics, and retained report upload.
- [x] Run the focused security test and confirm failure against the single current scan.
- [x] Rename the blocking scan for clarity, add the complete SARIF scan, and upload its report with `if: always()` before registry push.
- [x] Run the focused security and deployment contract suites and validate the workflow syntax.

### Task 4: Review, verification, GitHub disposition, and CI

**Files:**
- Modify only files required by Tasks 1-3 and this plan.

**Interfaces:**
- Consumes: all regression tests and exact-image proof above.
- Produces: reviewed commit, evidence-backed thread replies, fresh Codex review request, and observed CI result.

- [x] Review the full branch diff against the merge base for correctness, security, test quality, and documentation impact; fix any actionable findings.
- [ ] Run clean install, complete unit/integration/contract qualification required by the Tunes workflow, scoped and baseline TypeScript, production build, Docker build/startup smoke, and both Grype scan modes.
- [ ] Confirm `git diff --check`, inspect status, and verify the unrelated sitemap remains unstaged.
- [ ] Commit only scoped files, push the branch, and reply to each Codex thread with the exact root cause and verification evidence.
- [ ] Request a fresh Codex review and watch every required CI check to a terminal result; investigate any failure before reporting completion.
