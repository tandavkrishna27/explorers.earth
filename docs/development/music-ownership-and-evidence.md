# Music identity ownership and evidence matrix

These are interim solo-project assignments. Replace them in this matrix before
another human joins or production on-call is delegated. TK is final human
approver. The independent technical review is performed by the Codex task
reviewer required by the SDD workflow. Production mutation requires a separate
explicit TK authorization at C12.

| Task | DRI | Reviewer / approver | Entry evidence | Start | Exit | Artifact / checkpoint | Handoff | Rollback owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C0 topology/contracts | TK (product, identity, DB, frontend) | Codex reviewer / TK | clean worktree, baseline | `music:bootstrap` | `music:test:smoke` | `.artifacts/music-runs/*/checkpoint.json` | TK | TK |
| Strapi contract capture | TK (identity owner) | Codex reviewer / TK | explicit RO credential + endpoint review | `music:fixtures:capture -- --mode live` | sanitized fixture review | capture artifact | TK | TK |
| DB cutover | TK (DB owner) | Codex reviewer / TK | signed preflight + restore proof | C12-approved command | migration evidence | migration checkpoint | TK | TK |
| Provisioning rollout | TK (product owner) | Codex reviewer / TK | approved cohort/kill switch | implementation command | reconciliation evidence | rollout checkpoint | TK | TK |
| Incident/deployment | TK (incident owner) | TK | incident ticket and last checkpoint | `music:down` | recovery verification | incident artifact | TK | TK |
