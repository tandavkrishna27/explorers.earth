# Apps startup failure at 420e13c6

Byte-preserved protected records from the selected official Apps attempt at
`420e13c6895d0ae70d4c997b7244167db0079bce` on 2026-10-10.

The run is failed, not qualified. Source remained intact and clean. No identities
were discovered or executed. The protected record reports startup failure and
failed cleanup (`control`, `private-directory`); those failures are not waived.
An initial lookup used an incorrect container label and was not valid resource
evidence. Correct inspection using `com.explorers.music.uat-database=true` and
this exact `com.explorers.music.commit` found retained container
`explorers-music-uat-db-b1b0579261e7d0ffd2c3410bc77b5d5d`. It is preserved for
diagnosis; no cleanup is inferred from an empty wrong-label lookup. Startup
diagnostics are the next required investigation step. Older hosted checks do
not qualify this head.
