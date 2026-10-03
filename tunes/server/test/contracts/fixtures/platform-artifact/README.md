# Independent ZIP fixtures

Generated outside the validator with Python standard-library zipfile, fixed timestamp2020-01-01 and ordinary zero-extra/comment seekable ZIP profile. Run generate-positive.py and generate-negative.py from the repository root. The validator never uses these scripts or writes archive paths.

Positive stored.zip and deflated.zip contain release-manifest.json and qualification.json. Malicious fixtures cover unsafe filenames, duplicate entries, Unicode extra metadata, per-file expansion limits, entry count, missing manifest, Unix device and invalid UTF8. Header/envelope/range/flag/CRC mutations are explicit test operations on independent fixture bytes, not a production ZIP parser. Digest recomputation in mutation tests deliberately isolates structural checks from the whole-archive hash check.

These files are structural test fixtures, not authentic release manifests or cryptographically qualified producer artifacts. Python seekable ZIP compatibility is verified; GitHub upload-artifact producer ZIP compatibility remains unproven and must match this restricted profile before acquisition wiring.
