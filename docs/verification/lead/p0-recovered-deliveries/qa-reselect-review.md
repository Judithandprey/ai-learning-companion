# QA-P07-01 reselect delivery review

**Decision: approve QA delivery `aa63f52b92fbd436b37e149f95fa2109d0684152`.** The retained evidence supports closing QA-P07-01 for the tested desktop Edge mouse path against the real local API/PostgreSQL. No blocking defect was found in this delivery. Safari/iPad/Pencil/finger and broader product acceptance remain outside this result.

Candidate: `6c3c1b65bac13f315bb953158f101245139d9e63`. Assigned current main: `8fd2fb9654b1e2314551d7a52e70f7f11ae10492`; there is no application-source difference between those commits under `apps/safari-extension`, `services`, or `packages`. Reviewed the new report/evidence and recovery-script delta from `c18258191bca7e9452af58e54d8c6d25d059f0b8`, using `git show`/`git diff` and the existing workflow/PONYTAIL LITE. No main edits, live browser/API/database/native reruns, service changes or CI F1 mutation-anchor repair were performed.

Evidence:

- Ran the exact committed `analyze_reselect.py` offline against `/tmp/qa-6c3/evidence/result.json`, passing the full expected candidate SHA. Result: **23 PASS, 0 FAIL**, byte-for-byte identical to committed `checks.txt`. Local output: `/tmp/p0-qa-reselect-review-artifacts/offline-checks.txt`.
- Independently checked the original run file `/tmp/qa-preview-reselect-cdb5598f-original.txt`, which still exists. It is 6,241 bytes with SHA-256 `178ca95c76c976c51d7ab45a23fde110edd6d3226421e442c2f30593b7240a70`. Both X/B direct-readback originals equal that file byte-for-byte; both frame artifacts equal the outgoing captured bytes and verify against their frame hashes. Request text, user note, bridge request, request and frame also equal the outgoing payloads. The original was not reconstructed from readback.
- Checked the summary against the retained raw run: baseline/provenance, identity, database record, IDs, inventories, relay log, selection captures, events, cleanup and ports match; its states are faithful reductions. All 12 user/device/session identity fields in each returned record match this run's actor. The first lost response is `replayed=false`; its two automatic resends are replays. Retry preserves X's note ID and one-note inventory.
- After refusal, native selection is empty; after retry, dragging the same phrase produces a new draft and submitted ASK event with a different request. Typed words survive the later third-phrase refusal. B saves as a distinct note. The click-on-existing-selection control still selects the intended phrase. Final inventory has two notes and two revisions, with user authorship and provider unavailable.
- Cleanup remains scoped to the generated actor through the unchanged verified-database helper. Receipts show zero remaining documents/actors and all three ports released; the retained log records `api exited (0)`.

Provenance verification:

`run.mjs` now requires a full `QA_BASELINE`, executes `provenance.py` before starting the API/browser, and records the verified commit. The previous hardcoded baseline initializer is removed. Independently reran only this offline source-hash check: all **170 tracked files** match candidate `6c3c1b6`, with commit tree `1a7aabca72a103583921ebf103ea6308c4152933`; checking that same copy against `9eb6bd5` fails on exactly the four documented changed source files. Thus the new check discriminates the candidate from the old source.

Publication hygiene:

Visually inspected all four committed PNGs: only authored test content/test IDs are visible, with no token or private browser-profile path. The PNGs contain no text metadata chunks. Text/JSON checks found no credential URI, literal bearer credential, private key or Windows user-profile path. The report correctly labels response-loss injection and keeps local authentication, no provider, DOM-only context and non-device limits explicit.

Exact caveats:

- Provenance checks tracked source blobs under the three declared prefixes. As its documentation states, it excludes ignored build output, tools/dependencies and other untracked extras; it is not a cryptographic attestation of the served bundle or runtime environment. Keep source provenance described at that scope.
- Offline replay requires the retained full raw result and independently authored original, not the reduced committed summary alone. This is disclosed in the QA report. This review used Python 3.14.4; the analyzer requires `Path.read_text(..., newline="")` support.
- This is an independent review and offline replay of QA's retained completed operation, not a second live run or verification of every historical run-count claim. It closes the demonstrated Edge mouse defect without claiming Safari, physical-device, AI-provider, course-overlay, Notability or full P1 acceptance.

Next action: lead may integrate this QA delivery and record the bounded QA-P07-01 closure. The separate old CI F1 anchor issue stays with QA; production ownership remains Web.
