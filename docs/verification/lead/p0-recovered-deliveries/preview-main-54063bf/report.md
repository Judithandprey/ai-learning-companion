# Exact-main P0-07 actual operation — PASS

**Tested commit:** `54063bf81f7161ef457fb7d6b374ab48314df689`, exported unchanged to
an isolated directory. Web, Backend and generated contracts all came from this
same commit. No main/worker edits. Current workflow and `docs/document-preview.md`
were read; existing complete affected source/English requirement reading retained.
PONYTAIL LITE: reused the existing short scenario and supervised helpers.

Run `p0-main-54063bf-2cc49421` passed on its **first and only attempt**: command exit
0, CDP runner exit 0, zero browser-runner errors. TypeScript build passed.

| Actual check | Result |
| --- | --- |
| Generated module | Browser fetched `/dist/packages/contracts/document_preview/generated/contracts.js` with HTTP 200; actual page initialized |
| Real file → explicit ASK → typed request/note → Save | Trusted Edge mouse/file-input/text operations; `server_committed`, no generated AI answer |
| Complete original | 11,486 bytes, including BOM, Unicode, CRLF/LF, inert markup, long text beyond the selection and trailing spaces |
| Restart and recover | Closed document; API PID 102098 terminated/waited, exit 0; PID 102892 started with same identity/fresh token; page reload forgot token; reconnect/Reopen required no file reimport |
| Stricter real response validation | Actual Backend SavedPreview accepted; original, context and user note displayed with source binding/user authorship intact |
| Fresh independent HTTP readback | Exact original bytes, 505 DOM bytes, Frame, BridgeRequest, ExplanationRequest, typed request and note all equal; both SHA-256 checks passed |
| Canonical storage | Exactly one source/snapshot/frame/artifact/event/note/revision and each preview linkage record |
| Cleanup | Second API exited 0; browser/profile/steps removed; only own actor cleaned with zero rows remaining; 4173/8174 released |

Original SHA-256:
`96c2fc0e3f3fa083fff776e529b5084bb074961d0c5ec92d32581583c2fa4a00`.
Selection: `invariant subspace`. This is reviewer-authored acceptance text in a
real disk file, not private coursework or a backend fixture import. The actual
dedicated local `lc_p0_test` target was verified as PostgreSQL 18.6.

The scenario used the successful fresh Python HTTP client from the previous
review; the old auxiliary Node-readback failure path was not recreated. No old
33-check campaign, negative probes, native QA work, migrations, PostgreSQL-service
restart, provider/account change or paid request was performed.

**Publish-safe files:** `summary.json` (4 KB, no raw bodies/base64), `saved.png`,
`reopened.png`. Both screenshots were visually inspected: no credential values,
DSN, private paths or private document data; only test text and temporary test IDs.
No files were published by this reviewer. Full raw evidence stays local under
`evidence/result.json` and `evidence/run.log`; harness/input remain in this folder.
Earlier review evidence was preserved separately.

Reproduction from `/tmp/p0-preview-main-54063bf/source`, using the project's
existing pinned Node binary:

```sh
node /home/agentsdock/Projects/learning-companion/repo/node_modules/typescript/bin/tsc -p apps/safari-extension/tsconfig.build.json
node /tmp/p0-preview-main-54063bf/run.mjs
```

The browser command received normal exact-command escalation for WSL/Edge and
local DB access. The documented user launch remains two foreground terminals:
configure private API environment and `LC_PREVIEW_UI_ORIGIN=http://127.0.0.1:4173`,
run `.venv/bin/python -m services.api.preview_local --port 8174`, then
`bash apps/safari-extension/scripts/preview.sh`; open
`http://127.0.0.1:4173/preview/`. The harness invokes the same static-server module
and actual API launcher; it does not claim to package a Safari extension.

This closes the requested **exact-main normal-flow integration check**. Separately
closed negative reviews were not repeated. Browser-local saved-ID discovery, local
test authentication, no AI provider and DOM-without-pixels remain explicit limits.
No production login, real teaching, Safari/iPad/Pencil, original-screen ink,
Notability, long-term memory or full P1 acceptance is claimed.
