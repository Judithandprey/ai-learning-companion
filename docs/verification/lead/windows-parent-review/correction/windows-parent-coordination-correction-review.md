# Windows coordinator C1/C2 correction — APPROVE

Exact candidate: `5871981524140e3be986268a941d34e99af25bb9`, direct child of held `d6ef68a03bc3e18569d1b4a85dc20f09b7717dff`; read-only export `/tmp/lc-windows-parent-5871981`. Current canonical baseline: `6425a51834a09fe1f1f5ec367b1bc26043e1da52`. The candidate's older shared tree was not used for Backend/contracts. Project PONYTAIL LITE applies; affected canonical requirements/workflow/control README are unchanged from the preceding review.

**C1 and C2 are corrected within the assigned scope. No new blocking finding.**

- **C1:** `capture-link.ts:243–288, 323–329` now checks job/Stop members and their key/identity bindings, all four actor identities, explicit recovery state including mandatory `final`, and source ownership before accepting a persisted record. Both original probes (`jobs:[null]`, missing `final`) now report unavailable without throwing, preserve the file byte for byte, and make no DSN/host request at `reconcile()` or new `begin()`. A valid v1 record with optional `registration_sent` absent remains readable.
- **C2:** `capture-link.ts:337–380` writes an explicit UTF-8 buffer with advancing byte offsets, rejects zero progress, flushes/closes before rename, and cleans up failed temporary writes. Repeated 23-byte writes—including non-ASCII notes—produce the complete file; the exact Stop key/body is readable on disk before POST. Zero-progress and partial-write-then-ENOSPC probes preserve the previous file byte for byte, leave no temporary file, dispatch no Stop, and keep a new Start blocked with `sends_stopped: true`.
- **Generated-record compatibility:** using actual public `begin/appended/stopSending`, planner and uploader code over copied retained PNG/ink fixtures, with only the child and transport boundaries faked, produced nine distinct real coordination-record checkpoints. All nine reload successfully. The flow retained two acknowledged records plus one unknown record. Restart from the actual unknown checkpoint performed only `GET → POST :control → GET`, kept the job unknown, and sent neither registration nor old originals/batches. Both fake children ended.

Executed **8 independent bounded cases, 8 passed** on pinned Linux Node `v24.21.0`. Original held probes/results remain unchanged at `/tmp/windows-parent-coordination-review-probes.{mjs,json}`. The new Stop write cases preserve the original production-method seam; the generated compatibility case exercises the public coordinator flow and uses actual mapper bodies rather than the owner's placeholder unknown-body seed.

Read the complete production delta and new `capture-link-record.test.ts` / `link-fakes.ts`, including fault reporting, state acceptance and restart paths, plus the corrected owner report. Root's separately reported 115/115 affected checks/build and the owner's Linux/Windows receipts are not this reviewer's test executions. No duplicate owner suite was run.

Boundaries: in-memory child and HTTP fakes, isolated `/tmp` state and copied fixtures only. No actual host child, DB, listener, GUI, provider, Windows native execution, real disk exhaustion or power-loss test. The documented absence of directory fsync after rename remains a durability limit; this approval does not claim power-loss guarantees. Host transport and app quit remain separately reviewed scopes. Full display/ink/provider acceptance remains open for the planned Windows interaction QA.

Reproduce:

```sh
/home/agentsdock/Projects/learning-companion/repo/.tools/node-v24.21.0-linux-x64/bin/node /tmp/windows-parent-coordination-correction-probes.mjs
```

Evidence: `/tmp/windows-parent-coordination-correction-probes.{mjs,json}` and `/tmp/windows-parent-coordination-correction-review.json`. Source `capture-link.ts` SHA-256: `9dc98b6626eb5f88dce89abc720061d43e6efce83eeabdabcaa2b7f55e754d03`. Repository/worker files were not modified by this review.
