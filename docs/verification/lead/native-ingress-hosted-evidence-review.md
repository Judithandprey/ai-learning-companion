# Hosted native ingress evidence — APPROVE integrity

Reviewed downloaded `/tmp/native-ingress-3745c41-evidence` for workflow run `36664026247`, attempt 1, exact commit `3745c41eaa471d9662c04c362b9fd33997d88936`. **No artifact integrity or result mismatch found.** Approval concerns actual hosted evidence, not device, provider or production activation acceptance.

Independent local artifact inspection executed successfully:

| Evidence | Actual result |
| --- | --- |
| `SHA256SUMS` | All **12/12** file hashes match; no missing or unlisted evidence file. |
| `source.zip` | All **86 tracked files** match exact-commit Git blobs byte for byte, with exactly the workflow's selected path set; ZIP commit comment also matches. |
| `inputs.log` | Commit, run and source-tree `e8f98ac0c37623a756b3c0d6264b37dace98dfaf` match Git/workflow. Records arm64 macOS 26.6.2, Xcode 26.6 and SDK 26.5. |
| Native ingress log | **99 PASS, 0 FAIL**, ending `all capture ingress checks passed`. Includes both formerly failing lost-queue variants, repeated Stop persistence, stale-instance receipts and token-redaction cases. |
| Python actual-fixture log | **42 PASS, 0 FAIL**, ending `all fixture checks passed`. |
| Existing native frame-boundary log | **15 PASS, 0 FAIL**, ending `all screen observer checks passed`; inspected only, not rerun. |
| Device and simulator build logs | Both contain `BUILD SUCCEEDED`, no error lines and explicit `CODE_SIGNING_ALLOWED=NO`; both compile `OriginalUpload.swift`. |

The retained uploader and native-check source are also byte-identical to reviewed `94c5872` (`git diff --exit-code` returned 0 for those two files).

`capture-ingress-fixtures.zip` has **37 files** and **33 manifest entries**: four requests, one byte-identical retry comparison, 25 receipts (2 accepted/23 rejected), and three errors. Every referenced file exists with no extra unreferenced file. Independently decoded the four stored request bodies and checked exact base64/original bytes, SHA-256, byte length and artifact path. Three request bodies are 718 bytes with 293-byte originals; the maximum-size body is **44,739,575 bytes** for a **33,554,432-byte original**. The lost-response request/retry bodies are identical. No `check-token-` text was retained. This was artifact byte inspection, not a rerun of the native or contract suite.

Both product archives pass ZIP CRC checks and contain the app and embedded `BroadcastUpload.appex` with matching bundle identifiers, executable names and SDK metadata. Independently inspected Mach-O slices: device app/extension are arm64/iOS; simulator app/extension contain arm64 and x86_64/iOS Simulator. The extension identifies `com.apple.broadcast-services-upload`. No provisioning profile or `_CodeSignature` directory is included. Device executable sizes are 839,456/395,800 bytes (app/extension); simulator sizes are 1,666,128/743,712 bytes. Build-result outcomes agree. The two device warnings and four simulator warnings are the reported AppIntents extraction and simulator `ONLY_ACTIVE_ARCH` notes, not compilation failures.

## One documentation qualification

Owner docs-only commit `2d38189750aee6d3591993d85b3c190905369297` correctly reports the 99/42 counts and successful builds. Its claim that the checks ran in about **0.15 seconds**, with approximately 4m17s attributed to swiftc, is **not established by first/last PASS-output timestamps**. Output may be buffered, and the retained native log has no timing instrumentation or timestamps. Record the observed output/combined-step interval if desired; do not infer separate compiler/process durations. This does not undermine the recorded passes or block artifact acceptance.

## Reproduction and scope

Executed `python3 /tmp/native-ingress-artifact-audit.py`: **exit 0**, terminal `ARTIFACT AUDIT COMPLETE: no mismatches`. The reusable standard-library script performs hashes, exact Git comparisons, ZIP CRC/manifest checks, fixture byte comparisons, log counts and product plist/Mach-O inspection. Also read the exact committed workflow and relevant owner evidence delta. A first archive-listing command used the wrong manifest prefix, then was immediately corrected to `capture-ingress-fixtures/manifest.json`; all final archive checks completed successfully.

No CI, Swift, old tests, browser, network, DB, provider or device operation was rerun. Only `/tmp` audit/report files were written; repository work was untouched. The hosted checks are real macOS execution with synthetic local fixtures and an injected fake transport. They do not prove real HTTP/TLS/backend authorization, app activation, ReplayKit/device runtime, signing/install, live full-screen AI observation, frame/clock/orientation mapping, editable live-screen ink or Notability import. Preserve historical HOLD/source-review evidence alongside this actual hosted result.
