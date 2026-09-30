# Web recovery correction — evidence-only delta review

**APPROVE the evidence delta for `78f3ba87c5887bbd902aea9cb6ba3ea30064189f` (parent `32b7768df7411ac7557f8d44ca546e9fe1ea625c`).** The recorded 29/29 owner ink assertions are consistent with the delivered evaluator, saved observations, screenshots and source hash. No unexpected capture change or public-fixture privacy issue was found. This does not replace the separate IR1/IR2 production review or the assigned actual QA pass.

The review used an exact candidate archive at `/tmp/web-recovery-evidence-nb8qepqu`. It made no production/main/worker changes and launched no browser, service, listener, provider or DB. The previous 18 shadow-capture groups were not rerun.

## Evidence consistency

- Independently extracted only `evaluate(v)` from the candidate's `apps/safari-extension/scripts/ink-check.mjs` and ran it offline against the candidate JSON's saved `values`. All **29 distinct assertions**, including their descriptions, booleans, statuses and observed data, reproduce the stored `checks` exactly. The summary is 29 passed / 0 failed; `runner_errors` is empty.
- The one added owner assertion, `ink.unreadable_after_load_kept_as_copy`, has `mainCorrupted: true`, saved status, 9 visible strokes, an `unreadable` recovery copy forked from the main document, a separate stored copy with 9 visible strokes, and the main record retaining `other-version/unreadable`. The changed harness deliberately corrupts the already opened fixture record before the added stroke. Its controlled nature is disclosed. This checks evidence consistency; production recovery semantics belong to the separate reviewer.
- The Markdown's `content.js` hash prefix matches the delivered file. Full SHA-256: `2c2d0ed66cb4bac5878b9c98cdf2a8039ad24b7bfa2896a28bd8c4e1a6e975df`.
- Fresh pinned TypeScript/bundle verification reports `content.js`, `ink-format.js` and all three icons current.
- The JSON and all six named PNGs exist and exactly match the candidate's Git blobs. JSON SHA-256: `7265abec1d0eb2b0ae45dfdfbc5781d99e0dca3105b799ed950772525db08a84`. Full screenshot hashes are retained in `provenance-check.log`.
- The 173/173 unit count and 29/29 actual Edge execution remain **owner-reported execution evidence**. This bounded review reran neither suite. The JSON has no independent run-time source-hash attestation; the Markdown hash, mechanically current build, evaluator/observation agreement and committed artifacts establish the available correspondence without proving a fresh browser run by this reviewer.

## Capture continuity

Byte comparisons against the parent confirm no change to:

- `capture-evidence.ts`, `page.ts`, `extension-check.mjs`, the two course-fixture files, the capture report and `p0-07-extension.json`;
- the complete capture/watcher body from `const ours` through the capture implementation in both `extension-content.ts` and generated `content.js`.

The content-entry delta is restricted to ink-store error classification plus export of its existing queue helper for tests. The inspected background diff changes only ink-request handling. Other generated content differences follow the recovery/serialization/export cleanup changes handled by the production reviewer. No capture rerun is warranted from this delta; prior **scoped capture review approval** remains, while actual integrated QA-EXT-03/N2b acceptance remains QA's pending task. The new report's phrase “lead approved QA-EXT-03” must be carried forward with that distinction, not as a new browser acceptance claim.

## Public artifact privacy and labels

Viewed all six delivered screenshots. They show the owned synthetic “Lecture 7: Eigenvalues” page, generated diagram/video frames, test ink and extension controls. The screenshot with a page address shows only `http://127.0.0.1:4183/fixture/course.html`. No personal course account, user document, credentials or unrelated desktop content is visible.

The JSON's URL string fields contain only the loopback fixture origin; all five recorded address fingerprints reproduce the exact synthetic fixture URLs used by the harness. Scans found no account emails, credential-shaped strings or personal filesystem paths. The PNGs contain only IHDR/IDAT/IEND chunks, without extra textual or EXIF metadata. The JSON and Markdown explicitly identify Edge headless, trusted CDP mouse input, toolbar automation, synthetic controls and the absence of Safari/iPad/Pencil/pressure or course-account evidence. Public-artifact review found no blocker.

## Actual checks

From the isolated archive, using the existing pinned Node executable:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node evidence-check.mjs
# PASS: all 29 stored owner assertions reproduce exactly; 0 runner errors.
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node apps/safari-extension/scripts/build-webextension.mjs --check
# PASS: both bundles and all three icons current.
python3 /tmp/web-recovery-evidence-nb8qepqu/provenance-check.py
# PASS: parent/source/artifact/hash/privacy checks and unchanged capture inventory.
```

Scripts and logs are saved in `/tmp/web-recovery-evidence-nb8qepqu/` (`evidence-check.mjs`, `evidence-check.log`, `provenance-check.py`, `provenance-check.log`, `bundle-check.log`). Six images were also inspected using the read-only local image tool. Next action belongs to lead: combine this evidence approval with the separate production IR1/IR2 result, integrate if approved, then use the existing bounded QA task.
