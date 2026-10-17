# Official historical fixture, never project authority

Immutable upstream source: https://github.com/cli/cli/tree/cf862d65df7f8ff528015e235c8cccd48cea286f/pkg/cmd/attestation/test/data (GitHub CLI v2.87.3, upstream MIT). These are public test files for a 2024 actions/attest-demo signing event, not Explorers artifacts or credentials.

SHA256 bytes:

- github_provenance_demo-0.0.12-py3-none-any.whl: ae57936def59bc4c75edd3a837d89bcefc6d3a5e31d55a6fa7a71624f92c3c3b
- github_provenance_demo-0.0.12-py3-none-any-bundle.jsonl: 4f8c096e38a0eee242574ab100d16701928605409225e59784a3636f742bb27e
- gh-2.87.3-verified-fixture.json: 4d2ee70e1e69635d4349e0f4ed8a13c2d09d8beb28446bac7a46ca74eea9d2d5 (actual successful Windows pinned verifier stdout, no reserialization)

Actual crypto reproduction with pinned gh 2.87.3:

```text
gh attestation verify github_provenance_demo-0.0.12-py3-none-any.whl
 --repo actions/attest-demo
 --bundle github_provenance_demo-0.0.12-py3-none-any-bundle.jsonl
 --signer-workflow actions/attest-demo/.github/workflows/build-python.yml
 --source-digest a6c23b9806c593664f68637c8f9d45dfcf98b2db
 --source-ref refs/heads/main
 --signer-digest a6c23b9806c593664f68637c8f9d45dfcf98b2db
 --cert-oidc-issuer https://token.actions.githubusercontent.com
 --deny-self-hosted-runners --format json
```

Windows extracted executable SHA256: 54c7da7e7816f8c33dffec2023a0d23c04386ef6662cfb7640d927fbfea5c05b. Linux amd64 executable SHA256: a95a4e011d77e9cd0e9922c13fda2b95195c6be29dfa58207075fd983bbae744. Genuine fixture crypto passed on both in the explicitly qualified probe environments; changed artifact bytes failed on both. Wrong source/ref/workflow/signer SHA each failed Windows verification. Raw receipts and exact environment limits are in the Package B preflight report; local bundle verification may use default network TUF roots, so this is not an offline assertion.

Unit contracts do not execute the verifier. Mutations are independent schema/policy tests based on actual stdout; syntactically matching JSON with forged signature can pass schema inspection while remaining cryptographicallyVerified:false and releaseQualified:false. No caller JSON or this fixture can qualify production authority. Immutable protected executable provisioning, containment, genuine project producer, authenticated artifact acquisition and OCI graph qualification remain absent.
