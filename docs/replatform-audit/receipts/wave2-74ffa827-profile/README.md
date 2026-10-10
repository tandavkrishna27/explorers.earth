# Focused Profile qualification

Exact clean head: `74ffa8271a40009897ead773ae70f5a0d8d73269`.
Source hash: `ad72acc161cccac63493b4c24617ee843dd43918ba24c314e59b60882d9b218d`.

All six Profile identities passed once, with zero retries or skips. The official
lane validator accepted the receipt, source stayed unchanged, and cleanup and
artifact checks passed. Root also observed zero exact-commit containers, no
protected marker and no fresh Profile private directories after terminal exit0.

Both onboarding identities failed in the earlier aggregate run at `c6146c1d`.
They did not fail here; the diagnostic catch was therefore not exercised.
The original native assertions and business behavior are unchanged. This pass
does not establish that the intermittent failure is repaired or its cause known.
It qualifies this six-identity lane at this head only, not the full manifest,
newer source, hosted CI, or completion of Wave 2.
