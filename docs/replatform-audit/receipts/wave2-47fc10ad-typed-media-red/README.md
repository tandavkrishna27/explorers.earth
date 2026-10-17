# Apps/Places selected SQL RED with direct deletion witnesses

Exact source: 47fc10ad5aa9c800a0ba839192ce0f8a282657b1.
Ten actual selected cases: two schema-safety passes, eight failures, zero selected skips.
Public eligibility and aged cleanup failures reproduced. Both isolated deletion
cases reached MediaRepository.markDelete and the actual App screenshot/Place photo
ready-owned image guards. The missing reference checks cause COMMIT failure;
these guards prevent the attached status transition. No byte deletion is claimed.
Database, secret and storage cleanup passed; exact-source containers were absent.
The result copy is byte-identical. Private logs/authority/secret metadata are omitted.
Selected SQL RED only; no native, aggregate or hosted qualification.
