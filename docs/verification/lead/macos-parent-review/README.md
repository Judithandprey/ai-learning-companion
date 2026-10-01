# Mac app-parent review: three bounded corrections

Exact candidate `f625b480e591682be75dd6a7617c08eee4cf7bd6`, delivered in
`handoff_272773cc71abc32339799a07d8800bb1` at 2026-09-30 23:49:25 UTC.
Parent `497e05c` preserves the assigned `923217b` baseline. This continues the
existing P0-03/11 app-parent task; it introduces no new product task or protocol.

**HOLD. The parent source is not integrated or released for native CI yet.**
Three scoped reviews found three concrete lifecycle/evidence defects. The lead
checked the relevant call paths, probe source, actual outputs and source hashes.
The probes use Linux Swift with explicit stand-ins; none is Mac execution.

| Finding | Observed consequence | Required correction |
| --- | --- | --- |
| MAC-PARENT-C1 | After successful registration, an actual journal-write failure publishes “nothing more is sent”, but a new source PUT still follows. | Propagate failed persistence; fence post-await connection/reconnect/request work and end the owned child safely. Keep local capture/originals and earlier uncertainty. |
| MAC-PARENT-C2 | Reopening unknown Stop `.stop.1` sends identical revision/body as `.stop.2`. Backend CAS still constrains transitions; this is not proof of resurrection. | Validate and reuse the persisted applicable Stop body/key. Only a reconciled changed revision or no prior command warrants a new command. |
| MAC-CONTROL-01 | Lost/ambiguous reply followed by a typed refusal becomes known-refused, despite the earlier possible commit; registration detail and Stop journal are affected. | Retain unknown until an exactly corresponding success or independent state evidence settles it. Preserve first-attempt refusal and unsent controls. |

Evidence:

- [Coordinator review](macos-parent-link-f625-review.md): one healthy control
  plus two reproduced defects. [Machine output](link-probes/results.json),
  [probe](link-probes/main.swift) and [source manifest](link-probes/source-manifest.json).
- [Host/control review](macos-parent-f625-host-control-review.md): three defect
  reproductions and three passing controls. [Output](control-probes/probe.json),
  [extraction](control-probes/prepare.py) and [source/artifact hashes](macos-parent-f625-host-control-review.json).
  Initial extraction/cache errors are retained and are not product findings.
- [App/build review](macos-parent-app-review.md): assigned Start/Stop/Quit/UI,
  retention, small mapper change and build inclusion have no established blocker.
  SwiftPM includes all 70 declared XCTest methods/eight files. This is source
  review, not 70 executed passes. The historical 55-test native milestone remains
  unchanged and must not be relabeled as this candidate's result.

All 11 owner evidence checksums match. Mac FrameStore is byte-identical to the
preserved iOS implementation, SHA-256
`0ba0759dde8d09c8d13cd503b6b8da9ce596a3107b4cbc5f270586a9152a19d8`.
Shared contracts/services/root/mobile files are unchanged by the candidate.
No broad suite, GUI, database or provider was run by this review. The retained
probe runners describe their existing `/tmp` toolchain/harness prerequisites;
their Linux adaptations are explicit and no coordinator logic was patched.

Next owner: Native fixes these three findings together in `apps/macos/**` and
owned platform evidence, preserving the current work and released wire versions.
Add focused negative and positive controls; no new framework or mobile work.
Deliver one exact correction commit with honest executed/unexecuted boundaries.
Lead rechecks these cases, integrates approved source and runs the existing
macOS-only hosted workflow. Actual interactive Mac permission/Start/Stop/ink,
physical input, audio, provider and Notability remain separate open gates.

The native correction was actually accepted as `handoff_2bedf7ee1ad4bca823a2de9f24046f36`, initially unread with `execution_started:false`. [Receipts and observed Windows work](handoffs.json) also retain the existing Web correction and conditional QA retest. No native correction delivery or Mac CI success is implied.
