# Native Games authority-port repair independent review

Verdict: BLOCKED by one P2 diagnostic-containment defect. The authority composition itself is sound, but this freeze is not ready for its follow-up commit.

Reviewed frozen paths and SHA256 values:
- games.integration.test.ts: 9995c5d1252bdf236b8e3e6322ddb38c8e0ecb78421a3195a4f88caa8aedbac4
- games-owned-postgres-authority.ts: f86e5f1912165e1133612b4dffc227725237354b778d5ff808e4cc6477da6f3f
- games-owned-postgres-authority.test.ts: ddc56fa956e7e0d7d5be7cc4b45af9486bb512305377b9b61620e1c1dd90137a

Independent supported Node24.21 execution in the owned source-lf facility passed both exact contract selectors: new authority31 plus qualification-lanes72 =103 PASS, zero failures/skips (tool d9efce). An initial incorrect lane selector executed only31 and is not counted as103. Writer's approved51644 old-predicate RED30/1 remains meaningful historical evidence; this review did not execute PG or Docker.

The integration suite reads actual executing Git HEAD with a bounded child process and invokes preflight before any pool/provisioning. The helper requires explicit C3/C5/target, excludes any defined UAT authority, requires nonundefined existing full C10 attestation, and invokes the strict integration target validator before returning the URL. Parsed environment port alone cannot authorize a facility. Synthetic attestation tests are not live-container evidence.

## P2: fourth Docker read can expose raw native error

The shared existing attestC10StandalonePostgresAuthority catches context/container read errors, but its image-inspect dockerRead call is outside that catch. The new owned helper forwards this exception without containment. An independent no-resource reproduction supplied valid synthetic context/container inspection and threw PRIVATE_SENTINEL_IMAGE_READ only on image inspection. The outside catch observed imageReadRawSentinelLeaks:true (tool d9efce). No credential value was printed. Current read-failure tests throw on the first context call and therefore miss this path.

Repair only the owned helper and contract test: contain all native Docker read phases with fixed safe diagnostics while preserving the existing full attestation and strict target validation. Add per-phase failures/malformed hostile outputs, including fourth image inspection, asserting no native-message or credential disclosure and no pool continuation. Do not weaken authority or modify the shared production attestation helper.

After repaired freeze, independently review finite tests and exact source binding. A separate follow-up commit must retain42b1 history. Actual Games12 execution needs a fresh current-HEAD attested facility; old84 PASS/12 blocked is not qualification of those12. Exact committed canonical82/images/hosted verification and full provider parity remain separate gates.

## Corrected freeze rereview: PASS

The original P2 remains recorded above as historical rejected-freeze evidence. Corrected helper catches all exceptions from the full existing attestation and throws fixed Games C10 attestation failed without a raw cause. Shared attestation is unchanged; authority and strict target/pre-pool ordering are preserved. Four meaningful per-phase native read negatives include the previously missed fourth image inspection and verify safe fixed message, absent cause and no pool continuation.

Independently executed supported Node24.21 exact authority and qualification-lane selectors:107 PASS, two files, zero failures/skips (tool6581ab). All three primary/private bytes match the corrected manifest. Corrected hashes: integration9995c5d1252bdf236b8e3e6322ddb38c8e0ecb78421a3195a4f88caa8aedbac4; helper7ffa074b9dfe8c4d11e953feee34d8d8af091d4b67e68e16617e43de84628568; contract a9e5860ba9d61fd8f492a06cfa564e07e509264c2a01f0de4653130b514a1836.

Scoped three-source follow-up commit readiness PASS, with only explicitly inventoried curated report/hash/review/plan evidence. No implicit broad staging. Preserve42b1 and failed qualification history. Exact committed archive qualification and fresh current-HEAD fully attested facility must execute actual Games12 before native delivery qualification; current synthetic107 is not live authority evidence. No resources were started in this review; canonical82/images/hosted/fullIGDB parity remain separate obligations.
