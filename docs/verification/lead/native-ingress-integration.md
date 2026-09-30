# Native original-byte consumer: integration checkpoint

Current state **source approved and integrated; actual hosted compilation and
checks passed at `3745c41`**. Candidate `94c5872` closes the remaining witness gap; the original
source blockers below are retained as history. Current disposition is at the end. Actual iOS delivery `handoff_48dc2918c9a40153f38dc6a65b9ac7e3`
provides `7de89a67bd6f2d06e8cf12b38bc58f1fe44729ae`, parent `146ccaf` (normal
merge of assigned `1616cce`). The owner additionally read exact released ingress
`ddcae31` through git show and reports unchanged-wire consistency. This is a
substantive delivery/read receipt, not merely notification acceptance.

The app-target-only, uncalled consumer supplies exact retained PNG original
uploads, explicit in-memory authorization/injected transport, durable request
identities and matching receipt checks. It does not activate the capture-only UI,
add the uploader to BroadcastUpload, or establish network/device/provider evidence.
The author explicitly reports Swift **uncompiled**. Its Python fixture validator
ran against Python-simulated fixtures, not native output; those levels stay distinct.

[Independent source review](native-ingress-review.md) and lead reading identify:

1. An already-open instance overwrites subsequently malformed durable state.
2. Stale separate actors can replace newer source binding/queue/receipt state;
   a read-then-write Stop check is not atomic across actors.
3. Repeated Stop after a failed save can return true without persisting Stop.
4. Arbitrary NSError.domain from the injected transport can persist token text.

These are exact source traces, **not executed Swift reproductions**. Corrections
remain the original iOS task and write ownership. Native corrective messages
`handoff_063a7e1579386fc6d5ab50916ca781de` and
`handoff_255274a5dea2404ee450cdd269a1e4d0` were accepted/unread; no corrective
start or result is inferred from these receipts. Preserve originals/sidecars,
unchanged wire, no activation and bounded local error categories. The report also
records parsed-receipt/raw-parser limits without inventing another wire requirement.

## Lead-owned hosted check preparation

At the original HOLD boundary, the local, deliberately **uncommitted** change to
`.github/workflows/ios-screen-observer.yml` awaits the corrected native source:

- Extend the existing path filter/source archive with CaptureIngressCheck and its
  released contract/lockfile inputs; retain both existing unsigned SDK builds.
- Compile/run the actual native check on the existing macos-26 job, then validate
  its emitted fixtures through the existing pinned uv and locked Python dependency.
- Keep native and Python results separate; failure remains failure through tee.
  Preserve partial fixture ZIP, logs, outcomes and hashes with the existing products.
- No signing, old Simulator campaign, new framework, provider or default activation.

Local verification: YAML/conditions, Bash and embedded Python syntax pass.
`python3 /tmp/check-native-ingress-workflow.py` passes four controlled workflow
stand-ins: compile failure, native-check failure, Python-contract failure and
success; failure codes/outcomes/logs/available fixtures survive each case. They
are **workflow control tests only**, not Swift compilation or contract fixtures.
The prepared diff is also retained at `/tmp/native-ingress-workflow.patch`.
No hosted build was dispatched against the held source.

Next owner: iOS supplies one corrective commit with decisive native regressions;
lead performs targeted source review, integrates the corrected source plus this
workflow, and observes one actual native-check/Python-fixture and both unsigned
SDK build run. Genuine compiler/check failures return to iOS once with logs.
The two core §7.1 gates, real AI/network, trusted bootstrap, frame/clock/orientation
mapping, signing/install, original-screen ink and Notability remain unaccepted.


## Actual correction received; one retained file-loss boundary

Native delivery `handoff_e874e76b2858aa3dc6970df18c73202d` at 2026-09-29
18:05:28 UTC provides `cb27688bd04ce31f1f2dce937c855377c657a7d1`, parent
`7de89a6`. It adds locked fresh state transitions, honest repeated Stop saves,
fixed diagnostic categories and canonical retained receipts. Source review closes
the four original traces; Swift remains uncompiled, and owner fixture checks used
Python-simulated input rather than actual native output.

[Independent correction review](native-ingress-correction-review.md) confirms
one source-traced NI1/NI2 edge remains: construct A and B before a queue exists;
A enqueues and successfully persists Stop; only the queue JSON is then lost while
PNGs, sidecars, lock and started status remain. B's instance-local `stateExists`
is false, so lines 669–678 treat missing history as a new queue, allowing rebind
and writing/sending. A fresh uploader after the same loss has the same problem.
The lock serializes writes but does not record durable prior initialization.
The existing deletion check uses an instance that already saw the queue. These
are source traces, not executed Swift failures.

Same-task correction `handoff_cb5a2591b3680140f08b0a08912e292e` was accepted
on the actual iOS route with `execution_started:false`; it is not an observed
start. iOS owns the smallest persistent initialization witness or equivalent,
consulted under the existing lock, plus stale/fresh-instance queue-loss regressions
and legitimate first-initialization/reopen controls. No new store/framework or
network activation is requested. The existing prepared CI remains held until this
delta is reviewed; then lead runs one hosted native/fixture/unsigned-build check.


## Witness correction integrated after quota recovery

The user explicitly resumed after the actual Codex usage-limit interruption;
main `8c50587` and the held workflow were intact. Actual iOS mail
`handoff_2d99cfd05b7c6a849d3a676e94912a28` supplies
`94c5872fe69853ef1853fe9aac655af4416afe13`. The normal three-commit integration
maps `7de89a6` / `cb27688` / `94c5872` to `6b55d3a` / `1fbdbf7` / `b3dde7f`.
No branch reset or unrelated files were brought in.

[Independent witness review](native-ingress-witness-review.md) approves the
specific source correction. The existing locked file now retains initialization
evidence before queue creation. Missing established state is refused for both a
stale unopened observer and a fresh instance after loss; legitimate initialization,
failed first save and pre-witness controls are in the native check. Both witness
and queue loss remains an explicit limit. No prior failed source trace is erased.

The held CI patch is byte-identical to the previously checked patch; YAML and all
embedded shell syntax pass again at this integration boundary, and `git diff
--check` passes. No workflow-control simulation was rerun. This commit now includes
the previously prepared native compile/run, actual emitted-fixture validation and
two unsigned SDK builds in the existing workflow. Counts of 66 call sites / 99
expected PASS lines remain unexecuted until actual logs arrive. No default network,
real provider, signing, Simulator campaign or physical-device activation occurs.

## Actual hosted result after recovery

Exact main `3745c41eaa471d9662c04c362b9fd33997d88936` was pushed normally.
[Native run 36664026247](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36664026247)
completed successfully at 2026-09-30 03:27:27 UTC; job `109724738167` used
macOS 26.6.2 / Xcode 26.6 with both SDK versions 26.5. These are actual logs,
not the earlier expected assertion count:

- Native upload check: **99 PASS / 0 FAIL**, including stale/fresh observer
  queue loss, first initialization, failed first save, stopped queues, request
  retries, cancellation and token-safe retained diagnostics.
- Python validation of the **actual Swift-emitted** fixtures: **42 PASS / 0 FAIL**;
  four request fixtures and 25 receipt verdicts retain their source/byte identities.
- Existing native buffer/file checks: **15 PASS / 0 FAIL**.
- `iphoneos` and `iphonesimulator` unsigned app plus broadcast-extension builds
  succeeded. No installation or Simulator execution occurred.

[Independent artifact review](native-ingress-hosted-evidence-review.md) verifies
all 12 artifact hashes, all 86 archived tracked source files against the exact
commit, actual logs and both product bundles. Small text evidence is retained in
`native-ingress-hosted/`; the GitHub artifact is
`screen-observer-3745c41eaa471d9662c04c362b9fd33997d88936-1`, id `11075747047`.
The source and product ZIPs remain downloadable with that run while retained by
GitHub. Successful checks use an injected in-process transport; no real network,
backend receipt or provider input is established by this native job.

The upload step took about 4m19s. Buffered output timestamps do not independently
measure compilation versus execution time. The initially suspected stall did
not occur: the actual run completed successfully. Bounded diagnostic message
`handoff_3a8e6e06c3f4ee3868356d07dc1950f6` was superseded by
`handoff_16e584240de80402ea0fb4b60f3f890e`; no speculative repair or rerun was
requested after success. Actual reply `handoff_0c09fa96e0ce165ed1e09aba07b6b764`
confirms the owner read the real logs and supplied evidence-only `2d38189`,
integrated as `24d65ed`. The lead narrows its unsupported process-timing inference.

Normal [P0 run 36664026169](https://github.com/Judithandprey/ai-learning-companion/actions/runs/36664026169)
also passed its Python 3.12 and 3.14 / Node 24.21 matrices. Both foreground watchers
exited 0. No completed Backend/Learning, browser or old Simulator campaign was
replayed during quota recovery.

The original-byte segment is complete at this evidence level. Next lead-owned
dependency is an explicit mapping of native buffer/host observation time, unknown
capture-time uncertainty and unapplied orientation into a released Frame/process
baseline, plus trusted stream/source bootstrap. Current `Frame.captured_at` cannot
be filled with invented UTC or a course-video time inferred from ReplayKit PTS.
iOS has confirmed it awaits that exact mapping before the next consumer. Signing,
physical iPad/Pencil, live whole-display-to-real-AI, cross-app interactive ink,
audio and Notability acceptance remain open; this build does not pass either core gate.
