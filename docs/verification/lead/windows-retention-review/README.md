# Windows whole-display retention — source HOLD

Exact owner candidate **`04caef61f251e9df2e6c6f5e433b0a2c1dd6ed68`**, parent
`99ae568`; actual delivery `handoff_3adb37262bd994c755143b8ce815051b`.
Do not integrate this candidate until the following same-owner corrections pass.
This review preserves the existing approved Windows code and QA candidate061efe2.

1. [Storage S1](storage.md): a partial JSONL append followed by ENOSPC leaves a
   torn record; later retry returns success with an unparseable manifest.
2. [Storage S2 / renderer R3](storage.md): the actual main Stop timeout destroys
   an overlay still encoding retained pixels, with only an ink warning and no
   durable/visible pending-frame gap. Preserve immediate capture cessation and
   existing ink recovery; merely extending the timer is insufficient.
3. [Storage S3](storage.md): failure to append final `ended` is ignored, so its
   unwritten counter never reaches the user after session teardown.
4. [Renderer R1](renderer.md): a measured capture gap followed by identical pixels
   can vanish from durable history; retained gap frames omit known `gap_ms`.
5. [Renderer R2](renderer.md): header describes exact subtraction even though
   clock values were separately sampled/rounded. Preserve actual values and
   correct the description, including unknown pre-presentation latency.

The storage report also reproduces malformed internal facts/backwards gaps and
a truncated 24-byte PNG acknowledged as retained. They are owned-renderer data
integrity findings, not a demonstrated external exploit. Reuse the internal shape
and existing/native image validation; do not build another framework.

## Evidence and limits

Storage18 and renderer10 focused existing checks passed. Six renderer behavioral
probe groups passed; its two failure groups deliberately reproduce faulty behavior.
Storage's six bounded probe groups include reproduced failures and positive
sender/drain controls. Their exit success is **not** product acceptance.

All eight committed sample blobs match Git. Seven real PNG files fully decode to
2560×1600 RGBA; all file/decoded-pixel hashes, sizes and references agree.
[Artifact audit](sample-audit.json). Images show synthetic probe content only.
Web later disclosed possible overlapping QA display use during its final
12:37:09–12:38:00 run. The bytes remain author evidence; quiet timing and
independent interactive acceptance are not established by them.

The reviewers used exact exports, portable VM/fake Electron interfaces and real
temporary filesystem faults. No Windows launch, live capture, provider, install,
preview service/data, or Paperclip operation occurred. Both §7.1 gates stay open.

## Reproducing the preserved failures

Export exact04caef61 to a temporary directory. With pinned Node24.21.0:

- Run [renderer-failure-probes.mjs](renderer-failure-probes.mjs) with that export
  directory as its argument; [original output](renderer-results.txt).
- Copy the two preserved files under `repro/` into that export's
  `apps/windows/tests/`, alongside its original `png.ts`. From `apps/windows`,
  run `node tests/storage-review-probe.ts`; original observations are preserved
  in [storage-failure-results.json](storage-failure-results.json).
- The copied storage harness differs only by recording actual timer callbacks
  and injecting a partial append. Production source is unchanged. Temporary
  output paths in these files identify the original review run.

Keep these faulty-candidate assertions unchanged. A corrected retest must assert
the desired outcomes separately, not relabel the old reproduction as a pass.

Next owner: Web fixes this same retention task in its existing branch; Lead
retests the changed boundaries and integrates a reviewed correction. Backend's
explicit Windows0.2.9 pure metadata delegation continues without treating this
producer candidate as accepted or inventing missing facts. QA completes its
already assigned workflow, then its one conditional admission retest.

## Actual correction dispatch

Review evidence was normally pushed at
`54adcb2f3d9743162e51f3734d823d1858324d04`. The consolidated correction to Web
was accepted as `handoff_f69f481144d2aaff8d684a05f80de076`, replying to its actual
04caef61 delivery. It was initially unread; no correction implementation or
acceptance follows from that receipt. Owner scope and the original task remain.
Backend source-fact coordination was accepted as
`handoff_1f0e4b5dc696e8a70604f10cef0a9faa`; its actual0.2.9 start is independently
recorded in the task board. No duplicate task or broad test campaign was dispatched.
