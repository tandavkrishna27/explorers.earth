# Package A: optional typography must not block bootstrap

## Root cause and scope

The immutable web main chunk imports generated CSS. Its source `src/index.css` contained a remote Google Fonts `@import`; Vite CSS preload waits for that stylesheet dependency. Denied font networking rejects main import, and the bootstrap error handler then reports unavailable application configuration despite valid public JSON.

Removed the remote CSS import and the initial blocking HTML font stylesheet. After the main import completes, bootstrap appends an independent Google Fonts stylesheet containing all previously requested families/weights (DM Sans, Fraunces, Inter, Lato, Montserrat, Poppins, Space Grotesk). Existing fallback font stacks and layout rules remain unchanged. No bundled font binaries existed to reuse. Fonts remain available when permitted networking succeeds; unavailable fonts use the existing fallbacks without preventing app mount. The error handler still rejects genuinely invalid configuration or failed main imports.

The smoke harness now denies external font requests instead of permitting them, requires an attempted font request to prove denial was exercised, and retains its existing mounted-app, metadata, API/script egress, legacy503 and asset immutability assertions. No APIs are mocked or served. Existing external login images retain their earlier asset policy. No proxy/compose/workflow files changed.

## Red and green evidence

- RED: old immutable image `sha256:321fdbc9ba1b1e17cdaf59a224e8a6421492b7ab95df6de2fd00e98f3a4d248f` with only font traffic denied failed `BOOTSTRAP_FAILURE`.
- GREEN: clean Docker platform-runner build (including TypeScript and existing build guards) passed. Source context remains prior qualified baseline `ac3efc97294b483658c009ac33bf4411c4d36037` plus Package A overlays, with these four owned files updated; no unfinished Package B files were copied. Clean context: `C:/Users/TK/.codex/tmp/qa-runtime-clean-y39eg5ux`.
- GREEN: contained runtime configuration tests: one file,15 passed,zero skipped. Direct Vitest invocation first failed its containment guard and absent clean test file; copied the exact tracked existing test and used normal `npm run test:unit`, without bypassing the guard.
- GREEN: same immutable local image `sha256:f70dc846d3dfd65fd6b8893d77a368aed88609ee6cc4fea3bcbe096345ddd06f` mounted the actual application on both QA and production local HTTPS origins while Google font networking was denied. Each environment recorded one denied font request, correct metadata, legacy fallback denied and zero external API/script traffic. The self-signed local HTTPS certificate is explicitly accepted only by this qualification harness.
- Receipt: `C:/Users/TK/AppData/Local/Temp/platform-web-smoke-WgoOVi/receipt.json`. All129 served-file hashes remained identical across both configurations. Secret/endpoint sentinel scan of those129 files: zero matches. All owned containers/browser/TLS servers cleaned up and verified. An earlier invocation incorrectly used the image configuration digest and failed before creating resources; final evidence uses the Docker-inspected immutable image ID above.

Final source scope and SHA256 working bytes:

| File | SHA256 |
| --- | --- |
| explorers-earth/index.html | be100d3a8d126e4dcc0ce64e72ab3c928a7a15d94cccb2a955543c860125c861 |
| explorers-earth/src/bootstrap.ts | 4c5c3db8ca7654ffee14db29df1e69e3c489c9cbb6977f956fb750c415f91f7a |
| explorers-earth/src/index.css | cd5757c7270f7d407c753db5086375e4876463851da8dca6448d301a14afed18 |
| explorers-earth/scripts/platform-web-image-smoke.mjs | 5d54760205aeaced195368010ee0c2eaf490887311c063c540396115e0ad0334 |

This qualifies static bootstrap/metadata with optional font failure. Actual API, Google login, storage, trusted candidate images, live hostname and full QA acceptance remain separate obligations. No push or deployment performed; independent review precedes proxy writer image handoff.
