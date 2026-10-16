# Apps/Places selected SQL RED

Exact source: f42028330e049acce8c37945965510ddb8d62fbc.
Pinned Node24.21.0, existing owned PostgreSQL15 and canonical local storage.
Exactly eight selected cases: two schema-safety passes, six assertion failures,
zero selected skips. Four public-positive assertions observed false entitlement
(line68); two aged-attachment exclusion assertions failed (line134).
The normal attached-deletion assertions were not reached in this first run.
Database, secret and storage cleanup passed; exact-source container count was zero.
The retained result is byte-identical to the safe private execution result.
Private raw logs, report bodies and authority/secret metadata are not copied.
This is deliberate selected regression RED, not native, aggregate or hosted qualification.
