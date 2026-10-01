# MAC-STORAGE-COPY-01 runtime review — APPROVE within scope

Exact candidate `30807f23a911739c089126d86b2b34d51976ea18`, parent `1e0e5a1fb79efe19028ac76e632e80d318816ba7`; reviewed the changed library runtime and necessary existing mapper/uploader/Stop call flow. No concrete blocker found. Prior C1/C2/control acceptance is preserved.

- The linked summary makes no current-storage promise. Confirmed frames require verified batch ACK; recorded sending frames are awaiting, and prior unknown jobs remain unknown through retry until confirmation. Counts publish before upload.
- A known-unsent retry records sending intent before dispatch. A closed gate or failed witness restores unsent before publication; quiet journal failure sets the sticky fault without publishing temporary awaiting counts. No source path here bypasses the existing write-before-send or fault fence.
- Gate-closed count publication uses stopping. Stop's bounded completion converts remaining sending entries to unknown before final counts; the originals and prior confirmed counts remain.
- `acceptedOriginals` is a local optional journal field. The uploader returns an ordered **verified receipt prefix** of the immutable prepared batch's deduplicated originals. Taking the maximum across calls is coherent for that same prefix and avoids adding retry duplicates. This historical partial-original evidence is separate from confirmed frames, is cleared by a full batch ACK, and explains why an unsent batch can still have accepted original bytes. It does not claim the batch or AI received those frames.
- The `framesPerBatch` seam keeps production default/max20 and clamps to1…20; it does not change contracts, identities, process ordering or persistence format.

**Executed: two small portable groups,2/2, exit0, empty stderr.** Exact extracted `CaptureLinkStatus`/`LinkJob` declarations verified (1) an old journal job without `acceptedOriginals` decodes with nil and a new value roundtrips, and (2) neutral summary and separate pending/unknown/confirmed text. These are value-type checks, **not** actor, uploader or native runtime execution; lifecycle conclusions above come from the source trace.

```sh
bash /tmp/macos-storage-30807-runtime-probes/run.sh
```

Probe and stdout: `/tmp/macos-storage-30807-runtime-probes/`. Full source/probe hashes and checks: `/tmp/macos-storage-30807-runtime-review.json`; 22 exported library/test/report files match the immutable commit. Key lines: `CaptureLink.swift:987` sender; `949` initial witness; `1360` counts; `1376` gate publication; `1408` quiet-save fault; `1041` original-prefix tracking; `1223` final accepted-original detail.

No repository/worker edits, GUI, network, database, provider, native CI or full suite. Owner83declared tests and Linux79/83 remain owner evidence. The relocated public text extension and app import still require root's selected exact-source native build/test; this approval does not claim that run occurred or pass either §7.1 product gate. PONYTAIL LITE applied without changing requirements or uncertainty/original retention.
