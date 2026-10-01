# QA-WIN-05 evidence review — 26ac626

**APPROVE integration of the bounded historical QA evidence.** The saved evidence supports closing QA-WIN-05 for the exercised pending-send/ACK/Stop behavior. This review found no blocking contradiction. It does not close full product, device/physical-input or AI acceptance.

Reviewed exact delivery `26ac6269ad728266aade944005431008ad1d1675`, parent `0678c9a085441b126cdc144fac45ee4493de3e31`, tested candidate `476fd1fb832e708b79ad5e5be1c7ef17925febee`. Applied project workflow/PONYTAIL LITE, preserving current source/English Stop, truthful status, source-original retention and per-platform acceptance boundaries.

## Provenance

- All 21 changed exported files match their exact Git blobs. Candidate `apps/windows` equals owner `d295a51`. `apps`, `services` and `packages` equal both the preserving QA merge and delivery. Backend/packages also equal `86d2405`.
- The one separately authorized clean portable build used `git archive 476fd1f` and existing pinned Node 24.21.0/TypeScript plus the existing static-copy script, without installation, tests or an app launch. Its **57 files** reproduce aggregate **`4e65f654cb5c28ed3690dc649b9bcc768b083c43025c9edb4e101c6e449fb93b`**, exactly matching `build.json`. This independently verifies reproducible candidate output; the claim that those bytes ran on Windows remains QA's execution attribution. Actual Windows staged bytes were not independently read.
- `run.json` lists 13 executed harness hashes. **12/13 exactly match** committed files. The disclosed exception is `analyze_win05.py`: recorded executed hash `de85964e22a585e5c38331d01d2b5afc3422709c5ffe7a5ac4adc575be415063`, committed hash recorded in the companion machine report. The delivery does not contain the old analyzer bytes; this reviewer does not claim a byte-level proof of the author-reported note-only correction. The current note correctly preserves unknown upload arrival. Lead's separate analyzer review owns its detailed logic/delta assessment.
- `analyze_fix.py`, `replay_analyze_fix.py`, `qa-electron-runner.ps1` and `qa_parent_db.py` are unchanged from the parent. The `parentfix` scenario body is byte-identical; historical `86d2405` evidence is not rewritten. `run.mjs` only adds the new scenario to its usage text.

## Saved results checked independently

Run 2 summary recomputes to **16 pass**, and the 76 planned steps match 76 sequential successful actual steps with no runner errors. Run 1's supporting record recomputes to **13 pass / 1 fail / 2 limit**: its pending wait timed out, so it is not silently counted as a successful Stop scenario.

The retained 17 status events, 11 UI reads, manifest timestamps and five coordination snapshots agree:

| Observation | Recomputed from saved timestamps/state |
| --- | --- |
| First waiting status after sampled frame | 0.097 seconds |
| Later read while host remains paused | 10.766 seconds after first waiting status |
| Confirmed count rises after resume request | 0.346929 seconds |
| Stop gives up waiting after click | 5.015193 seconds |

While pending, stored remains 2, unknown is 1, `awaiting=true`, `storing=false`; the line explicitly says waiting. A later real receipt yields 3 committed and no unknown. After Stop, no saved event says sending/storing or increases stored above 3; the fourth job remains unknown. The header's live-state wording supplies the conditional confirmation rule rather than literally saying waiting; the adjacent line supplies waiting. The QA report explicitly discloses that distinction, consistent with the earlier accepted copy review.

Three unique server records and three replay receipts match the three committed jobs. The given-up fourth job has no record/receipt. Its in-doubt PNG equals an already committed original, so **whether that upload arrived is unknown**, not proven absent. Four stored originals (three unique PNGs, one ink JSON) agree with local filename hashes and byte-length metadata. Saved readback reports six raw/composed role comparisons and three ink comparisons without mismatch. With no pen input, raw/composed can alias; this is not six distinct pictures or demonstrated editable-pen behavior. The stopped and final hash checkpoints are identical. Retained request-body hashes checked across snapshots match the actual saved body strings.

## Cleanup and limits

The saved receipts show two app self-exits, code 0 (114 ms and 120 ms), one owned host exiting, its observed WSL child no longer running, an empty watcher end, and actor-only cleanup **32 documents → 0**, actor removed after exits. Readback is attributed to the same pristine actor and reports unchanged document state. The separate 04:20:01 display-release process listing is a QA-recorded timestamp, not a committed raw listing; two screenshot checkpoints and start/end observations establish point-in-time quietness only.

This audit read sanitized committed metadata, not private whole-screen PNG/ink bytes or a live database. Actual byte equality is supported by the saved comparison receipts and cross-linked hash/length facts, not a new raw-byte replay. Start/Stop and page changes were DevTools/DOM-driven; no pen input, provider/AI, Mac, audio or Notability was exercised. The 60/182-second timeouts, stalled/refusal/disk-fault paths, given-up-upload arrival and post-uncertain-Stop relaunch remain outside this run. Earlier campaigns remain historical rather than implicitly rerun.

## Review artifacts and commands

- `python3 /tmp/windows-win05-26ac-audit.py` — metadata/source audit completed successfully; JSON `/tmp/windows-win05-26ac-evidence-review.json` includes raw file hashes, tree checks, counts and recomputed timings.
- Clean build transcript: `/tmp/windows-win05-476fd1f-build.txt`.
- Independent 57-file manifest: `/tmp/windows-win05-476fd1f-build-SHA256SUMS`.
- Exact evidence export: `/tmp/windows-win05-26ac-export`.

No repository/worker writes, GUI, database operations, native/test runs, provider, network or service launches were performed. Two initial audit-script field assumptions (unnamed hostResume step; scalar readback actor) were corrected to the actual saved schema; they were not product/evidence failures.
